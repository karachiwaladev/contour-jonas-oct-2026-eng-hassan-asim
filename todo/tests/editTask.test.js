import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTask, editTask, toggleTask, LIMITS } from '../src/domain/tasks.js';

const ctx = { now: 1000, today: '2026-10-26' };
const base = {
  id: 7, title: 'Pay rent', done: true, createdAt: 5, due: '2027-01-31', tags: ['home'],
  repeat: 'monthly', repeatDay: 31, spawned: true, priority: 'low',
};
const input = (over = {}) => ({ title: 'Pay rent', due: '2027-01-31', tags: 'home', repeat: 'monthly', priority: 'low', ...over });

test('createTask defaults priority to none and stores a valid one', () => {
  assert.equal(createTask({ title: 'a' }, ctx).task.priority, 'none');
  assert.equal(createTask({ title: 'a', priority: 'high' }, ctx).task.priority, 'high');
});

test('createTask rejects an unknown priority', () => {
  const r = createTask({ title: 'a', priority: 'urgent' }, ctx);
  assert.equal(r.ok, false);
  assert.match(r.error, /priority/i);
});

test('editTask changes title, due, tags, repeat and priority and keeps id, done, createdAt, spawned', () => {
  const r = editTask(base, input({ title: ' Rent ', due: '2027-02-10', tags: 'Bills, home', repeat: 'weekly', priority: 'high' }), ctx);
  assert.equal(r.ok, true);
  assert.deepEqual(r.task, {
    id: 7, title: 'Rent', done: true, createdAt: 5, due: '2027-02-10', tags: ['bills', 'home'],
    repeat: 'weekly', repeatDay: 10, spawned: true, priority: 'high',
  });
});

test('editTask applies the same validation as createTask', () => {
  for (const bad of [{ title: '  ' }, { title: 'x'.repeat(LIMITS.title + 1) }, { due: '2027-02-30' }, { repeat: 'hourly' }, { priority: 'urgent' }]) {
    const r = editTask(base, input(bad), ctx);
    assert.equal(r.ok, false, JSON.stringify(bad));
    assert.equal(typeof r.error, 'string');
  }
});

test('editTask recomputes the monthly anchor day from a new due date, clears it when repeat is none', () => {
  assert.equal(editTask(base, input({ due: '2027-03-15' }), ctx).task.repeatDay, 15);
  assert.equal(editTask(base, input({ repeat: 'none' }), ctx).task.repeatDay, null);
});

test('editTask does not mutate the original task', () => {
  const copy = structuredClone(base);
  editTask(base, input({ title: 'Changed', tags: 'x' }), ctx);
  assert.deepEqual(base, copy);
});

test('the next copy of a recurring task keeps its priority', () => {
  const { next } = toggleTask({ ...base, done: false, spawned: false, priority: 'high' }, true, ctx);
  assert.equal(next.priority, 'high');
});

test('editTask keeps the anchor day of a recurring task without a due date when repeat is unchanged', () => {
  const noDue = { ...base, due: null, repeatDay: 31 };
  assert.equal(editTask(noDue, input({ due: '', priority: 'high' }), { ...ctx, today: '2027-02-05' }).task.repeatDay, 31);
  assert.equal(editTask(noDue, input({ due: '', repeat: 'weekly' }), { ...ctx, today: '2027-02-05' }).task.repeatDay, 5);
});

test('editTask keeps fields the input leaves out', () => {
  const r = editTask(base, { title: 'Renamed' }, ctx);
  assert.equal(r.ok, true);
  assert.deepEqual(r.task, { ...base, title: 'Renamed' });
});
