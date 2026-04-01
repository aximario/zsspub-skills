---
name: zsspub-todos
description: "管理存储在本地 SQLite 中的个人待办事项列表，支持添加、查看、完成、删除、更新和搜索任务，以及按优先级、标签、截止日期筛选。每当用户提到要记一件事、提醒自己做某事、查看今天有什么任务、把某件事标记为完成、想整理一下待办清单、搜索待办内容，都应主动使用这个 skill，即使用户没有明确说“todo”或“待办”。英文场景同样适用，如 remind me to、add to my todo list、what do I have today、mark X as done。"
argument-hint: "add|list|done|delete|update [选项]"
metadata:
  version: "1.0.0"
  author: https://github.com/aximario(zengshushu)
---

# 待办事项技能

基于本地 SQLite 数据库管理持久化待办事项列表。数据文件由脚本通过 `import.meta.dirname` 自动定位，存放在 skill 目录下的 `data/zsspub-todos/data.sqlite`，无需手动配置路径。

## 环境要求

- Node.js >= 22.5.0（使用内置 `node:sqlite`）

## 执行方式

所有命令均通过 `node` 直接运行脚本，无需安装任何全局命令：

```bash
node <本 SKILL.md 所在目录>/scripts/todos.mjs <命令> [选项]
```

下文中 `todos` 均代表 `node <skill目录>/scripts/todos.mjs`，请替换为实际路径。

## 使用流程

### 第一步：理解用户意图，映射到命令

根据用户的自然语言请求判断要执行的命令：

| 用户说的话（示例） | 应执行的命令 |
|---|---|
| "帮我记一下明天要交报告" | `add`，根据语义推断优先级和截止日期 |
| "今天有什么要做的？" / "列一下待办" | `list`（默认只显示 pending） |
| "把#3 标记完成" / "那个报告做完了" | `done <id>` |
| "删掉买菜那条" | 先 `list` 找到对应 id，再 `delete <id>` |
| "把第2条改成明天上午交" | `update <id> --due="..."` |
| "查一下高优先级的任务" | `list --priority=high` |
| "帮我找一下关于报告的任务" / "有没有跟工作相关的待办" | `list --search=关键字` |

**推断规则：**
- 用户说"今天"→ due 设当天 23:59:59；"明天"→ 次日 23:59:59；"后天"→ 后天 23:59:59
- "这周" / "本周"→ 本周日 23:59:59；"下周"→ 下周日 23:59:59；"下周X（如下周三）"→ 下周对应星期几的 23:59:59
- "月底"→ 当月最后一天 23:59:59；"下月初"→ 下月 1 日 23:59:59
- "X 小时后" / "X 分钟后"→ 当前时刻加对应时间量
- 用户没说优先级时，若语气急迫（"马上"、"紧急"、"立刻"）→ `high`，否则默认 `medium`
- 若需要 id 但用户没提供，先运行 `list` 展示结果，再请用户确认

### 第二步：执行命令并呈现结果

将命令输出直接展示给用户，不要省略或重新排版。若命令失败，把 stderr 内容告知用户并给出建议。

- 若输出中有标注 `⚠️已过期` 的任务，主动提醒用户处理。
- 若 `list` 返回较多条目（10 条以上），在展示列表后给出简短摘要，例如：“共 X 条待办，其中 Y 条已过期，最近截止的是「标题」（截止 日期）。”

## 命令说明

### 添加待办
```
todos add "标题" [--priority=low|medium|high] [--tags=标签1,标签2] [--due="YYYY-MM-DD HH:mm:ss"]
```
- `--priority`：`low`（低）、`medium`（中，默认）或 `high`（高）
- `--tags`：逗号分隔的标签列表，例如 `工作,紧急`
- `--due`：截止时间，格式严格为 `YYYY-MM-DD HH:mm:ss`

### 列出待办
```
todos list [--status=pending|done|all] [--priority=low|medium|high] [--tag=标签名] [--search=关键字] [--due-before="YYYY-MM-DD HH:mm:ss"] [--due-after="YYYY-MM-DD HH:mm:ss"]
```
- 默认仅列出 `pending`（待完成）的任务
- `--search`：按标题关键字模糊匹配，例如 `--search=报告`
- 排序：优先级（高→低）→ 截止日期（最早优先）→ id

### 标记为完成
```
todos done <id>
```

### 删除待办
```
todos delete <id>
```
别名：`del`、`rm`

### 更新待办
```
todos update <id> [--title="新标题"] [--priority=...] [--tags=...] [--due="YYYY-MM-DD HH:mm:ss"]
```
- 清除截止日期：`--due=null`

别名：`edit`

## 示例

```bash
# 添加一个高优先级任务，带标签和截止日期
todos add "提交季度报告" --priority=high --tags=工作 --due="2026-05-01 18:00:00"

# 列出所有待完成任务（默认视图）
todos list

# 列出所有任务（包括已完成）
todos list --status=all

# 仅列出高优先级任务
todos list --priority=high

# 按标签筛选
todos list --tag=工作

# 按截止日期筛选（截止日期在本周内）
todos list --due-before="2026-05-07 23:59:59"

# 将第 3 条待办标记为完成
todos done 3

# 更新第 2 条待办的标题和截止日期
todos update 2 --title="修订后的报告" --due="2026-05-02 09:00:00"

# 删除第 5 条待办
todos delete 5
```
