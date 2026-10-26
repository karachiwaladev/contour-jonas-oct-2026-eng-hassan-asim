# Software Factory

This repo is a **software factory**: tickets arrive as GitHub issues, and an agent loop
picks them up, does the work, pushes it to `main`, and reports back on the ticket.
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
| `.claude/skills/factory-loop/` | The ticket loop: read open issues, do the work, comment, close |
| `.claude/hooks/log-prompts.sh` | Stop hook (wired in `.claude/settings.json`): logs typed prompts |
| `.claude/logs/prompts.jsonl` | Prompt log, one JSON object per line; commit it with other work |
| `todo/` | Browser todo app (create / done / delete) backed by IndexedDB |

<!-- Add one row per project folder or skill. Keep descriptions to one line. -->

## Rules for adding a project

- Create a new top-level folder per project (kebab-case name), never mix projects.
- Give it a `README.md` explaining what it is and how to run it.
- Add a row to the index above in the same commit.

## Working agreements

- Tickets are GitHub issues in this repo; run the loop with `/factory-loop` or `/loop 1m /factory-loop`.
- Push finished work to `main` — only what is on GitHub counts.
- Training repo only: no Jonas or Contour code, no real keys or secrets.
