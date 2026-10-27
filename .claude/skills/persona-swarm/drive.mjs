#!/usr/bin/env node
// Browser driver for one persona agent: a long-lived headless Chrome per session, driven with short
// commands over the DevTools protocol (free, no dependencies, Node 22+). Agents act like users only:
// there is deliberately no "run arbitrary JS" command.
//
//   drive.mjs start  <dir> <url>          launch Chrome, open url (localhost only)
//   drive.mjs look   <dir>                page title, visible text and numbered controls [@N]
//   drive.mjs shot   <dir> <file.png>     screenshot (Read it to see the page)
//   drive.mjs click  <dir> <@N|css> [n]   click (n times, for rage clicks)
//   drive.mjs type   <dir> <@N|css> <text>   focus, then type the text
//   drive.mjs clear  <dir> <@N|css>       empty a field
//   drive.mjs key    <dir> <Enter|Escape|Tab|Backspace|ArrowDown|…>
//   drive.mjs select <dir> <@N|css> <value>
//   drive.mjs reload|back <dir>          drive.mjs goto <dir> <url>   (localhost only)
//   drive.mjs status <dir>                dialogs the page opened + script errors (XSS evidence)
//   drive.mjs stop   <dir>                close Chrome
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { isLocalUrl } from './lib.mjs';

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const [cmd, dir, ...args] = process.argv.slice(2);
const fail = (msg) => { console.error(`drive: ${msg}`); process.exit(1); };
if (!cmd || !dir) fail('usage: drive.mjs <command> <session-dir> [args] — see the header');

// Records what the page does that a user would see: dialogs (alert/confirm/prompt) and errors.
const INSTRUMENT = `if (!window.__swarm) { window.__swarm={dialogs:[],errors:[]};
for (const k of ['alert','confirm','prompt']) window[k] = (m) => { window.__swarm.dialogs.push(k + ': ' + m); return k === 'confirm' ? true : null; };
addEventListener('error', (e) => window.__swarm.errors.push(String(e.message)));
addEventListener('unhandledrejection', (e) => window.__swarm.errors.push('unhandled: ' + e.reason)); }`;

async function connect(port) {
  for (let i = 0; i < 60; i++) {
    const page = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json())
      .then((ts) => ts.find((t) => t.type === 'page')).catch(() => null);
    if (page) {
      const ws = new WebSocket(page.webSocketDebuggerUrl);
      await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
      let id = 0;
      const pending = new Map();
      ws.onmessage = (e) => { const m = JSON.parse(e.data); pending.get(m.id)?.(m); pending.delete(m.id); };
      const send = (method, params = {}) => new Promise((resolve, reject) => {
        pending.set(++id, (m) => (m.error ? reject(new Error(m.error.message)) : resolve(m.result)));
        ws.send(JSON.stringify({ id, method, params }));
      });
      return { send, close: () => ws.close() };
    }
    await sleep(150);
  }
  fail('Chrome is not responding (did you run start?)');
}

const evaluate = async (b, expression) => {
  const r = await b.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'page error');
  return r.result.value;
};
const target = (t) => (t.startsWith('@') ? `[data-swarm="${t.slice(1)}"]` : t);
const find = (t) => `(() => { const el = document.querySelector(${JSON.stringify(target(t))}); if (!el) throw new Error('no element ${t.replace(/'/g, '')} — run look'); return el; })()`;
const KEYS = { Enter: 13, Escape: 27, Tab: 9, Backspace: 8, ArrowDown: 40, ArrowUp: 38, ArrowLeft: 37, ArrowRight: 39, Space: 32 };

