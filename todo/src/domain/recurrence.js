// Recurring tasks: which repeats exist and when the next copy is due.
import { addDays, daysInMonth, formatIso, parseIso } from './dates.js';

export const REPEATS = ['none', 'daily', 'weekly', 'monthly'];

export const isRecurring = (task) => REPEATS.includes(task.repeat) && task.repeat !== 'none';

// Next month, keeping the anchor day where the month allows (Jan 31 → Feb 28 → Mar 31).
function addMonth(s, anchorDay) {
  const [y, m] = parseIso(s);
  const [ny, nm] = m === 12 ? [y + 1, 1] : [y, m + 1];
  return formatIso(ny, nm, Math.min(anchorDay, daysInMonth(ny, nm)));
}

function step(s, repeat, anchorDay) {
  if (repeat === 'daily') return addDays(s, 1);
  if (repeat === 'weekly') return addDays(s, 7);
  return addMonth(s, anchorDay);
}

/**
 * Due date of the next copy: one step after `due` (or after `today` when there is none), moved
 * forward until it is today or later so a late task doesn't spawn a backlog of overdue copies.
 */
export function nextDue({ due, repeat, anchorDay, today }) {
  const from = due || today;
  const anchor = anchorDay || parseIso(from)[2];
  let d = step(from, repeat, anchor);
  while (d < today) d = step(d, repeat, anchor);
  return d;
}
