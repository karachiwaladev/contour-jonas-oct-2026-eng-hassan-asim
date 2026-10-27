// Every file path the factory's docs tell the agent to use must exist, so a skill step can never
// reference tooling that hasn't been built yet (self-healing cause C1: the loop was told to "run
// the evals" before evals/ existed). Run: node --test '.claude/tests/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const skill = join(root, '.claude', 'skills', 'factory-loop');
const docs = [join(root, 'CLAUDE.md'), join(skill, 'SKILL.md'), ...readdirSync(join(skill, 'references')).map((f) => join(skill, 'references', f))];

// Backticked tokens that look like repo paths; placeholders (<project>, OWNER, issue-N, *, ~, $) are skipped.
export function referencedPaths(markdown) {
  const tokens = [...markdown.matchAll(/`([^`\s]+)`/g)].map((m) => m[1].replace(/[),.:;]+$/, ''));
  return tokens.filter((t) => /\.(md|mjs|cjs|js|sh|pl|json)$|\/$/.test(t) && t.includes('/')
    && !/[<>*~$()|^]|OWNER|issue-N|https?:|^\/|\/\/|\.\.\./.test(t));
}

// Paths resolve from the repo root, the skill, .claude/ and .claude/skills/, or inside any project
// folder (references describe a project's own layout, e.g. `src/domain/`).
const projects = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('.')).map((d) => join(root, d.name));
const bases = [root, skill, join(root, '.claude'), join(root, '.claude', 'skills'), ...projects];
// Named only as places the agent must not write, so they needn't exist.
const PROTECTED_ONLY = new Set(['.github/']);
const exists = (p) => PROTECTED_ONLY.has(p) || bases.some((base) => existsSync(join(base, p)));

test('referencedPaths keeps real paths and skips placeholders and URLs', () => {
  assert.deepEqual(referencedPaths('run `evals/run.mjs`, see `<project>/README.md`, `https://x.io/a.md`, `todo/`'), ['evals/run.mjs', 'todo/']);
});

for (const doc of docs) {
  test(`every path in ${doc.slice(root.length + 1)} exists`, () => {
    const missing = referencedPaths(readFileSync(doc, 'utf8')).filter((p) => !exists(p));
    assert.deepEqual(missing, [], `referenced but missing: ${missing.join(', ')}`);
  });
}
