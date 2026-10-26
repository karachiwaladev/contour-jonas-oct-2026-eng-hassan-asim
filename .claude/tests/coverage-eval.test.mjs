// Unit tests for the coverage eval (.claude/skills/factory-loop/coverage/). Run: node --test '.claude/tests/*.test.mjs'
// lib.mjs rules are tested directly; coverage-eval.mjs end to end in throwaway repos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULTS, resolveConfig, inScope, parseLcov, evaluate, formatReport, weakenedConfig } from '../skills/factory-loop/coverage/lib.mjs';

const cli = join(dirname(fileURLToPath(import.meta.url)), '..', 'skills', 'factory-loop', 'coverage', 'coverage-eval.mjs');

const LCOV = 'SF:src/domain/a.js\nFNF:2\nFNH:2\nBRF:4\nBRH:3\nLF:10\nLH:10\nend_of_record\n'
  + 'SF:src/domain/b.js\nFNF:1\nFNH:0\nBRF:0\nBRH:0\nLF:10\nLH:5\nend_of_record\n';

test('parseLcov reads hit/found per file', () => {
  const files = parseLcov(LCOV);
  assert.deepEqual(files.get('src/domain/a.js'), { lines: [10, 10], branches: [3, 4], functions: [2, 2] });
  assert.deepEqual(files.get('src/domain/b.js').lines, [5, 10]);
});

test('resolveConfig takes valid overrides and ignores bad ones', () => {
  assert.deepEqual(resolveConfig({}), { ...DEFAULTS });
  const cfg = resolveConfig({ coverage: { lines: 70, branches: 'x', functions: 101, exclude: ['src/data/x.js'] } });
  assert.equal(cfg.lines, 70);
  assert.equal(cfg.branches, DEFAULTS.branches);
  assert.equal(cfg.functions, DEFAULTS.functions);
  assert.deepEqual(cfg.exclude, ['src/ui/', 'src/main.js', 'src/data/x.js'], 'project excludes add to the defaults');
});

test('inScope honours include and exclude prefixes', () => {
  const cfg = resolveConfig({ coverage: { exclude: ['src/data/idb.js'] } });
  assert.equal(inScope('src/domain/a.js', cfg), true);
  assert.equal(inScope('src/ui/form.js', cfg), false);
  assert.equal(inScope('src/data/idb.js', cfg), false);
  assert.equal(inScope('src/utils/u.js', cfg), true, 'every folder is in scope by default');
  assert.equal(inScope('app.js', cfg), true);
  assert.equal(inScope('src/main.js', cfg), false);
  assert.equal(inScope('src/data/idb.jsx', cfg), true, 'entries are anchored, not raw prefixes');
  assert.equal(inScope('src/uix/a.js', cfg), true);
});

const src = (path, codeLines = 10) => ({ path, codeLines });

test('passes when totals meet thresholds and every file is loaded', () => {
  const lcov = parseLcov(LCOV.replace('BRH:3', 'BRH:4').replace('LH:5', 'LH:10').replace('FNH:0', 'FNH:1'));
  const r = evaluate({ lcov, sources: [src('src/domain/a.js'), src('src/domain/b.js')], cfg: DEFAULTS });
  assert.equal(r.pass, true, r.failures.join('; '));
  assert.equal(r.summary.lines, 100);
});

test('fails a source file that no test loads, counting its lines as uncovered', () => {
  const lcov = parseLcov(LCOV.replace('LH:5', 'LH:10').replace('FNH:0', 'FNH:1'));
  const r = evaluate({ lcov, sources: [src('src/domain/a.js'), src('src/domain/b.js'), src('src/domain/new.js', 20)], cfg: DEFAULTS });
  assert.equal(r.pass, false);
  assert.match(r.failures.join('\n'), /new\.js: no test imports it/);
  assert.equal(r.summary.lines, 50);
});

test('fails totals below threshold and a changed file below its minimum', () => {
  const r = evaluate({ lcov: parseLcov(LCOV), sources: [src('src/domain/a.js'), src('src/domain/b.js')], changed: ['src/domain/b.js'], cfg: DEFAULTS });
  const why = r.failures.join('\n');
  assert.match(why, /b\.js: changed but only 50\.0% lines covered/);
  assert.match(why, /lines coverage 75\.0% is below 90%/);
  assert.match(why, /functions coverage 66\.6% is below 90%/);
});

