#!/usr/bin/env bash
# Quality gate for factory PRs. Free and local only. For every top-level project folder changed
# relative to the base ref, it checks:
#   1. tests      <project>/tests exists and `node --test` (run inside <project>) passes
#   2. size       no source file over MAX_LINES lines (architecture: no monoliths)
#   3. sinks      no unsafe DOM/JS sinks in changed source (innerHTML, eval, …)
#   4. secrets    no likely keys/tokens in added lines
#   5. deepsec    free regex scan (`deepsec scan`); candidates in changed files listed for triage
# Exits 1 if any of checks 1–4 fail. deepsec candidates are warnings: triage them in the PR.
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

changed=$(git diff --name-only --diff-filter=ACMR "$base"...HEAD 2>/dev/null; git diff --name-only --diff-filter=ACMR HEAD)
changed=$(sort -u <<<"$changed" | grep -v '^$')
# Projects = changed top-level folders, skipping dot-folders (harness, deepsec workspace).
projects=$(grep '/' <<<"$changed" | cut -d/ -f1 | grep -v '^\.' | sort -u)
src_re='\.(m?js|ts|jsx|tsx)$'

echo "Quality gate vs $base"
[ -z "$projects" ] && echo "  (no project folders changed)"

for p in $projects; do
  echo "Project: $p"
  if [ -d "$p/tests" ] && ls "$p"/tests/*.test.* >/dev/null 2>&1; then
    # Clear NODE_TEST_CONTEXT so a gate run from inside another test runner still fails properly.
    if out=$(cd "$p" && env -u NODE_TEST_CONTEXT node --test 2>&1); then
      ok "tests: $(grep -E '^# (pass|fail)' <<<"$out" | tr '\n' ' ')"
    else
      bad "tests failing:"; tail -25 <<<"$out" | sed 's/^/      /'
    fi
  else
    bad "no tests: add $p/tests/*.test.js (see references/tdd.md)"
  fi

  for f in $(git ls-files "$p" | grep -E "$src_re" | grep -v '/tests/' | grep -v 'node_modules/'); do
    n=$(wc -l <"$f" | tr -d ' ')
    [ "$n" -gt "$MAX_LINES" ] && bad "size: $f has $n lines (max $MAX_LINES) — split it (references/architecture.md)"
  done
done

sink_re='\.(innerHTML|outerHTML)[[:space:]]*\+?=|insertAdjacentHTML|document\.write|(^|[^.[:alnum:]_])eval[[:space:]]*\(|new[[:space:]]+Function[[:space:]]*\(|set(Timeout|Interval)[[:space:]]*\([[:space:]]*[`"'"'"']'
sinks=0
for f in $(grep -E "$src_re" <<<"$changed" | grep -v '^\.' | grep -v '/tests/'); do
  [ -f "$f" ] || continue
  hits=$(grep -nE "$sink_re" "$f")
  [ -n "$hits" ] && sinks=1 && bad "unsafe sink in $f:" && sed 's/^/      /' <<<"$hits"
done
[ "$sinks" -eq 0 ] && ok "sinks: none in changed source"

secret_re='AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{40,}|sk-(ant-|proj-)?[A-Za-z0-9_-]{20,}|xox[abprs]-[A-Za-z0-9-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|AIza[0-9A-Za-z_-]{35}'
secrets=$( { git diff "$base"...HEAD; git diff HEAD; } 2>/dev/null | grep -E '^\+' | grep -v '^+++' | grep -nE "$secret_re")
if [ -n "$secrets" ]; then bad "possible secret in added lines:"; sed 's/^/      /' <<<"$secrets"; else ok "secrets: none in added lines"; fi

if [ -d .deepsec/node_modules/deepsec ]; then
  if (cd .deepsec && npx --no-install deepsec scan >/dev/null 2>&1); then
    cands=$(CHANGED="$changed" node -e '
      const fs = require("fs"), path = require("path");
      const want = new Set(process.env.CHANGED.split("\n").filter(Boolean));
      const dir = fs.readdirSync(".deepsec/data", { withFileTypes: true }).filter(d => d.isDirectory())[0];
      const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap(e =>
        e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
      const filesDir = path.join(".deepsec/data", dir.name, "files");
      if (!fs.existsSync(filesDir)) process.exit(0);
      for (const f of walk(filesDir)) {
        const r = JSON.parse(fs.readFileSync(f, "utf8"));
        if (!want.has(r.filePath)) continue;
        for (const c of r.candidates || [])
          console.log(`${r.filePath}:${(c.lineNumbers || []).join(",")} ${c.vulnSlug} (${c.matchedPattern})`);
      }')
    if [ -n "$cands" ]; then
      echo "  ! deepsec scan (free) candidates in changed files — triage each in the PR (fix or explain):"
      sed 's/^/      /' <<<"$cands"
    else
      ok "deepsec scan (free): no candidates in changed files"
    fi
  else
    echo "  ! deepsec scan failed to run — see .deepsec/ (gate continues)"
  fi
else
  echo "  ! deepsec not installed: (cd .deepsec && npm install) — free scan skipped"
fi

[ "$fail" -eq 0 ] && echo "PASS" || echo "FAIL"
exit "$fail"
