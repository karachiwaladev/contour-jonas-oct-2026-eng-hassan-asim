// Task rules: validating new input and completing tasks.
// Pure functions: time comes in through `ctx` ({ now: ms timestamp, today: 'YYYY-MM-DD' }).
import { isValidIsoDate, parseIso } from './dates.js';
import { REPEATS, isRecurring, nextDue } from './recurrence.js';

export const LIMITS = { title: 200, tag: 30, tags: 10 };

/** Trims, lower-cases, length-caps and de-duplicates tags; drops empties; caps the count. */
export function cleanTags(list) {
  const tags = list.map((t) => String(t).trim().toLowerCase().slice(0, LIMITS.tag)).filter(Boolean);
  return [...new Set(tags)].slice(0, LIMITS.tags);
}

export const parseTags = (text) => cleanTags(String(text ?? '').split(','));

/** Validates form input. Returns { ok: true, task } or { ok: false, error }. */
export function createTask({ title, due = '', tags = '', repeat = 'none' }, ctx) {
  const name = String(title ?? '').trim();
  if (!name) return { ok: false, error: 'Title is required.' };
  if (name.length > LIMITS.title) return { ok: false, error: `Title is limited to ${LIMITS.title} characters.` };
  if (due && !isValidIsoDate(due)) return { ok: false, error: 'Due date is not a valid date.' };
  if (!REPEATS.includes(repeat)) return { ok: false, error: 'Unknown repeat option.' };
  const repeatDay = repeat === 'none' ? null : parseIso(due || ctx.today)[2];
  return {
    ok: true,
    task: { title: name, done: false, createdAt: ctx.now, due: due || null, tags: parseTags(tags), repeat, repeatDay },
  };
}

/**
 * Ticks or unticks a task. Completing a recurring task the first time also returns the next copy
 * (`next`, ready to store); after that `spawned` stays true so re-ticking never duplicates it.
 */
export function toggleTask(task, done, ctx) {
  const spawn = done && isRecurring(task) && !task.spawned;
  const updated = { ...task, done, spawned: task.spawned || spawn };
  if (!spawn) return { updated, next: null };
  const next = {
    title: task.title,
    done: false,
    createdAt: ctx.now,
    due: nextDue({ due: task.due, repeat: task.repeat, anchorDay: task.repeatDay, today: ctx.today }),
    tags: [...task.tags],
    repeat: task.repeat,
    repeatDay: task.repeatDay,
  };
  return { updated, next };
}
