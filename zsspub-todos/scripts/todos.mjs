#!/usr/bin/env node
// @version 1.0.0
// @author  https://github.com/aximario

// 需要 Node.js >= 22.5.0（node:sqlite 作为实验性功能可用）
// 自 Node.js 23.4.0 起已稳定（无需额外标志）
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 5)) {
  console.error('错误：node:sqlite 支持需要 Node.js >= 22.5.0。');
  process.exit(1);
}

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

// ── 数据路径：{skill_install_dir}/data/zsspub-todos/data.sqlite ──────────
// 可通过环境变量 TODO_DB_PATH 覆盖（主要用于测试隔离）
const SKILL_DIR = resolve(import.meta.dirname, '..');
const DATA_DIR = join(SKILL_DIR, 'data', 'zsspub-todos');
const DB_PATH = process.env.TODO_DB_PATH ?? join(DATA_DIR, 'data.sqlite');

if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

const db = new DatabaseSync(DB_PATH);

// ── 数据库结构 ────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS todos (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    title      TEXT    NOT NULL,
    status     TEXT    NOT NULL DEFAULT 'pending',
    priority   TEXT    NOT NULL DEFAULT 'medium',
    tags       TEXT    NOT NULL DEFAULT '',
    due_date   TEXT,
    created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))
  )
`);

// ── 参数解析器 ───────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (const arg of argv) {
    if (arg.startsWith('--')) {
      const eqIdx = arg.indexOf('=');
      if (eqIdx !== -1) {
        const key = arg.slice(2, eqIdx);
        flags[key] = arg.slice(eqIdx + 1);
      } else {
        flags[arg.slice(2)] = true;
      }
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

// ── 输出辅助函数 ──────────────────────────────────────────────────────────────
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };
const PRIORITY_EMOJI = { high: '🔴', medium: '🟡', low: '🟢' };
const STATUS_LABEL = { pending: '[ ]', done: '[x]' };

function getNowLocal() {
  const n = new Date();
  const p = v => String(v).padStart(2, '0');
  return `${n.getFullYear()}-${p(n.getMonth()+1)}-${p(n.getDate())} ${p(n.getHours())}:${p(n.getMinutes())}:${p(n.getSeconds())}`;
}

function formatRow(t) {
  const pri = PRIORITY_EMOJI[t.priority] ?? t.priority;
  const now = getNowLocal();
  const overdue = t.due_date && t.status === 'pending' && t.due_date < now ? ' ⚠️已过期' : '';
  const due = t.due_date ? ` 截止:${t.due_date}${overdue}` : '';
  const tags = t.tags ? ` [${t.tags}]` : '';
  return `  ${t.id}. ${STATUS_LABEL[t.status] ?? t.status} ${pri} ${t.title}${tags}${due}  (创建时间: ${t.created_at})`;
}

function printTodos(rows) {
  if (rows.length === 0) {
    console.log('没有找到待办事项。');
    return;
  }
  console.log(`\n待办事项（共 ${rows.length} 条）:\n`);
  for (const t of rows) {
    console.log(formatRow(t));
  }
  console.log();
}

// ── 验证 due_date 格式 ────────────────────────────────────────────────────────
function validateDue(due) {
  if (!due) return null;
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(due)) {
    console.error('错误：--due 必须使用 "YYYY-MM-DD HH:mm:ss" 格式。');
    process.exit(1);
  }
  return due;
}

// ── 各命令实现 ────────────────────────────────────────────────────────────────

function cmdAdd(flags, positional) {
  const title = positional[0];
  if (!title) {
    console.error('错误：标题不能为空。\n  用法：add "标题" [--priority=low|medium|high] [--tags=标签1,标签2] [--due="YYYY-MM-DD HH:mm:ss"]');
    process.exit(1);
  }
  const priority = flags.priority ?? 'medium';
  if (!['low', 'medium', 'high'].includes(priority)) {
    console.error('错误：--priority 必须为 low、medium 或 high。');
    process.exit(1);
  }
  const tags = flags.tags ?? '';
  const due_date = validateDue(flags.due ?? null);

  const stmt = db.prepare(
    'INSERT INTO todos (title, priority, tags, due_date) VALUES (?, ?, ?, ?)'
  );
  const result = stmt.run(title, priority, tags, due_date);
  const row = db.prepare('SELECT * FROM todos WHERE id = ?').get(result.lastInsertRowid);
  console.log('\n已添加:\n');
  console.log(formatRow(row));
  console.log();
}

function cmdList(flags) {
  const status = flags.status ?? 'pending';
  if (!['pending', 'done', 'all'].includes(status)) {
    console.error('错误：--status 必须为 pending、done 或 all。');
    process.exit(1);
  }
  if (flags.priority && !['low', 'medium', 'high'].includes(flags.priority)) {
    console.error('错误：--priority 必须为 low、medium 或 high。');
    process.exit(1);
  }
  const conditions = [];
  const params = [];

  if (status !== 'all') {
    conditions.push('status = ?');
    params.push(status);
  }
  if (flags.priority) {
    conditions.push('priority = ?');
    params.push(flags.priority);
  }
  if (flags.tag) {
    // 在逗号分隔的标签列表中匹配标签
    conditions.push("(',' || tags || ',' LIKE ?)");
    params.push(`%,${flags.tag},%`);
  }
  if (flags.search) {
    conditions.push('title LIKE ?');
    params.push(`%${flags.search}%`);
  }
  if (flags['due-before']) {
    validateDue(flags['due-before']);
    conditions.push('due_date <= ?');
    params.push(flags['due-before']);
  }
  if (flags['due-after']) {
    validateDue(flags['due-after']);
    conditions.push('due_date >= ?');
    params.push(flags['due-after']);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = db.prepare(`SELECT * FROM todos ${where} ORDER BY
    CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
    CASE WHEN due_date IS NULL THEN 1 ELSE 0 END,
    due_date ASC,
    id ASC`).all(...params);

  printTodos(rows);
}

function cmdDone(positional) {
  const id = Number(positional[0]);
  if (!Number.isInteger(id) || id <= 0) {
    console.error('错误：需要有效的待办 id。\n  用法：done <id>');
    process.exit(1);
  }
  const existing = db.prepare('SELECT * FROM todos WHERE id = ?').get(id);
  if (!existing) {
    console.error(`错误：未找到待办 #${id}。`);
    process.exit(1);
  }
  db.prepare("UPDATE todos SET status = 'done' WHERE id = ?").run(id);
  const row = db.prepare('SELECT * FROM todos WHERE id = ?').get(id);
  console.log('\n已标记为完成:\n');
  console.log(formatRow(row));
  console.log();
}

