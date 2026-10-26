// Minimal fake of the IndexedDB API surface indexedDbBackend.js uses; test-only. Events fire on a
// later tick, like the real API. `failOpen` / `failTx` simulate errors.
export function createFakeIndexedDb({ failOpen = false, failTx = false } = {}) {
  const stores = new Map();
  const later = (fn) => setTimeout(fn, 0);
  const fake = {
    stores,
    open(name, version) {
      const req = { name, version };
      later(() => {
        if (failOpen) {
          req.error = new Error('open failed');
          return req.onerror();
        }
        req.result = db;
        if (!fake.opened) req.onupgradeneeded();
        fake.opened = true;
        req.onsuccess();
      });
      return req;
    },
  };
  const db = {
    createObjectStore(name, options) {
      stores.set(name, { options, rows: new Map(), nextId: 1 });
    },
    transaction(name, mode) {
      const store = stores.get(name);
      const tx = { mode };
      const op = (fn) => {
        const req = {};
        later(() => {
          if (failTx) {
            tx.error = new Error('tx failed');
            return tx.onerror();
          }
          req.result = fn();
          tx.oncomplete();
        });
        return req;
      };
      tx.objectStore = () => ({
        getAll: () => op(() => [...store.rows.values()]),
        add: (r) => op(() => {
          const id = store.nextId++;
          store.rows.set(id, { ...r, id });
          return id;
        }),
        put: (r) => op(() => store.rows.set(r.id, { ...r }) && r.id),
        delete: (id) => op(() => store.rows.delete(id) && undefined),
      });
      return tx;
    },
  };
  return fake;
}
