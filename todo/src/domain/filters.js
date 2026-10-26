// Which tasks are visible. A filter is { status: 'all'|'active'|'done', tag: string|null, recurring: boolean }.
import { isRecurring } from './recurrence.js';

export const DEFAULT_FILTER = Object.freeze({ status: 'all', tag: null, recurring: false });
export const STATUSES = ['all', 'active', 'done'];

export function matchesFilter(task, filter) {
  if (filter.status === 'active' && task.done) return false;
  if (filter.status === 'done' && !task.done) return false;
  if (filter.tag && !task.tags.includes(filter.tag)) return false;
  if (filter.recurring && !isRecurring(task)) return false;
  return true;
}

export const availableTags = (tasks) => [...new Set(tasks.flatMap((t) => t.tags))].sort();

export const sortByCreated = (tasks) => [...tasks].sort((a, b) => a.createdAt - b.createdAt);

/** Clears the tag filter once no task carries that tag any more. */
export const reconcileFilter = (filter, tags) =>
  filter.tag && !tags.includes(filter.tag) ? { ...filter, tag: null } : filter;
