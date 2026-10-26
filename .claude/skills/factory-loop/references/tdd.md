# Test-driven development in the factory

Every feature and bug fix is built test-first. Tooling is free and built in: Node's test runner
(`node --test`) and `node:assert/strict` — no dependencies to install.

## Loop

1. **Red:** for each requirement in the approved plan, write the unit test(s) first in
   `<project>/tests/<module>.test.js`. Run `node --test` inside `<project>/` (it finds `*.test.js`) and confirm they fail for
   the right reason (missing function / wrong value — not a syntax error).
2. **Green:** write the smallest code in `src/domain/` (or `src/data/`) that makes them pass.
3. **Refactor:** clean up with tests green. Re-run after every change.
4. Repeat per requirement. Browser verification (Stage 3) comes *after* unit tests are green — it
   checks wiring and UI, not logic the unit tests already cover.

## What to test

- **Domain:** every rule in the plan, plus edge cases: empty input, boundaries (month ends, leap
  years, max lengths), invalid input (rejected, not crashed), idempotency (doing it twice).
- **Data:** the storage adapter against an in-memory fake with the same API; migrations of old
  records (fields missing).
- **Security-relevant behaviour:** input validation and length limits, that stored strings are
  never interpreted as HTML (components use `textContent`).
- Not the browser's own behaviour, and not CSS.

## Shape

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextDue } from '../src/domain/recurrence.js';

test('monthly keeps the anchor day: Jan 31 → Feb 28', () => {
  assert.equal(nextDue({ due: '2027-01-31', repeat: 'monthly', anchorDay: 31, today: '2026-10-26' }), '2027-02-28');
});
```

One behaviour per test, named as a sentence. No shared mutable state between tests.

## Evidence

The PR body includes the test count and the `node --test` summary (pass/fail counts), and the plan
(Stage 2) lists the test cases before any code is written.

## Coverage eval

`coverage/coverage-eval.mjs` checks that the tests were actually written, using Node's built-in
coverage (free). For each project with changed source it runs `node --test` with coverage and fails if:

- tests fail;
- an in-scope source file is never imported by any test ("no test imports it");
- a changed in-scope file has under `changedFileLines`% lines covered;
- project totals are under the `lines` / `branches` / `functions` thresholds.

Defaults: scope `src/domain/`, `src/data/`, `src/services/` (UI and `main.js` are browser-verified);
thresholds 90 / 80 / 90, changed files 80. A project overrides them in its `package.json`:

```json
"coverage": { "exclude": ["src/data/indexedDbBackend.js"], "excludeReason": "browser-only adapter", "lines": 90 }
```

Exclude a file only when it can't run under Node (e.g. a thin browser-API adapter), and give the
reason. Never lower a threshold to get a PR through: write the tests.

Run it with `node .claude/skills/factory-loop/coverage/coverage-eval.mjs [--base REF] [--all] [project]`.
`quality-gate.sh` runs it, so a coverage miss blocks `gh pr create`; the Stop hook
`coverage-report.sh` shows the verdict at the end of each turn. Paste its table into the PR **Tests** section.
