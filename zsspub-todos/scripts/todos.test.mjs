/**
 * todos.mjs 集成测试
 * 运行方式：node --no-warnings --test scripts/todos.test.mjs
 *
 * 使用 Node.js 内置 node:test + node:assert，无需任何第三方依赖。
 * 每次测试通过 TODO_DB_PATH 环境变量指向临时数据库，测试结束后自动清理。
 */

import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

// ── 常量 ──────────────────────────────────────────────────────────────────────
const SCRIPT = fileURLToPath(new URL('./todos.mjs', import.meta.url));

// ── 临时数据库（每个 describe 块独立隔离）────────────────────────────────────
function makeTmpEnv() {
  const dir = mkdtempSync(join(tmpdir(), 'todos-test-'));
  const env = { ...process.env, TODO_DB_PATH: join(dir, 'test.sqlite') };
  return { dir, env };
}

/** 运行脚本并返回 { stdout, stderr, status } */
function run(env, ...args) {
  const result = spawnSync(
    process.execPath,
    ['--no-warnings', SCRIPT, ...args],
    { encoding: 'utf8', env },
  );
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    status: result.status ?? 0,
  };
}

// ── add 命令 ──────────────────────────────────────────────────────────────────
describe('add 命令', () => {
  let env, dir;
  before(() => ({ dir, env } = makeTmpEnv()));
  after(() => rmSync(dir, { recursive: true, force: true }));

  test('基本添加（默认优先级）', () => {
    const { stdout, status } = run(env, 'add', '买菜');
    assert.equal(status, 0);
    assert.match(stdout, /已添加/);
    assert.match(stdout, /买菜/);
    assert.match(stdout, /🟡/); // medium
  });

  test('指定优先级 high', () => {
    const { stdout, status } = run(env, 'add', '紧急任务', '--priority=high');
    assert.equal(status, 0);
    assert.match(stdout, /🔴/);
  });

  test('指定优先级 low', () => {
    const { stdout, status } = run(env, 'add', '低优先级任务', '--priority=low');
    assert.equal(status, 0);
    assert.match(stdout, /🟢/);
  });

  test('指定标签', () => {
    const { stdout, status } = run(env, 'add', '工作任务', '--tags=工作,项目');
    assert.equal(status, 0);
    assert.match(stdout, /\[工作,项目\]/);
  });

  test('指定截止日期', () => {
    const { stdout, status } = run(env, 'add', '有截止日期的任务', '--due=2026-12-31 18:00:00');
    assert.equal(status, 0);
    assert.match(stdout, /截止:2026-12-31 18:00:00/);
  });

  test('标题为空时报错并退出非零', () => {
    const { stderr, status } = run(env, 'add');
    assert.notEqual(status, 0);
    assert.match(stderr, /标题不能为空/);
  });

  test('无效优先级时报错并退出非零', () => {
    const { stderr, status } = run(env, 'add', '任务', '--priority=invalid');
    assert.notEqual(status, 0);
    assert.match(stderr, /low、medium 或 high/);
  });

  test('截止日期格式错误时报错并退出非零', () => {
    const { stderr, status } = run(env, 'add', '任务', '--due=2026/12/31');
    assert.notEqual(status, 0);
    assert.match(stderr, /YYYY-MM-DD HH:mm:ss/);
  });
});

