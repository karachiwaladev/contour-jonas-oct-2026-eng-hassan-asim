import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gatherUnitFacts, unitTestCases, THRESHOLDS } from '../unit-tests/eval.mjs';
import { writeFiles, SUM, SUM_TEST } from './support.js';

const full = { lines: [10, 10], branches: [4, 4], functions: [2, 2] };
const facts = (over = {}) => ({
  exitCode: 0, tests: 5, failed: 0, skipped: 0, todo: 0,
  sources: [{ path: 'src/domain/a.js', coverage: full }, { path: 'src/ui/view.js', coverage: full }],
  ...over,
});
const byId = (cs) => Object.fromEntries(cs.map((c) => [c.id, c]));

test('a fully tested project passes all eight cases', () => {
  const cs = unitTestCases(facts());
  assert.equal(cs.length, 8);
  assert.deepEqual(cs.filter((c) => !c.pass), []);
});

test('failing, missing, skipped and todo tests each fail their case', () => {
  const c = byId(unitTestCases(facts({ exitCode: 1, failed: 2, tests: 0, skipped: 1 })));
  assert.equal(c['tests-pass'].pass, false);
  assert.equal(c['has-tests'].pass, false);
  assert.equal(c['no-skipped-or-todo'].pass, false);
  assert.equal(byId(unitTestCases(facts({ todo: 1 })))['no-skipped-or-todo'].pass, false);
});

test('coverage cases use core modules only and their thresholds', () => {
  const low = { lines: [5, 10], branches: [1, 4], functions: [1, 2] };
  const c = byId(unitTestCases(facts({ sources: [{ path: 'src/domain/a.js', coverage: low }, { path: 'src/ui/v.js', coverage: full }] })));
  assert.equal(c['coverage-lines'].pass, false);
  assert.match(c['coverage-lines'].detail, new RegExp(`50\\.0% .*min ${THRESHOLDS.lines}%`));
  assert.equal(c['coverage-branches'].pass, false);
  assert.equal(c['coverage-functions'].pass, false);
});

test('untested core and UI modules are named; a project with none of a kind fails that case', () => {
  const c = byId(unitTestCases(facts({ sources: [{ path: 'src/domain/a.js', coverage: null }, { path: 'src/main.js', coverage: null }] })));
  assert.match(c['core-modules-tested'].detail, /src\/domain\/a\.js/);
  assert.equal(c['ui-modules-tested'].pass, false);
  assert.equal(c['coverage-lines'].pass, true, 'no loaded core code: nothing counted');
  const none = byId(unitTestCases(facts({ sources: [] })));
  assert.match(none['ui-modules-tested'].detail, /no UI modules found/);
  assert.equal(none['coverage-lines'].pass, false);
});

test('gatherUnitFacts runs the tests with coverage', () => {
  const dir = mkdtempSync(join(tmpdir(), 'unit-'));
  writeFiles(dir, {
    'package.json': '{"type":"module"}', 'src/domain/sum.js': SUM, 'tests/sum.test.js': SUM_TEST,
    'src/ui/view.js': 'export const v = 1;\n',
  });
  const f = gatherUnitFacts(dir);
  assert.equal(f.exitCode, 0);
  assert.equal(f.tests, 1);
  assert.deepEqual(f.sources.find((s) => s.path === 'src/domain/sum.js').coverage.lines, [1, 1]);
  assert.equal(f.sources.find((s) => s.path === 'src/ui/view.js').coverage, null);
});

test('gatherUnitFacts on a project without src or tests reports nothing passing', () => {
  const f = gatherUnitFacts(mkdtempSync(join(tmpdir(), 'unit-')));
  assert.deepEqual(f.sources, []);
  assert.equal(f.tests, 0);
});
