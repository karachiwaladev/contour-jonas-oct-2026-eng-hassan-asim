# Code review before every PR

Run after tests are green and before the security gate. Fix what it finds, re-run tests, then record
the outcome in the PR body. Free: everything here runs in the current Claude Code session.

## 1. Self-review against this checklist

Read the full diff (`git diff main...HEAD`) top to bottom, as a reviewer would:

- **Correctness:** each plan requirement has code *and* a test; edge cases from `tdd.md` covered;
  no dead code, no leftover debug logs, no commented-out code.
- **Architecture** (`architecture.md`): files in the right layer, no file over 150 lines, domain is
  pure, components don't touch storage, dependencies point the right way.
- **Naming & readability:** names say what things are; functions do one thing; comments explain
  *why*, matching the surrounding density.
- **Data:** old stored records still load (missing fields defaulted); no schema change without a
  migration path.
- **UX:** empty states, keyboard access, labels/aria for new controls, works at phone width.
- **Docs:** project README updated; `CLAUDE.md` index row if a project was added.

## 2. Independent review

Invoke the `code-review` skill on the branch diff at **high** effort. Then spawn one fresh-context
reviewer agent and give it only the diff and the ticket text — not your plan or conclusions — asking
for correctness bugs, missing tests and architecture violations. A second read that isn't anchored on
yours catches what you rationalised.

## 3. Resolve

For each finding: fix it (with a test if it's a bug) or write one line on why it's not a problem.
Never silently drop a finding.

## In the PR body

```
## Code review
- Self-review: <n> issues fixed (one line each)
- code-review skill (high): <n> findings → <fixed / not applicable + why>
- Independent reviewer: <n> findings → <fixed / not applicable + why>
```
