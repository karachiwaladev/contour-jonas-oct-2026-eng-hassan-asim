const form = document.getElementById('new-task');
const input = document.getElementById('title');
const dueInput = document.getElementById('due');
const tagsInput = document.getElementById('tags');
const repeatInput = document.getElementById('repeat');
const recurringFilter = document.getElementById('recurring-filter');
const list = document.getElementById('tasks');
const empty = document.getElementById('empty');
const statusFilter = document.getElementById('status-filter');
const tagFilter = document.getElementById('tag-filter');

// Current filters: status is 'all' | 'active' | 'done'; tag is a tag name or null for any;
// recurring limits the list to repeating tasks.
const filter = { status: 'all', tag: null, recurring: false };

const repeats = (task) => Boolean(task.repeat) && task.repeat !== 'none';

function parseTags(text) {
  const tags = text.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
  return [...new Set(tags)];
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function matches(task) {
  if (filter.status === 'active' && task.done) return false;
  if (filter.status === 'done' && !task.done) return false;
  if (filter.tag && !(task.tags || []).includes(filter.tag)) return false;
  if (filter.recurring && !repeats(task)) return false;
  return true;
}

async function render() {
  const tasks = (await TaskDB.all()).sort((a, b) => a.createdAt - b.createdAt);

  // Only offer tags that exist on some task; drop a selected tag once it disappears.
  const allTags = [...new Set(tasks.flatMap((t) => t.tags || []))].sort();
  if (filter.tag && !allTags.includes(filter.tag)) filter.tag = null;
  renderTagFilter(allTags);

  const visible = tasks.filter(matches);
  list.replaceChildren(...visible.map(renderTask));
  empty.hidden = visible.length > 0;
  empty.textContent = tasks.length ? 'No tasks match these filters.' : 'No tasks yet.';
}

function renderTagFilter(allTags) {
  if (!allTags.length) {
    tagFilter.replaceChildren();
    return;
  }
  const chip = (label, tag) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.setAttribute('aria-pressed', String(filter.tag === tag));
    b.addEventListener('click', () => {
      filter.tag = tag;
      render();
    });
    return b;
  };
  tagFilter.replaceChildren(chip('Any tag', null), ...allTags.map((t) => chip(`#${t}`, t)));
}

function renderTask(task) {
  const li = document.createElement('li');
  li.className = task.done ? 'done' : '';

  const label = document.createElement('label');
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = task.done;
  box.addEventListener('change', async () => {
    // Completing a recurring task creates its next copy, once: unticking and re-ticking
    // the same task doesn't spawn duplicates.
    const spawn = box.checked && repeats(task) && !task.spawned;
    await TaskDB.put({ ...task, done: box.checked, spawned: task.spawned || spawn });
    if (spawn) {
      await TaskDB.add({
        title: task.title,
        tags: task.tags || [],
        repeat: task.repeat,
        repeatDay: task.repeatDay,
        due: Recur.next(task.due, task.repeat, task.repeatDay, today()),
      });
    }
    render();
  });
  const body = document.createElement('div');
  body.className = 'body';
  const text = document.createElement('span');
  text.className = 'title';
  text.textContent = task.title;
  body.append(text);

  const meta = document.createElement('div');
  meta.className = 'meta';
  if (task.due) {
    const due = document.createElement('span');
    due.className = 'due';
    if (!task.done && task.due < today()) due.classList.add('overdue');
    due.textContent = `Due ${task.due}`;
    meta.append(due);
  }
  if (repeats(task)) {
    const rep = document.createElement('span');
    rep.className = 'repeat';
    rep.textContent = `↻ ${Recur.LABELS[task.repeat]}`;
    meta.append(rep);
  }
  for (const tag of task.tags || []) {
    const t = document.createElement('button');
    t.type = 'button';
    t.className = 'tag';
    t.textContent = `#${tag}`;
    t.title = `Show only #${tag}`;
    t.addEventListener('click', (e) => {
      e.preventDefault();
      filter.tag = tag;
      render();
    });
    meta.append(t);
  }
  if (meta.childElementCount) body.append(meta);
  label.append(box, body);

  const del = document.createElement('button');
  del.className = 'delete';
  del.textContent = 'Delete';
  del.setAttribute('aria-label', `Delete "${task.title}"`);
  del.addEventListener('click', async () => {
    await TaskDB.remove(task.id);
    render();
  });

  li.append(label, del);
  return li;
}

recurringFilter.addEventListener('click', () => {
  filter.recurring = !filter.recurring;
  recurringFilter.setAttribute('aria-pressed', String(filter.recurring));
  render();
});

statusFilter.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-status]');
  if (!b) return;
  filter.status = b.dataset.status;
  for (const btn of statusFilter.querySelectorAll('button[data-status]')) {
    btn.setAttribute('aria-pressed', String(btn === b));
  }
  render();
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = input.value.trim();
  if (!title) return;
  const due = dueInput.value || null;
  const repeat = repeatInput.value;
  // Monthly tasks remember their day so short months don't pull later dates earlier.
  const repeatDay = repeat === 'none' ? null : Recur.dayOf(due || today());
  await TaskDB.add({ title, due, tags: parseTags(tagsInput.value), repeat, repeatDay });
  input.value = '';
  dueInput.value = '';
  tagsInput.value = '';
  repeatInput.value = 'none';
  render();
});

render();
