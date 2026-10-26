// Composition root: owns the filter state, connects UI components to the task service, and
// re-renders after every change. No business rules live here.
import { isoDate } from './domain/dates.js';
import { DEFAULT_FILTER, availableTags, matchesFilter, reconcileFilter } from './domain/filters.js';
import { createTaskStore } from './data/taskStore.js';
import { createIndexedDbBackend } from './data/indexedDbBackend.js';
import { createTaskService } from './services/taskService.js';
import { bindTaskForm } from './ui/taskForm.js';
import { renderFilterBar } from './ui/filterBar.js';
import { renderTaskList } from './ui/taskList.js';

const $ = (id) => document.getElementById(id);
const clock = () => ({ now: Date.now(), today: isoDate(new Date()) });
const tasks = createTaskService(createTaskStore(createIndexedDbBackend()), clock);
let filter = DEFAULT_FILTER;
let editingId = null; // the task currently shown in the inline editor

async function render() {
  const all = await tasks.list();
  const tags = availableTags(all);
  filter = reconcileFilter(filter, tags);

  const visible = all.filter((t) => matchesFilter(t, filter));
  if (!visible.some((t) => t.id === editingId)) editingId = null; // a filter hid the task being edited

  renderFilterBar($('status-filter'), $('tag-filter'), $('priority-filter'), { filter, tags, onChange: updateFilter });
  renderTaskList($('tasks'), $('empty'), {
    visible,
    total: all.length,
    today: clock().today,
    editingId,
    onEdit: (task) => setEditing(task.id),
    onCancel: () => closeEditor(),
    onSave: async (task, input) => {
      const result = await tasks.edit(task, input);
      if (result.ok) closeEditor();
      return result;
    },
    onToggle: (task, done) => tasks.toggle(task, done).then(render),
    onDelete: (task) => tasks.remove(task).then(render),
    onTagClick: (tag) => updateFilter({ tag }),
  });
}

function setEditing(id) {
  editingId = id;
  render();
}

// Closes the editor and puts keyboard focus back on that task's Edit button.
async function closeEditor() {
  const id = editingId;
  editingId = null;
  await render();
  document.querySelector(`#tasks button.edit[data-id="${CSS.escape(String(id))}"]`)?.focus();
}

// Components send patches, merged into the current state here, so clicks that land while a
// render is still in flight never overwrite each other with a stale snapshot.
function updateFilter(patch) {
  filter = { ...filter, ...patch };
  render();
}

bindTaskForm($('new-task'), async (input) => {
  const result = await tasks.add(input);
  if (result.ok) render();
  return result;
});

render();
