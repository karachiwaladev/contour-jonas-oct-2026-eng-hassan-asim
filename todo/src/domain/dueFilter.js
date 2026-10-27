// The due-date filter. Dates are 'YYYY-MM-DD' strings, so they compare correctly as strings.
import { addDays } from './dates.js';

export const DUE_FILTERS = ['any', 'overdue', 'today', 'week', 'none'];

/**
 * @param due   'any' | 'overdue' (past and still open, like the red label) | 'today' |
 *              'week' (today through the next 6 days) | 'none' (no due date)
 * @param today 'YYYY-MM-DD'
 */
export function matchesDue(task, due, today) {
  if (due === 'overdue') return Boolean(task.due) && !task.done && task.due < today;
  if (due === 'today') return task.due === today;
  if (due === 'week') return Boolean(task.due) && task.due >= today && task.due <= addDays(today, 6);
  if (due === 'none') return !task.due;
  return true;
}
