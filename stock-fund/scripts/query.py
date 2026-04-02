#!/usr/bin/env python3
"""
股票 & 基金实时行情查询脚本
用法:
    python query.py stock <代码或名称>   # 查 A 股
    python query.py etf <代码或名称>     # 查 ETF/LOF
    python query.py fund <基金代码>      # 查开放式基金净值估算
    python query.py auto <代码或名称>    # 自动判断类型
"""

import sys
import json
import akshare as ak
import pandas as pd


def fmt_pct(val):
    """格式化涨跌幅，带颜色提示"""
    try:
        v = float(val)
        sign = "🔴" if v > 0 else ("🟢" if v < 0 else "⬜")
        return f"{sign} {v:+.2f}%"
    except (TypeError, ValueError):
        return str(val)


def fmt_amount(val):
    """将成交额格式化为亿元/万元"""
    try:
        v = float(val)
        if v >= 1e8:
            return f"{v / 1e8:.2f} 亿元"
        elif v >= 1e4:
            return f"{v / 1e4:.2f} 万元"
        else:
            return f"{v:.0f} 元"
    except (TypeError, ValueError):
        return str(val)


def fmt_vol(val):
    """将成交量格式化为手/万手"""
    try:
        v = float(val)
        if v >= 1e8:
            return f"{v / 1e8:.2f} 亿手"
        elif v >= 1e4:
            return f"{v / 1e4:.2f} 万手"
        else:
            return f"{int(v)} 手"
    except (TypeError, ValueError):
        return str(val)


def query_stock(keyword: str) -> dict:
    """查询 A 股实时行情"""
    df = ak.stock_zh_a_spot_em()

    # 精确匹配代码
    exact = df[df["代码"] == keyword]
    if not exact.empty:
        rows = exact
    else:
        # 按名称模糊搜索
        name_match = df[df["名称"].str.contains(keyword, na=False)]
        if name_match.empty:
            return {"error": f"未找到股票：{keyword}"}
        if len(name_match) > 1:
            hits = name_match[["代码", "名称", "最新价", "涨跌幅"]].to_dict(orient="records")
            return {"multiple": hits, "message": f"找到 {len(name_match)} 只股票，请指定代码"}
        rows = name_match

    row = rows.iloc[0]
    return {
        "type": "stock",
        "code": row["代码"],
        "name": row["名称"],
        "price": row.get("最新价"),
        "change_pct": row.get("涨跌幅"),
        "change": row.get("涨跌额"),
        "open": row.get("今开"),
        "prev_close": row.get("昨收"),
        "high": row.get("最高"),
        "low": row.get("最低"),
        "volume": row.get("成交量"),
        "amount": row.get("成交额"),
        "turnover": row.get("换手率"),
        "pe": row.get("市盈率-动态"),
        "pb": row.get("市净率"),
        "amplitude": row.get("振幅"),
    }


def query_etf(keyword: str) -> dict:
    """查询 ETF/LOF 实时行情"""
    etf_df = ak.fund_etf_spot_em()
    lof_df = ak.fund_lof_spot_em()

    # 合并 ETF + LOF
    etf_df["fund_type"] = "ETF"
    lof_df["fund_type"] = "LOF"
    df = pd.concat([etf_df, lof_df], ignore_index=True)

    # 精确匹配代码
    exact = df[df["代码"] == keyword]
    if not exact.empty:
        rows = exact
    else:
        name_match = df[df["名称"].str.contains(keyword, na=False)]
        if name_match.empty:
            return {"error": f"未找到 ETF/LOF 基金：{keyword}"}
        if len(name_match) > 1:
            hits = name_match[["代码", "名称", "最新价", "涨跌幅", "fund_type"]].to_dict(orient="records")
            return {"multiple": hits, "message": f"找到 {len(name_match)} 只 ETF/LOF，请指定代码"}
        rows = name_match

    row = rows.iloc[0]
    return {
        "type": row.get("fund_type", "ETF"),
        "code": row["代码"],
        "name": row["名称"],
        "price": row.get("最新价"),
        "change_pct": row.get("涨跌幅"),
        "change": row.get("涨跌额"),
        "open": row.get("开盘价"),
        "prev_close": row.get("昨收价"),
        "high": row.get("最高价"),
        "low": row.get("最低价"),
        "volume": row.get("成交量"),
        "amount": row.get("成交额"),
    }


