// The add-task form. Reads the fields, hands them to `onSubmit`, and shows a validation error
// (from the domain layer) instead of storing bad input. Clears itself after a successful add.
import { REPEATS } from '../domain/recurrence.js';
import { REPEAT_LABELS } from './labels.js';
import { LIMITS } from '../domain/tasks.js';
import { el } from './dom.js';

/**
 * @param form     the <form> element (fields: #title, #due, #tags, #repeat; message: #form-error)
 * @param onSubmit async ({ title, due, tags, repeat }) → { ok, error }
 */
export function bindTaskForm(form, onSubmit) {
  const field = (id) => form.querySelector(`#${id}`);
  const [title, due, tags, repeat, error] = ['title', 'due', 'tags', 'repeat', 'form-error'].map(field);

  title.maxLength = LIMITS.title;
  tags.maxLength = LIMITS.tag * LIMITS.tags;
  repeat.replaceChildren(...REPEATS.map((r) => el('option', { text: REPEAT_LABELS[r], attrs: { value: r } })));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const result = await onSubmit({ title: title.value, due: due.value, tags: tags.value, repeat: repeat.value });
    error.hidden = result.ok;
    error.textContent = result.ok ? '' : result.error;
    if (result.ok) {
      form.reset();
      title.focus();
    }
  });
}
