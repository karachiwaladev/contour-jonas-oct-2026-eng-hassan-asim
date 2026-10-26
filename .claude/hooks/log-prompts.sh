#!/usr/bin/env bash
# Stop hook: append this session's new user prompts to .claude/logs/prompts.jsonl.
# One JSON object per line: {timestamp, session_id, uuid, prompt}. Already-logged
# prompts are skipped by uuid, so running on every stop only adds new ones.
set -euo pipefail

input=$(cat)
transcript=$(jq -r '.transcript_path // empty' <<<"$input")
[ -n "$transcript" ] && [ -f "$transcript" ] || exit 0

log_dir="$(cd "$(dirname "$0")/.." && pwd)/logs"
log="$log_dir/prompts.jsonl"
mkdir -p "$log_dir"
touch "$log"

# Typed prompts only: skip tool results, meta messages (skill expansions,
# scheduled /loop fires) and local command output.
jq -c --slurpfile seen <(jq -c '.uuid' "$log") '
  select(.type == "user" and (.isMeta | not))
  | (.message.content
     | if type == "string" then .
       else (map(select(.type == "text") | .text) | join("\n")) end) as $text
  | select($text != "" and ($text | startswith("<local-command") | not))
  | select(.uuid as $u | $seen | index($u) | not)
  | {timestamp, session_id: .sessionId, uuid, prompt: $text}
' "$transcript" >>"$log"
