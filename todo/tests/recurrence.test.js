import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextDue, isRecurring, REPEATS } from '../src/domain/recurrence.js';

const today = '2026-10-26';

test('repeat options', () => {
  assert.deepEqual(REPEATS, ['none', 'daily', 'weekly', 'monthly']);
});

test('isRecurring is true only for daily, weekly and monthly', () => {
  assert.equal(isRecurring({ repeat: 'daily' }), true);
  assert.equal(isRecurring({ repeat: 'none' }), false);
  assert.equal(isRecurring({}), false);
});

test('daily: an overdue task catches up to today, not a backlog', () => {
  assert.equal(nextDue({ due: '2026-10-20', repeat: 'daily', anchorDay: 20, today }), '2026-10-26');
});

test('weekly: +7 days from the due date', () => {
  assert.equal(nextDue({ due: '2026-10-30', repeat: 'weekly', anchorDay: 30, today }), '2026-11-06');
});

test('no due date: counted from today', () => {
  assert.equal(nextDue({ due: null, repeat: 'daily', anchorDay: null, today }), '2026-10-27');
  assert.equal(nextDue({ due: null, repeat: 'monthly', anchorDay: 26, today }), '2026-11-26');
});

test('monthly keeps the anchor day: Jan 31 → Feb 28 → Mar 31', () => {
  assert.equal(nextDue({ due: '2027-01-31', repeat: 'monthly', anchorDay: 31, today }), '2027-02-28');
  assert.equal(nextDue({ due: '2027-02-28', repeat: 'monthly', anchorDay: 31, today }), '2027-03-31');
});

test('monthly in a leap year and across December', () => {
  assert.equal(nextDue({ due: '2028-01-31', repeat: 'monthly', anchorDay: 31, today }), '2028-02-29');
  assert.equal(nextDue({ due: '2026-12-15', repeat: 'monthly', anchorDay: 15, today }), '2027-01-15');
});

test('monthly overdue catches up month by month', () => {
  assert.equal(nextDue({ due: '2026-08-31', repeat: 'monthly', anchorDay: 31, today }), '2026-10-31');
});

test('monthly without an anchor day falls back to the due date day', () => {
  assert.equal(nextDue({ due: '2027-01-31', repeat: 'monthly', anchorDay: null, today }), '2027-02-28');
});
