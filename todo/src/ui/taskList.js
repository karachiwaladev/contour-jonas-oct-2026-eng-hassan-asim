// The visible task list plus its empty-state message.
import { createTaskItem } from './taskItem.js';
import { createTaskEditor } from './taskEditor.js';

/**
 * @param listEl   <ul> to fill
 * @param emptyEl  element shown when nothing is visible
 * @param props    { visible: tasks to show, total: count before filtering, editingId: id of the task
 *                 shown in the editor (or null), onSave(task, input), onCancel(), ...taskItem handlers }
 */
export function renderTaskList(listEl, emptyEl, { visible, total, editingId, onSave, onCancel, ...handlers }) {
  const row = (task) =>
    task.id === editingId
      ? createTaskEditor(task, { onSave: (input) => onSave(task, input), onCancel })
      : createTaskItem(task, handlers);
  listEl.replaceChildren(...visible.map(row));
  emptyEl.hidden = visible.length > 0;
  emptyEl.textContent = total ? 'No tasks match these filters.' : 'No tasks yet.';
}