// ── list 命令 ─────────────────────────────────────────────────────────────────
describe('list 命令', () => {
  let env, dir;

  before(() => {
    ({ dir, env } = makeTmpEnv());
    // 准备测试数据
    run(env, 'add', '待完成任务A', '--priority=high', '--tags=工作');
    run(env, 'add', '待完成任务B', '--priority=low', '--tags=个人');
    run(env, 'add', '有截止的任务', '--due=2026-06-01 12:00:00');
  });
  after(() => rmSync(dir, { recursive: true, force: true }));

  test('默认只列出 pending 任务', () => {
    const { stdout, status } = run(env, 'list');
    assert.equal(status, 0);
    assert.match(stdout, /待完成任务A/);
    assert.match(stdout, /待完成任务B/);
  });

  test('空库时提示没有找到', () => {
    const { dir: d2, env: e2 } = makeTmpEnv();
    try {
      const { stdout, status } = run(e2, 'list');
      assert.equal(status, 0);
      assert.match(stdout, /没有找到/);
    } finally {
      rmSync(d2, { recursive: true, force: true });
    }
  });

  test('按优先级筛选', () => {
    const { stdout } = run(env, 'list', '--priority=high');
    assert.match(stdout, /待完成任务A/);
    assert.doesNotMatch(stdout, /待完成任务B/);
  });

  test('按标签筛选', () => {
    const { stdout } = run(env, 'list', '--tag=个人');
    assert.match(stdout, /待完成任务B/);
    assert.doesNotMatch(stdout, /待完成任务A/);
  });

  test('按截止日期筛选（due-before）', () => {
    const { stdout } = run(env, 'list', '--due-before=2026-07-01 00:00:00');
    assert.match(stdout, /有截止的任务/);
  });

  test('--status=all 包含所有状态', () => {
    // 将任务A完成
    const listResult = run(env, 'list', '--priority=high');
    const idMatch = listResult.stdout.match(/(\d+)\.\s+\[\s*\]/);
    if (idMatch) {
      run(env, 'done', idMatch[1]);
    }
    const { stdout } = run(env, 'list', '--status=all');
    // all 模式下已完成和待完成都应显示
    assert.match(stdout, /待办事项/);
  });

  test('无效 --status 值时报错', () => {
    const { stderr, status } = run(env, 'list', '--status=invalid');
    assert.notEqual(status, 0);
    assert.match(stderr, /pending、done 或 all/);
  });

  test('无效 --priority 值时报错', () => {
    const { stderr, status } = run(env, 'list', '--priority=超高');
    assert.notEqual(status, 0);
    assert.match(stderr, /low、medium 或 high/);
  });
});

// ── done 命令 ─────────────────────────────────────────────────────────────────
describe('done 命令', () => {
  let env, dir;
  before(() => ({ dir, env } = makeTmpEnv()));
  after(() => rmSync(dir, { recursive: true, force: true }));

  test('将任务标记为完成', () => {
    run(env, 'add', '待完成的任务');
    const listOut = run(env, 'list').stdout;
    const id = listOut.match(/(\d+)\./)?.[1];
    assert.ok(id, '应能找到任务 id');

    const { stdout, status } = run(env, 'done', id);
    assert.equal(status, 0);
    assert.match(stdout, /已标记为完成/);
    assert.match(stdout, /\[x\]/);
  });

  test('id 不存在时报错', () => {
    const { stderr, status } = run(env, 'done', '9999');
    assert.notEqual(status, 0);
    assert.match(stderr, /未找到待办/);
  });

  test('无效 id 时报错', () => {
    const { stderr, status } = run(env, 'done', 'abc');
    assert.notEqual(status, 0);
    assert.match(stderr, /有效的待办 id/);
  });
});

// ── delete 命令 ───────────────────────────────────────────────────────────────
describe('delete 命令', () => {
  let env, dir;
  before(() => ({ dir, env } = makeTmpEnv()));
  after(() => rmSync(dir, { recursive: true, force: true }));

  test('删除任务', () => {
    run(env, 'add', '待删除的任务');
    const id = run(env, 'list').stdout.match(/(\d+)\./)?.[1];
    assert.ok(id);

    const { stdout, status } = run(env, 'delete', id);
    assert.equal(status, 0);
    assert.match(stdout, /已删除待办/);

    // 确认已删除
    const after = run(env, 'list').stdout;
    assert.doesNotMatch(after, /待删除的任务/);
  });

  test('别名 del 可用', () => {
    run(env, 'add', '用别名删除的任务');
    const id = run(env, 'list').stdout.match(/(\d+)\./)?.[1];
    const { status } = run(env, 'del', id);
    assert.equal(status, 0);
  });

  test('别名 rm 可用', () => {
    run(env, 'add', '用rm别名删除的任务');
    const id = run(env, 'list').stdout.match(/(\d+)\./)?.[1];
    const { status } = run(env, 'rm', id);
    assert.equal(status, 0);
  });

  test('id 不存在时报错', () => {
    const { stderr, status } = run(env, 'delete', '9999');
    assert.notEqual(status, 0);
    assert.match(stderr, /未找到待办/);
  });
});

