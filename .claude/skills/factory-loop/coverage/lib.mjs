// Pure helpers for the coverage eval: parse lcov, apply thresholds, format the report.
// No I/O here, so every rule is unit-tested in .claude/tests/coverage-eval.test.mjs.

// Every source file is in scope except UI components and the entry point, which are verified in
// the browser. A project's `exclude` adds to DEFAULT_EXCLUDE; it can't put UI back out of reach.
export const DEFAULT_EXCLUDE = Object.freeze(['src/ui/', 'src/main.js']);
export const DEFAULTS = Object.freeze({
  include: [''],
  exclude: DEFAULT_EXCLUDE,
  lines: 90,
  branches: 80,
  functions: 90,
  changedFileLines: 80,
  changedFileBranches: 70,
  changedFileFunctions: 80,
});
const NUMERIC = ['lines', 'branches', 'functions', 'changedFileLines', 'changedFileBranches', 'changedFileFunctions'];

const METRICS = ['lines', 'branches', 'functions'];

// A project's package.json may override any default under "coverage" (unknown keys ignored).
export function resolveConfig(pkg = {}) {
  const own = pkg && typeof pkg.coverage === 'object' && pkg.coverage ? pkg.coverage : {};
  const cfg = { ...DEFAULTS };
  const list = (v) => Array.isArray(v) && v.every((s) => typeof s === 'string');
  if (list(own.include)) cfg.include = own.include;
  if (list(own.exclude)) cfg.exclude = [...DEFAULT_EXCLUDE, ...own.exclude];
  for (const key of NUMERIC) {
    if (Number.isFinite(own[key]) && own[key] >= 0 && own[key] <= 100) cfg[key] = own[key];
  }
  return cfg;
}

// Entries are an exact file, a folder (matches everything under it, with or without a trailing
// slash), or '' for the whole project. `src/data/foo` never matches `src/data/foobar.js`.
const matches = (path, p) => p === '' || path === p || path.startsWith(p.endsWith('/') ? p : `${p}/`);
export const inScope = (path, cfg) => cfg.include.some((p) => matches(path, p)) && !cfg.exclude.some((p) => matches(path, p));

// The coverage config is the agent's own exam, so a branch may only tighten it: any lowered
// threshold, new exclude or narrowed include (vs the base config) is reported as a weakening.
export function weakenedConfig(baseCfg, cfg) {
  const out = [];
  for (const key of NUMERIC) if (cfg[key] < baseCfg[key]) out.push(`${key} ${baseCfg[key]} → ${cfg[key]}`);
  for (const p of cfg.exclude) if (!baseCfg.exclude.includes(p)) out.push(`exclude adds \`${p}\``);
  for (const p of baseCfg.include) if (!cfg.include.includes(p)) out.push(`include drops \`${p}\``);
  return out;
}

