#!/usr/bin/env node
// Capture PNG screenshots of a page with local headless Chrome over the DevTools protocol.
// Zero dependencies (Node 22+ for global WebSocket/fetch).
//
//   node screenshot.mjs <url> <out-dir> [steps.json] [--width 1200] [--height 900]
//
// steps.json is an array of shots taken in order in one page session, so state carries over:
//   [{ "name": "01-empty" },
//    { "name": "02-added", "js": "document.querySelector('#title').value='Buy milk'; ...", "wait": 300 }]
// "js" runs in the page (awaited if it returns a promise) before the shot; "wait" is ms after it.
// Without steps.json one shot named "page.png" is taken. Console errors are printed and make the
// exit code 2, so a broken page fails verification.
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { asExpression, asStatements, isSyntaxError } from './screenshot-steps.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? def : Number(args.splice(i, 2)[1]);
};
const width = opt('width', 1200);
const height = opt('height', 900);
const [url, outDir, stepsFile] = args;
if (!url || !outDir) {
  console.error('usage: node screenshot.mjs <url> <out-dir> [steps.json] [--width N] [--height N]');
  process.exit(1);
}
const steps = stepsFile ? JSON.parse(readFileSync(stepsFile, 'utf8')) : [{ name: 'page' }];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const port = 9300 + Math.floor(Math.random() * 500);
const profile = mkdtempSync(join(tmpdir(), 'shot-'));
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  `--window-size=${width},${height}`, '--no-first-run', '--no-default-browser-check', 'about:blank',
], { stdio: 'ignore' });

let ws;
let errors = 0;
try {
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    await sleep(100);
    target = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json())
      .then((ts) => ts.find((t) => t.type === 'page')).catch(() => null);
  }
  if (!target) throw new Error('Chrome did not start');

  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let nextId = 0;
  const pending = new Map();
  const listeners = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? reject(new Error(m.error.message)) : resolve(m.result);
    } else listeners.forEach((fn) => fn(m));
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  listeners.push((m) => {
    const err = (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error')
      ? m.params.args.map((a) => a.value ?? a.description).join(' ')
      : m.method === 'Runtime.exceptionThrown' ? m.params.exceptionDetails.exception?.description
      : null;
    if (err) { errors++; console.error(`console error: ${err}`); }
  });

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  const loaded = new Promise((r) => listeners.push((m) => m.method === 'Page.loadEventFired' && r()));
  await send('Page.navigate', { url });
  await loaded;
  await sleep(300);

  mkdirSync(outDir, { recursive: true });
  for (const step of steps) {
    if (step.js) {
      const run = (expression) => send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      let res = await run(asExpression(step.js));
      if (res.exceptionDetails && isSyntaxError(res.exceptionDetails)) res = await run(asStatements(step.js));
      if (res.exceptionDetails) {
        errors++;
        console.error(`step ${step.name} failed: ${res.exceptionDetails.exception?.description}`);
      }
    }
    await sleep(step.wait ?? 300);
    const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const file = join(outDir, `${step.name}.png`);
    writeFileSync(file, Buffer.from(data, 'base64'));
    console.log(file);
  }
} catch (e) {
  console.error(e.message);
  errors++;
} finally {
  ws?.close();
  chrome.kill();
  await sleep(200);
  rmSync(profile, { recursive: true, force: true });
}
process.exit(errors ? 2 : 0);
