#!/usr/bin/env bash
# PreToolUse hook for Bash: enforces the factory's non-destructive, PR-only, free-only rules
# mechanically, and runs the quality gate before a PR is opened.
# Exit 2 blocks the command; stderr is shown to Claude as the reason.
set -uo pipefail

raw=$(jq -r '.tool_input.command // empty')
[ -n "$raw" ] || exit 0
# Drop heredoc bodies (file content being written), keeping the rest of the opening line and
# everything after the terminator, so only real commands are checked. A heredoc fed to a shell
# (`bash <<EOF`) *is* commands, so then nothing is stripped. Strings run via `sh -c '…'` are
# appended as extra lines so they're checked too.
shell='(^|[;&|(]|\$\()[[:space:]]*(bash|sh|zsh)([[:space:]]|$)'
if grep -qE "$shell[^<]*<<" <<<"$raw"; then
  cmd=$raw
else
  cmd=$(perl -0pe 's/<<-?[ \t]*([\x27"]?)(\w+)\1([^\n]*)\n.*?^\t*\2[ \t]*$/$3/gms' <<<"$raw")
fi
cmd+=$'\n'$(perl -ne 'print "$2\n" while /\b(?:bash|sh|zsh)\s+-\w*c\s+([\x27"])(.*?)\1/g' <<<"$raw")

block() { echo "Blocked by .claude/hooks/guard-bash.sh: $*" >&2; exit 2; }
# Match commands at a command position (start of a line, or after ; & | && || ( or $( ), so text that
# merely mentions them (docs, commit messages, grep patterns) isn't blocked.
at() { grep -qE "(^|[;&|(]|\\\$\\()[[:space:]]*$1" <<<"$cmd"; }

# `git` optionally followed by global options that take a value (-C <path>, -c <key=val>).
G='git([[:space:]]+-[Cc][[:space:]]+[^[:space:]]+)*[[:space:]]+'

root=$(git -C "${CLAUDE_PROJECT_DIR:-.}" rev-parse --show-toplevel 2>/dev/null || echo "${CLAUDE_PROJECT_DIR:-.}")
branch=$(git -C "$root" rev-parse --abbrev-ref HEAD 2>/dev/null)

if at "${G}push"; then
  grep -qE 'push[^;&|]*[[:space:]](--force|-f|--force-with-lease)([[:space:]=]|$)' <<<"$cmd" && block "force-push is never allowed."
  grep -qE 'push[^;&|]*[[:space:]](--delete|-d)[[:space:]]|push[^;&|]*[[:space:]]:[^[:space:]]' <<<"$cmd" && block "deleting remote branches is not allowed."
  grep -qE 'push[^;&|]*([[:space:]]|:)(refs/heads/)?(main|master)([[:space:]]|$)' <<<"$cmd" && block "never push to main — push the factory/* branch and open a PR."
  if ! grep -qE 'push[^;&|]*[[:space:]][^-[:space:]][^[:space:]]*[[:space:]]+[^-[:space:]]' <<<"$cmd" && [ "$branch" = main ]; then
    block "on main: 'git push' would push main. Switch to a factory/* branch first."
  fi
fi
at 'gh[[:space:]]+pr[[:space:]]+merge' && block "the loop never merges PRs — the owner merges."
at 'gh[[:space:]]+pr[[:space:]]+(create|edit)[^;&|]*--auto' && block "auto-merge is not allowed."
at "${G}reset[[:space:]]+[^;&|]*--hard" && block "git reset --hard discards work; not allowed."
at "${G}clean[[:space:]]+[^;&|]*-[a-zA-Z]*f" && block "git clean -f deletes untracked files; not allowed."
at "${G}branch[[:space:]]+[^;&|]*-D" && block "force-deleting branches is not allowed."
at "${G}(rebase[[:space:]]+-i|commit[[:space:]][^;&|]*--amend)" && block "history rewriting is not allowed."
if at 'rm[[:space:]]+-[a-zA-Z]*[rR]'; then
  targets=$(grep -oE 'rm[[:space:]]+-[a-zA-Z]+[[:space:]]+[^;&|]+' <<<"$cmd" | sed -E 's/^rm[[:space:]]+-[a-zA-Z]+[[:space:]]+//')
  for t in $targets; do
    case "$t" in /tmp/*|/private/tmp/*|*/scratchpad/*) ;; *) block "recursive rm outside the scratchpad/tmp ($t) is not allowed." ;; esac
  done
fi
# Free-only: deepsec's AI stages are paid.
at '(npx[[:space:]]+(-y[[:space:]]+)?|pnpm[[:space:]]+|npm[[:space:]]+exec[[:space:]]+)?deepsec(@[^[:space:]]+)?[[:space:]]+(process|revalidate|triage|enrich|sandbox|setup)' \
  && block "deepsec paid AI stages are disabled (free tools only). Use 'deepsec scan'."
if at '(npx[[:space:]]+(-y[[:space:]]+)?|pnpm[[:space:]]+)?deepsec(@[^[:space:]]+)?[[:space:]]+init' && ! grep -q -- '--scaffold-only' <<<"$cmd"; then
  block "'deepsec init' starts paid AI processing; use 'deepsec init --scaffold-only'."
fi

# Quality gate before any PR is opened.
if at 'gh[[:space:]]+pr[[:space:]]+create'; then
  if ! out=$("$root/.claude/skills/factory-loop/quality-gate.sh" 2>&1); then
    printf 'Blocked: quality gate failed — fix these before opening the PR.\n%s\n' "$out" >&2
    exit 2
  fi
fi
exit 0
