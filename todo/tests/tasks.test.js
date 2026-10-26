import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTags, createTask, toggleTask, LIMITS } from '../src/domain/tasks.js';

const ctx = { now: 1000, today: '2026-10-26' };

test('parseTags trims, lower-cases, de-duplicates and drops empties', () => {
  assert.deepEqual(parseTags(' Work, urgent,work ,, '), ['work', 'urgent']);
  assert.deepEqual(parseTags(''), []);
});

test('parseTags caps tag length and count', () => {
  const long = 'x'.repeat(LIMITS.tag + 10);
  assert.equal(parseTags(long)[0].length, LIMITS.tag);
  const many = Array.from({ length: LIMITS.tags + 5 }, (_, i) => `t${i}`).join(',');
  assert.equal(parseTags(many).length, LIMITS.tags);
});

test('createTask builds a task from valid input', () => {
  const r = createTask({ title: '  Pay rent ', due: '2027-01-31', tags: 'Home', repeat: 'monthly' }, ctx);
  assert.equal(r.ok, true);
  assert.deepEqual(r.task, {
    title: 'Pay rent', done: false, createdAt: 1000, due: '2027-01-31',
    tags: ['home'], repeat: 'monthly', repeatDay: 31, priority: 'none',
  });
});

test('createTask: no due date, not repeating', () => {
  const r = createTask({ title: 'One-off', due: '', tags: '', repeat: 'none' }, ctx);
  assert.equal(r.ok, true);
  assert.equal(r.task.due, null);
  assert.equal(r.task.repeatDay, null);
});

test('createTask: repeating without a due date anchors on today', () => {
  assert.equal(createTask({ title: 'Gym', repeat: 'monthly' }, ctx).task.repeatDay, 26);
});

test('createTask rejects invalid input instead of storing it', () => {
  assert.equal(createTask({ title: '   ' }, ctx).ok, false);
  assert.equal(createTask({ title: 'x'.repeat(LIMITS.title + 1) }, ctx).ok, false);
  assert.equal(createTask({ title: 'x', due: '2027-02-30' }, ctx).ok, false);
  assert.equal(createTask({ title: 'x', repeat: 'hourly' }, ctx).ok, false);
});

const daily = { id: 7, title: 'Water', done: false, createdAt: 1, due: '2026-10-20', tags: ['home'], repeat: 'daily', repeatDay: 20, spawned: false, priority: 'medium' };

test('toggleTask: completing a recurring task spawns the next copy once', () => {
  const { updated, next } = toggleTask(daily, true, ctx);
  assert.equal(updated.done, true);
  assert.equal(updated.spawned, true);
  assert.deepEqual(next, { title: 'Water', done: false, createdAt: 1000, due: '2026-10-26', tags: ['home'], repeat: 'daily', repeatDay: 20, priority: 'medium' });
});

test('toggleTask: unticking and re-ticking does not spawn a duplicate', () => {
  const reopened = toggleTask({ ...daily, done: true, spawned: true }, false, ctx);
  assert.equal(reopened.next, null);
  assert.equal(toggleTask(reopened.updated, true, ctx).next, null);
});

test('toggleTask: one-off tasks never spawn', () => {
  const oneOff = { id: 8, title: 'Once', done: false, createdAt: 1, due: null, tags: [], repeat: 'none', repeatDay: null, spawned: false };
  assert.equal(toggleTask(oneOff, true, ctx).next, null);
});
