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

## Run

No build step or dependencies. Serve the folder and open it:

```bash
cd todo
python3 -m http.server 8000
# open http://localhost:8000
```

Opening `index.html` directly from disk also works in most browsers.

## Files

| File | Purpose |
|---|---|
| `index.html` | Page markup |
| `db.js` | IndexedDB wrapper (`TaskDB.all/add/put/remove`); tasks carry `due` and `tags` |
| `recur.js` | Recurring-task date logic (`Recur.next`), pure calendar-date arithmetic |
| `app.js` | UI: render list, create / toggle / delete, status, tag and recurring filters; spawns the next copy of a recurring task |
| `styles.css` | Styling (light and dark) |
