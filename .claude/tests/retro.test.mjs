// Self-healing retro (.claude/skills/factory-loop/retro/). Run: node --test '.claude/tests/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CAUSES, classify, digest, report } from '../skills/factory-loop/retro/causes.mjs';
import { extractEvents, projectDir, newestTranscript, main } from '../skills/factory-loop/retro/retro.mjs';

const err = (text, command = 'ls') => ({ kind: 'tool-error', text, command });

test('classify sorts failures into causes', () => {
  assert.equal(classify(err('Blocked by .claude/hooks/guard-bash.sh: piping', "python3 - <<'EOF'")), 'C3');
  assert.equal(classify(err('Blocked by .claude/hooks/guard-bash.sh: the loop never merges', 'gh pr merge 3')), 'guard-ok');
  assert.equal(classify(err('Blocked by .claude/hooks/guard-files.mjs: x is outside the project')), 'C6');
  assert.equal(classify(err('error: Your local changes would be overwritten by checkout')), 'C4');
  assert.equal(classify(err('SyntaxError: missing ) after argument list')), 'C5');
  assert.equal(classify(err('not ok 3 - x')), 'expected');
  assert.equal(classify(err('Exit code 1', 'grep -n x f')), 'expected');
  assert.equal(classify(err('something nobody has seen')), 'new');
  assert.equal(classify({ kind: 'user', text: 'fix these so i can score best on leaderboard' }), 'C1');
  assert.equal(classify({ kind: 'user', text: 'it is still wrong' }), 'C2');
  assert.equal(classify({ kind: 'user', text: 'add a footer <pasted_content id="1">use X instead, still</pasted_content id="1">' }), 'expected');
  assert.equal(classify({ kind: 'review', text: '**High** bug in x' }), 'C2');
  assert.equal(classify({ kind: 'loop-pass', text: 'Quiet tick: nothing' }), 'C7');
});

test('digest drops expected and rightful blocks; report names the fix location', () => {
  const groups = digest([err('SyntaxError: x'), err('not ok 1'), err('weird'), { kind: 'loop-pass', text: 'Quiet tick' }]);
  assert.deepEqual(Object.keys(groups).sort(), ['C5', 'C7', 'new']);
  const md = report(groups, { since: 'S' });
  assert.match(md, /### C5 · 1× .*\nFix in: references\/pitfalls\.md/);
  assert.match(md, /### new · 1× · NEW/);
  assert.match(report({}, {}), /Nothing to heal/);
  assert.ok(Object.keys(CAUSES).length >= 7);
});

const line = (o) => JSON.stringify(o);
const T = (t) => `2026-10-27T0${t}:00:00Z`;
const transcript = [
  line({ type: 'assistant', timestamp: T(1), message: { content: [{ type: 'tool_use', id: 'u1', input: { command: 'git switch main' } }] } }),
  line({ type: 'user', timestamp: T(1), message: { content: [{ type: 'tool_result', tool_use_id: 'u1', is_error: true, content: [{ type: 'text', text: 'would be overwritten by checkout' }] }] } }),
  line({ type: 'user', timestamp: T(2), message: { content: 'this is still broken' } }),
  line({ type: 'user', timestamp: T(2), message: { content: '<command-name>/loop</command-name>' } }),
  line({ type: 'user', timestamp: T(3), message: { content: [{ type: 'text', text: '[Subagent hand-back] High: bug' }] } }),
  line({ type: 'assistant', timestamp: T(4), message: { content: [{ type: 'text', text: 'Quiet tick: nothing new.' }] } }),
  'not json',
].join('\n');

test('extractEvents reads errors with their command, owner messages, reviews and idle passes in the window', () => {
  const ev = extractEvents(transcript, { since: T(0) });
  assert.deepEqual(ev.map((e) => e.kind), ['tool-error', 'user', 'review', 'loop-pass']);
  assert.equal(ev[0].command, 'git switch main');
  assert.deepEqual(extractEvents(transcript, { since: T(2), until: T(3) }).map((e) => e.kind), ['user']);
});

test('main finds the newest transcript for the project and reports', () => {
  const home = mkdtempSync(join(tmpdir(), 'home-'));
  const dir = projectDir('/work/my.repo', home);
  assert.match(dir, /projects\/-work-my-repo$/);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'old.jsonl'), '');
  utimesSync(join(dir, 'old.jsonl'), 1, 1);
  writeFileSync(join(dir, 'new.jsonl'), transcript);
  assert.equal(newestTranscript(dir), join(dir, 'new.jsonl'));
  assert.equal(newestTranscript(join(home, 'none')), null);
  const r = main(['--since', T(0), '--transcript', join(dir, 'new.jsonl')]);
  assert.equal(r.code, 0);
  assert.match(r.text, /### C4/);
  assert.equal(main([], { cwd: '/nowhere/at/all' }).code, 3);
});
