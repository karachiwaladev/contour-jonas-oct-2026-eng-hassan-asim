// Jev engine for the persona swarm (.claude/skills/persona-swarm/jev*.mjs). Run: node --test '.claude/tests/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildOptions, inputFor, detectLoop, findingsFromRun, toResult, providerFor, PERSONA_INPUTS, JEV_MODEL } from '../skills/persona-swarm/jev-lib.mjs';
import { decide, loadKey, parseArgs } from '../skills/persona-swarm/jev.mjs';
import { validateAgentResult, ALWAYS } from '../skills/persona-swarm/lib.mjs';
import { loadPanel } from '../skills/persona-swarm/swarm.mjs';

const snap = {
  url: 'http://localhost:8790/#/list?x=1', title: 'Todo', text: 'My tasks\n2 items',
  controls: [
    { n: 1, tag: 'input', type: 'text', label: 'New task', value: '', checked: false },
    { n: 2, tag: 'button', type: 'submit', label: 'Add', value: '', checked: false },
    { n: 3, tag: 'input', type: 'checkbox', label: 'milk', value: 'on', checked: true },
    { n: 4, tag: 'a', type: '', label: '', value: '', checked: false },
    { n: 5, tag: 'textarea', type: 'textarea', label: 'Notes', value: 'hi', checked: false },
  ],
};

test('every persona in the panel has Jev inputs, and the hacker has script payloads', () => {
  for (const p of loadPanel()) assert.ok(PERSONA_INPUTS[p.id]?.length > 0, p.id);
  assert.ok(PERSONA_INPUTS[ALWAYS].some((s) => /<script|onerror=/i.test(s)));
});

test('inputFor cycles through the persona inputs and falls back for unknown personas', () => {
  const list = PERSONA_INPUTS[ALWAYS];
  assert.equal(inputFor(ALWAYS, 0), list[0]);
  assert.equal(inputFor(ALWAYS, list.length), list[0]);
  assert.equal(typeof inputFor('nobody', 3), 'string');
});

test('buildOptions: text fields get TYPE, clickables get CLICK, keys always offered', () => {
  const { criteria, targets, state } = buildOptions(snap, { step: 0, nextText: 'buy milk' });
  assert.deepEqual(targets['TYPE:1'], { op: 'type', n: 1, text: 'buy milk' });
  assert.deepEqual(targets['TYPE:5'], { op: 'type', n: 5, text: 'buy milk' });
  assert.deepEqual(targets['CLICK:2'], { op: 'click', n: 2 });
  assert.deepEqual(targets['CLICK:3'], { op: 'click', n: 3 });
  assert.equal(targets['CLICK:1'], undefined);
  for (const k of ['KEY:Enter', 'KEY:Escape', 'KEY:Tab', 'RELOAD', 'GIVE_UP']) assert.ok(criteria[k], k);
  assert.match(criteria['TYPE:1'], /New task.*textbox.*buy milk/);
  assert.match(criteria['CLICK:2'], /Add.*button/);
  assert.equal(state.url, '/#/list', 'path and hash only: no query string or host sent');
  assert.deepEqual(state.elements[2], { i: '3', r: 'checkbox', l: 'milk', v: 'checked' });
  assert.equal(state.elements[3].l, '(unlabeled)');
  assert.deepEqual(Object.keys(criteria).sort(), Object.keys(targets).sort());
});

test('buildOptions: DONE only after 3 steps, so Jev cannot quit before trying', () => {
  assert.equal(buildOptions(snap, { step: 2, nextText: 'x' }).criteria.DONE, undefined);
  assert.ok(buildOptions(snap, { step: 3, nextText: 'x' }).criteria.DONE);
});

test('buildOptions caps elements and text so the decision stays small', () => {
  const many = { ...snap, text: 'x'.repeat(5000), controls: Array.from({ length: 100 }, (_, i) => ({ n: i + 1, tag: 'button', type: 'button', label: `b${i}`, value: '', checked: false })) };
  const { state, criteria } = buildOptions(many, { step: 0, nextText: 'x' });
  assert.ok(state.elements.length <= 40);
  assert.ok(state.text.length <= 300);
  assert.ok(Object.keys(criteria).length <= 46);
});

