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
- **Filter by status**: **All**, **Incomplete** or **Completed**.
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
| `app.js` | UI: render list, create / toggle / delete, status and tag filters |
| `styles.css` | Styling (light and dark) |
