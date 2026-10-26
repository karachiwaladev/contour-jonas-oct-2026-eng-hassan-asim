#!/usr/bin/env node
// Coverage eval: did the agent write unit tests for what it built? For each project, runs
// `node --test` with Node's built-in coverage (free, no dependencies), then checks:
//   - tests pass;
//   - every in-scope source file is loaded by some test (an untested file fails);
//   - every changed in-scope file meets `changedFileLines`;
//   - project totals meet the line / branch / function thresholds.
// Scope and thresholds: lib.mjs DEFAULTS, overridable in <project>/package.json under "coverage".
//
//   coverage-eval.mjs [--base REF] [--all] [project ...]
// No projects named: evaluates projects whose source changed vs REF (default origin/main).
// --all: every top-level project with a tests/ folder. Prints a markdown report per project and
// ends with `COVERAGE PASS` or `COVERAGE FAIL`; exits 1 on FAIL or when the base ref is missing.
import { spawnSync, execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveConfig, inScope, parseLcov, evaluate, formatReport } from './lib.mjs';

const SRC_RE = /\.(m?js|cjs|ts|jsx|tsx)$/;
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const baseIdx = args.indexOf('--base');
const base = baseIdx >= 0 ? args[baseIdx + 1] : 'origin/main';
const named = args.filter((a, i) => !a.startsWith('--') && (baseIdx < 0 || i !== baseIdx + 1));
const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();

function changedFiles() {
  try {
    git('rev-parse', '--verify', '-q', `${base}^{commit}`);
  } catch {
    return null;
  }
  return [...new Set([
    ...git('diff', '--name-only', '--diff-filter=ACMR', `${base}...HEAD`),
    ...git('diff', '--name-only', '--diff-filter=ACMR', 'HEAD'),
    ...git('ls-files', '--others', '--exclude-standard'),
  ])];
}

const isSource = (path) => SRC_RE.test(path) && !path.includes('/tests/') && !path.includes('node_modules/');

const changed = changedFiles();
let projects = named;
if (!projects.length && flag('--all')) {
  projects = readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.') && existsSync(join(root, d.name, 'tests')))
    .map((d) => d.name);
} else if (!projects.length) {
  if (!changed) {
    console.log(`✗ base ref '${base}' not found — fetch it (git fetch origin) or pass --base.\nCOVERAGE FAIL`);
    process.exit(1);
  }
  projects = [...new Set(changed.filter((f) => f.includes('/') && !f.startsWith('.') && isSource(f)).map((f) => f.split('/')[0]))];
}
if (!projects.length) {
  console.log('No project source changed — nothing to evaluate.\nCOVERAGE PASS');
  process.exit(0);
}

function evalProject(project) {
  const dir = join(root, project);
  const pkgPath = join(dir, 'package.json');
  const cfg = resolveConfig(existsSync(pkgPath) ? JSON.parse(readFileSync(pkgPath, 'utf8')) : {});
  const files = [...new Set([...git('ls-files', '--', project), ...git('ls-files', '--others', '--exclude-standard', '--', project)])];
  const sources = files
    .map((f) => f.slice(project.length + 1))
    .filter((f) => isSource(f) && inScope(f, cfg) && existsSync(join(dir, f)))
    .map((path) => ({ path, codeLines: codeLines(join(dir, path)) }));
  const projChanged = (changed || []).filter((f) => f.startsWith(`${project}/`)).map((f) => f.slice(project.length + 1));

  let lcov = new Map();
  let testsPassed = false;
  if (existsSync(join(dir, 'tests'))) {
    const tmp = mkdtempSync(join(tmpdir(), 'coverage-'));
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT; // a run nested in another test runner must still report properly
    const run = spawnSync(process.execPath, ['--test', '--experimental-test-coverage',
      '--test-reporter=dot', '--test-reporter-destination=stdout',
      '--test-reporter=lcov', `--test-reporter-destination=${join(tmp, 'lcov.info')}`], { cwd: dir, env, encoding: 'utf8' });
    testsPassed = run.status === 0;
    if (existsSync(join(tmp, 'lcov.info'))) lcov = parseLcov(readFileSync(join(tmp, 'lcov.info'), 'utf8'));
    rmSync(tmp, { recursive: true, force: true });
  }
  const result = evaluate({ lcov, sources, changed: projChanged, cfg, testsPassed });
  if (!existsSync(join(dir, 'tests'))) result.failures.unshift(`no ${project}/tests folder — no unit tests at all`);
  result.pass = result.failures.length === 0;
  return { text: formatReport(project, result, cfg), pass: result.pass };
}

// Lines that can hold code: not blank, not a comment-only line. Used only for files no test loaded.
function codeLines(path) {
  return readFileSync(path, 'utf8').split('\n').filter((l) => {
    const t = l.trim();
    return t && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
  }).length;
}

let allPass = true;
for (const p of projects) {
  if (!existsSync(join(root, p))) {
    console.log(`✗ project '${p}' not found`);
    allPass = false;
    continue;
  }
  const { text, pass } = evalProject(p);
  console.log(text + '\n');
  allPass &&= pass;
}
console.log(allPass ? 'COVERAGE PASS' : 'COVERAGE FAIL');
process.exit(allPass ? 0 : 1);
