// In-memory backend with the same API as the IndexedDB one (src/data/indexedDbBackend.js); test-only.
export function createMemoryBackend(seed = []) {
  const rows = new Map();
  let nextId = 1;
  for (const r of seed) {
    const id = r && typeof r === 'object' && r.id !== undefined ? r.id : `seed-${nextId++}`;
    rows.set(id, r);
    if (typeof id === 'number') nextId = Math.max(nextId, id + 1);
  }
  return {
    getAll: async () => [...rows.values()].map((r) => (r && typeof r === 'object' ? { ...r } : r)),
    add: async (record) => {
      const id = nextId++;
      rows.set(id, { ...record, id });
      return id;
    },
    put: async (record) => {
      rows.set(record.id, { ...record });
    },
    delete: async (id) => {
      rows.delete(id);
    },
  };
}
