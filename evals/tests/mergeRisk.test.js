import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { gatherDiffFacts, mergeRiskCases, riskLevel, LIMITS } from '../merge-risk/eval.mjs';
import { repoWith, SUM, SUM_TEST } from './support.js';

const file = (path, over = {}) => ({ path, status: 'M', added: 1, deleted: 0, binary: false, ...over });
const facts = (over = {}) => ({ files: [file('app/src/a.js'), file('app/tests/a.test.js')], addedLines: [], depsAdded: [], sizes: { 'app/src/a.js': 10 }, ...over });
const byId = (cs) => Object.fromEntries(cs.map((c) => [c.id, c]));

test('a small, tested, single-project change passes all nine cases', () => {
  const cs = mergeRiskCases(facts());
  assert.equal(cs.length, 9);
  assert.deepEqual(cs.filter((c) => !c.pass), []);
});

test('size limits: lines changed and file count', () => {
  const many = Array.from({ length: LIMITS.files + 1 }, (_, i) => file(`app/docs/${i}.md`, { added: 30 }));
  const c = byId(mergeRiskCases(facts({ files: many })));
  assert.equal(c['small-diff'].pass, false);
  assert.equal(c['few-files'].pass, false);
});

test('source without tests, deletions, harness edits and new dependencies are risks', () => {
  const c = byId(mergeRiskCases(facts({
    files: [file('app/src/a.js'), file('app/old.js', { status: 'D' }), file('.claude/hooks/x.sh')],
    depsAdded: ['app/package.json: left-pad'],
  })));
  assert.equal(c['tests-with-source'].pass, false);
  assert.match(c['no-deleted-files'].detail, /app\/old\.js/);
  assert.match(c['no-harness-changes'].detail, /\.claude\/hooks\/x\.sh/);
  assert.match(c['no-new-dependencies'].detail, /left-pad/);
});

test('oversized files, unsafe sinks and multi-project changes are risks', () => {
  const c = byId(mergeRiskCases(facts({
    files: [file('app/src/a.js'), file('app/tests/a.test.js'), file('web/index.html')],
    sizes: { 'app/src/a.js': LIMITS.fileLines + 1 },
    addedLines: [{ path: 'app/src/a.js', text: 'el.innerHTML = x;' }, { path: 'app/README.md', text: 'never use innerHTML = x' }],
  })));
  assert.equal(c['files-under-limit'].pass, false);
  assert.match(c['no-unsafe-sinks'].detail, /app\/src\/a\.js/);
  assert.doesNotMatch(c['no-unsafe-sinks'].detail, /README/);
  assert.equal(c['single-project'].pass, false);
});

test('riskLevel bands the score', () => {
  assert.deepEqual([100, 85, 84, 60, 59].map(riskLevel), ['low', 'low', 'medium', 'medium', 'high']);
});

test('gatherDiffFacts reads statuses, line counts, binaries, added lines, new deps and sizes', () => {
  const { dir } = repoWith(
    { 'app/package.json': '{"dependencies":{"a":"1"}}', 'app/old.md': 'x\n', 'app/src/sum.js': SUM },
    { 'app/package.json': '{"dependencies":{"a":"1","b":"2"}}', 'app/src/sum.js': `${SUM}export const two = 2;\n`, 'app/tests/sum.test.js': SUM_TEST, 'app/shot.png': Buffer.from([0, 1, 2, 0]) },
  );
  execSync('git rm -q app/old.md && git commit -q -m del', { cwd: dir });
  const f = gatherDiffFacts(dir, 'base', 'HEAD');
  const by = Object.fromEntries(f.files.map((x) => [x.path, x]));
  assert.equal(by['app/old.md'].status, 'D');
  assert.equal(by['app/tests/sum.test.js'].status, 'A');
  assert.equal(by['app/shot.png'].binary, true);
  assert.deepEqual(f.depsAdded, ['app/package.json: b']);
  assert.equal(f.sizes['app/src/sum.js'], 2);
  assert.ok(f.addedLines.some((l) => l.path === 'app/src/sum.js' && l.text === 'export const two = 2;'));
});

test('gatherDiffFacts treats unparsable or new package.json as having no previous deps', () => {
  const { dir } = repoWith({ 'app/package.json': 'not json' }, { 'app/package.json': '{"devDependencies":{"x":"1"}}', 'web/package.json': '{"dependencies":{"y":"1"}}' });
  assert.deepEqual(gatherDiffFacts(dir, 'base', 'HEAD').depsAdded.sort(), ['app/package.json: x', 'web/package.json: y']);
});

test('prompt logs under .claude/logs/ are not harness changes', () => {
  const c = byId(mergeRiskCases(facts({ files: [...facts().files, file('.claude/logs/prompts.jsonl')] })));
  assert.equal(c['no-harness-changes'].pass, true);
});
