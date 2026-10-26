// Task rules: validating new and edited input, and completing tasks.
// Pure functions: time comes in through `ctx` ({ now: ms timestamp, today: 'YYYY-MM-DD' }).
import { isValidIsoDate, parseIso } from './dates.js';
import { REPEATS, isRecurring, nextDue } from './recurrence.js';
import { isPriority } from './priority.js';

export const LIMITS = { title: 200, tag: 30, tags: 10 };

/** Trims, lower-cases, length-caps and de-duplicates tags; drops empties; caps the count. */
export function cleanTags(list) {
  const tags = list.map((t) => String(t).trim().toLowerCase().slice(0, LIMITS.tag)).filter(Boolean);
  return [...new Set(tags)].slice(0, LIMITS.tags);
}

export const parseTags = (text) => cleanTags(String(text ?? '').split(','));

// The user-editable fields, validated the same way for adding and editing.
// Returns { ok: true, fields } or { ok: false, error }.
function validateFields({ title, due = '', tags = '', repeat = 'none', priority = 'none' }, ctx) {
  const name = String(title ?? '').trim();
  if (!name) return { ok: false, error: 'Title is required.' };
  if (name.length > LIMITS.title) return { ok: false, error: `Title is limited to ${LIMITS.title} characters.` };
  if (due && !isValidIsoDate(due)) return { ok: false, error: 'Due date is not a valid date.' };
  if (!REPEATS.includes(repeat)) return { ok: false, error: 'Unknown repeat option.' };
  if (!isPriority(priority)) return { ok: false, error: 'Unknown priority.' };
  const repeatDay = repeat === 'none' ? null : parseIso(due || ctx.today)[2];
  return { ok: true, fields: { title: name, due: due || null, tags: parseTags(tags), repeat, repeatDay, priority } };
}

/** Validates form input. Returns { ok: true, task } or { ok: false, error }. */
export function createTask(input, ctx) {
  const r = validateFields(input, ctx);
  return r.ok ? { ok: true, task: { ...r.fields, done: false, createdAt: ctx.now } } : r;
}

/** Applies edited form input to a task, keeping id, done, createdAt and spawned. Same result shape. */
export function editTask(task, input, ctx) {
  const r = validateFields(input, ctx);
  return r.ok ? { ok: true, task: { ...task, ...r.fields } } : r;
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
    priority: task.priority,
  };
  return { updated, next };
}
