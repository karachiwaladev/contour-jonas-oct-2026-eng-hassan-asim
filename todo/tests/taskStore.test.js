import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTaskStore } from '../src/data/taskStore.js';
import { createMemoryBackend } from './support/memoryBackend.js';

test('add then all returns the stored task with an id', async () => {
  const store = createTaskStore(createMemoryBackend());
  const id = await store.add({ title: 'A', done: false, createdAt: 1, due: null, tags: [], repeat: 'none', repeatDay: null });
  const all = await store.all();
  assert.equal(all.length, 1);
  assert.equal(all[0].id, id);
  assert.equal(all[0].title, 'A');
});

test('all normalizes old records and skips corrupted ones', async () => {
  const store = createTaskStore(createMemoryBackend([
    { id: 1, title: 'Old', done: false, createdAt: 1 },
    { id: 2, title: 99 },
    'garbage',
  ]));
  const all = await store.all();
  assert.deepEqual(all.map((t) => [t.id, t.repeat, t.tags.length]), [[1, 'none', 0]]);
});

test('put updates and remove deletes', async () => {
  const store = createTaskStore(createMemoryBackend([{ id: 1, title: 'A', done: false, createdAt: 1 }]));
  const [task] = await store.all();
  await store.put({ ...task, done: true });
  assert.equal((await store.all())[0].done, true);
  await store.remove(1);
  assert.deepEqual(await store.all(), []);
});
