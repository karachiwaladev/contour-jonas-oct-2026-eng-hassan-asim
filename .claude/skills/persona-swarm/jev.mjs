#!/usr/bin/env node
// Jev-driven persona swarm: each picked persona gets its own headless Chrome, and Jev (OpenRouter
// typesafe/jev-1.13, a small decision model) picks every step from the options offered. All 5
// personas run in parallel; results land in the same schema as the Claude agents' files.
//
//   jev.mjs <runKey> <url> <goals.json> <resultsDir> [--only <personaId>]
//
// goals.json: { "<personaId>": "goal in plain English", "*": "goal for anyone not listed" }
// Needs OPENROUTER_API_KEY (environment, or the repo's .env). The key is sent only to OpenRouter and
// never printed. Only localhost targets are allowed.
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { pickPersonas, isLocalUrl } from './lib.mjs';
import { buildOptions, inputFor, detectLoop, findingsFromRun, toResult, JEV_MODEL } from './jev-lib.mjs';
import { sleep, launchChrome, connect, evaluate, instrument, click, type, clear, key as pressKey, status, SNAPSHOT } from './cdp.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ENV = resolve(here, '../../../.env');
const JEV_URL = 'https://openrouter.ai/api/alpha/decisions';
const RULES = 'Choose the one operation that advances the goal from this page, the way this persona would. '
  + 'Do not repeat a step that is already satisfied.';

