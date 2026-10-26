import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTask } from '../src/data/taskRecord.js';
import { LIMITS } from '../src/domain/tasks.js';

test('defaults fields missing from older records', () => {
  assert.deepEqual(normalizeTask({ id: 1, title: 'Old', done: false, createdAt: 5 }), {
    id: 1, title: 'Old', done: false, createdAt: 5, due: null, tags: [], repeat: 'none', repeatDay: null, spawned: false,
  });
});

test('cleans tampered or corrupted fields', () => {
  const t = normalizeTask({ id: 2, title: 'T', done: 'yes', createdAt: 'x', due: 'soon', tags: ['ok', 5, '<b>x</b>'], repeat: 'hourly', repeatDay: 99 });
  assert.equal(t.done, false);
  assert.equal(t.createdAt, 0);
  assert.equal(t.due, null);
  assert.deepEqual(t.tags, ['ok', '<b>x</b>']); // kept as text; the UI renders it with textContent
  assert.equal(t.repeat, 'none');
  assert.equal(t.repeatDay, null);
});

test('stored tags get the same cleaning as new ones: trimmed, lower-cased, de-duplicated, no empties', () => {
  assert.deepEqual(normalizeTask({ id: 3, title: 'T', tags: [' Work ', 'work', '', '  ', 'HOME'] }).tags, ['work', 'home']);
});

test('caps title length and tag count/length from storage', () => {
  const t = normalizeTask({
    id: 4,
    title: 'x'.repeat(LIMITS.title + 50),
    tags: Array.from({ length: LIMITS.tags + 5 }, (_, i) => `${i}-${'t'.repeat(LIMITS.tag + 5)}`),
  });
  assert.equal(t.title.length, LIMITS.title);
  assert.equal(t.tags.length, LIMITS.tags);
  assert.ok(t.tags.every((tag) => tag.length <= LIMITS.tag));
});

test('rejects records without an id or a string title', () => {
  assert.equal(normalizeTask(null), null);
  assert.equal(normalizeTask('garbage'), null);
  assert.equal(normalizeTask({ title: 'no id' }), null);
  assert.equal(normalizeTask({ id: 3, title: 42 }), null);
});
