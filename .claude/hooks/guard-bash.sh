#!/usr/bin/env bash
# PreToolUse hook for Bash: enforces the factory's non-destructive, PR-only, free-only rules
# mechanically, and runs the quality gate before a PR is opened. Best-effort guardrail against
# agent mistakes — GitHub branch protection on `main` is the real backstop.
# Exit 2 blocks the command; stderr is shown to Claude as the reason.
set -uo pipefail

raw=$(jq -r '.tool_input.command // empty')
[ -n "$raw" ] || exit 0

block() { echo "Blocked by .claude/hooks/guard-bash.sh: $*" >&2; exit 2; }
here=$(cd "$(dirname "$0")" && pwd)
root=$(git -C "${CLAUDE_PROJECT_DIR:-.}" rev-parse --show-toplevel 2>/dev/null || echo "${CLAUDE_PROJECT_DIR:-.}")
branch=$(git -C "$root" rev-parse --abbrev-ref HEAD 2>/dev/null)

# One simple command per line, as the shell would run them (see guard-normalize.pl).
segs=$(perl "$here/guard-normalize.pl" <<<"$raw")
at() { grep -qE "^$1" <<<"$segs"; }
G='git([[:space:]]+-[Cc][[:space:]]+[^[:space:]]+)*[[:space:]]+'

# Pushes and recursive rm need argument parsing, not just matching.
if ! reason=$(BRANCH="$branch" perl "$here/guard-args.pl" <<<"$segs" 2>&1); then
  block "$reason"
fi

at 'gh[[:space:]]+pr[[:space:]]+merge' && block "the loop never merges PRs — the owner merges."
at 'gh[[:space:]]+pr[[:space:]]+(create|edit)([[:space:]].*)?[[:space:]]--auto' && block "auto-merge is not allowed."
at "${G}reset([[:space:]].*)?[[:space:]]--hard" && block "git reset --hard discards work; not allowed."
at "${G}clean([[:space:]].*)?[[:space:]]-[a-zA-Z]*f" && block "git clean -f deletes untracked files; not allowed."
at "${G}branch([[:space:]].*)?[[:space:]](-D|--delete[[:space:]]+--force)" && block "force-deleting branches is not allowed."
at "${G}(rebase([[:space:]].*)?[[:space:]](-i|--interactive)|commit([[:space:]].*)?[[:space:]]--amend)" && block "history rewriting is not allowed."

# Free-only: deepsec's AI stages are paid.
D='((npx|pnpm|bunx)[[:space:]]+(-y[[:space:]]+|--yes[[:space:]]+|exec[[:space:]]+)?|npm[[:space:]]+exec[[:space:]]+)?deepsec(@[^[:space:]]+)?[[:space:]]+'
at "${D}(process|revalidate|triage|enrich|sandbox|setup)" && block "deepsec paid AI stages are disabled (free tools only). Use 'deepsec scan'."
if at "${D}init" && ! grep -q -- '--scaffold-only' <<<"$segs"; then
  block "'deepsec init' starts paid AI processing; use 'deepsec init --scaffold-only'."
fi

# Quality gate before any PR is opened. Runs on the branch being proposed: --head <ref> if given
# (checked out in a temporary worktree), else the directory the command cd's into, else the repo.
if at 'gh[[:space:]]+pr[[:space:]]+create'; then
  dir=$(grep -E '^cd[[:space:]]' <<<"$segs" | tail -1 | sed -E 's/^cd[[:space:]]+//; s/[[:space:]].*//')
  dir=${dir:-$root}
  head=$(grep -E '^gh[[:space:]]+pr[[:space:]]+create' <<<"$segs" | grep -oE -- '--head[[:space:]=]+[^[:space:]]+' | head -1 | sed -E 's/--head[[:space:]=]+//')
  tmp=""
  if [ -n "$head" ] && [ "$head" != "$(git -C "$dir" rev-parse --abbrev-ref HEAD 2>/dev/null)" ]; then
    tmp=$(mktemp -d "${TMPDIR:-/tmp}/gate-XXXXXX")
    git -C "$dir" worktree add -q --detach "$tmp" "$head" 2>/dev/null || block "quality gate: can't check out --head $head to test it."
    dir=$tmp
  fi
  # Fail closed: a gate that doesn't finish in time blocks the PR (hook timeout would let it through).
  out=$(cd "$dir" && perl -e 'alarm shift; exec @ARGV' 240 "$here/../skills/factory-loop/quality-gate.sh" 2>&1)
  code=$?
  [ -n "$tmp" ] && git -C "$root" worktree remove --force "$tmp" 2>/dev/null
  [ "$code" -eq 142 ] && block "quality gate timed out (240s) — run it yourself and fix what's slow."
  [ "$code" -ne 0 ] && { printf 'Blocked: quality gate failed — fix these before opening the PR.\n%s\n' "$out" >&2; exit 2; }
fi
exit 0
