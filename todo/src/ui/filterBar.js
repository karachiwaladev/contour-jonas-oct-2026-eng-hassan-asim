// Filter controls: status chips + "↻ Recurring" toggle, a chip per tag in use, and the priority and
// due-date menus.
import { chip, replaceKeepingFocus } from './dom.js';
import { STATUSES } from '../domain/filters.js';
import { DUE_FILTERS } from '../domain/dueFilter.js';
import { STATUS_LABELS, DUE_LABELS } from './labels.js';
import { el } from './dom.js';
import { priorityOptions } from './taskFields.js';

/**
 * @param statusEl container for status chips and the recurring toggle
 * @param tagEl    container for tag chips (left empty when no task has tags)
 * @param menus    { priority: <select> ('' = any), due: <select> }
 * @param props    { filter, tags, onChange(patch) } — sends only what changed, e.g. { tag: 'home' }
 */
export function renderFilterBar(statusEl, tagEl, menus, { filter, tags, onChange: set }) {
  const { priority: priorityEl, due: dueEl } = menus;
  if (!priorityEl.options.length) priorityEl.replaceChildren(el('option', { text: 'Any', attrs: { value: '' } }), ...priorityOptions());
  priorityEl.value = filter.priority ?? '';
  priorityEl.onchange = () => set({ priority: priorityEl.value || null });
  if (!dueEl.options.length) dueEl.replaceChildren(...DUE_FILTERS.map((d) => el('option', { text: DUE_LABELS[d], attrs: { value: d } })));
  dueEl.value = filter.due;
  dueEl.onchange = () => set({ due: dueEl.value });
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
