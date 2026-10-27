import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { score, buildResults, validate, writeResults, summary } from '../lib/results.mjs';

const cases = [{ id: 'a', pass: true }, { id: 'b', pass: false }, { id: 'c', pass: true }];

test('score is the rounded percentage of passing cases; no cases scores 0', () => {
  assert.equal(score(cases), 67);
  assert.equal(score([]), 0);
});

test('buildResults carries name, target, time and a matching score', () => {
  const r = buildResults('x', { project: 'p' }, cases, '2026-01-01T00:00:00Z');
  assert.deepEqual(r, { eval: 'x', score: 67, target: { project: 'p' }, ranAt: '2026-01-01T00:00:00Z', cases });
  assert.deepEqual(validate(r), []);
});

test('validate rejects missing or inconsistent fields', () => {
  assert.deepEqual(validate(null), ['results must be an object']);
  assert.match(validate({ score: 50, cases: [] }).join(), /non-empty/);
  assert.match(validate({ score: 101, cases }).join(), /0–100/);
  assert.match(validate({ score: 10, cases }).join(), /does not match/);
  assert.match(validate({ score: 50, cases: [{ id: 'a', pass: true }, { id: 'a', pass: false }] }).join(), /duplicate/);
  assert.match(validate({ score: 0, cases: [{ id: '', pass: 'yes' }] }).join(), /string id/);
  assert.match(validate({ score: 0, cases: [{ id: 'z', pass: 'yes' }] }).join(), /true or false/);
});

test('writeResults writes pretty JSON and refuses invalid results', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'res-')), 'deep', 'results.json');
  const r = buildResults('x', {}, cases);
  writeResults(path, r);
  assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), r);
  assert.throws(() => writeResults(path, { ...r, score: 1 }), /invalid results/);
});

test('summary is one line with score and pass count', () => {
  assert.equal(summary(buildResults('unit-tests', {}, cases)), 'unit-tests: 67/100 (2/3 cases pass)');
});