/** OPENROUTER_API_KEY from the environment, else from the repo .env (that one key only). */
export function loadKey({ env = process.env, envFile = REPO_ENV } = {}) {
  if (env.OPENROUTER_API_KEY) return env.OPENROUTER_API_KEY;
  if (existsSync(envFile)) {
    const line = readFileSync(envFile, 'utf8').split('\n').find((l) => /^\s*OPENROUTER_API_KEY\s*=/.test(l));
    const value = line?.split('=').slice(1).join('=').trim().replace(/^(['"])(.*)\1$/, '$2');
    if (value) return value;
  }
  throw new Error('Set OPENROUTER_API_KEY (environment or the repo .env) for the Jev engine: https://openrouter.ai/keys');
}

/** One Jev choice over the offered option keys. Retries 429/5xx/network errors; errors never contain the key. */
export async function decide({ state, criteria, goal, rules = RULES }, { key, fetchFn = fetch, tries = 4, backoffMs = 400 }) {
  const body = JSON.stringify({ model: JEV_MODEL, state, questions: { action: { type: 'choice', criteria, instructions: { goal, rules } } } });
  const scrub = (s) => String(s).split(key).join('***').slice(0, 160);
  for (let k = 0; ; k++) {
    const res = await fetchFn(JEV_URL, { method: 'POST', signal: AbortSignal.timeout(30000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body })
      .catch((e) => ({ ok: false, status: 0, text: async () => String(e) }));
    if (res.ok) {
      const j = await res.json();
      const { choice, confidence } = j.answers?.action ?? {};
      if (!(choice in criteria)) throw new Error(`Jev picked "${scrub(choice)}", which was not offered`);
      return { choice, confidence: confidence ?? 0, cost: j.usage?.cost ?? 0 };
    }
    if (k + 1 < tries && (res.status === 0 || res.status === 429 || res.status >= 500)) {
      await sleep(backoffMs * 2 ** k);
      continue;
    }
    const hint = [401, 403].includes(res.status) ? ' (check OPENROUTER_API_KEY: an OpenRouter key starts with sk-or-, no quotes or spaces)' : '';
    throw new Error(`Jev HTTP ${res.status}: ${scrub(await res.text())}${hint}`);
  }
}

export function parseArgs(argv) {
  const [runKey, url, goalsFile, outDir] = argv;
  if (!runKey || !url || !goalsFile || !outDir) throw new Error('usage: jev.mjs <runKey> <url> <goals.json> <resultsDir> [--only <personaId>]');
  if (!isLocalUrl(url)) throw new Error(`refusing non-local target ${url}: the swarm only tests local dev servers`);
  const at = argv.indexOf('--only');
  return { runKey, url, goalsFile, outDir, only: at >= 0 ? argv[at + 1] : null };
}

const sigOf = (snap) => {
  const s = snap.url + snap.text.length + snap.controls.map((c) => `${c.label}|${c.value}|${c.checked}`).join('\n');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
};

/** Drives one persona to its goal with Jev; returns the results object. */
export async function runPersona({ persona, goal, url, outDir, key }) {
  const session = mkdtempSync(join(tmpdir(), `jev-${persona.id}-`));
  const { port, pid } = launchChrome(session);
  const seen = { dialogs: [], errors: [] };
  const trace = [], steps = [];
  let outcome = 'blocked', typed = 0, lastTyped = '', cost = 0, loop = null, unlabeled = [];
  const fullGoal = `${persona.name}: ${goal}. Focus: ${persona.focus}.`;
  try {
    const b = await connect(port);
    await instrument(b);
    await b.send('Page.navigate', { url });
    await sleep(800);
    for (let step = 0; step < persona.patience_steps; step++) {
      await instrument(b);
      const snap = await evaluate(b, SNAPSHOT);
      if (step === 0) unlabeled = snap.controls.filter((c) => !c.label).map(({ n, tag }) => ({ n, tag }));
      const nextText = inputFor(persona.id, typed);
      const { state, criteria, targets } = buildOptions(snap, { step, nextText, history: trace.map((t) => t.label) });
      const d = await decide({ state, criteria, goal: fullGoal }, { key });
      cost += d.cost;
      const t = targets[d.choice];
      trace.push({ step: step + 1, choice: d.choice, label: criteria[d.choice], confidence: d.confidence });
      steps.push({ choice: d.choice, sig: sigOf(snap) });
      if (t.op === 'done') { outcome = 'completed'; break; }
      if (t.op === 'give_up') { outcome = 'gave_up'; break; }
      if (detectLoop(steps)) { loop = { label: criteria[d.choice] }; outcome = 'gave_up'; break; }
      try {
        if (t.op === 'type') { await clear(b, `@${t.n}`); await type(b, `@${t.n}`, t.text); typed++; lastTyped = t.text; }
        else if (t.op === 'click') await click(b, `@${t.n}`);
        else if (t.op === 'key') await pressKey(b, t.key);
        else if (t.op === 'reload') await b.send('Page.reload');
      } catch (e) {
        trace.at(-1).error = String(e.message).slice(0, 120);
      }
      await sleep(t.op === 'reload' ? 800 : 350);
      const st = await status(b).catch(() => ({ dialogs: [], errors: [] }));
      if (st.dialogs.length && !seen.dialogs.length) seen.lastTyped = lastTyped;
      seen.dialogs.push(...st.dialogs);
      seen.errors.push(...st.errors);
      await evaluate(b, 'window.__swarm && (window.__swarm.dialogs = [], window.__swarm.errors = [])').catch(() => {});
    }
    const { data } = await b.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(outDir, `${persona.id}.png`), Buffer.from(data, 'base64'));
    b.close();
  } finally {
    try { process.kill(pid); } catch { /* already gone */ }
    await sleep(200);
    rmSync(session, { recursive: true, force: true });
  }
  const findings = findingsFromRun({ goal, outcome, lastTyped: seen.lastTyped ?? lastTyped, status: seen, loop, unlabeled });
  return toResult({ persona: persona.id, outcome, steps: trace.length, goal, findings, trace, cost });
}

export async function main(argv) {
  const { runKey, url, goalsFile, outDir, only } = parseArgs(argv);
  const panel = JSON.parse(readFileSync(join(here, 'personas.yaml'), 'utf8')).personas;
  const personas = only ? panel.filter((p) => p.id === only) : pickPersonas(panel, runKey);
  if (!personas.length) throw new Error(`no persona ${only}`);
  const goals = JSON.parse(readFileSync(goalsFile, 'utf8'));
  const key = loadKey();
  mkdirSync(outDir, { recursive: true });
  const t0 = Date.now();
  const results = await Promise.all(personas.map(async (persona) => {
    const goal = goals[persona.id] ?? goals['*'];
    if (!goal) throw new Error(`goals.json has no goal for ${persona.id} and no "*" default`);
    const r = await runPersona({ persona, goal, url, outDir, key });
    writeFileSync(join(outDir, `${persona.id}.json`), `${JSON.stringify(r, null, 2)}\n`);
    console.log(`${persona.emoji} ${persona.id}: ${r.outcome}, ${r.steps} steps, ${r.findings.length} findings, $${r.cost}`);
    return r;
  }));
  const total = results.reduce((s, r) => s + r.cost, 0);
  console.log(`\n${results.length} personas in ${((Date.now() - t0) / 1000).toFixed(1)}s, $${total.toFixed(6)} total.`
    + `\nNext: node ${join(here, 'swarm.mjs')} report ${outDir} --label "..."`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((e) => { console.error(`jev: ${e.message}`); process.exit(1); });
}
