import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRIORITIES, isPriority } from '../src/domain/priority.js';

test('the four priority levels, lowest first', () => {
  assert.deepEqual(PRIORITIES, ['none', 'low', 'medium', 'high']);
});

test('isPriority accepts the four levels and rejects anything else', () => {
  for (const p of PRIORITIES) assert.equal(isPriority(p), true, p);
  for (const p of ['', 'urgent', 'HIGH', null, undefined, 1, {}]) assert.equal(isPriority(p), false, String(p));
});
