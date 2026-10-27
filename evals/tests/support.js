// Test helpers: throwaway git repos and projects under the OS temp dir.
import { execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

export function writeFiles(dir, files) {
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(join(dir, dirname(path)), { recursive: true });
    writeFileSync(join(dir, path), body);
  }
}

/** A repo with `baseFiles` committed on main, then `headFiles` committed on top. Returns { dir, sh }. */
export function repoWith(baseFiles, headFiles = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'evals-'));
  const sh = (c) => execSync(c, { cwd: dir, stdio: 'pipe', encoding: 'utf8' });
  sh('git init -q -b main && git config user.email t@example.com && git config user.name t');
  writeFiles(dir, baseFiles);
  sh('git add -A && git commit -q --allow-empty -m base && git tag base');
  writeFiles(dir, headFiles);
  sh('git add -A && git commit -q --allow-empty -m head');
  return { dir, sh };
}

export const SUM = 'export const sum = (a, b) => a + b;\n';
export const SUM_TEST = "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\n"
  + "import { sum } from '../src/domain/sum.js';\ntest('adds', () => assert.equal(sum(1, 2), 3));\n";
