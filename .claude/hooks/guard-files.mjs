#!/usr/bin/env node
// PreToolUse hook for Edit / Write / MultiEdit / NotebookEdit (writes) and Read / Grep (reads):
// a prompt-injected ticket can't read secrets, plant persistence or rewrite its own checks.
// Exit 2 blocks. Reads: only rule 2 applies (secrets anywhere, example/template files allowed).
//   1. Only inside the project, temp dirs or Claude's per-project memory — never shell profiles,
//      ~/.ssh, ~/.claude/settings.json and the like.
//   2. Never secret-looking files (.env, keys, credentials).
//   3. On a ticket branch (factory/issue-*), the harness (.claude/ except logs, .github/) is
//      read-only: harness changes come from the owner on a harness branch, not from tickets.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SECRET_FILE = /(^|\/)(\.env(\..*)?|.*\.(pem|key|p12|pfx)|id_(rsa|ed25519)(\.pub)?|\.netrc|\.npmrc|credentials(\.json)?|\.git-credentials)$/i;
const HARNESS = /^(\.claude\/(?!logs\/)|\.github\/)/;
const inside = (dir, path) => {
  const rel = relative(dir, path);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
};

/** Why writing `filePath` is not allowed, or null if it is. */
export function verdict(filePath, { root, branch, read = false, home = homedir(), temps = [tmpdir(), '/tmp', '/private/tmp', '/private/var/folders'] }) {
  if (!filePath) return null;
  const path = resolve(root, filePath); // resolves ../ segments, so traversal can't hide a target
  if (read) {
    const exampleFile = /\.(example|sample|template|dist)$/i.test(path);
    return SECRET_FILE.test(path) && !exampleFile ? `${path} looks like a secrets file; the agent never reads secrets.` : null;
  }
  const allowed = [root, ...temps, resolve(home, '.claude', 'projects'), resolve(home, '.claude', 'plans')];
  if (!allowed.some((dir) => inside(dir, path))) {
    return `${path} is outside the project and temp folders; the agent doesn't write there.`;
  }
  const rel = relative(root, path).split(sep).join('/');
  if (SECRET_FILE.test(rel)) return `${rel} looks like a secrets file; the agent never writes secrets.`;
  if (inside(root, path) && /^factory\/issue-/.test(branch ?? '') && HARNESS.test(rel)) {
    return `${rel} is harness; it's read-only on ticket branches (a ticket can't change the rules that check it).`;
  }
  return null;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let input;
  try {
    input = JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    process.exit(0);
  }
  const args = input.tool_input ?? {};
  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  let branch = '';
  try {
    branch = execFileSync('git', ['-C', root, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch { /* not a git repo */ }
  const read = input.tool_name === 'Read' || input.tool_name === 'Grep';
  const why = verdict(args.file_path ?? args.notebook_path ?? args.path, { root, branch, read });
  if (why) {
    process.stderr.write(`Blocked by .claude/hooks/guard-files.mjs: ${why}\n`);
    process.exit(2);
  }
}
