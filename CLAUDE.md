# Software Factory

This repo is a **software factory**: tickets arrive as GitHub issues, and an agent loop
picks them up, does the work, opens a pull request for the owner to review and merge, and reports back on the ticket.
We build and improve the loop, not individual features by hand.

## Progressive disclosure

Keep context small and load detail only when it's needed:

1. **This file is the entry point.** It holds the purpose, the rules and the index below — nothing else.
2. **Each project lives in its own folder** with its own `README.md` (or `CLAUDE.md`) for details.
   Read a project's docs only when a ticket touches that project.
3. **Skills hold procedures.** How to do a recurring job lives in `.claude/skills/<name>/SKILL.md`,
   not here.

Hard limit: **this file stays under 100 lines.** If it grows, move detail into the relevant
project folder or skill and leave a one-line pointer in the index.

## Index

| Path | What it is |
|---|---|
| `README.md` | Workshop brief: how tickets arrive, scoring, ground rules |
| `.claude/skills/factory-loop/` | The ticket loop: answer/act on issues; features go questions → plan approval → TDD build → review → security gate → Chrome screenshots → PR |
| `.claude/skills/factory-loop/references/` | Engineering standards: architecture, TDD, code review, security (loaded per step) |
| `.claude/skills/factory-loop/quality-gate.sh` | Pre-PR gate: tests, coverage eval, file size, unsafe sinks, secrets, free deepsec scan |
| `.claude/hooks/guard-bash.sh` | PreToolUse hook (+ `guard-normalize.pl`, `guard-args.pl`): blocks main pushes, force/merge/destructive commands, paid deepsec; gates `gh pr create` |
| `.claude/hooks/log-prompts.sh` | Stop hook (wired in `.claude/settings.json`): logs typed prompts |
| `.claude/hooks/auto-commit.sh` | Stop hook: commits and pushes pending changes on the current work branch, never `main` (no deletions, no secrets, no force) |
| `.claude/skills/factory-loop/coverage/` | Coverage eval: did the agent write unit tests? Thresholds per project (`package.json` "coverage"); `.claude/hooks/coverage-report.sh` reports it on every Stop |
| `.claude/logs/prompts.jsonl` | Prompt log, one JSON object per line; commit it with other work |
| `.claude/tests/` | Unit tests for the hooks and gate: `node --test '.claude/tests/*.test.mjs'` |
| `.deepsec/` | deepsec workspace, **free `scan` stage only** (`cd .deepsec && npm install && npx deepsec scan`) |
| `todo/` | Browser todo app (create / done / delete) backed by IndexedDB |

<!-- Add one row per project folder or skill. Keep descriptions to one line. -->

## Rules for adding a project

- Create a new top-level folder per project (kebab-case name), never mix projects.
- Give it a `README.md` explaining what it is and how to run it.
- Add a row to the index above in the same commit.

## Working agreements

- Tickets are GitHub issues in this repo; run the loop with `/factory-loop` or `/loop 1m /factory-loop`.
- Finished work goes to a `factory/issue-N-*` branch and a PR; the owner reviews and merges. The loop never pushes to `main` or merges.
- Code is layered (domain / data / ui / main), test-first with `node --test`, reviewed and security-gated before the PR — see `factory-loop/references/`.
- Free tools only: no paid APIs or services (deepsec AI stages included).
- Training repo only: no Jonas or Contour code, no real keys or secrets.
