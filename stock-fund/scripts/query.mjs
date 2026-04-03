#!/usr/bin/env node

/**
 * 基金实时净值/估值查询脚本
 * 数据来源：天天基金 (fundgz.1234567.com.cn)
 *
 * 用法：
 *   node query.mjs <基金代码> [基金代码2 ...]
 *   node query.mjs 110022
 *   node query.mjs 110022 005827 161725
 *   node query.mjs search <关键词>          # 按名称搜索基金代码
 */

const args = process.argv.slice(2);

if (args.length === 0) {
  console.log(`用法：
  node query.mjs <基金代码> [基金代码2 ...]   # 查询估值
  node query.mjs search <关键词>              # 按名称搜索基金

示例：
  node query.mjs 110022           # 查单只基金
  node query.mjs 110022 005827    # 查多只基金
  node query.mjs search 易方达蓝筹  # 搜索基金
  node query.mjs search 医疗       # 模糊搜索`);
  process.exit(0);
}

// ----- 搜索模式 -----
if (args[0] === 'search') {
  const keyword = args.slice(1).join(' ');
  if (!keyword) {
    console.log('请提供搜索关键词');
    process.exit(1);
  }
  const url = `http://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx?m=1&key=${encodeURIComponent(keyword)}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const text = await res.text();
    const data = JSON.parse(text);
    const funds = (data.Datas || []).filter((d) => d.CATEGORYDESC === '基金');
    if (funds.length === 0) {
      console.log(`未找到与「${keyword}」匹配的基金`);
      process.exit(0);
    }
    console.log(`\n搜索「${keyword}」找到 ${funds.length} 只基金：\n`);
    console.log('  代码\t\t名称\t\t\t\t类型');
    console.log('  ' + '-'.repeat(60));
    for (const f of funds) {
      const info = f.FundBaseInfo || {};
      const ftype = info.FTYPE || '';
      console.log(`  ${f.CODE}\t\t${f.NAME}\t\t${ftype}`);
    }
    console.log('\n--- JSON ---');
    console.log(JSON.stringify(funds.map((f) => ({
      code: f.CODE,
      name: f.NAME,
      type: (f.FundBaseInfo || {}).FTYPE || '',
    })), null, 2));
  } catch (err) {
    console.error(`搜索失败：${err.message}`);
    process.exit(1);
  }
  process.exit(0);
}

// ----- 查询模式 -----
const codes = args;

const fmtPct = (val) => {
  const v = parseFloat(val);
  if (isNaN(v)) return val;
  const icon = v > 0 ? '🔴' : v < 0 ? '🟢' : '⬜';
  return `${icon} ${v > 0 ? '+' : ''}${v.toFixed(2)}%`;
};

async function queryFund(code) {
  const url = `http://fundgz.1234567.com.cn/js/${code}.js`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) {
      return { error: `请求失败 (${res.status})`, code };
    }
    const text = await res.text();
    // 解析 JSONP: jsonpgz({...});
    const match = text.match(/jsonpgz\((.+)\)/);
    if (!match) {
      return { error: `无效的基金代码：${code}`, code };
    }
    return JSON.parse(match[1]);
  } catch (err) {
    return { error: `查询失败：${err.message}`, code };
  }
}

function printResult(data) {
  if (data.error) {
    console.log(`❌ ${data.error}`);
    return;
  }

  const name = data.name || '';
  const code = data.fundcode || '';
  const nav = data.dwjz || '-';
  const estNav = data.gsz || '-';
  const estPct = data.gszzl;
  const navDate = data.jzrq || '-';
  const estTime = data.gztime || '-';

  console.log(`\n${'='.repeat(40)}`);
  console.log(`  ${name} (${code})`);
  console.log(`${'='.repeat(40)}`);
  console.log(`  上期净值：  ${nav} 元  (${navDate})`);
  console.log(`  估算净值：  ${estNav} 元`);
  if (estPct != null) {
    console.log(`  估算涨幅：  ${fmtPct(estPct)}`);
  }
  console.log(`  估值时间：  ${estTime}`);
  console.log();
}

// 并发查询所有基金
const results = await Promise.all(codes.map(queryFund));

for (const data of results) {
  printResult(data);
}

// 输出 JSON 供 LLM 处理
console.log('--- JSON ---');
console.log(JSON.stringify(results.length === 1 ? results[0] : results, null, 2));
