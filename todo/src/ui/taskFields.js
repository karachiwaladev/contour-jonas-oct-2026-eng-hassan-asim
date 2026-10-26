// Pieces shared by the add form and the inline editor: <option> lists for the select fields and
// the input limits, so both forms offer the same choices and caps.
import { REPEATS } from '../domain/recurrence.js';
import { PRIORITIES } from '../domain/priority.js';
import { LIMITS } from '../domain/tasks.js';
import { REPEAT_LABELS, PRIORITY_LABELS } from './labels.js';
import { el } from './dom.js';

const options = (values, labels) => values.map((v) => el('option', { text: labels[v], attrs: { value: v } }));

export const repeatOptions = () => options(REPEATS, REPEAT_LABELS);

// Highest first in menus, which is how people scan priorities.
export const priorityOptions = () => options([...PRIORITIES].reverse(), PRIORITY_LABELS);

/** Applies the shared length caps to a title and a tags input. */
export function capInputs(title, tags) {
  title.maxLength = LIMITS.title;
  tags.maxLength = LIMITS.tag * LIMITS.tags;
}
