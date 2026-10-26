// Unit tests for .claude/skills/factory-loop/quality-gate.sh. Run: node --test '.claude/tests/*.test.mjs'
// Each test builds a throwaway repo: `main` with one commit, then a work branch with the change.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const gate = join(dirname(fileURLToPath(import.meta.url)), '..', 'skills', 'factory-loop', 'quality-gate.sh');

const PASSING_TEST = "import { test } from 'node:test';\ntest('ok', () => {});\n";

function branchWith(files) {
  const dir = mkdtempSync(join(tmpdir(), 'gate-'));
  const sh = (c) => execSync(c, { cwd: dir, stdio: 'pipe' });
  sh('git init -q -b main && git commit -q --allow-empty -m init && git switch -q -c factory/issue-1');
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(join(dir, dirname(path)), { recursive: true });
    writeFileSync(join(dir, path), body);
  }
  sh('git add -A && git commit -q -m change');
  return dir;
}

function run(dir) {
  const r = spawnSync('bash', [gate, 'main'], { cwd: dir, encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr };
}

const app = (extra = '') => ({
  'app/package.json': '{"type":"module"}\n',
  'app/src/domain/sum.js': `export const sum = (a, b) => a + b;\n${extra}`,
  'app/tests/sum.test.js': PASSING_TEST,
});

test('passes a small, tested, clean project', () => {
  const { code, out } = run(branchWith(app()));
  assert.equal(code, 0, out);
  assert.match(out, /PASS/);
});

test('fails when a changed project has no tests', () => {
  const { code, out } = run(branchWith({ 'app/src/main.js': 'export {};\n' }));
  assert.equal(code, 1);
  assert.match(out, /no tests/);
});

test('fails when tests fail', () => {
  const files = app();
  files['app/tests/sum.test.js'] = "import { test } from 'node:test';\nimport assert from 'node:assert';\ntest('x', () => assert.equal(1, 2));\n";
  const { code, out } = run(branchWith(files));
  assert.equal(code, 1);
  assert.match(out, /tests failing/);
});

test('fails on a source file over 150 lines', () => {
  const { code, out } = run(branchWith(app('//\n'.repeat(160))));
  assert.equal(code, 1);
  assert.match(out, /size: app\/src\/domain\/sum\.js has \d+ lines/);
});

test('fails on unsafe DOM/JS sinks', () => {
  for (const sink of ['el.innerHTML = x;', 'el.insertAdjacentHTML("beforeend", x);', 'eval(code);', 'new Function(code);', "setTimeout('run()', 5);"]) {
    const { code, out } = run(branchWith(app(`${sink}\n`)));
    assert.equal(code, 1, sink);
    assert.match(out, /unsafe sink/, sink);
  }
});

test('allows safe look-alikes', () => {
  const { code, out } = run(branchWith(app('el.textContent = x;\nconst evaluate = (y) => y;\nsetTimeout(() => {}, 5);\n')));
  assert.equal(code, 0, out);
});

test('fails on a likely secret in added lines', () => {
  const key = ['gh', 'p_', 'a'.repeat(36)].join(''); // built at runtime so this file isn't flagged
  const { code, out } = run(branchWith(app(`const token = "${key}";\n`)));
  assert.equal(code, 1);
  assert.match(out, /possible secret/);
});
