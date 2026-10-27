// Jev engine for the persona swarm: pure rules, no I/O (tested in .claude/tests/persona-jev.test.mjs).
// Follows quicke2e (github.com/dmoka/quicke2e): Jev only picks one of the options offered, text comes
// from a fixed per-persona list (no model invents input), and code, not the model, decides findings.

export const JEV_MODEL = 'typesafe/jev-1.14';
const TYPESAFE = { name: 'typesafe', url: 'https://api.typesafe.ai/v1/systemone', model: 'jev-1.14.0', usdPerInputToken: 0.042 / 1e6 };
const OPENROUTER = { name: 'openrouter', url: 'https://openrouter.ai/api/alpha/decisions', model: JEV_MODEL, usdPerInputToken: 0 };

/** Jev is served by TypeSafe directly (keys start with apikey_) and through OpenRouter (sk-or-…). */
export const providerFor = (key) => (String(key).startsWith('apikey_') ? TYPESAFE : OPENROUTER);
export const MAX_ELEMENTS = 40;
export const MIN_STEPS_BEFORE_DONE = 3;

/** What each persona types. The hacker's list is the XSS / injection probe set. */
export const PERSONA_INPUTS = {
  'power-user-priya': ['buy milk', 'call bank', 'pay rent', 'book dentist', 'renew passport'],
  'older-user-omar': ['Doctor appointment', 'Call my daughter', 'Pick up pills'],
  'hacker-hana': ['<img src=x onerror=alert(1)>', '<script>alert("xss")</script>', '"><svg onload=alert(1)>',
    "'; DROP TABLE todos; --", 'javascript:alert(1)', '{{7*7}}${7*7}'],
  'angry-andy': ['asdf', 'WHY IS THIS NOT WORKING', 'x', 'asdf'],
  'breaker-bo': ['', '   ', 'a'.repeat(5000), '\u0000\u202e', '-1', 'null'],
  'edge-case-eli': ['🍕🚀 emoji task', 'مرحبا RTL', 'Ünïcödé ✓', '0', 'line\nbreak', '2026-02-30'],
};
const FALLBACK_INPUTS = ['test task'];

export const inputFor = (personaId, typedCount) => {
  const list = PERSONA_INPUTS[personaId] ?? FALLBACK_INPUTS;
  return list[typedCount % list.length];
};

const TEXT_TYPES = new Set(['', 'text', 'search', 'email', 'url', 'tel', 'password', 'number', 'textarea', 'date']);
const roleOf = (c) => (c.tag === 'a' ? 'link'
  : c.tag === 'select' ? 'combobox'
  : c.tag === 'textarea' ? 'textbox'
  : c.tag === 'input' && ['checkbox', 'radio'].includes(c.type) ? c.type
  : c.tag === 'input' && TEXT_TYPES.has(c.type) ? 'textbox'
  : 'button');
const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const preview = (s) => JSON.stringify(clip(s, 24));
const pathOf = (url) => { try { const u = new URL(url); return u.pathname + u.hash.replace(/\?.*$/, ''); } catch { return '/'; } };

/**
 * The decision for one step: `state` (what Jev sees), `criteria` (option key → description) and
 * `targets` (option key → the action the runner performs). Only the page path is sent, never the
 * host or query string.
 */
export function buildOptions(snap, { step, nextText, history = [] }) {
  const elements = [], criteria = {}, targets = {};
  for (const c of snap.controls.slice(0, MAX_ELEMENTS)) {
    const r = roleOf(c), l = clip(c.label, 44) || '(unlabeled)';
    const v = r === 'checkbox' || r === 'radio' ? (c.checked ? 'checked' : 'unchecked') : r === 'textbox' && c.value ? clip(c.value, 24) : null;
    elements.push({ i: String(c.n), r, l, ...(v ? { v } : {}) });
    if (r === 'textbox') {
      criteria[`TYPE:${c.n}`] = `TYPE ${c.n} ${l} [${r}] ← ${preview(nextText)}`;
      targets[`TYPE:${c.n}`] = { op: 'type', n: c.n, text: nextText };
    } else if (r !== 'combobox') {
      criteria[`CLICK:${c.n}`] = `CLICK ${c.n} ${l} [${r}]`;
      targets[`CLICK:${c.n}`] = { op: 'click', n: c.n };
    }
  }
  for (const k of ['Enter', 'Escape', 'Tab']) {
    criteria[`KEY:${k}`] = `press ${k}`;
    targets[`KEY:${k}`] = { op: 'key', key: k };
  }
  criteria.RELOAD = 'reload the page';
  targets.RELOAD = { op: 'reload' };
  criteria.GIVE_UP = 'give up: stuck, the app does not let you reach the goal';
  targets.GIVE_UP = { op: 'give_up' };
  if (step >= MIN_STEPS_BEFORE_DONE) {
    criteria.DONE = 'the goal is visibly achieved on this page';
    targets.DONE = { op: 'done' };
  }
  const state = { url: pathOf(snap.url), title: clip(snap.title, 60), text: clip(snap.text, 300), elements, done: history.slice(-5) };
  return { state, criteria, targets };
}

/** Three identical choices in a row on an unchanged page (same signature). */
export function detectLoop(steps) {
  if (steps.length < 3) return false;
  const [a, b, c] = steps.slice(-3);
  return a.choice === b.choice && b.choice === c.choice && a.sig === b.sig && b.sig === c.sig;
}

/** Findings from what the run recorded. Severity follows agent-prompt.md. */
export function findingsFromRun({ goal, outcome, lastTyped, status, loop, unlabeled = [] }) {
  const out = [];
  for (const d of new Set(status?.dialogs ?? [])) {
    out.push({ title: `Script ran from typed input (${clip(d, 40)})`, severity: 'critical',
      detail: `After typing ${preview(lastTyped ?? '')} the page opened a dialog: ${clip(d, 120)}`, evidence: 'status.dialogs' });
  }
  for (const e of new Set(status?.errors ?? [])) {
    out.push({ title: `Script error: ${clip(e, 60)}`, severity: 'high', detail: clip(e, 200), evidence: 'status.errors' });
  }
  if (outcome === 'gave_up') out.push({ title: `Got stuck trying to: ${clip(goal, 60)}`, severity: 'high', detail: 'Jev found no option that advanced the goal and gave up.' });
  if (outcome === 'blocked') out.push({ title: 'Ran out of patience before finishing the goal', severity: 'medium', detail: `Goal not reached within the step budget: ${clip(goal, 120)}` });
  if (loop) out.push({ title: `Same action repeated with no visible change: ${clip(loop.label, 50)}`, severity: 'medium', detail: 'The page did not change after the same action three times in a row.' });
  for (const u of unlabeled) out.push({ title: `Control with no label (@${u.n} ${u.tag})`, severity: 'low', detail: 'A screen reader or a new user cannot tell what this control does.' });
  return out;
}

/** A results file in the same schema as the Claude agents', so `swarm.mjs report` reads both. */
export function toResult({ persona, outcome, steps, goal, findings, trace, cost, model = JEV_MODEL }) {
  return { persona, outcome, steps, engine: 'jev', model, summary: `Jev ${outcome} after ${steps} steps: ${clip(goal, 80)}`,
    findings, cost: Number(cost.toFixed(6)), trace };
}
