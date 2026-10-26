// Filter controls: status chips + "↻ Recurring" toggle, a chip per tag in use, and a priority menu.
import { chip, replaceKeepingFocus } from './dom.js';
import { STATUSES } from '../domain/filters.js';
import { STATUS_LABELS } from './labels.js';
import { el } from './dom.js';
import { priorityOptions } from './taskFields.js';

/**
 * @param statusEl container for status chips and the recurring toggle
 * @param tagEl    container for tag chips (left empty when no task has tags)
 * @param priorityEl <select> for the priority filter ('' = any priority)
 * @param props    { filter, tags, onChange(patch) } — sends only what changed, e.g. { tag: 'home' }
 */
export function renderFilterBar(statusEl, tagEl, priorityEl, { filter, tags, onChange: set }) {
  if (!priorityEl.options.length) priorityEl.replaceChildren(el('option', { text: 'Any priority', attrs: { value: '' } }), ...priorityOptions());
  priorityEl.value = filter.priority ?? '';
  priorityEl.onchange = () => set({ priority: priorityEl.value || null });
  replaceKeepingFocus(statusEl, [
    ...STATUSES.map((s) => chip(STATUS_LABELS[s], filter.status === s, () => set({ status: s }), { 'data-status': s, 'data-key': s })),
    chip('↻ Recurring', filter.recurring, () => set({ recurring: !filter.recurring }), { id: 'recurring-filter', 'data-key': 'recurring' }),
  ]);
  replaceKeepingFocus(tagEl, [
    ...(tags.length
      ? [chip('Any tag', filter.tag === null, () => set({ tag: null }), { 'data-key': 'any' }),
         ...tags.map((t) => chip(`#${t}`, filter.tag === t, () => set({ tag: t }), { 'data-key': `tag:${t}` }))]
      : []),
  ]);
}