test('buildOptions keeps the last 5 actions as history', () => {
  const history = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  assert.deepEqual(buildOptions(snap, { step: 9, nextText: 'x', history }).state.done, ['c', 'd', 'e', 'f', 'g']);
});

test('detectLoop: same action on an unchanged page 3 times in a row', () => {
  const s = (choice, sig) => ({ choice, sig });
  assert.equal(detectLoop([s('CLICK:2', 1), s('CLICK:2', 1), s('CLICK:2', 1)]), true);
  assert.equal(detectLoop([s('CLICK:2', 1), s('CLICK:2', 2), s('CLICK:2', 3)]), false);
  assert.equal(detectLoop([s('CLICK:2', 1), s('CLICK:2', 1)]), false);
  assert.equal(detectLoop([s('CLICK:1', 1), s('CLICK:2', 1), s('CLICK:2', 1)]), false);
});

test('findingsFromRun: code, not the model, turns evidence into findings', () => {
  const f = findingsFromRun({
    goal: 'add a task', outcome: 'gave_up', lastTyped: '<img src=x onerror=alert(1)>',
    status: { dialogs: ['alert: 1', 'alert: 1'], errors: ['TypeError: x is undefined'] },
    loop: { label: 'CLICK 2 Add [button]' }, unlabeled: [{ n: 4, tag: 'a' }],
  });
  const by = (re) => f.find((x) => re.test(x.title));
  assert.equal(by(/script ran/i).severity, 'critical');
  assert.match(by(/script ran/i).detail, /onerror/);
  assert.equal(f.filter((x) => /script ran/i.test(x.title)).length, 1, 'duplicate dialogs collapse');
  assert.equal(by(/script error/i).severity, 'high');
  assert.equal(by(/stuck/i).severity, 'high');
  assert.equal(by(/no visible change/i).severity, 'medium');
  assert.equal(by(/no label/i).severity, 'low');
});

test('findingsFromRun: a clean completed run has no findings; out of patience is medium', () => {
  assert.deepEqual(findingsFromRun({ goal: 'g', outcome: 'completed', status: { dialogs: [], errors: [] } }), []);
  const f = findingsFromRun({ goal: 'g', outcome: 'blocked', status: { dialogs: [], errors: [] } });
  assert.equal(f[0].severity, 'medium');
  assert.match(f[0].title, /patience/i);
});

test('toResult produces a results file that swarm.mjs report accepts', () => {
  const r = toResult({ persona: ALWAYS, outcome: 'completed', steps: 4, goal: 'g', findings: [], trace: [], cost: 0.0001, model: 'jev-1.14.0' });
  assert.deepEqual(validateAgentResult(r), []);
  assert.equal(r.engine, 'jev');
  assert.equal(r.model, 'jev-1.14.0');
});

const okBody = { answers: { action: { choice: 'CLICK:2', confidence: 0.93 } }, usage: { cost: 0.00002 } };
const fakeFetch = (replies) => {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    const r = replies[Math.min(calls.length - 1, replies.length - 1)];
    return { ok: r.status === 200, status: r.status, json: async () => r.body, text: async () => JSON.stringify(r.body) };
  };
  return { fn, calls };
};

test('providerFor routes TypeSafe keys direct and everything else to OpenRouter', () => {
  const ts = providerFor('apikey_abc');
  assert.equal(ts.url, 'https://api.typesafe.ai/v1/systemone');
  assert.equal(ts.model, 'jev-1.14.0');
  assert.equal(providerFor('sk-or-v1-abc').url, 'https://openrouter.ai/api/alpha/decisions');
  assert.equal(providerFor('sk-or-v1-abc').model, JEV_MODEL);
});