def _parse_fund_row(row, df_columns) -> dict:
    """从基金行数据中提取净值信息，处理动态列名"""
    name_col = next(
        (c for c in ("基金简称", "基金名称") if c in row.index),
        row.index[1]
    )

    # 列名可能是动态的（如 "2026-04-02-估算数据-估算值"），也可能是静态的
    def find_val(row, *keywords):
        for kw in keywords:
            # 精确匹配
            if kw in row.index and pd.notna(row[kw]):
                return row[kw]
        # 模糊匹配（处理动态列名）
        for col in row.index:
            for kw in keywords:
                if kw in col and pd.notna(row[col]):
                    return row[col]
        return None

    est_nav = find_val(row, "估算净值", "估算值")
    est_change_pct = find_val(row, "估算涨幅", "估算增长率")

    # 从动态列名提取日期（如 "2026-04-02-估算数据-估算值"）
    date_str = None
    for col in df_columns:
        if "估算" in col and "-" in col:
            parts = col.split("-")
            if len(parts) >= 3:
                try:
                    # 验证是否是有效日期格式 YYYY-MM-DD
                    int(parts[0]), int(parts[1]), int(parts[2])
                    date_str = f"{parts[0]}-{parts[1]}-{parts[2]}"
                    break
                except ValueError:
                    pass

    return {
        "type": "open_fund",
        "code": row["基金代码"],
        "name": row.get(name_col, ""),
        "est_nav": est_nav,
        "est_change_pct": est_change_pct,
        "nav_date": date_str,
    }


def query_fund(keyword: str) -> dict:
    """查询开放式基金净值估算。

    当用户给出的代码与名称不匹配时，同时返回两只基金供用户确认：
    - by_code: 代码对应的实际基金
    - by_name: 名称搜索到的基金（用户意图）
    """
    df = ak.fund_value_estimation_em("全部")
    name_col = next((c for c in ("基金简称", "基金名称") if c in df.columns), df.columns[1])

    # 先按代码精确查找
    by_code_rows = df[df["基金代码"] == keyword]

    # 再按名称模糊查找（仅当 keyword 看起来不像纯数字代码时才有意义）
    by_name_rows = pd.DataFrame()
    if not keyword.isdigit():
        by_name_rows = df[df[name_col].str.contains(keyword, na=False)]

    # 如果两者都没找到
    if by_code_rows.empty and by_name_rows.empty:
        return {"error": f"未找到基金：{keyword}"}

    # 如果代码查到了、名称也查到了，且不是同一只基金 → 可能代码与名称不匹配，两个都返回
    if not by_code_rows.empty and not by_name_rows.empty:
        code_result = _parse_fund_row(by_code_rows.iloc[0], df.columns)
        # 名称匹配到多只时只取第一条
        name_result = _parse_fund_row(by_name_rows.iloc[0], df.columns)
        if code_result["code"] != name_result["code"]:
            return {
                "type": "fund_mismatch",
                "message": f"代码 {keyword} 对应的是「{code_result['name']}」，但名称搜索到「{name_result['name']}」，以下两只都已查询",
                "by_code": code_result,
                "by_name": name_result,
            }

    # 只有代码查到
    if not by_code_rows.empty:
        return _parse_fund_row(by_code_rows.iloc[0], df.columns)

    # 只有名称查到
    if len(by_name_rows) > 1:
        hits = by_name_rows[["基金代码", name_col]].head(10).to_dict(orient="records")
        return {"multiple": hits, "message": f"找到 {len(by_name_rows)} 只基金，请指定代码"}
    return _parse_fund_row(by_name_rows.iloc[0], df.columns)