async function main() {
  const session = join(dir, 'session.json');
  if (cmd === 'start') {
    const [url] = args;
    if (!isLocalUrl(url)) fail(`refusing non-local target ${url}: agents only test local dev servers`);
    mkdirSync(dir, { recursive: true });
    const port = 9500 + Math.floor(Math.random() * 400);
    const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${join(dir, 'profile')}`,
      '--window-size=1200,900', '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore', detached: true });
    chrome.unref();
    writeFileSync(session, JSON.stringify({ port, pid: chrome.pid }));
    const b = await connect(port);
    await b.send('Page.enable');
    await b.send('Page.addScriptToEvaluateOnNewDocument', { source: INSTRUMENT });
    await b.send('Page.navigate', { url });
    await sleep(800);
    b.close();
    return console.log(`started ${url} (port ${port})`);
  }
  if (!existsSync(session)) fail(`no session in ${dir} — run start first`);
  const { port, pid } = JSON.parse(readFileSync(session, 'utf8'));
  if (cmd === 'stop') {
    try { process.kill(pid); } catch { /* already gone */ }
    await sleep(300);
    rmSync(dir, { recursive: true, force: true });
    return console.log('stopped');
  }
  const b = await connect(port);
  try {
    // Startup scripts die with the DevTools connection, so every command re-registers it for later
    // page loads and instruments the current page if it isn't yet.
    await b.send('Page.enable');
    await b.send('Page.addScriptToEvaluateOnNewDocument', { source: INSTRUMENT });
    await evaluate(b, INSTRUMENT);
    const [t, ...rest] = args;
    if (cmd === 'look') console.log(await evaluate(b, LOOK));
    else if (cmd === 'shot') {
      const { data } = await b.send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(t, Buffer.from(data, 'base64'));
      console.log(`screenshot → ${t}`);
    } else if (cmd === 'click') {
      for (let i = 0; i < Math.min(Number(rest[0]) || 1, 20); i++) await evaluate(b, `${find(t)}.click()`);
      console.log(`clicked ${t}`);
    } else if (cmd === 'type') {
      await evaluate(b, `${find(t)}.focus()`);
      await b.send('Input.insertText', { text: rest.join(' ') });
      console.log(`typed into ${t}`);
    } else if (cmd === 'clear') {
      await evaluate(b, `(() => { const el = ${find(t)}; el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
      console.log(`cleared ${t}`);
    } else if (cmd === 'select') {
      await evaluate(b, `(() => { const el = ${find(t)}; el.value = ${JSON.stringify(rest[0])}; el.dispatchEvent(new Event('change', { bubbles: true })); })()`);
      console.log(`selected ${rest[0]} in ${t}`);
    } else if (cmd === 'key') {
      const code = KEYS[t] ?? t.charCodeAt(0);
      for (const type of ['rawKeyDown', 'char', 'keyUp']) {
        if (type === 'char' && !['Enter', 'Space'].includes(t)) continue;
        await b.send('Input.dispatchKeyEvent', { type, key: t === 'Space' ? ' ' : t, windowsVirtualKeyCode: code, text: t === 'Enter' ? '\r' : t === 'Space' ? ' ' : undefined });
      }
      console.log(`pressed ${t}`);
    } else if (cmd === 'reload' || cmd === 'back') {
      await evaluate(b, cmd === 'reload' ? 'location.reload()' : 'history.back()').catch(() => {});
      console.log(cmd);
    } else if (cmd === 'goto') {
      if (!isLocalUrl(t)) fail(`refusing non-local target ${t}`);
      await b.send('Page.navigate', { url: t });
      console.log(`went to ${t}`);
    } else if (cmd === 'status') console.log(JSON.stringify(await evaluate(b, 'JSON.parse(JSON.stringify(window.__swarm ?? { dialogs: [], errors: ["page not instrumented"] }))')));
    else fail(`unknown command ${cmd}`);
    if (!['look', 'shot', 'status'].includes(cmd)) await sleep(350); // let the app re-render
  } catch (e) {
    fail(e.message);
  } finally {
    b.close();
  }
}

// Numbers every visible control ([@N]) so agents can address it like a user pointing at it.
const LOOK = `(() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && !el.closest('[hidden]'); };
  const label = (el) => (el.getAttribute('aria-label') || el.labels?.[0]?.textContent || el.placeholder || el.textContent || el.value || '').trim().replace(/\\s+/g, ' ').slice(0, 60);
  const ctrls = [...document.querySelectorAll('button, a[href], input, select, textarea, [role=button]')].filter(vis);
  ctrls.forEach((el, i) => el.setAttribute('data-swarm', i + 1));
  const lines = ctrls.map((el, i) => '[@' + (i + 1) + '] ' + el.tagName.toLowerCase() + (el.type ? '(' + el.type + ')' : '') + (el.checked ? ' ✓' : '') + ' ' + JSON.stringify(label(el)) + (el.value && el.tagName !== 'BUTTON' ? ' value=' + JSON.stringify(String(el.value).slice(0, 40)) : ''));
  return 'TITLE: ' + document.title + '\\nURL: ' + location.href + '\\nTEXT: ' + document.body.innerText.replace(/\\n{2,}/g, '\\n').slice(0, 2500) + '\\nCONTROLS:\\n' + lines.join('\\n');
})()`;

main();
