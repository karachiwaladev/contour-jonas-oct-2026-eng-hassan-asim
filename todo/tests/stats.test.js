import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countTasks } from '../src/domain/stats.js';

const task = (id, done, extra = {}) => ({ id, title: `t${id}`, done, tags: [], repeat: 'none', ...extra });

test('no tasks: everything is zero', () => {
  assert.deepEqual(countTasks([]), { open: 0, done: 0, total: 0 });
});

test('counts open and done tasks', () => {
  assert.deepEqual(countTasks([task(1, false), task(2, true), task(3, false)]), { open: 2, done: 1, total: 3 });
});

test('only the done flag decides; anything not exactly true is open', () => {
  assert.deepEqual(countTasks([task(1, true), task(2, 'yes'), task(3, undefined)]), { open: 2, done: 1, total: 3 });
});

test('a completed recurring copy is done and its next copy is open', () => {
  const tasks = [task(1, true, { repeat: 'daily', spawned: true }), task(2, false, { repeat: 'daily' })];
  assert.deepEqual(countTasks(tasks), { open: 1, done: 1, total: 2 });
});

test('does not mutate the input', () => {
  const tasks = [task(1, false), task(2, true)];
  const copy = structuredClone(tasks);
  countTasks(tasks);
  assert.deepEqual(tasks, copy);
});