test('decide talks to TypeSafe directly for an apikey_ key and prices by input tokens', async () => {
  const { fn, calls } = fakeFetch([{ status: 200, body: { answers: { action: { choice: 'CLICK:2', confidence: 0.9 } }, usage: { input_tokens: 1000 } } }]);
  const d = await decide({ state: {}, criteria: { 'CLICK:2': 'x' }, goal: 'g' }, { key: 'apikey_test', fetchFn: fn });
  assert.equal(calls[0].url, 'https://api.typesafe.ai/v1/systemone');
  assert.equal(JSON.parse(calls[0].init.body).model, 'jev-1.14.0');
  assert.ok(Math.abs(d.cost - 0.000042) < 1e-12, String(d.cost));
});

test('decide posts one choice question to OpenRouter with a bearer key', async () => {
  const { fn, calls } = fakeFetch([{ status: 200, body: okBody }]);
  const d = await decide({ state: { url: '/' }, criteria: { 'CLICK:2': 'x' }, goal: 'g' }, { key: 'sk-test', fetchFn: fn });
  assert.deepEqual(d, { choice: 'CLICK:2', confidence: 0.93, cost: 0.00002 });
  assert.equal(calls[0].url, 'https://openrouter.ai/api/alpha/decisions');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer sk-test');
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.model, JEV_MODEL);
  assert.equal(body.questions.action.type, 'choice');
  assert.equal(body.questions.action.instructions.goal, 'g');
});

test('decide retries 429/5xx, then fails without leaking the key', async () => {
  const retry = fakeFetch([{ status: 429, body: {} }, { status: 200, body: okBody }]);
  assert.equal((await decide({ state: {}, criteria: { 'CLICK:2': 'x' }, goal: 'g' }, { key: 'sk-secret', fetchFn: retry.fn, backoffMs: 1 })).choice, 'CLICK:2');
  assert.equal(retry.calls.length, 2);
  const denied = fakeFetch([{ status: 401, body: { error: { message: 'bad key sk-secret' } } }]);
  await assert.rejects(decide({ state: {}, criteria: {}, goal: 'g' }, { key: 'sk-secret', fetchFn: denied.fn, backoffMs: 1 }),
    (e) => /401/.test(e.message) && !e.message.includes('sk-secret'));
  assert.equal(denied.calls.length, 1, 'no retry on 401');
});

test('decide rejects a choice that was not offered', async () => {
  const { fn } = fakeFetch([{ status: 200, body: { answers: { action: { choice: 'EVIL:1', confidence: 1 } } } }]);
  await assert.rejects(decide({ state: {}, criteria: { 'CLICK:2': 'x' }, goal: 'g' }, { key: 'k', fetchFn: fn }), /not offered/);
});

test('loadKey prefers TYPESAFE_API_KEY, then OPENROUTER_API_KEY, and explains a missing key', () => {
  assert.equal(loadKey({ env: { OPENROUTER_API_KEY: 'sk-env' }, envFile: '/nonexistent' }), 'sk-env');
  assert.equal(loadKey({ env: { OPENROUTER_API_KEY: 'sk-env', TYPESAFE_API_KEY: 'apikey_x' }, envFile: '/nonexistent' }), 'apikey_x');
  assert.throws(() => loadKey({ env: {}, envFile: '/nonexistent' }), /TYPESAFE_API_KEY/);
});

test('loadKey reads either name from an env file, stripping quotes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'jevkey-'));
  writeFileSync(join(dir, '.env'), 'OTHER=1\nTYPESAFE_API_KEY="apikey_q"\n');
  assert.equal(loadKey({ env: {}, envFile: join(dir, '.env') }), 'apikey_q');
});

test('parseArgs: url must be local, goals file and results dir required', () => {
  const a = parseArgs(['7', 'http://localhost:8790/', 'goals.json', 'out']);
  assert.deepEqual(a, { runKey: '7', url: 'http://localhost:8790/', goalsFile: 'goals.json', outDir: 'out', only: null });
  assert.equal(parseArgs(['7', 'http://localhost:1/', 'g', 'o', '--only', 'hacker-hana']).only, 'hacker-hana');
  assert.throws(() => parseArgs(['7', 'https://example.com', 'g', 'o']), /local/);
  assert.throws(() => parseArgs(['7']), /usage/);
});