function cmdDelete(positional) {
  const id = Number(positional[0]);
  if (!Number.isInteger(id) || id <= 0) {
    console.error('错误：需要有效的待办 id。\n  用法：delete <id>');
    process.exit(1);
  }
  const existing = db.prepare('SELECT * FROM todos WHERE id = ?').get(id);
  if (!existing) {
    console.error(`错误：未找到待办 #${id}。`);
    process.exit(1);
  }
  db.prepare('DELETE FROM todos WHERE id = ?').run(id);
  console.log(`\n已删除待办 #${id}："${existing.title}"\n`);
}

function cmdUpdate(positional, flags) {
  const id = Number(positional[0]);
  if (!Number.isInteger(id) || id <= 0) {
    console.error('错误：需要有效的待办 id。\n  用法：update <id> [--title=...] [--priority=...] [--tags=...] [--due="YYYY-MM-DD HH:mm:ss"]');
    process.exit(1);
  }
  const existing = db.prepare('SELECT * FROM todos WHERE id = ?').get(id);
  if (!existing) {
    console.error(`错误：未找到待办 #${id}。`);
    process.exit(1);
  }

  const updates = [];
  const params = [];

  if (flags.title !== undefined) {
    if (!flags.title) {
      console.error('错误：--title 不能为空字符串。');
      process.exit(1);
    }
    updates.push('title = ?');
    params.push(flags.title);
  }
  if (flags.priority !== undefined) {
    if (!['low', 'medium', 'high'].includes(flags.priority)) {
      console.error('错误：--priority 必须为 low、medium 或 high。');
      process.exit(1);
    }
    updates.push('priority = ?');
    params.push(flags.priority);
  }
  if (flags.tags !== undefined) {
    updates.push('tags = ?');
    params.push(flags.tags);
  }
  if (flags.due !== undefined) {
    const due = validateDue(flags.due === 'null' ? null : flags.due);
    updates.push('due_date = ?');
    params.push(due);
  }

  if (updates.length === 0) {
    console.log('没有可更新的内容。请使用 --title、--priority、--tags 或 --due。');
    process.exit(0);
  }

  params.push(id);
  db.prepare(`UPDATE todos SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  const row = db.prepare('SELECT * FROM todos WHERE id = ?').get(id);
  console.log('\n已更新:\n');
  console.log(formatRow(row));
  console.log();
}

// ── 程序入口 ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const { positional, flags } = parseArgs(args);
const [cmd, ...rest] = positional;

switch (cmd) {
  case 'add':
    cmdAdd(flags, rest);
    break;
  case 'list':
    cmdList(flags);
    break;
  case 'done':
    cmdDone(rest);
    break;
  case 'delete':
  case 'del':
  case 'rm':
    cmdDelete(rest);
    break;
  case 'update':
  case 'edit':
    cmdUpdate(rest, flags);
    break;
  default:
    console.log(`
待办事项技能脚本
用法：
  node todos.mjs add "标题" [--priority=low|medium|high] [--tags=标签1,标签2] [--due="YYYY-MM-DD HH:mm:ss"]
  node todos.mjs list [--status=pending|done|all] [--priority=low|medium|high] [--tag=标签名] [--search=关键字] [--due-before="YYYY-MM-DD HH:mm:ss"] [--due-after="YYYY-MM-DD HH:mm:ss"]
  node todos.mjs done <id>
  node todos.mjs delete <id>
  node todos.mjs update <id> [--title="新标题"] [--priority=low|medium|high] [--tags=标签1,标签2] [--due="YYYY-MM-DD HH:mm:ss"]

数据存储路径：${DB_PATH}
`);
}
