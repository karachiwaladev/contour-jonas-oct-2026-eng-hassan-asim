# Security gate (free tools only)

**Only free tools.** deepsec's paid stages — `process`, `revalidate`, `triage`, `enrich`, `sandbox`,
and a full `deepsec init` (it starts AI processing) — are **never** run; the Bash guard hook blocks
them. Everything below is local and costs nothing.

## 1. Quality gate script

```bash
.claude/skills/factory-loop/quality-gate.sh            # compares the branch with origin/main
```

It fails on: missing or failing tests, source files over 150 lines, unsafe sinks (`innerHTML`,
`outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, `new Function`, string timers) and
likely secrets in added lines. It also runs the **free deepsec pattern scan** and lists candidates in
the changed files. The guard hook runs this automatically before `gh pr create` and blocks the PR if
it fails.

## 2. deepsec (free stage)

The workspace is `.deepsec/` (scaffolded with `npx deepsec init --scaffold-only`, installed with
`npm install` inside it). The gate runs `npx deepsec scan` from there. Each candidate is a regex hit,
not a confirmed bug — **triage every one** in the changed files: fix it, or record "false positive:
<reason>" in the PR. Never run `deepsec process` (paid AI stage).

## 3. security-review skill

Invoke the `security-review` skill on the branch. It's a review by this session — no extra service.

## 4. Checklist for browser apps

- Untrusted strings (user input, stored data, URL params) reach the DOM only via `textContent` /
  `setAttribute` on safe attributes — never `innerHTML` or `href="javascript:"`.
- `index.html` has a Content-Security-Policy `<meta>`: `default-src 'self'; script-src 'self';
  style-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'` (no inline scripts or
  handlers).
- Inputs have length limits (`maxlength` + validation in the domain layer); stored records are
  validated on read, so a corrupted or tampered IndexedDB entry can't crash or inject.
- No third-party scripts or CDNs unless pinned with Subresource Integrity.
- No secrets, keys or tokens in code, config or screenshots.
- Dates, numbers and ids parsed defensively (reject malformed values rather than propagate `NaN`).

## Fix, then report

Fix every true positive with a test that would have caught it. In the PR body:

```
## Security
- quality-gate.sh: pass (tests <n>/<n>, sinks 0, secrets 0)
- deepsec scan (free): <n> candidates → <fixed / false positive: reason>
- security-review skill: <n> findings → <fixed / not applicable + why>
- Checklist: CSP ✓, textContent ✓, input limits ✓, …
```
