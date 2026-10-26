// One task row: checkbox, title, priority badge, due date, repeat label, tag chips, edit and delete.
import { el } from './dom.js';
import { isRecurring } from '../domain/recurrence.js';
import { REPEAT_LABELS, PRIORITY_LABELS } from './labels.js';

function meta(task, today, onTagClick) {
  const parts = [];
  if (task.due) {
    const overdue = !task.done && task.due < today;
    parts.push(el('span', { className: overdue ? 'due overdue' : 'due', text: `Due ${task.due}` }));
  }
  if (isRecurring(task)) parts.push(el('span', { className: 'repeat', text: `↻ ${REPEAT_LABELS[task.repeat]}` }));
  for (const tag of task.tags) {
    parts.push(el('button', {
      className: 'tag',
      text: `#${tag}`,
      attrs: { type: 'button', title: `Show only #${tag}` },
      on: { click: (e) => { e.preventDefault(); onTagClick(tag); } },
    }));
  }
  return parts.length ? el('div', { className: 'meta' }, parts) : null;
}

// Text label as well as colour, so the priority isn't conveyed by colour alone. 'none' shows nothing.
const badge = (priority) =>
  priority === 'none' ? null : el('span', { className: `priority priority-${priority}`, text: PRIORITY_LABELS[priority] });

/**
 * @param task     normalized task
 * @param handlers { today, onToggle(task, done), onEdit(task), onDelete(task), onTagClick(tag) }
 */
export function createTaskItem(task, { today, onToggle, onEdit, onDelete, onTagClick }) {
  const box = el('input', {
    attrs: { type: 'checkbox', checked: task.done },
    on: { change: (e) => onToggle(task, e.target.checked) },
  });
  const body = el('div', { className: 'body' }, [
    el('div', { className: 'title-row' }, [el('span', { className: 'title', text: task.title }), badge(task.priority)]),
    meta(task, today, onTagClick),
  ]);
  const del = el('button', {
    className: 'delete',
    text: 'Delete',
    attrs: { type: 'button', 'aria-label': `Delete "${task.title}"` },
    on: { click: () => onDelete(task) },
  });
  const edit = el('button', {
    className: 'edit',
    text: 'Edit',
    attrs: { type: 'button', 'aria-label': `Edit "${task.title}"` },
    on: { click: () => onEdit(task) },
  });
  return el('li', { className: task.done ? 'done' : '' }, [el('label', {}, [box, body]), edit, del]);
}
