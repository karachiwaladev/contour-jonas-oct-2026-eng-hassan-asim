import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_FILTER, matchesFilter, availableTags, sortByCreated, reconcileFilter } from '../src/domain/filters.js';

const tasks = [
  { id: 1, title: 'A', done: false, createdAt: 3, tags: ['work'], repeat: 'weekly' },
  { id: 2, title: 'B', done: true, createdAt: 1, tags: ['home', 'fun'], repeat: 'none' },
  { id: 3, title: 'C', done: false, createdAt: 2, tags: ['home'], repeat: 'daily' },
];
const ids = (f) => tasks.filter((t) => matchesFilter(t, { ...DEFAULT_FILTER, ...f })).map((t) => t.id);

test('default filter shows everything', () => {
  assert.deepEqual(ids({}), [1, 2, 3]);
});

test('status filter: active and done', () => {
  assert.deepEqual(ids({ status: 'active' }), [1, 3]);
  assert.deepEqual(ids({ status: 'done' }), [2]);
});

test('tag filter', () => {
  assert.deepEqual(ids({ tag: 'home' }), [2, 3]);
});

test('recurring filter', () => {
  assert.deepEqual(ids({ recurring: true }), [1, 3]);
});

test('filters combine', () => {
  assert.deepEqual(ids({ status: 'active', tag: 'home', recurring: true }), [3]);
});

test('availableTags lists each tag in use once, sorted', () => {
  assert.deepEqual(availableTags(tasks), ['fun', 'home', 'work']);
});

test('sortByCreated orders oldest first without mutating the input', () => {
  const copy = [...tasks];
  assert.deepEqual(sortByCreated(tasks).map((t) => t.id), [2, 3, 1]);
  assert.deepEqual(tasks, copy);
});

test('reconcileFilter drops a selected tag that no longer exists', () => {
  assert.equal(reconcileFilter({ ...DEFAULT_FILTER, tag: 'gone' }, ['home']).tag, null);
  assert.equal(reconcileFilter({ ...DEFAULT_FILTER, tag: 'home' }, ['home']).tag, 'home');
});