def auto_query(keyword: str) -> dict:
    """自动判断类型并查询"""
    # 判断是否是纯数字代码
    is_code = keyword.isdigit() and len(keyword) == 6

    if is_code:
        prefix = keyword[:2]
        # ETF/LOF 常见前缀
        if prefix in ("51", "52", "56", "15", "16", "18"):
            result = query_etf(keyword)
            if "error" not in result:
                return result
        # 尝试股票
        result = query_stock(keyword)
        if "error" not in result:
            return result
        # 尝试 ETF
        result = query_etf(keyword)
        if "error" not in result:
            return result
        # 尝试开放式基金
        return query_fund(keyword)
    else:
        # 名称查询：先股票，再 ETF，再基金
        result = query_stock(keyword)
        if "error" not in result:
            return result
        result = query_etf(keyword)
        if "error" not in result:
            return result
        return query_fund(keyword)


def print_result(result: dict):
    """格式化打印查询结果"""
    if "error" in result:
        print(f"❌ {result['error']}")
        return

    if "multiple" in result:
        print(f"⚠️  {result['message']}：")
        for item in result["multiple"][:10]:
            parts = [f"  {item.get('代码', item.get('基金代码', ''))}",
                     item.get("名称", item.get("基金简称", "")),
                     f"¥{item.get('最新价', item.get('估算净值', ''))}"
                     ]
            print("  |  ".join(str(p) for p in parts if p))
        return

    # 代码与名称不匹配，展示两只基金
    if result.get("type") == "fund_mismatch":
        print(f"\n⚠️  {result['message']}\n")
        print("--- 按代码查到的基金 ---")
        print_result(result["by_code"])
        print("--- 按名称查到的基金 ---")
        print_result(result["by_name"])
        return

    t = result.get("type", "unknown")
    code = result.get("code", "")
    name = result.get("name", "")

    if t in ("stock", "ETF", "LOF"):
        price = result.get("price")
        change_pct = result.get("change_pct")
        change = result.get("change")
        open_ = result.get("open")
        prev_close = result.get("prev_close")
        high = result.get("high")
        low = result.get("low")
        volume = result.get("volume")
        amount = result.get("amount")

        print(f"\n{'='*40}")
        print(f"  {name} ({code})  [{t}]")
        print(f"{'='*40}")
        print(f"  最新价：  {price} 元")
        print(f"  涨跌幅：  {fmt_pct(change_pct)}  ({change:+.2f} 元)" if change else f"  涨跌幅：  {fmt_pct(change_pct)}")
        print(f"  今开：    {open_}  |  昨收：{prev_close}")
        print(f"  最高：    {high}  |  最低：{low}")
        if volume is not None:
            print(f"  成交量：  {fmt_vol(volume)}")
        if amount is not None:
            print(f"  成交额：  {fmt_amount(amount)}")
        if t == "stock":
            turnover = result.get("turnover")
            pe = result.get("pe")
            pb = result.get("pb")
            if turnover is not None:
                print(f"  换手率：  {turnover}%")
            if pe is not None:
                print(f"  市盈率：  {pe}")
            if pb is not None:
                print(f"  市净率：  {pb}")
        print()

    elif t == "open_fund":
        est_nav = result.get("est_nav")
        est_change_pct = result.get("est_change_pct")
        nav_date = result.get("nav_date")

        print(f"\n{'='*40}")
        print(f"  {name} ({code})  [开放式基金]")
        print(f"{'='*40}")
        print(f"  估算净值：  {est_nav}")
        if est_change_pct is not None:
            print(f"  估算涨幅：  {fmt_pct(est_change_pct)}")
        if nav_date:
            print(f"  净值日期：  {nav_date}")
        print("  (注：开放式基金净值为盘中估算，官方净值于收盘后 T+1 公布)")
        print()


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)

    mode = sys.argv[1].lower()
    keyword = sys.argv[2].strip()

    if mode == "stock":
        result = query_stock(keyword)
    elif mode in ("etf", "lof"):
        result = query_etf(keyword)
    elif mode == "fund":
        result = query_fund(keyword)
    elif mode == "auto":
        result = auto_query(keyword)
    else:
        print(f"未知模式：{mode}，可选 stock/etf/fund/auto")
        sys.exit(1)

    print_result(result)
    # 同时输出 JSON（供 LLM 进一步处理）
    print("--- JSON ---")
    print(json.dumps(result, ensure_ascii=False, default=str, indent=2))


if __name__ == "__main__":
    main()
