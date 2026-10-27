---
name: persona-swarm
description: Test a local web app with a swarm of 5 persona agents (power user, older user, hacker, angry rage-clicker, breaker, edge-case hunter — 5 of 6 per run, hacker always in), each a Claude Code subagent driving its own real headless Chrome. Produces a shoal-style friction map (issues ranked by how many personas hit them). Free — runs on the local Claude Code session, no API key. Used by factory-loop Stage 3 after browser verification; also on demand (/persona-swarm, "run the persona swarm on <url>").
---

# persona-swarm — five simulated users, one friction map

Inspired by [shoal](https://github.com/Raynan00/shoal): persona-driven agents use the app in a real
browser, file findings in character, and the findings are clustered and ranked into a **friction map**.
`personas.yaml` follows shoal's persona schema (JSON is valid YAML), so the same panel loads in
shoal unchanged.

**Why not shoal's own runner:** its agents need a model API. Its `subscription` mode reads
`~/.claude/.credentials.json`, which doesn't exist on macOS because Claude Code keeps its token in the
Keychain. Pulling that token out is credential handling the harness blocks. So the agents here are
**Claude Code subagents of the current session**: free, with no API key and no extra service.

## Files
| File | What |
|---|---|
| `personas.yaml` | The 6-persona panel: id, emoji, name, patience_steps, focus, profile |
| `drive.mjs` | Browser driver: one headless Chrome per agent; look/click/type/key/shot/status; **localhost only**, no arbitrary JS |
| `agent-prompt.md` | Prompt template for each persona subagent, including the results JSON format |
| `swarm.mjs` | `pick <runKey>` (5 personas, rotating, hacker always) · `report <dir>` (validate + friction map) |
| `lib.mjs` | Pure rules, tested in `.claude/tests/persona-swarm.test.mjs` |

## Run it
1. **Serve** the project on a free port, e.g. `python3 -m http.server 8790` from its folder.
2. **Pick:** `node .claude/skills/persona-swarm/swarm.mjs pick <issue number>` gives 5 personas.
3. **Spawn 5 subagents in one message, so they run in parallel** (Agent tool, `general-purpose`).
   Each one gets `agent-prompt.md` with its placeholders filled in:
   - `{task}`: the ticket's visible request, plus the plan's browser checks.
   - `{url}`: the local server.
   - `{session_dir}`: `<scratchpad>/swarm/<id>`.
   - `{results_file}`: `<scratchpad>/swarm/results/<id>.json`.
   - The persona fields come from the pick.

   Give the subagents nothing else: no plan, no code, no hints about known bugs.
4. **Report:** `node .claude/skills/persona-swarm/swarm.mjs report <scratchpad>/swarm/results --label "Ticket #N"`.
   If an agent's file is invalid, re-run that one agent. Then stop the server, and run
   `drive.mjs stop` on any session that's left.
5. **Triage every friction-map entry.** Reproduce critical and high entries yourself with the
   driver or the screenshot script.
   - **Fix it**, with a unit test where the logic allows, then re-run that persona.
   - **Or explain it** (not reproducible, or out of scope) in one line.

   Findings are model judgements, so they **don't block** on their own. Anything you confirm is a
   real bug and gets fixed like any other.
6. **PR body:** add a `## Persona swarm` section with the printed report and a triage line per entry.

## Cost and limits
- Five subagents use this session's Claude Code usage (no API charges), so run the swarm once per
  build, not on quiet ticks.
- Agents see the page through `look` (text + controls) and screenshots they Read.
- Timing-dependent bugs and races are out of scope; shoal's race mode covers those.