export function parseLcov(text) {
  const files = new Map();
  let cur = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const i = line.indexOf(':');
    const key = i < 0 ? line : line.slice(0, i);
    const val = line.slice(i + 1);
    if (key === 'SF') {
      cur = { lines: [0, 0], branches: [0, 0], functions: [0, 0] };
      files.set(val.replace(/^\.\//, ''), cur);
    } else if (cur) {
      const n = Number(val);
      if (key === 'LH') cur.lines[0] = n;
      else if (key === 'LF') cur.lines[1] = n;
      else if (key === 'BRH') cur.branches[0] = n;
      else if (key === 'BRF') cur.branches[1] = n;
      else if (key === 'FNH') cur.functions[0] = n;
      else if (key === 'FNF') cur.functions[1] = n;
      else if (key === 'end_of_record') cur = null;
    }
  }
  return files;
}

// Percent with nothing to cover counts as 100 (a file with no branches isn't a gap).
export const pct = ([hit, found]) => (found === 0 ? 100 : (100 * hit) / found);

/**
 * sources: in-scope source files (project-relative): `codeLines` (code-bearing lines, used when
 * coverage can't count them) and `ignores` (true if it has a `node:coverage disable/ignore` comment).
 * changed: project-relative paths changed on the branch. Returns the verdict and its reasons.
 */
export function evaluate({ lcov, sources, changed = [], cfg, testsPassed = true }) {
  const totals = { lines: [0, 0], branches: [0, 0], functions: [0, 0] };
  const files = [];
  const failures = [];
  if (!testsPassed) failures.push('unit tests are failing');
  if (sources.length === 0) failures.push(`no source files in scope (${cfg.include.join(', ')})`);
  for (const { path, codeLines, ignores } of sources) {
    let cov = lcov.get(path);
    // Lines hidden from coverage (ignore comments, or nothing counted) are treated as uncovered.
    if (cov && cov.lines[1] === 0 && codeLines > 0) cov = { ...cov, lines: [0, codeLines] };
    const isChanged = changed.includes(path);
    const row = cov
      ? { path, changed: isChanged, loaded: true, lines: pct(cov.lines), branches: pct(cov.branches), functions: pct(cov.functions) }
      : { path, changed: isChanged, loaded: false, lines: 0, branches: null, functions: null };
    for (const m of METRICS) {
      const [hit, found] = cov ? cov[m] : m === 'lines' ? [0, codeLines] : [0, 0];
      totals[m][0] += hit;
      totals[m][1] += found;
    }
    if (ignores) failures.push(`${path}: has a node:coverage disable/ignore comment — test the code instead`);
    if (!cov) failures.push(`${path}: no test imports it — write unit tests for it`);
    else if (isChanged) {
      for (const [m, min] of [['lines', cfg.changedFileLines], ['branches', cfg.changedFileBranches], ['functions', cfg.changedFileFunctions]]) {
        if (row[m] < min) failures.push(`${path}: changed but only ${fmt(row[m])} ${m} covered (min ${min}%)`);
      }
    }
    files.push(row);
  }
  const summary = {};
  for (const m of METRICS) {
    summary[m] = pct(totals[m]);
    if (summary[m] < cfg[m]) failures.push(`${m} coverage ${fmt(summary[m])} is below ${cfg[m]}%`);
  }
  return { pass: failures.length === 0, summary, files, failures };
}

export const fmt = (n) => (n === null ? '—' : `${(Math.floor(n * 10) / 10).toFixed(1)}%`);

// Markdown, so the same text goes in the terminal, the PR body and the Stop-hook message.
export function formatReport(project, result, cfg) {
  const mark = (m) => (result.summary[m] >= cfg[m] ? '✓' : '✗');
  const out = [
    `### Coverage: \`${project}\` — ${result.pass ? 'PASS ✓' : 'FAIL ✗'}`,
    '',
    '| Metric | Covered | Threshold | |',
    '|---|---|---|---|',
    ...METRICS.map((m) => `| ${m} | ${fmt(result.summary[m])} | ${cfg[m]}% | ${mark(m)} |`),
    '',
  ];
  const extra = cfg.exclude.filter((p) => !DEFAULT_EXCLUDE.includes(p));
  if (extra.length) out.push(`Excluded by the project: ${extra.map((p) => `\`${p}\``).join(', ')}`, '');
  const shown = result.files.filter((f) => f.changed || !f.loaded || f.lines < 100);
  if (shown.length) {
    out.push('| File | Lines | Branches | Functions | |', '|---|---|---|---|---|');
    for (const f of shown) {
      const tag = !f.loaded ? 'untested' : f.changed ? 'changed' : '';
      out.push(`| ${f.path} | ${fmt(f.lines)} | ${fmt(f.branches)} | ${fmt(f.functions)} | ${tag} |`);
    }
    out.push('');
  }
  for (const reason of result.failures) out.push(`- ✗ ${reason}`);
  return out.join('\n').trimEnd();
}
