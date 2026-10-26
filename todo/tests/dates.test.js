import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isoDate, isValidIsoDate, addDays, daysInMonth } from '../src/domain/dates.js';

test('isoDate formats a local date as YYYY-MM-DD', () => {
  assert.equal(isoDate(new Date(2026, 0, 5)), '2026-01-05');
  assert.equal(isoDate(new Date(2026, 11, 31, 23, 59)), '2026-12-31');
});

test('isValidIsoDate accepts real calendar dates only', () => {
  assert.equal(isValidIsoDate('2026-10-26'), true);
  assert.equal(isValidIsoDate('2028-02-29'), true);
  for (const bad of ['2027-02-29', '2026-13-01', '2026-00-10', '2026-1-1', 'not a date', '', null, 20261026]) {
    assert.equal(isValidIsoDate(bad), false, String(bad));
  }
});

test('addDays crosses month and year boundaries', () => {
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-10-30', 7), '2026-11-06');
});

test('daysInMonth handles leap years', () => {
  assert.equal(daysInMonth(2027, 2), 28);
  assert.equal(daysInMonth(2028, 2), 29);
  assert.equal(daysInMonth(2026, 4), 30);
});
