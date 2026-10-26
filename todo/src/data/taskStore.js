// Task repository: the app's only way to read or write tasks. Records are normalized on read, so
// older or corrupted entries can't break the UI. The backend (IndexedDB in the browser, memory in
// tests) only needs getAll / add / put / delete returning promises.
import { normalizeTask } from './taskRecord.js';

export function createTaskStore(backend) {
  return {
    async all() {
      const records = await backend.getAll();
      return records.map(normalizeTask).filter(Boolean);
    },
    add: (task) => backend.add(task),
    put: (task) => backend.put(task),
    remove: (id) => backend.delete(id),
  };
}
