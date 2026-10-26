// Application use cases: list, add, edit, toggle and remove tasks. Applies the domain rules, persists
// through the store, and turns storage failures into results the UI can show.
import { createTask, editTask, toggleTask } from '../domain/tasks.js';
import { sortByCreated } from '../domain/filters.js';

const SAVE_FAILED = "The task couldn't be saved (browser storage unavailable or full).";

/**
 * @param store task repository (src/data/taskStore.js)
 * @param clock () => { now: ms timestamp, today: 'YYYY-MM-DD' }
 */
export function createTaskService(store, clock) {
  async function save(result, write) {
    if (!result.ok) return { ok: false, error: result.error };
    try {
      await write(result.task);
      return { ok: true };
    } catch {
      return { ok: false, error: SAVE_FAILED };
    }
  }

  return {
    list: async () => sortByCreated(await store.all()),

    /** @returns {Promise<{ ok: true } | { ok: false, error: string }>} */
    add: (input) => save(createTask(input, clock()), store.add),

    /** Validates edited fields and saves them over the task. Same result shape as add. */
    edit: (task, input) => save(editTask(task, input, clock()), store.put),

    /** Ticks/unticks; a recurring task's first completion also stores its next copy. */
    async toggle(task, done) {
      const { updated, next } = toggleTask(task, done, clock());
      await store.put(updated);
      if (next) await store.add(next);
    },

    remove: (task) => store.remove(task.id),
  };
}
