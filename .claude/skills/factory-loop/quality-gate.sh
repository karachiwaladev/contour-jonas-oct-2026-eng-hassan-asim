#!/usr/bin/env bash
# Quality gate for factory PRs. Free and local only. For every top-level project folder changed
# relative to the base ref, it checks:
#   1. tests      if source changed: <project>/tests has test() calls and `node --test` passes,
#                 and the coverage eval (coverage/coverage-eval.mjs) meets its thresholds
#                 (docs-only changes don't need tests)
#   2. size       no source file over MAX_LINES lines (architecture: no monoliths)
#   3. sinks      no unsafe DOM/JS sinks in changed source or HTML (innerHTML, eval, onclick=, …)
#   4. secrets    no likely keys/tokens in added lines
#   5. deepsec    free regex scan (`deepsec scan`); candidates in changed files listed for triage
# Exits 1 if any of checks 1–4 fail, or if the base ref is missing (fails closed). deepsec
# candidates are warnings: triage them in the PR.
#
#   quality-gate.sh [base-ref]      (default: origin/main)
set -uo pipefail

root=$(git rev-parse --show-toplevel) || exit 1
cd "$root"
base=${1:-origin/main}
MAX_LINES=${MAX_LINES:-150}
fail=0
bad() { echo "  ✗ $*"; fail=1; }
ok() { echo "  ✓ $*"; }

echo "Quality gate vs $base"
if ! git rev-parse --verify -q "$base^{commit}" >/dev/null; then
  echo "  ✗ base ref '$base' not found — fetch it (git fetch origin) or pass an existing base."
  echo "FAIL"
  exit 1
fi

changed=$( { git diff --name-only --diff-filter=ACMR "$base"...HEAD && git diff --name-only --diff-filter=ACMR HEAD; } | sort -u | grep -v '^$')
src_re='\.(m?js|cjs|ts|jsx|tsx)$'
web_re='\.(m?js|cjs|ts|jsx|tsx|html?)$'
# Projects = changed top-level folders, skipping dot-folders (harness, deepsec workspace).
projects=$(grep '/' <<<"$changed" | cut -d/ -f1 | grep -v '^\.' | sort -u)
[ -z "$projects" ] && echo "  (no project folders changed)"

while IFS= read -r p; do
  [ -n "$p" ] || continue
  echo "Project: $p"
  if ! grep -E "^$p/" <<<"$changed" | grep -v '/tests/' | grep -qE "$src_re"; then
    ok "tests: not required (no source changed)"
  elif ! ls "$p"/tests/*.test.* >/dev/null 2>&1; then
    bad "no tests: add $p/tests/*.test.js (see references/tdd.md)"
  elif ! grep -qE '(^|[^[:alnum:]_.])(test|it)[[:space:]]*\(' "$p"/tests/*.test.*; then
    bad "tests: $p/tests has no test() calls — empty test files don't count"
  # Clear NODE_TEST_CONTEXT so a gate run from inside another test runner still fails properly.
  elif out=$(cd "$p" && env -u NODE_TEST_CONTEXT node --test 2>&1); then
    ok "tests: $(grep -E '^# (pass|fail)' <<<"$out" | tr '\n' ' ')"
    if cov=$(node "$(dirname "$0")/coverage/coverage-eval.mjs" --base "$base" "$p" 2>&1); then
      ok "coverage: $(grep -E '^\| (lines|branches|functions) ' <<<"$cov" | awk -F'|' '{gsub(/ /,"",$2); gsub(/ /,"",$3); printf "%s %s  ", $2, $3}')"
    else
      bad "coverage below threshold (coverage/coverage-eval.mjs):"; sed 's/^/      /' <<<"$cov"
    fi
  else
    bad "tests failing:"; tail -25 <<<"$out" | sed 's/^/      /'
  fi

  while IFS= read -r f; do
    n=$(wc -l <"$f" | tr -d ' ')
    [ "$n" -gt "$MAX_LINES" ] && bad "size: $f has $n lines (max $MAX_LINES) — split it (references/architecture.md)"
  done < <(git ls-files "$p" | grep -E "$src_re" | grep -v '/tests/' | grep -v 'node_modules/')
done <<<"$projects"

js_sinks='\.(innerHTML|outerHTML)[[:space:]]*\+?=|insertAdjacentHTML|document\.write|(^|[^.[:alnum:]_])eval[[:space:]]*\(|new[[:space:]]+Function[[:space:]]*\(|set(Timeout|Interval)[[:space:]]*\([[:space:]]*[`"'"'"']'
html_sinks='[[:space:]]on[a-z]+[[:space:]]*=|javascript:|<script(>|[[:space:]][^>]*>)[[:space:]]*[^<[:space:]]'
sinks=0
while IFS= read -r f; do
  [ -f "$f" ] || continue
  hits=$(grep -nE "$js_sinks" "$f"; if [[ "$f" =~ \.html?$ ]]; then grep -nE "$html_sinks" "$f"; fi)
  [ -n "$hits" ] && sinks=1 && bad "unsafe sink in $f:" && sed 's/^/      /' <<<"$hits"
done < <(grep -E "$web_re" <<<"$changed" | grep -v '^\.' | grep -v '/tests/')
[ "$sinks" -eq 0 ] && ok "sinks: none in changed source"

secret_re='AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{40,}|sk-(ant-|proj-)?[A-Za-z0-9_-]{20,}|xox[abprs]-[A-Za-z0-9-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|AIza[0-9A-Za-z_-]{35}'
secrets=$( { git diff "$base"...HEAD; git diff HEAD; } | grep -E '^\+' | grep -v '^+++' | grep -nE "$secret_re")
if [ -n "$secrets" ]; then bad "possible secret in added lines:"; sed 's/^/      /' <<<"$secrets"; else ok "secrets: none in added lines"; fi

# deepsec lives in the main checkout; a linked worktree uses it too, scanning this tree via --root.
main_root=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")
ds="$root/.deepsec"; [ -d "$ds/node_modules/deepsec" ] || ds="$main_root/.deepsec"
if [ -d "$ds/node_modules/deepsec" ]; then
  if (cd "$ds" && npx --no-install deepsec scan --root "$root" >/dev/null 2>&1); then
    if cands=$(CHANGED="$changed" DS="$ds" ROOT="$root" node "$(dirname "$0")/deepsec-candidates.cjs" 2>&1); then
      if [ -n "$cands" ]; then
        echo "  ! deepsec scan (free) candidates in changed files — triage each in the PR (fix or explain):"
        sed 's/^/      /' <<<"$cands"
      else
        ok "deepsec scan (free): no candidates in changed files"
      fi
    else
      echo "  ! deepsec results unreadable — triage manually: $cands"
    fi
  else
    echo "  ! deepsec scan failed to run — see $ds (gate continues)"
  fi
else
  echo "  ! deepsec not installed: (cd .deepsec && npm install) — free scan skipped"
fi

[ "$fail" -eq 0 ] && echo "PASS" || echo "FAIL"
exit "$fail"
