// unit-tests eval: how well a project's unit tests cover it. Runs `node --test` with Node's built-in
// coverage (free, no dependencies) and turns the run into pass/fail cases. "Core" modules are every
// source file except UI components (src/ui/) and the entry point (src/main.js).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { parseLcov, pct } from '../../.claude/skills/factory-loop/coverage/lib.mjs';

export const THRESHOLDS = Object.freeze({ lines: 90, branches: 80, functions: 90 });
const isUi = (path) => path.startsWith('src/ui/') || path === 'src/main.js';

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? walk(join(dir, d.name)) : /\.m?js$/.test(d.name) ? [join(dir, d.name)] : []);
}

const count = (out, key) => Number(out.match(new RegExp(`^# ${key} (\\d+)`, 'm'))?.[1] ?? 0);

/** Runs the project's tests with coverage and collects the raw numbers. */
export function gatherUnitFacts(projectDir) {
  const tmp = mkdtempSync(join(tmpdir(), 'eval-unit-'));
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT; // a run nested in another test runner must still report properly
  const run = spawnSync(process.execPath, ['--test', '--experimental-test-coverage',
    '--test-reporter=tap', '--test-reporter-destination=stdout',
    '--test-reporter=lcov', `--test-reporter-destination=${join(tmp, 'lcov.info')}`], { cwd: projectDir, env, encoding: 'utf8' });
  const lcov = existsSync(join(tmp, 'lcov.info')) ? parseLcov(readFileSync(join(tmp, 'lcov.info'), 'utf8')) : new Map();
  rmSync(tmp, { recursive: true, force: true });
  const out = run.stdout ?? '';
  return {
    exitCode: run.status,
    tests: count(out, 'tests'),
    failed: count(out, 'fail'),
    skipped: count(out, 'skipped'),
    todo: count(out, 'todo'),
    sources: walk(join(projectDir, 'src')).map((f) => {
      const path = relative(projectDir, f).split('\\').join('/');
      return { path, coverage: lcov.get(path) ?? null };
    }),
  };
}

/** Turns gathered facts into the eval's cases. Pure, so every rule is unit-tested. */
export function unitTestCases(facts) {
  const core = facts.sources.filter((s) => !isUi(s.path));
  const ui = facts.sources.filter((s) => isUi(s.path));
  const untested = (list) => list.filter((s) => !s.coverage).map((s) => s.path);
  const totals = { lines: [0, 0], branches: [0, 0], functions: [0, 0] };
  for (const s of core.filter((c) => c.coverage)) {
    for (const m of Object.keys(totals)) {
      totals[m][0] += s.coverage[m][0];
      totals[m][1] += s.coverage[m][1];
    }
  }
  const metric = (m) => {
    const value = core.length ? pct(totals[m]) : 0;
    return { id: `coverage-${m}`, pass: value >= THRESHOLDS[m], detail: `${value.toFixed(1)}% of core ${m} (min ${THRESHOLDS[m]}%)` };
  };
  const listCase = (id, list, what) => {
    const missing = untested(list);
    return { id, pass: list.length > 0 && missing.length === 0, detail: list.length === 0 ? `no ${what} found` : missing.length ? `not imported by any test: ${missing.join(', ')}` : `all ${list.length} ${what} imported by tests` };
  };
  return [
    { id: 'tests-pass', pass: facts.exitCode === 0 && facts.failed === 0, detail: `${facts.failed} failing, exit code ${facts.exitCode}` },
    { id: 'has-tests', pass: facts.tests > 0, detail: `${facts.tests} tests` },
    { id: 'no-skipped-or-todo', pass: facts.skipped === 0 && facts.todo === 0, detail: `${facts.skipped} skipped, ${facts.todo} todo` },
    metric('lines'),
    metric('branches'),
    metric('functions'),
    listCase('core-modules-tested', core, 'core modules'),
    listCase('ui-modules-tested', ui, 'UI modules'),
  ];
}
