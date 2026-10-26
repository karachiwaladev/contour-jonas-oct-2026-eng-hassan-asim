// Application use cases: list, add, toggle and remove tasks. Applies the domain rules, persists
// through the store, and turns storage failures into results the UI can show.
import { createTask, toggleTask } from '../domain/tasks.js';
import { sortByCreated } from '../domain/filters.js';

const SAVE_FAILED = "The task couldn't be saved (browser storage unavailable or full).";

/**
 * @param store task repository (src/data/taskStore.js)
 * @param clock () => { now: ms timestamp, today: 'YYYY-MM-DD' }
 */
export function createTaskService(store, clock) {
  return {
    list: async () => sortByCreated(await store.all()),

    /** @returns {Promise<{ ok: true } | { ok: false, error: string }>} */
    async add(input) {
      const result = createTask(input, clock());
      if (!result.ok) return { ok: false, error: result.error };
      try {
        await store.add(result.task);
        return { ok: true };
      } catch {
        return { ok: false, error: SAVE_FAILED };
      }
    },

    /** Ticks/unticks; a recurring task's first completion also stores its next copy. */
    async toggle(task, done) {
      const { updated, next } = toggleTask(task, done, clock());
      await store.put(updated);
      if (next) await store.add(next);
    },

    remove: (task) => store.remove(task.id),
  };
}
