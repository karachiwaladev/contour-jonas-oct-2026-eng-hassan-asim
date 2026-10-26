# contour-jonas-oct-2026-eng-hassan-asim

Free-tier use only: this workspace runs `deepsec scan` (regex stage). The paid AI stages are not
used. This file documents the codebase for whoever triages scan candidates.

## What this codebase does

A "software factory" training repo: an agent loop (`.claude/skills/factory-loop/`) turns GitHub
issues into pull requests. Projects are small static browser apps in top-level folders (e.g.
`todo/`), served as plain files with no backend; data lives in the browser's IndexedDB.

## Auth shape

No authentication: apps are single-user and local to the browser. The harness relies on the
developer's `gh` CLI login; no tokens are stored in the repo.

## Threat model

1. DOM XSS: task titles/tags are user input persisted in IndexedDB and rendered back — any HTML sink
   would let a stored string execute.
2. Secrets committed by the agent loop (it writes and pushes code autonomously).
3. Harness scripts (`.claude/hooks/*.sh`) parse tool-call JSON; command-matching mistakes could let a
   destructive git command through.

## Project-specific patterns to flag

- Rendering stored task fields with anything other than `textContent` (e.g. `innerHTML` in `todo/`).
- `eval`/`new Function`/string timers anywhere in app code.
- Shell scripts interpolating untrusted text into commands without quoting.

## Known false-positives

- `insecure-crypto` on `todo/app.js`: matches the word "done"/filter logic, there is no crypto.
- `.claude/tests/*.test.mjs` build fake secrets at runtime on purpose to test the secret scanner.
