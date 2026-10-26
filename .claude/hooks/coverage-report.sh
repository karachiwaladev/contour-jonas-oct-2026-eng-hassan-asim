#!/usr/bin/env bash
# Stop hook: at the end of each turn, if project source changed vs origin/main (committed or not),
# run the coverage eval and show the verdict to the user as a systemMessage. Report-only: it never
# blocks the stop — the quality gate is what blocks a PR below threshold. Always exits 0.
set -uo pipefail

eval_js="$(cd "$(dirname "$0")/../skills/factory-loop/coverage" && pwd)/coverage-eval.mjs"
cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}" || exit 0
cat >/dev/null # hook input isn't needed
git rev-parse --verify -q 'origin/main^{commit}' >/dev/null || exit 0

out=$(env -u NODE_TEST_CONTEXT node "$eval_js" --base origin/main 2>&1)
grep -q 'nothing to evaluate' <<<"$out" && exit 0
if ! grep -q "^COVERAGE " <<<"$out"; then out="### Coverage: eval failed to run
- ✗ $(tail -3 <<<"$out" | tr "\n" " ")
COVERAGE FAIL"; fi

# Condense the markdown report: project verdicts, metric rows and failure reasons.
summary=$(grep -E '^### Coverage|^\| (lines|branches|functions) |^- ✗|^COVERAGE |^✗' <<<"$out" |
  sed -E 's/^### Coverage: /Coverage eval — /; s/^\| ([a-z]+) \| ([^|]+) \| ([^|]+) \| (.) \|$/  \1 \2 (min \3) \4/; s/ +/ /g')
SUMMARY="$summary" node -e 'process.stdout.write(JSON.stringify({ systemMessage: process.env.SUMMARY }))'
exit 0
