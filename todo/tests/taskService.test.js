import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTaskService } from '../src/services/taskService.js';
import { createTaskStore } from '../src/data/taskStore.js';
import { createMemoryBackend } from './support/memoryBackend.js';

const clock = () => ({ now: 1000, today: '2026-10-26' });
const service = (seed) => createTaskService(createTaskStore(createMemoryBackend(seed)), clock);
const find = (tasks, title, done) => tasks.filter((t) => t.title === title && t.done === done);

test('add stores a valid task and lists it', async () => {
  const s = service();
  assert.deepEqual(await s.add({ title: 'Buy milk', due: '', tags: 'home', repeat: 'none' }), { ok: true });
  const [t] = await s.list();
  assert.equal(t.title, 'Buy milk');
  assert.deepEqual(t.tags, ['home']);
});

test('add rejects invalid input and stores nothing', async () => {
  const s = service();
  const r = await s.add({ title: '   ' });
  assert.equal(r.ok, false);
  assert.match(r.error, /required/);
  assert.deepEqual(await s.list(), []);
});

test('add reports a storage failure instead of throwing', async () => {
  const backend = { ...createMemoryBackend(), add: async () => { throw new Error('QuotaExceededError'); } };
  const s = createTaskService(createTaskStore(backend), clock);
  const r = await s.add({ title: 'x' });
  assert.equal(r.ok, false);
  assert.match(r.error, /couldn't be saved/i);
});

test('ticking a recurring task stores exactly one next copy', async () => {
  const s = service([{ id: 1, title: 'Water', done: false, createdAt: 1, due: '2026-10-20', tags: ['home'], repeat: 'daily', repeatDay: 20 }]);
  await s.toggle((await s.list())[0], true);
  const tasks = await s.list();
  assert.equal(tasks.length, 2);
  assert.equal(find(tasks, 'Water', true).length, 1);
  assert.equal(find(tasks, 'Water', false)[0].due, '2026-10-26');
});

test('unticking and re-ticking the done task adds nothing more', async () => {
  const s = service([{ id: 1, title: 'Water', done: false, createdAt: 1, due: '2026-10-20', tags: [], repeat: 'daily', repeatDay: 20 }]);
  await s.toggle((await s.list())[0], true);
  const done = () => s.list().then((ts) => find(ts, 'Water', true)[0]);
  await s.toggle(await done(), false);
  const reopened = (await s.list()).find((t) => t.id === 1);
  await s.toggle(reopened, true);
  assert.equal((await s.list()).length, 2);
});

test('remove deletes the task', async () => {
  const s = service([{ id: 1, title: 'A', done: false, createdAt: 1 }]);
  await s.remove((await s.list())[0]);
  assert.deepEqual(await s.list(), []);
});
