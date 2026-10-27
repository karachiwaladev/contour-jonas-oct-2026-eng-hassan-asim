import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseQuery, matchesSearch } from '../src/domain/search.js';
import { DUE_FILTERS, matchesDue } from '../src/domain/dueFilter.js';
import { DEFAULT_FILTER, matchesFilter } from '../src/domain/filters.js';

const task = (title, tags = [], extra = {}) => ({ id: title, title, tags, done: false, due: null, repeat: 'none', priority: 'none', ...extra });

test('parseQuery trims, lower-cases, splits, strips a leading # and drops empties', () => {
  assert.deepEqual(parseQuery('  Rent  #Home '), ['rent', 'home']);
  assert.deepEqual(parseQuery(''), []);
  assert.deepEqual(parseQuery('   # '), []);
  assert.deepEqual(parseQuery(undefined), []);
});

test('matchesSearch finds a term inside the title, case-insensitively', () => {
  assert.equal(matchesSearch(task('Morning Workout'), ['wor']), true);
  assert.equal(matchesSearch(task('Pay rent'), ['wor']), false);
});

test('matchesSearch finds a term inside a tag, also when typed with #', () => {
  assert.equal(matchesSearch(task('Report', ['work']), ['wor']), true);
  assert.equal(matchesSearch(task('Report', ['work']), parseQuery('#wor')), true);
});

test('every term must match, in any order, across title and tags', () => {
  const t = task('Pay rent', ['home']);
  assert.equal(matchesSearch(t, ['home', 'rent']), true);
  assert.equal(matchesSearch(t, ['rent', 'car']), false);
});

test('no terms match everything', () => {
  assert.equal(matchesSearch(task('anything'), []), true);
});

const today = '2026-10-27';

test('due "overdue": past date on an open task only', () => {
  assert.deepEqual(DUE_FILTERS, ['any', 'overdue', 'today', 'week', 'none']);
  assert.equal(matchesDue(task('a', [], { due: '2026-10-26' }), 'overdue', today), true);
  assert.equal(matchesDue(task('a', [], { due: '2026-10-26', done: true }), 'overdue', today), false);
  assert.equal(matchesDue(task('a', [], { due: today }), 'overdue', today), false);
  assert.equal(matchesDue(task('a'), 'overdue', today), false);
});

test('due "today", "week" (today to +6, across a month end) and "none"', () => {
  assert.equal(matchesDue(task('a', [], { due: today }), 'today', today), true);
  assert.equal(matchesDue(task('a', [], { due: '2026-10-28' }), 'today', today), false);
  assert.equal(matchesDue(task('a', [], { due: today }), 'week', today), true);
  assert.equal(matchesDue(task('a', [], { due: '2026-11-02' }), 'week', today), true, '+6 crosses into November');
  assert.equal(matchesDue(task('a', [], { due: '2026-11-03' }), 'week', today), false, '+7 is out');
  assert.equal(matchesDue(task('a', [], { due: '2026-10-26' }), 'week', today), false, 'past dates are not this week');
  assert.equal(matchesDue(task('a'), 'none', today), true);
  assert.equal(matchesDue(task('a', [], { due: today }), 'none', today), false);
});

test('due "any" (and an unknown value) matches everything', () => {
  assert.equal(matchesDue(task('a', [], { due: '2020-01-01' }), 'any', today), true);
  assert.equal(matchesDue(task('a'), 'bogus', today), true);
});

test('matchesFilter combines search and due with status, tag, recurring and priority', () => {
  assert.equal(DEFAULT_FILTER.due, 'any');
  assert.equal(DEFAULT_FILTER.query, '');
  const tasks = [
    task('Pay rent', ['home'], { due: today, priority: 'high' }),
    task('Rent car', ['work'], { due: today }),
    task('Pay rent', ['home'], { due: today, done: true }),
    task('Pay rent', ['home'], { due: null }),
  ];
  const pick = (f) => tasks.filter((t) => matchesFilter(t, { ...DEFAULT_FILTER, ...f }, today)).length;
  assert.equal(pick({}), 4);
  assert.equal(pick({ query: 'rent' }), 4);
  assert.equal(pick({ query: 'rent home', due: 'today' }), 2);
  assert.equal(pick({ query: 'rent home', due: 'today', status: 'active' }), 1);
  assert.equal(pick({ query: 'rent', tag: 'work' }), 1);
  assert.equal(pick({ query: 'rent', priority: 'high' }), 1);
  assert.equal(pick({ query: 'nothing' }), 0);
});

test('a due filter without today is an error, not a silent skip; "any" needs no today', () => {
  const t = task('a', [], { due: today });
  assert.throws(() => matchesFilter(t, { ...DEFAULT_FILTER, due: 'today' }), /needs today/);
  assert.equal(matchesFilter(t, DEFAULT_FILTER), true);
});
