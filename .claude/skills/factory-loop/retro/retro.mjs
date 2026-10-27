#!/usr/bin/env node
// Self-healing retro: reads a Claude Code session transcript, pulls out failure signals from a time
// window (tool errors, guard blocks, reviewer findings, the owner's corrections, idle loop passes),
// sorts them by cause (causes.mjs) and prints a markdown report saying where each fix belongs.
//
//   node retro.mjs [--since ISO] [--until ISO] [--transcript file.jsonl]
//
// Default transcript: the newest one for this project under ~/.claude/projects/. Default window:
// the last 24 hours. Read-only: it never edits anything; the loop acts on the report (SKILL.md).
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { digest, report } from './causes.mjs';

/** Transcript folder Claude Code uses for a project directory. */
export const projectDir = (cwd, home = homedir()) => join(home, '.claude', 'projects', cwd.replace(/[^A-Za-z0-9]/g, '-'));

export function newestTranscript(dir) {
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => f.endsWith('.jsonl')).map((f) => join(dir, f));
  return files.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0] ?? null;
}

const textOf = (content) => (typeof content === 'string' ? content
  : Array.isArray(content) ? content.map((c) => c.text ?? '').join(' ') : '');

/** Failure-signal events from transcript lines inside [since, until). */
export function extractEvents(jsonl, { since = '', until = '￿' } = {}) {
  const commands = new Map();
  const events = [];
  for (const line of jsonl.split('\n')) {
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    const at = e.timestamp ?? '';
    const content = e.message?.content;
    if (e.type === 'assistant' && Array.isArray(content)) {
      for (const c of content) if (c.type === 'tool_use') commands.set(c.id, c.input?.command ?? c.input?.file_path ?? '');
      const said = textOf(content.filter((c) => c.type === 'text'));
      if (at >= since && at < until && /^Quiet tick/i.test(said.trim())) events.push({ kind: 'loop-pass', at, text: said });
    }
    if (e.type !== 'user' || at < since || at >= until) continue;
    if (typeof content === 'string') {
      if (/^\s*<agent-message|Subagent hand-back/.test(content)) events.push({ kind: 'review', at, text: content });
      else if (!/<command-name>|<system-reminder>|<task-notification>|^Caveat:|^This session is being continued/.test(content)) events.push({ kind: 'user', at, text: content });
      continue;
    }
    if (!Array.isArray(content)) continue;
    for (const c of content) {
      if (c.type === 'tool_result' && c.is_error) events.push({ kind: 'tool-error', at, text: textOf(c.content), command: commands.get(c.tool_use_id) });
      if (c.type === 'text' && /Subagent hand-back/.test(c.text)) events.push({ kind: 'review', at, text: c.text });
    }
  }
  return events;
}

export function main(argv, { cwd = process.cwd(), now = new Date() } = {}) {
  const opt = (name) => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : undefined);
  const since = opt('since') ?? new Date(now.getTime() - 86_400_000).toISOString();
  const until = opt('until');
  const file = opt('transcript') ?? newestTranscript(projectDir(cwd));
  if (!file) return { code: 3, text: `No transcript found for ${cwd}.` };
  const groups = digest(extractEvents(readFileSync(file, 'utf8'), { since, until }));
  return { code: 0, text: report(groups, { since, until }) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { code, text } = main(process.argv.slice(2));
  console.log(text);
  process.exitCode = code;
}
