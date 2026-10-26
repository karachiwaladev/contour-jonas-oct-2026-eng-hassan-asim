#!/usr/bin/env bash
# Stop hook: commit and push pending changes on a work branch so nothing finished is lost.
# Work reaches main only through a PR the owner reviews and merges, so this hook never
# commits on or pushes to main. Non-destructive by design: never force-pushes, never
# resets, and refuses to commit deletions or likely secrets (left for a human).
# Always exits 0 so a failed commit/push never blocks the session.
set -uo pipefail

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}" || exit 0
log() { echo "auto-commit: $*" >&2; }

# Only on a work branch (never main/master or a detached HEAD), with no merge/rebase running.
branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
case "$branch" in
  main|master|HEAD|"") exit 0 ;;
esac
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

git push -q -u origin "$branch" 2>/dev/null || log "push of $branch failed; commit kept locally" 
exit 0
