import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs, runEvals, main } from '../run.mjs';
import { validate } from '../lib/results.mjs';
import { repoWith, SUM, SUM_TEST } from './support.js';

test('parseArgs has defaults and rejects unknown or incomplete options', () => {
  assert.deepEqual(parseArgs([]), { project: 'todo', base: 'origin/main', head: 'HEAD', label: null });
  assert.deepEqual(parseArgs(['--project', 'app', '--base', 'base', '--label', 'T6']).project, 'app');
  assert.throws(() => parseArgs(['--nope', 'x']), /unknown/);
  assert.throws(() => parseArgs(['--base']), /incomplete/);
});

const app = { 'app/package.json': '{"type":"module"}', 'app/src/domain/sum.js': SUM, 'app/tests/sum.test.js': SUM_TEST };

test('runEvals writes two valid results files with resolved commit SHAs', () => {
  const { dir, sh } = repoWith({}, app);
  const out = mkdtempSync(join(tmpdir(), 'out-'));
  const { unit, risk } = runEvals({ root: dir, outDir: out, project: 'app', base: 'base', head: 'HEAD', label: 'T', ranAt: 'now' });
  for (const name of ['unit-tests', 'merge-risk', 'prompt-injection']) {
    const saved = JSON.parse(readFileSync(join(out, name, 'results.json'), 'utf8'));
    assert.deepEqual(validate(saved), [], name);
  }
  assert.equal(unit.cases.find((c) => c.id === 'tests-pass').pass, true);
  assert.equal(unit.cases.find((c) => c.id === 'ui-modules-tested').pass, false, 'app has no UI modules');
  assert.equal(risk.target.head, sh('git rev-parse HEAD').trim());
  assert.equal(risk.risk, 'low');
});

test('main prints a summary line per eval and every case', (t) => {
  const { dir } = repoWith({}, app);
  const lines = [];
  t.mock.method(console, 'log', (l) => lines.push(l));
  main(['--project', 'app', '--base', 'base'], dir, mkdtempSync(join(tmpdir(), 'out-')));
  assert.match(lines[0], /^unit-tests: \d+\/100/);
  assert.match(lines[1], /^merge-risk: \d+\/100 .* risk$/);
  assert.match(lines[2], /^prompt-injection: \d+\/100/);
  assert.equal(lines.length, 3 + 8 + 9 + 12);
});