test('fails when tests fail or nothing is in scope', () => {
  assert.match(evaluate({ lcov: new Map(), sources: [], cfg: DEFAULTS }).failures.join(), /no source files in scope/);
  const r = evaluate({ lcov: parseLcov(LCOV), sources: [src('src/domain/a.js')], cfg: DEFAULTS, testsPassed: false });
  assert.match(r.failures.join(), /unit tests are failing/);
});

test('formatReport shows verdict, thresholds and untested files', () => {
  const r = evaluate({ lcov: new Map(), sources: [src('src/domain/x.js')], cfg: DEFAULTS });
  const md = formatReport('app', r, DEFAULTS);
  assert.match(md, /Coverage: `app` — FAIL ✗/);
  assert.match(md, /\| lines \| 0\.0% \| 90% \| ✗ \|/);
  assert.match(md, /\| src\/domain\/x\.js \| 0\.0% .*untested/);
});

// End to end: a repo with main + a work branch carrying the given files.
function branchWith(files) {
  const dir = mkdtempSync(join(tmpdir(), 'cov-'));
  const sh = (c) => execSync(c, { cwd: dir, stdio: 'pipe' });
  sh('git init -q -b main && git commit -q --allow-empty -m init && git switch -q -c factory/issue-1');
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(join(dir, dirname(path)), { recursive: true });
    writeFileSync(join(dir, path), body);
  }
  sh('git add -A && git commit -q -m change');
  return dir;
}
function run(dir, ...args) {
  const r = spawnSync(process.execPath, [cli, '--base', 'main', ...args], { cwd: dir, encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr };
}

const SUM = 'export const sum = (a, b) => a + b;\n';
const SUM_TEST = "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\n"
  + "import { sum } from '../src/domain/sum.js';\ntest('adds', () => assert.equal(sum(1, 2), 3));\n";

test('e2e: a tested change passes', () => {
  const { code, out } = run(branchWith({ 'app/package.json': '{"type":"module"}', 'app/src/domain/sum.js': SUM, 'app/tests/sum.test.js': SUM_TEST }));
  assert.equal(code, 0, out);
  assert.match(out, /COVERAGE PASS/);
});

test('e2e: a new module without tests fails and is named', () => {
  const { code, out } = run(branchWith({
    'app/package.json': '{"type":"module"}', 'app/src/domain/sum.js': SUM, 'app/tests/sum.test.js': SUM_TEST,
    'app/src/domain/mul.js': 'export const mul = (a, b) => a * b;\n',
  }));
  assert.equal(code, 1, out);
  assert.match(out, /src\/domain\/mul\.js: no test imports it/);
  assert.match(out, /COVERAGE FAIL/);
});

test('e2e: a project with no tests folder fails', () => {
  const { code, out } = run(branchWith({ 'app/package.json': '{"type":"module"}', 'app/src/domain/sum.js': SUM }));
  assert.equal(code, 1, out);
  assert.match(out, /no app\/tests folder/);
});

test('e2e: docs-only changes have nothing to evaluate', () => {
  const { code, out } = run(branchWith({ 'app/README.md': '# app\n' }));
  assert.equal(code, 0, out);
  assert.match(out, /nothing to evaluate/);
});

test('e2e: a missing base ref fails closed', () => {
  const dir = branchWith({ 'app/src/domain/sum.js': SUM });
  const r = spawnSync(process.execPath, [cli, '--base', 'origin/nope'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /base ref 'origin\/nope' not found/);
});

const hook = join(dirname(cli), '..', '..', '..', 'hooks', 'coverage-report.sh');
function runHook(dir) {
  const r = spawnSync('bash', [hook], { input: '{}', env: { ...process.env, CLAUDE_PROJECT_DIR: dir }, encoding: 'utf8' });
  return { code: r.status, out: r.stdout };
}

test('stop hook: reports a FAIL verdict as a systemMessage, never blocks', () => {
  const dir = branchWith({ 'app/package.json': '{"type":"module"}', 'app/src/domain/sum.js': SUM, 'app/tests/sum.test.js': SUM_TEST });
  execSync('git update-ref refs/remotes/origin/main main', { cwd: dir });
  writeFileSync(join(dir, 'app/src/domain/mul.js'), 'export const mul = (a, b) => a * b;\n');
  const { code, out } = runHook(dir);
  assert.equal(code, 0);
  const msg = JSON.parse(out).systemMessage;
  assert.match(msg, /Coverage eval — `app` — FAIL/);
  assert.match(msg, /mul\.js: no test imports it/);
});

test('stop hook: silent when no project source changed', () => {
  const dir = branchWith({ 'app/README.md': '# app\n' });
  execSync('git update-ref refs/remotes/origin/main main', { cwd: dir });
  assert.deepEqual(runHook(dir), { code: 0, out: '' });
});

test('weakenedConfig flags lowered thresholds and new excludes, allows tightening', () => {
  const base = resolveConfig({});
  assert.deepEqual(weakenedConfig(base, resolveConfig({ coverage: { lines: 95, branches: 90 } })), []);
  const why = weakenedConfig(base, resolveConfig({ coverage: { lines: 0, exclude: ['src/domain/new.js'], include: ['src/domain/'] } }));
  assert.deepEqual(why, ['lines 90 → 0', 'exclude adds `src/domain/new.js`', 'include drops ``']);
});

test('a changed file must also meet per-file branch and function minimums', () => {
  const lcov = parseLcov('SF:src/domain/a.js\nFNF:2\nFNH:2\nBRF:10\nBRH:0\nLF:10\nLH:10\nend_of_record\n'
    + 'SF:src/domain/old.js\nFNF:2\nFNH:2\nBRF:100\nBRH:100\nLF:100\nLH:100\nend_of_record\n');
  const r = evaluate({ lcov, sources: [src('src/domain/a.js'), src('src/domain/old.js', 100)], changed: ['src/domain/a.js'], cfg: DEFAULTS });
  assert.equal(r.summary.branches > DEFAULTS.branches, true, 'totals alone would pass');
  assert.match(r.failures.join('\n'), /a\.js: changed but only 0\.0% branches covered \(min 70%\)/);
});

test('ignore comments fail, and a loaded file with no counted lines is uncovered', () => {
  const lcov = parseLcov('SF:src/domain/a.js\nFNF:0\nFNH:0\nBRF:0\nBRH:0\nLF:0\nLH:0\nend_of_record\n');
  const r = evaluate({ lcov, sources: [{ path: 'src/domain/a.js', codeLines: 8, ignores: true }], cfg: DEFAULTS });
  assert.match(r.failures.join('\n'), /node:coverage disable\/ignore comment/);
  assert.equal(r.summary.lines, 0);
});

// A repo whose main already has `baseFiles`; the work branch then applies `change` (a shell command).
function repoWith(baseFiles, change) {
  const dir = mkdtempSync(join(tmpdir(), 'cov-'));
  const sh = (c) => execSync(c, { cwd: dir, stdio: 'pipe' });
  sh('git init -q -b main');
  for (const [path, body] of Object.entries(baseFiles)) {
    mkdirSync(join(dir, dirname(path)), { recursive: true });
    writeFileSync(join(dir, path), body);
  }
  sh('git add -A && git commit -q -m base && git switch -q -c factory/issue-1');
  sh(change);
  return dir;
}
const TESTED_APP = { 'app/package.json': '{"type":"module"}', 'app/src/domain/sum.js': SUM, 'app/tests/sum.test.js': SUM_TEST };

test('e2e: untested code outside the usual layer folders still fails', () => {
  const { code, out } = run(repoWith(TESTED_APP, 'mkdir -p app/src/utils && echo "export const u = (x) => (x ? 1 : 2);" > app/src/utils/u.js'));
  assert.equal(code, 1, out);
  assert.match(out, /src\/utils\/u\.js: no test imports it/);
});

test('e2e: a node:coverage ignore comment fails', () => {
  const dir = repoWith(TESTED_APP, "printf '/* node:coverage disable */\\nexport const sum = (a, b) => a + b;\\n' > app/src/domain/sum.js");
  const { code, out } = run(dir);
  assert.equal(code, 1, out);
  assert.match(out, /node:coverage disable\/ignore comment/);
});

test('e2e: a branch that only deletes the tests is evaluated and fails', () => {
  const { code, out } = run(repoWith(TESTED_APP, 'git rm -q app/tests/sum.test.js && git commit -q -m "drop tests"'));
  assert.equal(code, 1, out);
  assert.match(out, /COVERAGE FAIL/);
});

test('e2e: weakening the coverage config on the branch fails', () => {
  const { code, out } = run(repoWith(TESTED_APP, `echo '{"type":"module","coverage":{"lines":0}}' > app/package.json`));
  assert.equal(code, 1, out);
  assert.match(out, /"coverage" weakened on this branch: lines 90 → 0/);
});

test('e2e: a missing base ref fails closed even with a named project', () => {
  const r = spawnSync(process.execPath, [cli, '--base', 'origin/nope', 'app'], { cwd: repoWith(TESTED_APP, 'true'), encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /base ref 'origin\/nope' not found/);
});
