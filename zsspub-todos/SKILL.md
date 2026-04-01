---
name: zsspub-todos
description: "管理存储在 SQLite 中的个人待办事项列表。适用场景：添加待办、列出待办、完成待办、删除待办、更新待办、按优先级/标签/截止日期筛选、检查任务、跟踪任务，待办事项，任务管理，添加任务，查看任务，完成任务，删除任务，todo，TODO，备忘，备忘录，记录，提醒，事项，清单，任务清单，todo list，task，tasks"
argument-hint: "add|list|done|delete|update [选项]"
metadata:
  version: "1.0.0"
  author: https://github.com/aximario(zengshushu)
---

# 待办事项技能

基于本地 SQLite 数据库管理持久化待办事项列表。

## 数据存储位置

数据库存储路径：
```
{skill_install_dir}/data/zsspub-todos/data.sqlite
```

脚本通过 `import.meta.dirname` 自动解析该路径，无需手动配置。

## 安装命令

首次使用前，在 skill 目录下执行一次：
```bash
cd {skill_install_dir}/zsspub-todos && npm link
```
执行后 `zsspub_todos` 即注册为全局命令，后续直接使用即可。

## 环境要求

- Node.js >= 22.5.0（使用内置 `node:sqlite`）

## 命令说明

### 添加待办
```
zsspub_todos add "标题" [--priority=low|medium|high] [--tags=标签1,标签2] [--due="YYYY-MM-DD HH:mm:ss"]
```
- `--priority`：优先级，`low`（低）、`medium`（中，默认）或 `high`（高）
- `--tags`：逗号分隔的标签列表，例如 `工作,紧急`
- `--due`：截止时间，格式为 `YYYY-MM-DD HH:mm:ss`，例如 `"2026-04-30 18:00:00"`

### 列出待办
```
zsspub_todos list [--status=pending|done|all] [--priority=low|medium|high] [--tag=标签名] [--due-before="YYYY-MM-DD HH:mm:ss"] [--due-after="YYYY-MM-DD HH:mm:ss"]
```
- 默认：仅列出 `pending`（待完成）的待办
- 排序规则：优先级（高→低）、截止日期（最早优先）、id

### 标记为完成
```
zsspub_todos done <id>
```

### 删除待办
```
zsspub_todos delete <id>
```
别名：`del`、`rm`

### 更新待办
```
zsspub_todos update <id> [--title="新标题"] [--priority=...] [--tags=...] [--due="YYYY-MM-DD HH:mm:ss"]
```
- 清除截止日期：`--due=null`

别名：`edit`

## 使用流程

1. 直接执行 `zsspub_todos <命令> [选项]`。
2. 将命令输出呈现给用户。

## 字段说明

| 字段 | 取值 | 备注 |
|------|------|------|
| `id` | 整数 | 自动分配，用于 done/delete/update |
| `title` | 字符串 | 待办内容 |
| `status` | `pending` / `done` | 默认：`pending` |
| `priority` | `low` / `medium` / `high` | 默认：`medium` |
| `tags` | 逗号分隔字符串 | 例如 `工作,个人` |
| `due_date` | `YYYY-MM-DD HH:mm:ss` | 可选截止日期 |
| `created_at` | `YYYY-MM-DD HH:mm:ss` | 自动设置 |

## 示例

```bash
# 添加一个今晚截止的高优先级任务
zsspub_todos add "提交报告" --priority=high --tags=工作 --due="2026-04-01 23:59:00"

# 列出所有待完成任务
zsspub_todos list

# 列出所有任务（包括已完成）
zsspub_todos list --status=all

# 仅列出高优先级任务
zsspub_todos list --priority=high

# 按标签筛选
zsspub_todos list --tag=工作

# 按截止日期筛选
zsspub_todos list --due-before="2026-04-07 00:00:00"

# 将第 3 条待办标记为完成
zsspub_todos done 3

# 更新第 2 条待办的标题和截止日期
zsspub_todos update 2 --title="修订后的标题" --due="2026-05-01 09:00:00"

# 删除第 5 条待办
zsspub_todos delete 5
```
