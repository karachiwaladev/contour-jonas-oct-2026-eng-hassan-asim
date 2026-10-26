// Pure helpers for the coverage eval: parse lcov, apply thresholds, format the report.
// No I/O here, so every rule is unit-tested in .claude/tests/coverage-eval.test.mjs.

export const DEFAULTS = Object.freeze({
  include: ['src/domain/', 'src/data/', 'src/services/'],
  exclude: [],
  lines: 90,
  branches: 80,
  functions: 90,
  changedFileLines: 80,
});

const METRICS = ['lines', 'branches', 'functions'];

// A project's package.json may override any default under "coverage" (unknown keys ignored).
export function resolveConfig(pkg = {}) {
  const own = pkg && typeof pkg.coverage === 'object' && pkg.coverage ? pkg.coverage : {};
  const cfg = { ...DEFAULTS };
  for (const key of ['include', 'exclude']) {
    if (Array.isArray(own[key]) && own[key].every((s) => typeof s === 'string')) cfg[key] = own[key];
  }
  for (const key of [...METRICS, 'changedFileLines']) {
    if (Number.isFinite(own[key]) && own[key] >= 0 && own[key] <= 100) cfg[key] = own[key];
  }
  return cfg;
}

// A path is in scope when it starts with an include prefix and no exclude prefix (exact file or folder/).
export const inScope = (path, cfg) =>
  cfg.include.some((p) => path.startsWith(p)) && !cfg.exclude.some((p) => path === p || path.startsWith(p));

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
 * sources: in-scope source files (project-relative), with `codeLines` for files no test loaded.
 * changed: project-relative paths changed on the branch. Returns the verdict and its reasons.
 */
export function evaluate({ lcov, sources, changed = [], cfg, testsPassed = true }) {
  const totals = { lines: [0, 0], branches: [0, 0], functions: [0, 0] };
  const files = [];
  const failures = [];
  if (!testsPassed) failures.push('unit tests are failing');
  if (sources.length === 0) failures.push(`no source files in scope (${cfg.include.join(', ')})`);
  for (const { path, codeLines } of sources) {
    const cov = lcov.get(path);
    const isChanged = changed.includes(path);
    const row = cov
      ? { path, changed: isChanged, loaded: true, lines: pct(cov.lines), branches: pct(cov.branches), functions: pct(cov.functions) }
      : { path, changed: isChanged, loaded: false, lines: 0, branches: null, functions: null };
    for (const m of METRICS) {
      const [hit, found] = cov ? cov[m] : m === 'lines' ? [0, codeLines] : [0, 0];
      totals[m][0] += hit;
      totals[m][1] += found;
    }
    if (!cov) failures.push(`${path}: no test imports it — write unit tests for it`);
    else if (isChanged && row.lines < cfg.changedFileLines) {
      failures.push(`${path}: changed but only ${fmt(row.lines)} lines covered (min ${cfg.changedFileLines}%)`);
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
