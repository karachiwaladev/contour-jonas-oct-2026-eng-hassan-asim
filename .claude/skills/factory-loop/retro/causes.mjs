// Self-healing retro: the failure causes we know, and how to sort a failure event into one.
// Pure functions, unit-tested in .claude/tests/retro.test.mjs. A new kind of failure that matches
// nothing is reported as `new`: that is the signal to add a cause here and a fix in the skills.

export const CAUSES = Object.freeze({
  C1: { title: 'Process ordering: rules or tooling referenced before they existed, process changes not applied to in-flight tickets', fixIn: 'SKILL.md, references/pitfalls.md (Process), .claude/tests/skill-paths.test.mjs' },
  C2: { title: 'Review too shallow: bugs found late, by reviewers or the owner', fixIn: 'references/code-review.md, guard-bash.sh PR-body check' },
  C3: { title: 'Guard false positive: file content written through Bash matched a block rule', fixIn: 'references/pitfalls.md (Writing files), guard tests' },
  C4: { title: 'Environment state: generated or tracked files, merge conflicts, timing', fixIn: '.gitignore / .gitattributes, references/pitfalls.md (Environment)' },
  C5: { title: 'Coding pitfall: syntax or escaping errors, shell portability', fixIn: 'references/pitfalls.md (Shell, Code edits)' },
  C6: { title: 'Policy gap: a rule blocked a legitimate request, or two rules conflicted', fixIn: 'references/prompt-injection.md, hooks' },
  C7: { title: 'Loop cost: passes that found nothing to do', fixIn: 'SKILL.md (Running on a schedule)' },
});

const WRITES_FILE = /<<-?\s*['"]?\w+|python3?\s+-\s|node\s+-e\s|sed\s+-i|\bcat\s*>|\btee\s/;

/**
 * @param e { kind: 'tool-error' | 'user' | 'review' | 'loop-pass', text, command? }
 * @returns a cause id, 'guard-ok' (a guard rightly blocked something), 'expected' or 'new'
 */
export function classify(e) {
  const text = String(e.text ?? '');
  if (e.kind === 'loop-pass') return /quiet tick|no open|nothing to/i.test(text) ? 'C7' : 'expected';
  if (e.kind === 'review') return /\b(bug|high|medium|finding|missing test|fails? (open|closed))/i.test(text) ? 'C2' : 'expected';
  if (e.kind === 'user') {
    if (/\b(score|leaderboard|feedback|✗|fix these)\b/i.test(text)) return 'C1';
    const own = text.replace(/<pasted_content[\s\S]*?<\/pasted_content[^>]*>/g, ''); // the owner's words, not a paste
    if (/\b(wrong|still|not working|again|broken|doesn'?t work|you missed)\b/i.test(own)) return 'C2';
    return 'expected';
  }
  // Tool errors.
  if (/Blocked by \.claude\/hooks/.test(text)) {
    if (/outside the project|read-only on ticket/.test(text)) return 'C6';
    return WRITES_FILE.test(e.command ?? '') ? 'C3' : 'guard-ok';
  }
  if (/would be overwritten by (checkout|merge)|CONFLICT|Merge conflict|stash/i.test(text)) return 'C4';
  if (/SyntaxError|syntax error|unexpected token|Unexpected (token|identifier)/i.test(text)) return 'C5';
  if (/not ok \d+|# fail [1-9]|COVERAGE FAIL/.test(text)) return 'expected'; // TDD red runs are intended
  if (/^Exit code 1\b/.test(text) && /\bgrep\b|\bls\b/.test(e.command ?? '')) return 'expected'; // no match ≠ failure
  return 'new';
}

/** Groups classified events: { C1: [events], …, new: [events] }, dropping expected / guard-ok. */
export function digest(events) {
  const groups = {};
  for (const e of events) {
    const cause = classify(e);
    if (cause === 'expected' || cause === 'guard-ok') continue;
    (groups[cause] ??= []).push(e);
  }
  return groups;
}

const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').slice(0, n);

/** Markdown report: one section per cause with count, where to fix it, and up to 3 examples. */
export function report(groups, { since, until } = {}) {
  const ids = Object.keys(groups).sort();
  const out = [`## Retro ${since ?? ''}${until ? ` → ${until}` : ''}`, ''];
  if (!ids.length) return [...out, 'No new failures. Nothing to heal.'].join('\n');
  for (const id of ids) {
    const cause = CAUSES[id] ?? { title: 'NEW — no known cause matches: add one to retro/causes.mjs', fixIn: 'decide, then record it in retro/learnings.md' };
    out.push(`### ${id} · ${groups[id].length}× · ${cause.title}`, `Fix in: ${cause.fixIn}`);
    for (const e of groups[id].slice(0, 3)) out.push(`- [${e.kind}] ${clip(e.command ? `${clip(e.command, 60)} → ` : '', 70)}${clip(e.text, 160)}`);
    out.push('');
  }
  return out.join('\n').trimEnd();
}
