// Which tasks are visible. A filter is
// { status: 'all'|'active'|'done', tag: string|null, recurring: boolean, priority: string|null (null = any),
//   due: one of DUE_FILTERS, query: the search box's text }.
import { isRecurring } from './recurrence.js';
import { matchesDue } from './dueFilter.js';
import { parseQuery, matchesSearch } from './search.js';

export const DEFAULT_FILTER = Object.freeze({ status: 'all', tag: null, recurring: false, priority: null, due: 'any', query: '' });
export const STATUSES = ['all', 'active', 'done'];

/** `today` ('YYYY-MM-DD') is required whenever a due filter other than 'any' is set. */
export function matchesFilter(task, filter, today) {
  if (filter.due && filter.due !== 'any' && !today) throw new Error('matchesFilter: a due filter needs today');
  if (filter.status === 'active' && task.done) return false;
  if (filter.status === 'done' && !task.done) return false;
  if (filter.tag && !task.tags.includes(filter.tag)) return false;
  if (filter.recurring && !isRecurring(task)) return false;
  if (filter.priority && task.priority !== filter.priority) return false;
  if (!matchesDue(task, filter.due, today)) return false;
  return matchesSearch(task, parseQuery(filter.query));
}

export const availableTags = (tasks) => [...new Set(tasks.flatMap((t) => t.tags))].sort();

export const sortByCreated = (tasks) => [...tasks].sort((a, b) => a.createdAt - b.createdAt);

/** Clears the tag filter once no task carries that tag any more. */
export const reconcileFilter = (filter, tags) =>
  filter.tag && !tags.includes(filter.tag) ? { ...filter, tag: null } : filter;
