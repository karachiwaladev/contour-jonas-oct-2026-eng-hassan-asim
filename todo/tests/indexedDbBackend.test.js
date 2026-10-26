import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createIndexedDbBackend } from '../src/data/indexedDbBackend.js';
import { createFakeIndexedDb } from './support/fakeIndexedDb.js';

test('first open creates the tasks store with auto-increment ids', async () => {
  const idb = createFakeIndexedDb();
  await createIndexedDbBackend(idb).getAll();
  assert.deepEqual(idb.stores.get('tasks').options, { keyPath: 'id', autoIncrement: true });
});

test('add returns the new id, and getAll/put/delete round-trip records', async () => {
  const backend = createIndexedDbBackend(createFakeIndexedDb());
  const id = await backend.add({ title: 'a' });
  assert.equal(id, 1);
  await backend.put({ id, title: 'b' });
  assert.deepEqual(await backend.getAll(), [{ id: 1, title: 'b' }]);
  await backend.delete(id);
  assert.deepEqual(await backend.getAll(), []);
});

test('a failed open rejects every call', async () => {
  const backend = createIndexedDbBackend(createFakeIndexedDb({ failOpen: true }));
  await assert.rejects(backend.getAll(), /open failed/);
});

test('a failed transaction rejects with its error', async () => {
  const backend = createIndexedDbBackend(createFakeIndexedDb({ failTx: true }));
  await assert.rejects(backend.add({ title: 'x' }), /tx failed/);
});
