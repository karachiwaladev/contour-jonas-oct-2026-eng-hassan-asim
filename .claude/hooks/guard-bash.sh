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

# Prompt-injection backstop: whatever a ticket says, never leak secrets, run downloaded code or
# turn off the harness. (Ticket content is screened first — see factory-loop/injection/.)
kseg=$(GUARD_KEEP_QUOTES=1 perl "$here/guard-normalize.pl" <<<"$raw") # same lines, quoted text kept
qraw=$(GUARD_FLAT=1 perl "$here/guard-normalize.pl" <<<"$raw") # unsplit (pipes kept), quotes hidden, no heredoc file bodies
SECRET='(\.ssh/|/id_(rsa|ed25519)|\.aws/credentials|\.netrc|\.npmrc|\.git-credentials|\.config/gh/|\.docker/config\.json|\.gnupg/|Keychains/|(^|[/[:space:]])\.env($|[.[:space:]]))'
READER='(cat|less|more|head|tail|base64|xxd|od|strings|cp|scp|rsync|tar|zip|gzip|curl|wget|nc|openssl|python3?|node|perl|ruby|awk|sed|grep|source|\.)'
at 'gh[[:space:]]+auth[[:space:]]+token' && block "printing the GitHub token is not allowed."
grep -q -- '--show-token' <<<"$segs" && block "printing the GitHub token is not allowed."
grep -qE "^${READER}([[:space:]].*)?${SECRET}" <<<"$kseg" && block "reading credential files (ssh keys, .env, tokens) is not allowed."
at "${G}credential([[:space:]]|$)" && block "git credential helpers can reveal tokens; not allowed."
at 'security[[:space:]]+(find|dump)-' && block "reading the macOS keychain is not allowed."
at 'printenv' && block "dumping environment variables is not allowed (they hold tokens)."
grep -qE '(^|[;&|(][[:space:]]*)(env|export[[:space:]]+-p|set)[[:space:]]*($|[|>;&)])' <<<"$qraw" && block "dumping environment variables is not allowed (they hold tokens)."
grep -qE '(curl|wget)[^|;&]*\|[[:space:]]*(sudo[[:space:]]+)?(ba|z|da)?sh\b|(ba|z)?sh[[:space:]]+<\([[:space:]]*(curl|wget)' <<<"$qraw" && block "piping downloaded code into a shell is not allowed."
at '(nc|ncat|netcat|socat|telnet|scp|sftp|ftp)([[:space:]]|$)' && block "raw network transfer tools are not allowed (possible exfiltration)."
while IFS= read -r seg; do
  [[ "$seg" =~ ^(curl|wget)[[:space:]] ]] || continue
  if [[ "$seg" =~ [[:space:]](-d|--data[a-z-]*|-F|--form|-T|--upload-file|--post-data|--post-file|--body-file)([[:space:]=]|$) ]]; then
    grep -oE 'https?://[^/[:space:]]+' <<<"$seg" | grep -qvE '^https?://([a-z0-9-]+\.)*github\.com$' && block "uploading data to a non-GitHub host is not allowed (possible exfiltration)."
  fi
done <<<"$kseg"
grep -qE -- '--no-verify|core\.hooksPath|dangerously' <<<"$segs$kseg" && block "skipping or redirecting hooks is not allowed."

# On a ticket branch the harness is read-only: a ticket can't rewrite the rules that check it.
if [[ "$branch" == factory/issue-* ]]; then
  P='(\.claude/(hooks|skills|settings|agents|commands)|\.github/)'
  W='^(tee|cp|mv|rm|ln|chmod|chown|touch|truncate|install|dd|sed[[:space:]]+(-[a-zA-Z]*i|--in-place)|perl[[:space:]]+-[a-zA-Z]*i|git[[:space:]]+(checkout|restore|rm|mv|apply))([[:space:]]|$)'
  if grep -qE ">{1,2}[[:space:]]*[^[:space:]]*${P}" <<<"$kseg" || grep -E "$W" <<<"$kseg" | grep -qE "$P"; then
    block "harness files (.claude/, .github/) are read-only on ticket branches."
  fi
fi

# Quality gate before any PR is opened. Runs on the branch being proposed: --head <ref> if given
# (checked out in a temporary worktree), else the directory the command cd's into, else the repo.
if at 'gh[[:space:]]+pr[[:space:]]+create'; then
  dir=$(grep -E '^cd[[:space:]]' <<<"$segs" | tail -1 | sed -E 's/^cd[[:space:]]+//; s/[[:space:]].*//')
  dir=${dir:-$root}
  head=$(grep -E '^gh[[:space:]]+pr[[:space:]]+create' <<<"$segs" | grep -oE -- '--head[[:space:]=]+[^[:space:]]+' | head -1 | sed -E 's/--head[[:space:]=]+//')
  # A ticket PR must carry the full report, so a skipped review or eval blocks the PR instead of
  # going unnoticed (self-healing cause C2). The body has to come from a file to be checkable.
  pr_branch=${head:-$(git -C "$dir" rev-parse --abbrev-ref HEAD 2>/dev/null)}
  if [[ "$pr_branch" == factory/issue-* ]]; then
    bf=$(grep -E '^gh[[:space:]]+pr[[:space:]]+create' <<<"$kseg" | grep -oE -- '--body-file[[:space:]=]+[^[:space:]]+' | head -1 | sed -E 's/--body-file[[:space:]=]+//')
    [ -n "$bf" ] || block "ticket PRs need --body-file with the full report (Tests, Evals, Code review, Security)."
    [[ "$bf" = /* ]] || bf="$dir/$bf"
    [ -f "$bf" ] || block "PR body file $bf not found."
    missing=""
    for need in '## Tests' '## Evals' '## Code review' 'Independent reviewer' '## Security'; do
      grep -qiF -- "$need" "$bf" || missing="$missing, $need"
    done
    [ -z "$missing" ] || block "PR body is missing:${missing#,} — do the step, then report it (references/code-review.md)."
  fi
  tmp=""
  if [ -n "$head" ] && [ "$head" != "$(git -C "$dir" rev-parse --abbrev-ref HEAD 2>/dev/null)" ]; then
    tmp=$(mktemp -d "${TMPDIR:-/tmp}/gate-XXXXXX")
    git -C "$dir" worktree add -q --detach "$tmp" "$head" 2>/dev/null || block "quality gate: can't check out --head $head to test it."
    dir=$tmp
  fi
  # Fail closed: a gate that doesn't finish in time blocks the PR (hook timeout would let it through).
  gate_branch=${head:-$(git -C "$dir" rev-parse --abbrev-ref HEAD 2>/dev/null)}
  out=$(cd "$dir" && GATE_BRANCH="$gate_branch" perl -e 'alarm shift; exec @ARGV' 240 "$here/../skills/factory-loop/quality-gate.sh" 2>&1)
  code=$?
  [ -n "$tmp" ] && git -C "$root" worktree remove --force "$tmp" 2>/dev/null
  [ "$code" -eq 142 ] && block "quality gate timed out (240s) — run it yourself and fix what's slow."
  [ "$code" -ne 0 ] && { printf 'Blocked: quality gate failed — fix these before opening the PR.\n%s\n' "$out" >&2; exit 2; }
fi
exit 0
