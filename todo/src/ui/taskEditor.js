// Inline editor that replaces a task row: the same fields as the add form, pre-filled, with Save
// and Cancel. Enter saves (form submit), Esc cancels. Validation errors come back from the domain
// layer through `onSave` and are shown in place; nothing is saved until the input is valid.
import { el } from './dom.js';
import { capInputs, priorityOptions, repeatOptions } from './taskFields.js';

/**
 * @param task     the task being edited
 * @param handlers { onSave(input) → Promise<{ ok, error }>, onCancel() }
 */
export function createTaskEditor(task, { onSave, onCancel }) {
  const label = (text, control) => el('label', { className: 'field' }, [text, control]);
  const title = el('input', { attrs: { type: 'text', value: task.title, 'aria-label': 'Task title', autocomplete: 'off' } });
  const due = el('input', { attrs: { type: 'date', value: task.due ?? '' } });
  const tags = el('input', { attrs: { type: 'text', value: task.tags.join(', '), 'aria-label': 'Tags', placeholder: 'Tags, comma separated', autocomplete: 'off' } });
  const repeat = el('select', { attrs: { 'aria-label': 'Repeat' } }, repeatOptions());
  const priority = el('select', {}, priorityOptions());
  const error = el('p', { className: 'form-error', attrs: { role: 'alert', hidden: true } });
  capInputs(title, tags);
  repeat.value = task.repeat;
  priority.value = task.priority;

  const form = el('form', { className: 'editor', attrs: { novalidate: true, 'aria-label': `Edit "${task.title}"` } }, [
    title,
    el('div', { className: 'row' }, [label('Due', due), tags, repeat, label('Priority', priority)]),
    el('div', { className: 'row actions' }, [
      el('button', { text: 'Save', attrs: { type: 'submit' } }),
      el('button', { className: 'secondary', text: 'Cancel', attrs: { type: 'button' }, on: { click: () => onCancel() } }),
    ]),
    error,
  ]);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const result = await onSave({ title: title.value, due: due.value, tags: tags.value, repeat: repeat.value, priority: priority.value });
    error.hidden = result.ok;
    error.textContent = result.ok ? '' : result.error;
  });
  form.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') onCancel();
  });
  queueMicrotask(() => title.focus()); // once the row is in the document
  return el('li', { className: 'editing', attrs: { 'data-id': task.id } }, [form]);
}
