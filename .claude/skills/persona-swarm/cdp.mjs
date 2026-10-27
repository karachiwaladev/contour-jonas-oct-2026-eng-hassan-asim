// Headless Chrome over the DevTools protocol, shared by drive.mjs (Claude persona agents) and
// jev.mjs (Jev-driven personas). Free, no dependencies, Node 22+. User-level actions only: there is
// deliberately no "run arbitrary JS" export.
import { spawn } from 'node:child_process';
import { join } from 'node:path';

export const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Records what the page does that a user would see: dialogs (alert/confirm/prompt) and errors.
export const INSTRUMENT = `if (!window.__swarm) { window.__swarm={dialogs:[],errors:[]};
for (const k of ['alert','confirm','prompt']) window[k] = (m) => { window.__swarm.dialogs.push(k + ': ' + m); return k === 'confirm' ? true : null; };
addEventListener('error', (e) => window.__swarm.errors.push(String(e.message)));
addEventListener('unhandledrejection', (e) => window.__swarm.errors.push('unhandled: ' + e.reason)); }`;

/** Starts a detached headless Chrome with its own profile in `dir`; returns { port, pid, proc }. */
export function launchChrome(dir) {
  const port = 9500 + Math.floor(Math.random() * 400);
  const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${join(dir, 'profile')}`,
    '--window-size=1200,900', '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore', detached: true });
  proc.unref();
  return { port, pid: proc.pid, proc };
}

export async function connect(port) {
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
  throw new Error('Chrome is not responding (did you run start?)');
}

export const evaluate = async (b, expression) => {
  const r = await b.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'page error');
  return r.result.value;
};

/** Re-registers the instrument for later page loads and applies it to the current page. */
export async function instrument(b) {
  await b.send('Page.enable');
  await b.send('Page.addScriptToEvaluateOnNewDocument', { source: INSTRUMENT });
  await evaluate(b, INSTRUMENT);
}

const target = (t) => (t.startsWith('@') ? `[data-swarm="${t.slice(1)}"]` : t);
const find = (t) => `(() => { const el = document.querySelector(${JSON.stringify(target(t))}); if (!el) throw new Error('no element ${t.replace(/'/g, '')} — run look'); return el; })()`;
const KEYS = { Enter: 13, Escape: 27, Tab: 9, Backspace: 8, ArrowDown: 40, ArrowUp: 38, ArrowLeft: 37, ArrowRight: 39, Space: 32 };

export async function click(b, t, times = 1) {
  for (let i = 0; i < Math.min(Number(times) || 1, 20); i++) await evaluate(b, `${find(t)}.click()`);
}
export async function type(b, t, text) {
  await evaluate(b, `${find(t)}.focus()`);
  await b.send('Input.insertText', { text });
}
export const clear = (b, t) => evaluate(b, `(() => { const el = ${find(t)}; el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
export const select = (b, t, value) => evaluate(b, `(() => { const el = ${find(t)}; el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('change', { bubbles: true })); })()`);
export async function key(b, name) {
  const code = KEYS[name] ?? name.charCodeAt(0);
  for (const kind of ['rawKeyDown', 'char', 'keyUp']) {
    if (kind === 'char' && !['Enter', 'Space'].includes(name)) continue;
    await b.send('Input.dispatchKeyEvent', { type: kind, key: name === 'Space' ? ' ' : name, windowsVirtualKeyCode: code, text: name === 'Enter' ? '\r' : name === 'Space' ? ' ' : undefined });
  }
}
export const status = (b) => evaluate(b, 'JSON.parse(JSON.stringify(window.__swarm ?? { dialogs: [], errors: ["page not instrumented"] }))');

// Numbers every visible control ([@N]) so agents can address it like a user pointing at it.
const CONTROLS = `const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && !el.closest('[hidden]'); };
  const label = (el) => (el.getAttribute('aria-label') || el.labels?.[0]?.textContent || el.placeholder || el.textContent || el.value || '').trim().replace(/\\s+/g, ' ').slice(0, 60);
  const ctrls = [...document.querySelectorAll('button, a[href], input, select, textarea, [role=button]')].filter(vis);
  ctrls.forEach((el, i) => el.setAttribute('data-swarm', i + 1));`;

export const LOOK = `(() => { ${CONTROLS}
  const lines = ctrls.map((el, i) => '[@' + (i + 1) + '] ' + el.tagName.toLowerCase() + (el.type ? '(' + el.type + ')' : '') + (el.checked ? ' ✓' : '') + ' ' + JSON.stringify(label(el)) + (el.value && el.tagName !== 'BUTTON' ? ' value=' + JSON.stringify(String(el.value).slice(0, 40)) : ''));
  return 'TITLE: ' + document.title + '\\nURL: ' + location.href + '\\nTEXT: ' + document.body.innerText.replace(/\\n{2,}/g, '\\n').slice(0, 2500) + '\\nCONTROLS:\\n' + lines.join('\\n');
})()`;

/** Same numbering as LOOK, as data: { url, title, text, controls: [{ n, tag, type, label, value, checked }] }. */
export const SNAPSHOT = `(() => { ${CONTROLS}
  return { url: location.href, title: document.title, text: document.body.innerText.replace(/\\n{2,}/g, '\\n').slice(0, 1500),
    controls: ctrls.map((el, i) => ({ n: i + 1, tag: el.tagName.toLowerCase(), type: el.type || '', label: label(el),
      value: el.tagName === 'BUTTON' ? '' : String(el.value ?? '').slice(0, 40), checked: !!el.checked })) };
})()`;
