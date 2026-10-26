const form = document.getElementById('new-task');
const input = document.getElementById('title');
const list = document.getElementById('tasks');
const empty = document.getElementById('empty');

async function render() {
  const tasks = (await TaskDB.all()).sort((a, b) => a.createdAt - b.createdAt);
  list.replaceChildren(...tasks.map(renderTask));
  empty.hidden = tasks.length > 0;
}

function renderTask(task) {
  const li = document.createElement('li');
  li.className = task.done ? 'done' : '';

  const label = document.createElement('label');
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = task.done;
  box.addEventListener('change', async () => {
    await TaskDB.put({ ...task, done: box.checked });
    render();
  });
  const text = document.createElement('span');
  text.textContent = task.title;
  label.append(box, text);

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

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = input.value.trim();
  if (!title) return;
  await TaskDB.add(title);
  input.value = '';
  render();
});

render();
