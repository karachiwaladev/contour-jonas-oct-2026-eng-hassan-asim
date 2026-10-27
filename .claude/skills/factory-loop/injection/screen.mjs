#!/usr/bin/env node
// Screens a ticket (issue or PR, with its comments) for prompt injection before the loop acts on it.
//
//   node screen.mjs --repo OWNER/REPO --issue N      (or --pr N; or --file ticket.json offline)
//
// Prints JSON: { verdict, visibleVerdict, findings }. Exit 0 clean, 1 suspicious, 2 malicious, 3 error
// (from `verdict`). `visibleVerdict` screens only what a reader sees (HTML comments and invisible
// characters removed): malicious overall but clean visible means the attack is hidden content only.
// The verdict is about *content*, never the author: a legitimate person can paste or forward a
// malicious payload, so the title, body and every comment are screened the same way whoever wrote
// them. The one exception is the loop's own comments (its login *and* its marker), which are
// skipped; the marker anywhere else is flagged as spoofing.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { screenText, worst, visibleText } from './rules.mjs';

const isLoopComment = (c, loopLogin) => c.login === loopLogin && /<!--\s*factory-loop/.test(c.body ?? '');

/**
 * @param ticket { title, body, comments: [{ id, login, body }] }
 * @param loopLogin GitHub login the loop posts as
 */
export function screenTicket(ticket, loopLogin) {
  const parts = [['title', ticket.title], ['body', ticket.body],
    ...(ticket.comments ?? []).filter((c) => !isLoopComment(c, loopLogin)).map((c) => [`comment ${c.id}`, c.body])];
  const findings = parts.flatMap(([where, text]) => screenText(text, where));
  const visible = parts.flatMap(([where, text]) => screenText(visibleText(text), where));
  return { verdict: worst(findings.map((f) => f.severity)), visibleVerdict: worst(visible.map((f) => f.severity)), findings };
}

const EXIT = { clean: 0, suspicious: 1, malicious: 2 };

// GitHub REST shapes → the ticket shape above.
export const fromApi = (issue, comments) => ({
  title: issue.title, body: issue.body,
  comments: comments.map((c) => ({ id: c.id, login: c.user?.login, body: c.body })),
});

export function fetchTicket(repo, number, isPr, gh = (args) => JSON.parse(execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }))) {
  const issue = gh(['api', `repos/${repo}/issues/${number}`]);
  const pages = (path) => gh(['api', '--paginate', '--slurp', path]).flat();
  const comments = pages(`repos/${repo}/issues/${number}/comments`);
  if (isPr) comments.push(...pages(`repos/${repo}/pulls/${number}/comments`), ...pages(`repos/${repo}/pulls/${number}/reviews`));
  return { ticket: fromApi(issue, comments), loopLogin: gh(['api', 'user']).login };
}

export function main(argv, { gh, out = (s) => process.stdout.write(s) } = {}) {
  const opt = (name) => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : undefined);
  let ticket;
  let loopLogin;
  if (opt('file')) {
    ({ ticket, loopLogin = null } = JSON.parse(readFileSync(opt('file'), 'utf8')));
  } else if (opt('repo') && (opt('issue') || opt('pr'))) {
    ({ ticket, loopLogin } = fetchTicket(opt('repo'), opt('issue') ?? opt('pr'), Boolean(opt('pr')), gh));
  } else {
    out('usage: screen.mjs --repo OWNER/REPO (--issue N | --pr N) | --file ticket.json\n');
    return 3;
  }
  const result = screenTicket(ticket, loopLogin);
  out(`${JSON.stringify(result, null, 2)}\n`);
  return EXIT[result.verdict];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    console.error(`screen.mjs: ${e.message}`);
    process.exitCode = 3; // fail closed: the loop treats an unscreened ticket as not safe to act on
  }
}
