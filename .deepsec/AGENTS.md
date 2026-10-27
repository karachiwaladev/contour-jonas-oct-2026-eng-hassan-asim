# Agent setup

This is a deepsec scanning workspace used for the free `scan` stage only
(`npm install && npx deepsec scan`). The paid AI stages (`setup`, `process`,
`revalidate`, `triage`, `enrich`, `sandbox`) are blocked by
`.claude/hooks/guard-bash.sh`; see `.claude/skills/factory-loop/references/security.md`.

- **Write a custom matcher** (only after a real true-positive shows you
  a pattern worth keeping): read
  `node_modules/deepsec/dist/docs/writing-matchers.md`.

## Reference

The deepsec skill is at `node_modules/deepsec/SKILL.md` (after
`npm install`). The full docs ship at
`node_modules/deepsec/dist/docs/`.
