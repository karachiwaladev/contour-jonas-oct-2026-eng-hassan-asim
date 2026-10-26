#!/usr/bin/env bash
# Stop hook: commit and push any pending changes to main so finished work is on GitHub.
# Non-destructive by design: never force-pushes, never resets, and refuses to commit
# deletions or likely secrets (those are left in the working tree for a human).
# Always exits 0 so a failed commit/push never blocks the session.
set -uo pipefail

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}" || exit 0
log() { echo "auto-commit: $*" >&2; }

# Only on a clean, normal checkout of main.
[ "$(git rev-parse --abbrev-ref HEAD 2>/dev/null)" = main ] || { log "not on main, skipping"; exit 0; }
gitdir=$(git rev-parse --git-dir)
for f in MERGE_HEAD REBASE_HEAD rebase-merge rebase-apply CHERRY_PICK_HEAD; do
  [ -e "$gitdir/$f" ] && { log "merge/rebase in progress, skipping"; exit 0; }
done

# Stage modifications and new files (.gitignore keeps junk out), but never deletions.
git add --ignore-removal . 2>/dev/null
git diff --cached --quiet && exit 0

# Unstage anything that looks like a secret.
git diff --cached --name-only | grep -Ei '(^|/)(\.env(\..*)?|.*\.(pem|key|p12|pfx)|id_(rsa|ed25519).*|credentials.*)$' |
  while read -r f; do git restore --staged -- "$f"; log "not committing possible secret: $f"; done
git diff --cached --quiet && exit 0

files=$(git diff --cached --name-only)
count=$(wc -l <<<"$files" | tr -d ' ')
summary=$(head -3 <<<"$files" | paste -sd, - | sed 's/,/, /g')
[ "$count" -gt 3 ] && summary="$summary, +$((count - 3)) more"
git commit -q -m "Auto-commit on stop: $summary" || { log "commit failed"; exit 0; }

if ! git push -q origin main 2>/dev/null; then
  if git pull -q --rebase origin main 2>/dev/null; then
    git push -q origin main 2>/dev/null || log "push failed after rebase; commit kept locally"
  else
    git rebase --abort 2>/dev/null
    log "pull --rebase failed; commit kept locally, push manually"
  fi
fi
exit 0