// ── update 命令 ───────────────────────────────────────────────────────────────
describe('update 命令', () => {
  let env, dir;
  before(() => ({ dir, env } = makeTmpEnv()));
  after(() => rmSync(dir, { recursive: true, force: true }));

  function addAndGetId(title) {
    run(env, 'add', title);
    const out = run(env, 'list').stdout;
    return out.match(/(\d+)\./)?.[1];
  }

  test('更新标题', () => {
    const id = addAndGetId('原始标题');
    const { stdout, status } = run(env, 'update', id, '--title=新标题');
    assert.equal(status, 0);
    assert.match(stdout, /新标题/);
  });

  test('更新优先级', () => {
    const id = addAndGetId('优先级测试');
    const { stdout, status } = run(env, 'update', id, '--priority=high');
    assert.equal(status, 0);
    assert.match(stdout, /🔴/);
  });

  test('更新标签', () => {
    const id = addAndGetId('标签测试');
    const { stdout, status } = run(env, 'update', id, '--tags=新标签');
    assert.equal(status, 0);
    assert.match(stdout, /\[新标签\]/);
  });

  test('更新截止日期', () => {
    const id = addAndGetId('截止日期测试');
    const { stdout, status } = run(env, 'update', id, '--due=2027-01-01 09:00:00');
    assert.equal(status, 0);
    assert.match(stdout, /截止:2027-01-01 09:00:00/);
  });

  test('清除截止日期（--due=null）', () => {
    const id = addAndGetId('清除截止日期');
    run(env, 'update', id, '--due=2027-01-01 09:00:00');
    const { stdout, status } = run(env, 'update', id, '--due=null');
    assert.equal(status, 0);
    assert.doesNotMatch(stdout, /截止:/);
  });

  test('无更新字段时提示', () => {
    const id = addAndGetId('无更新字段');
    const { stdout, status } = run(env, 'update', id);
    assert.equal(status, 0);
    assert.match(stdout, /没有可更新的内容/);
  });

  test('别名 edit 可用', () => {
    const id = addAndGetId('edit别名测试');
    const { status } = run(env, 'edit', id, '--title=edit别名更新');
    assert.equal(status, 0);
  });

  test('id 不存在时报错', () => {
    const { stderr, status } = run(env, 'update', '9999', '--title=x');
    assert.notEqual(status, 0);
    assert.match(stderr, /未找到待办/);
  });

  test('无效优先级时报错', () => {
    const id = addAndGetId('无效优先级');
    const { stderr, status } = run(env, 'update', id, '--priority=超高');
    assert.notEqual(status, 0);
    assert.match(stderr, /low、medium 或 high/);
  });

  test('--title 为空字符串时报错', () => {
    const id = addAndGetId('空标题测试');
    const { stderr, status } = run(env, 'update', id, '--title=');
    assert.notEqual(status, 0);
    assert.match(stderr, /不能为空字符串/);
  });
});

// ── 未知命令 ──────────────────────────────────────────────────────────────────
describe('未知命令', () => {
  let env, dir;
  before(() => ({ dir, env } = makeTmpEnv()));
  after(() => rmSync(dir, { recursive: true, force: true }));

  test('无命令时打印帮助信息', () => {
    const { stdout, status } = run(env);
    assert.equal(status, 0);
    assert.match(stdout, /待办事项技能脚本/);
    assert.match(stdout, /用法/);
  });

  test('无效命令时打印帮助信息', () => {
    const { stdout, status } = run(env, 'invalid-cmd');
    assert.equal(status, 0);
    assert.match(stdout, /待办事项技能脚本/);
  });
});
