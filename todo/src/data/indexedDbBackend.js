// IndexedDB backend: one object store of tasks, auto-increment ids. Same database and store
// names as before the refactor, so existing tasks keep loading.
const DB_NAME = 'todo-app';
const STORE = 'tasks';

function openDb(idb) {
  return new Promise((resolve, reject) => {
    const req = idb.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function createIndexedDbBackend(idb = globalThis.indexedDB) {
  const dbPromise = openDb(idb);

  async function run(mode, fn) {
    const db = await dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  return {
    getAll: () => run('readonly', (s) => s.getAll()),
    add: (record) => run('readwrite', (s) => s.add(record)),
    put: (record) => run('readwrite', (s) => s.put(record)),
    delete: (id) => run('readwrite', (s) => s.delete(id)),
  };
}
