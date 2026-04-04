---
name: notes
description: "个人笔记管理。当用户需要「记录信息/想法/知识」性质的内容使用。支持添加、查看、搜索、按标签筛选、编辑和删除笔记。"
metadata:
  version: "2.0.0"
  author: https://github.com/zsspub
  license: MIT
  updated_at: "2026-04-04"
---

# 笔记技能

通过 curl 调用 `https://zss.pub` API 管理个人笔记。

## 配置

配置文件：`<本 SKILL.md 所在目录>/../.data/zsspub/notes/config.json`

```json
{ "accessKey": "<用户提供>" }
```

首次使用前需确认配置文件存在且 accessKey 有效，若不存在则创建目录和文件。若用户未提供 access-key，提示用户先配置。

读取：`ACCESS_KEY=$(jq -r '.accessKey' <config.json路径>)`

## API

公共头：`-H "x-access-key: $ACCESS_KEY" -H "Content-Type: application/json"`

### POST /api/notes — 创建笔记
```bash
curl -s -X POST https://zss.pub/api/notes -H "x-access-key: $ACCESS_KEY" -H "Content-Type: application/json" \
  -d '{"title":"React Hooks 常见坑","content":"## useEffect\n\n1. 依赖数组遗漏...","description":"React Hooks 使用注意事项","tags":"技术,React"}'
```
字段：
- `title`（必需）：标题，字符串
- `content`（必需）：正文，字符串（支持 Markdown）
- `description`（可选）：简短描述
- `tags`（可选）：逗号分隔的标签字符串

### GET /api/notes — 列出笔记
```bash
curl -s "https://zss.pub/api/notes?tag=技术&search=React" -H "x-access-key: $ACCESS_KEY"
```
参数：
- `tag`（可选）：按标签筛选
- `search`（可选）：在标题、正文和描述中模糊搜索

默认按更新时间倒序排列。

### GET /api/notes/:id — 获取单条笔记
```bash
curl -s https://zss.pub/api/notes/3 -H "x-access-key: $ACCESS_KEY"
```

### PATCH /api/notes/:id — 更新笔记
```bash
curl -s -X PATCH https://zss.pub/api/notes/2 -H "x-access-key: $ACCESS_KEY" -H "Content-Type: application/json" \
  -d '{"title":"新标题","content":"新正文","tags":"技术,JavaScript"}'
```
可更新字段：`title`、`content`、`description`、`tags`

### DELETE /api/notes/:id — 删除笔记
```bash
curl -s -X DELETE https://zss.pub/api/notes/5 -H "x-access-key: $ACCESS_KEY"
```
响应：204 No Content

## 核心要点

- **添加笔记**：从用户话语提取标题和正文，整理成结构化 Markdown，自动推断标签
- **编辑笔记**：通过 PATCH 更新指定字段
- **标签**：用户未指定时自动推断（技术/学习/工作/想法/生活等），优先复用已有标签保持一致性
- **操作反馈**：添加或修改笔记后，展示笔记内容
