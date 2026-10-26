// The add-task form. Reads the fields, hands them to `onSubmit`, and shows a validation error
// (from the domain layer) instead of storing bad input. Clears itself after a successful add.
import { capInputs, priorityOptions, repeatOptions } from './taskFields.js';

/**
 * @param form     the <form> element (fields: #title, #due, #tags, #repeat, #priority; message: #form-error)
 * @param onSubmit async ({ title, due, tags, repeat, priority }) → { ok, error }
 */
export function bindTaskForm(form, onSubmit) {
  const field = (id) => form.querySelector(`#${id}`);
  const [title, due, tags, repeat, priority, error] = ['title', 'due', 'tags', 'repeat', 'priority', 'form-error'].map(field);

  capInputs(title, tags);
  repeat.replaceChildren(...repeatOptions());
  priority.replaceChildren(...priorityOptions());
  priority.value = 'none';

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const result = await onSubmit({ title: title.value, due: due.value, tags: tags.value, repeat: repeat.value, priority: priority.value });
    error.hidden = result.ok;
    error.textContent = result.ok ? '' : result.error;
    if (result.ok) {
      form.reset();
      priority.value = 'none';
      title.focus();
    }
  });
}
