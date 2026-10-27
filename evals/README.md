# evals

Scores the factory's own output after every build. Two evals, each writing a `results.json`:

```json
{ "eval": "unit-tests", "score": 88, "target": { … }, "ranAt": "…", "cases": [{ "id": "tests-pass", "pass": true, "detail": "…" }] }
```

`score` is the percentage of passing cases. Everything is free and local: Node's test runner and
built-in coverage, plus `git`. No dependencies.

| Eval | What it scores | Cases |
|---|---|---|
| `unit-tests/` | A project's unit tests, from a `node --test` run with coverage | `tests-pass`, `has-tests`, `no-skipped-or-todo`, `coverage-lines` (≥90%), `coverage-branches` (≥80%), `coverage-functions` (≥90%), `core-modules-tested`, `ui-modules-tested` |
| `merge-risk/` | How risky a change is to merge, from its git diff `base...head` | `small-diff` (≤400 lines), `few-files` (≤20), `tests-with-source`, `no-deleted-files`, `no-harness-changes`, `no-new-dependencies`, `files-under-limit` (≤150 lines), `no-unsafe-sinks`, `single-project` |

"Core" modules are every source file except UI components (`src/ui/`) and `src/main.js`.
merge-risk also records a `risk` level: low (score ≥85), medium (≥60) or high.

## Run

```bash
node evals/run.mjs --project todo --base origin/main --head HEAD --label "Ticket #N"
```

Both `results.json` files are rewritten; commit them with the build. To score a merged PR, pass
its base and head commits (`gh pr view N --json baseRefOid,headRefOid`).

## Test

```bash
cd evals && node --test
```

## Layout

```
run.mjs                CLI: runs both evals, writes results, prints a summary
lib/results.mjs        results shape: score, validate, write, one-line summary
unit-tests/eval.mjs    gather (node --test + coverage) → cases
merge-risk/eval.mjs    gather (git diff) → cases, risk level
tests/                 node --test, incl. end-to-end runs in throwaway git repos
```
