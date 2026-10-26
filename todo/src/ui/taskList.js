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
  // An open editor is reused across re-renders (adding or ticking other tasks, filter changes), so
  // unsaved typing and the focused field survive.
  const open = listEl.querySelector('li.editing');
  const reuse = open && open.dataset.id === String(editingId) ? open : null;
  const focused = reuse?.contains(document.activeElement) ? document.activeElement : null;
  const row = (task) => {
    if (task.id !== editingId) return createTaskItem(task, handlers);
    return reuse ?? createTaskEditor(task, { onSave: (input) => onSave(task, input), onCancel });
  };
  listEl.replaceChildren(...visible.map(row));
  focused?.focus();
  emptyEl.hidden = visible.length > 0;
  emptyEl.textContent = total ? 'No tasks match these filters.' : 'No tasks yet.';
}
