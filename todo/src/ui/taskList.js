// The visible task list plus its empty-state message.
import { createTaskItem } from './taskItem.js';

/**
 * @param listEl   <ul> to fill
 * @param emptyEl  element shown when nothing is visible
 * @param props    { visible: tasks to show, total: count before filtering, ...taskItem handlers }
 */
export function renderTaskList(listEl, emptyEl, { visible, total, ...handlers }) {
  listEl.replaceChildren(...visible.map((task) => createTaskItem(task, handlers)));
  emptyEl.hidden = visible.length > 0;
  emptyEl.textContent = total ? 'No tasks match these filters.' : 'No tasks yet.';
}
