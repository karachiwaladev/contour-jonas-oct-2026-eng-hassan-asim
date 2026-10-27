// Persona swarm (.claude/skills/persona-swarm/). Run: node --test '.claude/tests/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pickPersonas, isLocalUrl, validateAgentResult, frictionMap, formatReport, ALWAYS, SWARM_SIZE } from '../skills/persona-swarm/lib.mjs';
import { loadPanel, main } from '../skills/persona-swarm/swarm.mjs';

const panel = loadPanel();

test('the panel has 6 personas in shoal\'s schema, including the always-on hacker', () => {
  assert.equal(panel.length, 6);
  for (const p of panel) {
    for (const k of ['id', 'emoji', 'name', 'profile']) assert.equal(typeof p[k], 'string', `${p.id}.${k}`);
    assert.ok(Number.isInteger(p.patience_steps) && p.patience_steps > 0, p.id);
  }
  assert.ok(panel.some((p) => p.id === ALWAYS));
  assert.equal(new Set(panel.map((p) => p.id)).size, 6);
});

test('pickPersonas: 5 per run, hacker always in, rotation covers every persona', () => {
  const seen = new Set();
  for (let run = 0; run < 5; run++) {
    const picked = pickPersonas(panel, run);
    assert.equal(picked.length, SWARM_SIZE);
    assert.equal(picked[0].id, ALWAYS);
    assert.equal(new Set(picked.map((p) => p.id)).size, SWARM_SIZE);
    picked.forEach((p) => seen.add(p.id));
  }
  assert.equal(seen.size, 6);
  assert.notDeepEqual(pickPersonas(panel, 1).map((p) => p.id), pickPersonas(panel, 2).map((p) => p.id));
  assert.throws(() => pickPersonas(panel.slice(0, 3), 1), /at least 4/);
});

test('isLocalUrl allows only local dev servers', () => {
  for (const u of ['http://localhost:8000/', 'http://127.0.0.1:3000/x', 'http://[::1]:5173/']) assert.equal(isLocalUrl(u), true, u);
  for (const u of ['https://example.com', 'http://localhost.evil.com', 'file:///etc/passwd', 'javascript:alert(1)', 'nope']) assert.equal(isLocalUrl(u), false, u);
});

const result = (persona, findings, outcome = 'completed') => ({ persona, outcome, steps: 10, findings });
const finding = (title, severity = 'medium', detail = 'd') => ({ title, severity, detail });

test('validateAgentResult catches malformed agent output', () => {
  assert.deepEqual(validateAgentResult(result('a', [finding('x')])), []);
  assert.deepEqual(validateAgentResult(null), ['result must be an object']);
  const bad = validateAgentResult({ persona: '', outcome: 'won', findings: [{ title: '', severity: 'huge' }] });
  assert.equal(bad.length, 4);
  assert.match(validateAgentResult({ persona: 'a', outcome: 'completed' }).join(), /must be an array/);
});

test('frictionMap clusters similar findings and ranks by personas hit, then severity', () => {
  const map = frictionMap([
    result('a', [finding('Search box loses focus after typing', 'low'), finding('Tiny delete button', 'medium')]),
    result('b', [finding('search box loses focus when typing fast', 'high')]),
    result('c', [finding('Stored XSS in task title', 'critical')]),
  ]);
  assert.equal(map.length, 3);
  assert.equal(map[0].hits, 2);
  assert.equal(map[0].severity, 'high', 'worst severity wins');
  assert.deepEqual(map[0].personas, ['a', 'b']);
  assert.equal(map[1].severity, 'critical', 'ties on hits rank by severity');
});

test('formatReport shows outcomes and the ranked map, or a clean message', () => {
  const md = formatReport([result('a', [finding('Broken undo', 'high', 'deleted for good')]), result('b', [], 'gave_up')], { label: 'Ticket #9' });
  assert.match(md, /## Persona swarm · Ticket #9/);
  assert.match(md, /\| b \| gave_up \| 10 \| 0 \|/);
  assert.match(md, /1\. \*\*Broken undo\*\*: 1\/2 personas · high · a/);
  assert.match(formatReport([result('a', [])]), /No findings/);
});

test('swarm CLI: pick prints 5 personas; report validates, writes report.json and prints markdown', () => {
  let printed = '';
  const out = (s) => { printed += s; };
  assert.equal(main(['pick', '7'], { out, panel }), 0);
  assert.equal(JSON.parse(printed).length, 5);
  const dir = mkdtempSync(join(tmpdir(), 'swarm-'));
  writeFileSync(join(dir, 'a.json'), JSON.stringify(result('a', [finding('Lost edit')])));
  printed = '';
  assert.equal(main(['report', dir, '--label', 'T'], { out, panel }), 0);
  assert.match(printed, /Lost edit/);
  assert.equal(JSON.parse(readFileSync(join(dir, 'report.json'), 'utf8')).frictionMap.length, 1);
  writeFileSync(join(dir, 'b.json'), JSON.stringify({ persona: 'b', outcome: 'x', findings: [] }));
  printed = '';
  assert.equal(main(['report', dir], { out, panel }), 1);
  assert.match(printed, /b\.json: outcome/);
  assert.equal(main([], { out: () => {}, panel }), 2);
});
