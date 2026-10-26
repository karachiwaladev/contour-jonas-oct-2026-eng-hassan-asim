// The stored-record format. Cleans a record read from storage: defaults fields older records lack
// and discards values of the wrong type or shape (corrupted or tampered data), applying the same
// limits as new input. Returns null when the record is unusable.
import { isValidIsoDate } from '../domain/dates.js';
import { REPEATS } from '../domain/recurrence.js';
import { LIMITS, cleanTags } from '../domain/tasks.js';
import { isPriority } from '../domain/priority.js';

export function normalizeTask(r) {
  if (!r || typeof r !== 'object' || r.id === undefined || typeof r.title !== 'string') return null;
  const repeat = REPEATS.includes(r.repeat) ? r.repeat : 'none';
  const day = Number.isInteger(r.repeatDay) && r.repeatDay >= 1 && r.repeatDay <= 31 ? r.repeatDay : null;
  return {
    id: r.id,
    title: r.title.slice(0, LIMITS.title),
    done: r.done === true,
    createdAt: Number.isFinite(r.createdAt) ? r.createdAt : 0,
    due: isValidIsoDate(r.due) ? r.due : null,
    tags: Array.isArray(r.tags) ? cleanTags(r.tags.filter((t) => typeof t === 'string')) : [],
    repeat,
    repeatDay: repeat === 'none' ? null : day,
    spawned: r.spawned === true,
    priority: isPriority(r.priority) ? r.priority : 'none',
  };
}
