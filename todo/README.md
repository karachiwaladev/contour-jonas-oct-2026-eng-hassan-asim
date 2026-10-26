# todo

A minimal todo app that runs entirely in the browser. Tasks are stored in a client-side
database (IndexedDB), so they persist across reloads with no server.

## Features

- **Create** a task: type a title and press Enter or **Add**.
- **Mark done**: tick the checkbox (untick to reopen). Done tasks are struck through.
- **Delete**: click **Delete** on a task.
- **Due date** (optional): pick a date when adding a task. It shows under the task and turns
  red once the task is overdue and still open.
- **Tags** (optional): enter comma-separated tags when adding (e.g. `work, urgent`). Tags are
  lower-cased and de-duplicated.
- **Recurring tasks** (optional): choose **Daily**, **Weekly** or **Monthly** in the Repeat menu.
  Ticking a recurring task marks it done and creates the next copy (same title and tags) due on the
  next date, counted from the due date (or from today if it had none) and moved forward to today or
  later so a late task doesn't pile up overdue copies. Monthly tasks keep their day, using the last
  day of shorter months (Jan 31 → Feb 28 → Mar 31). Each copy spawns at most once; deleting the
  current copy stops the series. Recurring tasks show a **↻ Daily/Weekly/Monthly** label.
- **Filter by status**: **All**, **Incomplete** or **Completed**.
- **↻ Recurring** button: show only recurring tasks (combines with the other filters).
- **Filter by tag**: pick one of the available tags (only tags in use are listed), or click a
  tag on any task. **Any tag** clears it. Status and tag filters combine.

- **Validation**: empty titles, titles over 200 characters and invalid dates are rejected with a
  message instead of being saved. Tags are limited to 10 per task, 30 characters each.

## Run

No build step or dependencies. The app uses ES modules, which browsers only load over http, so
serve the folder (opening `index.html` from disk won't work):

```bash
cd todo
python3 -m http.server 8000
# open http://localhost:8000
```

## Test

Unit tests use Node's built-in test runner (Node 18+), no install needed:

```bash
cd todo
node --test        # or: npm test
```

Coverage eval (domain, data and service layers; thresholds and the IndexedDB-adapter exclusion are in
`package.json` under `"coverage"`):

```bash
npm run coverage   # prints line/branch/function coverage vs thresholds and COVERAGE PASS or FAIL
```

## Architecture

Layered, one job per file; dependencies point inwards (`ui` → `domain`, `services` → `domain` +
`data`, `data` → `domain`; `main` wires everything). Domain code is pure (no DOM, storage, clock or
UI text), so it is unit-tested; the service is tested against an in-memory store.

```
index.html               markup + CSP; loads src/main.js as a module
src/
  main.js                composition root: filter state, render, events → service
  domain/                pure rules
    dates.js             ISO calendar dates: validate, add days, days in month
    recurrence.js        repeat options and next due date (month-end aware, catches up)
    tasks.js             validate new input, clean tags, complete a task (+ next copy)
    filters.js           status / tag / recurring filters, tags in use, sorting
  services/
    taskService.js       use cases: list, add, toggle, remove; storage errors → messages
  data/
    taskStore.js         repository: all/add/put/remove; normalizes records on read
    taskRecord.js        stored-record format: defaults + cleaning of old/corrupted records
    indexedDbBackend.js  browser storage (same database as before the refactor)
  ui/                    components: build elements from props + callbacks, text via textContent
    dom.js               el() / chip() helpers; re-render keeps keyboard focus
    labels.js            user-facing wording for statuses and repeat options
    taskForm.js          add-task form + validation / save-error message
    filterBar.js         status chips, ↻ Recurring toggle, tag chips
    taskList.js          visible tasks + empty state
    taskItem.js          one task row
tests/                   node --test: domain, data, service (tests/support/memoryBackend.js)
styles.css               styling (light and dark)
```

## Security

- Content-Security-Policy allows only same-origin scripts and styles, with no inline scripts.
- User text is only ever rendered with `textContent`/`setAttribute`, never parsed as HTML.
- Input is validated and length-limited in `domain/tasks.js`. Stored records are re-validated on
  read (`normalizeTask`), so corrupted or tampered IndexedDB data can't break or inject into the page.
