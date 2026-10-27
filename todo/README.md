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
- **Priority** (optional): choose **High**, **Medium** or **Low** when adding (default **No priority**).
  A coloured badge with the level's name shows next to the title; tasks without a priority show none.
  Recurring copies keep their priority. Tasks saved before this feature load as *No priority*.
- **Edit**: click **Edit** on a task to change its title, due date, tags, repeat and priority in place.
  **Save** (or Enter) applies the same validation as adding; **Cancel** (or Esc) leaves it unchanged.
  Editing a recurring task changes only that copy; later copies inherit its title, tags and priority.
- **Task count footer**: below the list, e.g. `3 open · 2 done`. It counts all tasks whatever the
  filters, updates after every change, and is hidden when there are no tasks.
- **Filter by status**: **All**, **Incomplete** or **Completed**.
- **↻ Recurring** button: show only recurring tasks (combines with the other filters).
- **Filter by tag**: pick one of the available tags (only tags in use are listed), or click a
  tag on any task. **Any tag** clears it.
- **Filter by priority**: the **Priority** menu shows only High, Medium, Low or No-priority tasks
  (**Any** clears it).
- **Filter by due date**: the **Due** menu shows **Overdue** (past and still open), **Today**,
  **This week** (today plus the next 6 days) or **No date** tasks; **Any** clears it.
- **Search**: the box above the filters narrows the list as you type, matching the title and tags
  (case-insensitive, a leading `#` is optional, every word must match). **×** or **Esc** clears it.
  Search, status, tag, recurring, priority and due filters all combine.

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

Coverage eval (every module except `src/ui/` and `src/main.js`, which are browser-verified; the
IndexedDB adapter is tested against `tests/support/fakeIndexedDb.js`):

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
  main.js                composition root: filter + editing state, render, events → service
  domain/                pure rules
    dates.js             ISO calendar dates: validate, add days, days in month
    recurrence.js        repeat options and next due date (month-end aware, catches up)
    priority.js          priority levels (none / low / medium / high)
    stats.js             task counts (open / done / total) for the footer
    search.js            search terms from the box; title/tag matching
    dueFilter.js         due-date filter: overdue / today / this week / no date
    tasks.js             validate new and edited input, clean tags, complete a task (+ next copy)
    filters.js           status / tag / recurring / priority filters, tags in use, sorting
  services/
    taskService.js       use cases: list, add, edit, toggle, remove; storage errors → messages
  data/
    taskStore.js         repository: all/add/put/remove; normalizes records on read
    taskRecord.js        stored-record format: defaults + cleaning of old/corrupted records
    indexedDbBackend.js  browser storage (same database as before the refactor)
  ui/                    components: build elements from props + callbacks, text via textContent
    dom.js               el() / chip() helpers; re-render keeps keyboard focus
    labels.js            user-facing wording for statuses, repeat options and priorities
    taskFields.js        option lists and input caps shared by the add form and the editor
    taskForm.js          add-task form + validation / save-error message
    taskEditor.js        inline edit form: Save / Cancel, Enter / Esc, validation message
    filterBar.js         status chips, ↻ Recurring toggle, tag chips, priority menu
    taskList.js          visible tasks (+ the one being edited) + empty state
    taskItem.js          one task row: priority badge, Edit and Delete
    taskFooter.js        footer text "N open · M done", hidden when empty
    searchBox.js         search input: sends text as you type; × and Esc clear it
tests/                   node --test: domain, data (incl. IndexedDB via a fake), service (tests/support/)
styles.css               styling (light and dark)
```

## Security

- Content-Security-Policy allows only same-origin scripts and styles, with no inline scripts.
- User text is only ever rendered with `textContent`/`setAttribute`, never parsed as HTML.
- Input is validated and length-limited in `domain/tasks.js`. Stored records are re-validated on
  read (`normalizeTask`), so corrupted or tampered IndexedDB data can't break or inject into the page.
