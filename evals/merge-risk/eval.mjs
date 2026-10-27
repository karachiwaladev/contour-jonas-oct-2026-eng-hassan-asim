// merge-risk eval: how risky it is to merge a change, from its git diff (base...head). Each case is a
// risk check that passes when the change is low-risk on that axis; the score is the share passing.
import { execFileSync } from 'node:child_process';

export const LIMITS = Object.freeze({ changedLines: 400, files: 20, fileLines: 150 });
const SOURCE = /\.(m?js|cjs|ts|jsx|tsx)$/;
const isTest = (p) => /(^|\/)tests?\//.test(p) || /\.test\.[cm]?[jt]sx?$/.test(p);
const isSource = (p) => SOURCE.test(p) && !isTest(p) && !p.startsWith('.');
// Same sinks as quality-gate.sh. Assembled from parts so this file doesn't trip the gate's own scan.
const SINKS = new RegExp([
  String.raw`\.(inner|outer)HTML\s*\+?=`, 'insert' + 'AdjacentHTML', String.raw`document\.wr` + 'ite',
  String.raw`(^|[^.\w])ev` + String.raw`al\s*\(`, String.raw`new\s+Func` + String.raw`tion\s*\(`,
  String.raw`set(Timeout|Interval)\s*\(\s*['"\x60]`, String.raw`\son[a-z]+\s*=\s*["']`, 'java' + 'script:',
].join('|'));

const deps = (text) => {
  try {
    const pkg = JSON.parse(text);
    return Object.keys({ ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies });
  } catch {
    return [];
  }
};

/** Reads the diff between two commits in the repo at `root`. */
export function gatherDiffFacts(root, base, head) {
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const show = (ref, path) => {
    try {
      return git('show', `${ref}:${path}`);
    } catch {
      return null; // the path doesn't exist at that ref
    }
  };
  const range = `${base}...${head}`;
  const status = new Map(git('diff', '--name-status', '--no-renames', range).split('\n').filter(Boolean)
    .map((l) => l.split('\t')).map(([s, p]) => [p, s[0]]));
  const files = git('diff', '--numstat', '--no-renames', range).split('\n').filter(Boolean).map((l) => {
    const [a, d, path] = l.split('\t');
    const binary = a === '-';
    return { path, status: status.get(path) ?? 'M', added: binary ? 0 : Number(a), deleted: binary ? 0 : Number(d), binary };
  });
  const addedLines = [];
  let current = null;
  for (const line of git('diff', '--unified=0', '--no-renames', range).split('\n')) {
    if (line.startsWith('+++ ')) current = line.slice(6);
    else if (line.startsWith('+') && current) addedLines.push({ path: current, text: line.slice(1) });
  }
  const depsAdded = files.filter((f) => f.path.endsWith('package.json')).flatMap((f) => {
    const before = new Set(deps(show(base, f.path) ?? '{}'));
    return deps(show(head, f.path) ?? '{}').filter((d) => !before.has(d)).map((d) => `${f.path}: ${d}`);
  });
  const sizes = Object.fromEntries(files.filter((f) => isSource(f.path) && f.status !== 'D')
    .map((f) => [f.path, (show(head, f.path) ?? '').split('\n').length - 1]));
  return { base, head, files, addedLines, depsAdded, sizes };
}

/** Turns diff facts into risk cases. Pure, so every rule is unit-tested. */
export function mergeRiskCases(facts) {
  const { files } = facts;
  const changed = files.reduce((n, f) => n + f.added + f.deleted, 0);
  const source = files.filter((f) => isSource(f.path));
  const tests = files.filter((f) => isTest(f.path));
  const deleted = files.filter((f) => f.status === 'D').map((f) => f.path);
  // Hooks, skills, settings and CI change how every later change is checked; logs don't.
  const harness = files.filter((f) => /^\.(claude|github)\//.test(f.path) && !f.path.startsWith('.claude/logs/')).map((f) => f.path);
  const big = Object.entries(facts.sizes).filter(([, n]) => n > LIMITS.fileLines).map(([p, n]) => `${p} (${n})`);
  const sinks = facts.addedLines.filter((l) => isSource(l.path) || /\.html?$/.test(l.path)).filter((l) => SINKS.test(l.text)).map((l) => l.path);
  const projects = [...new Set(files.map((f) => f.path).filter((p) => p.includes('/') && !p.startsWith('.')).map((p) => p.split('/')[0]))];
  const list = (xs) => xs.slice(0, 5).join(', ') + (xs.length > 5 ? ` (+${xs.length - 5} more)` : '');
  return [
    { id: 'small-diff', pass: changed <= LIMITS.changedLines, detail: `${changed} text lines changed (max ${LIMITS.changedLines})` },
    { id: 'few-files', pass: files.length <= LIMITS.files, detail: `${files.length} files changed (max ${LIMITS.files})` },
    { id: 'tests-with-source', pass: source.length === 0 || tests.length > 0, detail: `${source.length} source files, ${tests.length} test files changed` },
    { id: 'no-deleted-files', pass: deleted.length === 0, detail: deleted.length ? `deleted: ${list(deleted)}` : 'no files deleted' },
    { id: 'no-harness-changes', pass: harness.length === 0, detail: harness.length ? `touches: ${list(harness)}` : 'no .claude/ or .github/ changes' },
    { id: 'no-new-dependencies', pass: facts.depsAdded.length === 0, detail: facts.depsAdded.length ? list(facts.depsAdded) : 'no dependencies added' },
    { id: 'files-under-limit', pass: big.length === 0, detail: big.length ? `over ${LIMITS.fileLines} lines: ${list(big)}` : `changed source files ≤ ${LIMITS.fileLines} lines` },
    { id: 'no-unsafe-sinks', pass: sinks.length === 0, detail: sinks.length ? `unsafe sink added in: ${list([...new Set(sinks)])}` : 'no unsafe sinks added' },
    { id: 'single-project', pass: projects.length <= 1, detail: projects.length ? `projects touched: ${projects.join(', ')}` : 'no project folders touched' },
  ];
}

/** low / medium / high from the score, for one-line reports. */
export const riskLevel = (score) => (score >= 85 ? 'low' : score >= 60 ? 'medium' : 'high');
