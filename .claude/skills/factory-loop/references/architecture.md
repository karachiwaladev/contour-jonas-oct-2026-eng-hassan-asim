# Architecture rules for factory projects

No monolith files. Every project is split into layers with one job each, so logic can be unit-tested
without a browser and UI pieces can change without touching storage.

## Layout (browser apps, no build step)

```
<project>/
  index.html            markup + <script type="module" src="src/main.js">
  package.json          {"type": "module", "scripts": {"test": "node --test"}}
  src/
    domain/             pure logic: no DOM, no storage, no Date.now() inside — pass time in
    data/               storage adapters (IndexedDB, localStorage) behind a small async API
    ui/                 components: one file per component, `createX(props) → HTMLElement`
    main.js             wiring only: load state, render components, connect events to domain + data
  tests/                *.test.js for domain (and data, with a fake store); `node --test` finds them
  README.md
```

ES modules need http, not `file://` — README run instructions must use a local server.

## Rules

1. **Size:** no source file over 150 lines (the quality gate enforces this). Split before you hit it.
2. **Direction of dependencies:** `ui → domain`, `main → ui/data/domain`, `data → domain` types only.
   `domain` imports nothing from `ui` or `data`.
3. **Pure domain:** functions take inputs and return outputs; time ("today"), ids and randomness are
   parameters. That makes them deterministic under test.
4. **Components:** a component builds and returns its element from props and callbacks
   (`onToggle`, `onDelete`); it never talks to storage directly. Render text with `textContent`.
5. **State:** one place owns app state (in `main.js`, or a dedicated state module beside it); components get what they need.
6. **No globals** except what `index.html` needs to boot; no `window.*` sharing between files.
7. **Small, named exports**; no default-export grab bags.

## Refactoring an existing monolith

When a ticket touches a project that breaks these rules, include the split in the plan (Stage 2):
move pure logic to `src/domain/` first with tests that pin current behaviour, then extract
components, then thin `main.js`. Behaviour must not change — the existing browser checks still pass.
