// Client-side storage: a single IndexedDB object store of tasks.
// Task shape: { id: number (auto), title: string, done: boolean, createdAt: number,
//               due: string|null ('YYYY-MM-DD'), tags: string[] }
// Tasks saved before due/tags existed simply lack those fields; the UI defaults them.
const TaskDB = (() => {
  const DB_NAME = 'todo-app';
  const STORE = 'tasks';
  let dbPromise;

  function open() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  }

  async function run(mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req && req.result);
      tx.onerror = () => reject(tx.error);
    });
  }

  return {
    all: () => run('readonly', (s) => s.getAll()),
    add: ({ title, due = null, tags = [] }) =>
      run('readwrite', (s) => s.add({ title, done: false, createdAt: Date.now(), due, tags })),
    put: (task) => run('readwrite', (s) => s.put(task)),
    remove: (id) => run('readwrite', (s) => s.delete(id)),
  };
})();
