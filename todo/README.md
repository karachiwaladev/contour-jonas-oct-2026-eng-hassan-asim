# todo

A minimal todo app that runs entirely in the browser. Tasks are stored in a client-side
database (IndexedDB), so they persist across reloads with no server.

## Features

- **Create** a task: type a title and press Enter or **Add**.
- **Mark done**: tick the checkbox (untick to reopen). Done tasks are struck through.
- **Delete**: click **Delete** on a task.

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
| `db.js` | IndexedDB wrapper (`TaskDB.all/add/put/remove`) |
| `app.js` | UI: render list, handle create / toggle / delete |
| `styles.css` | Styling (light and dark) |
