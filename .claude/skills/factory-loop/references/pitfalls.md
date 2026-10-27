# Pitfalls that already cost us (load before writing code or editing the harness)

Each rule comes from a real failure in a session trace. The retro (`retro/`) adds new ones.

## Writing files (cause C3: guards matched text, not behaviour)
- Create or change files with the **Write / Edit tools**, not Bash heredocs, `python3 -`, `node -e`
  or `sed -i`. The Bash guard can't tell file content from commands, so text that mentions
  `curl | sh`, `.env` or `deepsec init` gets blocked.
- For a PR body, write the markdown to a file in the scratchpad and pass `--body-file`. Inline
  `--body "…"` with backticks or `$(` is brittle, and ticket PRs require `--body-file` anyway.
  Pass the body file as a **literal path**, not `$VAR`: the guard reads the command before the
  shell expands it (retro 2026-10-27, ticket #20).
- Keep attack-shaped strings (`curl … | sh`, secret paths) inside test files, never in a command line.
- If a guard blocks something legitimate, fix it with a regression test in `.claude/tests/`. Don't
  route around it.

## Shell (cause C5)
- macOS ships **bash 3.2**: no `case` inside `$( … )` (use `[[ =~ ]]`), no `mapfile`, no `${x,,}`.
- `grep` exits 1 when nothing matches; under `set -e` or `&&` chains, that isn't an error.
- `node --test dir/` doesn't work on Node 22. Run `node --test` inside the project, or pass a glob.
- Clear `NODE_TEST_CONTEXT` (`env -u NODE_TEST_CONTEXT`) when running tests from inside a test run.

## Code edits (cause C5)
- Don't round-trip JavaScript through Python strings: `\x60` becomes a real backtick and breaks
  template literals. Use Edit.
- Paths from `git ls-files` relative to a project have no leading `/`. Match `(^|/)tests/`, not `/tests/`.
- When parsing CLI args, don't index with `indexOf(...) + 1` when the flag may be absent (`-1 + 1` is 0).

## Environment state (cause C4)
- Generated files (`.deepsec/data/*/tech.json`, coverage output) are gitignored; don't commit them.
- `.claude/logs/prompts.jsonl` merges as a union (`.gitattributes`). If a pull still conflicts, keep
  every line from both sides.
- Screenshot steps: an async IIFE step is awaited (`screenshot-steps.mjs`). Still, assert in the
  page (`throw` when the UI is wrong) instead of trusting fixed waits.

## Process (causes C1, C2)
- Never reference a script, path or eval in a skill before it exists. `.claude/tests/skill-paths.test.mjs`
  checks this.
- When the process changes (a new rule in the skill), re-check open tickets started under the old
  process, and bring them up to the new one before their PR.
- Every ticket PR gets the independent reviewer, whatever its size. The guard rejects a ticket PR
  body without `Independent reviewer`.
