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
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { isLocalUrl } from './lib.mjs';
import { sleep, INSTRUMENT, LOOK, launchChrome, connect, evaluate, instrument, click, type, clear, select, key, status } from './cdp.mjs';

const [cmd, dir, ...args] = process.argv.slice(2);
const fail = (msg) => { console.error(`drive: ${msg}`); process.exit(1); };
if (!cmd || !dir) fail('usage: drive.mjs <command> <session-dir> [args] — see the header');

async function main() {
  const session = join(dir, 'session.json');
  if (cmd === 'start') {
    const [url] = args;
    if (!isLocalUrl(url)) fail(`refusing non-local target ${url}: agents only test local dev servers`);
    mkdirSync(dir, { recursive: true });
    const { port, pid } = launchChrome(dir);
    writeFileSync(session, JSON.stringify({ port, pid }));
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
    await instrument(b);
    const [t, ...rest] = args;
    if (cmd === 'look') console.log(await evaluate(b, LOOK));
    else if (cmd === 'shot') {
      const { data } = await b.send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(t, Buffer.from(data, 'base64'));
      console.log(`screenshot → ${t}`);
    } else if (cmd === 'click') {
      await click(b, t, rest[0]);
      console.log(`clicked ${t}`);
    } else if (cmd === 'type') {
      await type(b, t, rest.join(' '));
      console.log(`typed into ${t}`);
    } else if (cmd === 'clear') {
      await clear(b, t);
      console.log(`cleared ${t}`);
    } else if (cmd === 'select') {
      await select(b, t, rest[0]);
      console.log(`selected ${rest[0]} in ${t}`);
    } else if (cmd === 'key') {
      await key(b, t);
      console.log(`pressed ${t}`);
    } else if (cmd === 'reload' || cmd === 'back') {
      await evaluate(b, cmd === 'reload' ? 'location.reload()' : 'history.back()').catch(() => {});
      console.log(cmd);
    } else if (cmd === 'goto') {
      if (!isLocalUrl(t)) fail(`refusing non-local target ${t}`);
      await b.send('Page.navigate', { url: t });
      console.log(`went to ${t}`);
    } else if (cmd === 'status') console.log(JSON.stringify(await status(b)));
    else fail(`unknown command ${cmd}`);
    if (!['look', 'shot', 'status'].includes(cmd)) await sleep(350); // let the app re-render
  } catch (e) {
    fail(e.message);
  } finally {
    b.close();
  }
}

main().catch((e) => fail(e.message));
