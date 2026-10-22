# Structra V2 Memory Bank

Reference notes for the V2 codebase. Companion: `..\structra-v1\memory-bank.md`.
Written from the code (the files in `docs/` are old and not trusted). Refreshed 2026-10-22 after the V1 to V2 catch-up work.
The task list lives in `todo.json` at the repo root.

## 1. Snapshot

| Item | Value |
|---|---|
| Location | `C:\Users\228295\Personal Github Repos\structra-v2` |
| Remote | `https://github.com/Hemanth-PPlatform-1919/structra-v2` (private), branch `main` |
| Stack | Vanilla JS custom elements (no Shadow DOM), plain `<script>` tags, no build step, no ES modules in app code |
| Namespace | everything lives under `window.Structra`. No `window.App` code remains |
| Entry points | `index.html` (the app), `structra-v2.html` (old single-file design prototype, not used by the app) |
| Size | 21 core files, 38 components, 7 utils, 6 workers, 3 CSS files (`components.css` is about 3.5k lines) |
| Design rule | V2 is a fresh rewrite of V1 ideas, not a port. No backward-compatibility layers |

## 2. Run and test

- Serve over HTTP. A no-cache static server is used for testing (see `scratchpad/nocache_server.py` during the dev session): V2 on port 8765, V1 on 8766.
- Browsers cache scripts aggressively. When testing in Playwright, reload changed files with `fetch(url, { cache: 'reload' })` and open the page with a new query string (`index.html?v=N`), otherwise an old copy of a script may run.
- Pushing: plain `git push` picks the wrong GitHub login. Use `git -c credential.helper= -c "credential.helper=!gh auth git-credential" push origin main`.
- Shell note: the Bash tool breaks on backticks inside heredocs. Write files with the file tool and run Python patch scripts from a file.
- Fixtures for testing are in `..\structra-v1\Tests` (edge cases, `jsonobject.json`, and the large `perf_100k.json` and `perf_150k_complex.json`).

## 3. Architecture

### 3.1 Base class (`src/core/base.js`)
`class StructraElement extends HTMLElement`. `connectedCallback` runs once: `_readProps`, `init()`, `render()`. Helpers: `on/off` (global event bus), `emit`, `$`, `$$`, attribute-to-`props` mapping.

### 3.2 State and events (`src/core/state.js`)
- `Structra.events`: `on`, `off`, `emit`, `once`. A listener that throws is logged and re-thrown.
- `Structra.state`: `theme, activeView, currentPath, jsonData, fileName, fileSize, drawerState, queryPanelOpen, contextPanelOpen, findBarOpen, duplicateKeys`.
- `Structra.set(key, value)` emits `state:<key>` with `{ key, value, old }` (no-op when the value is identical).
- `Structra.tabs = { list, activeId, nextId }`.
- Paths in `currentPath` are written without a leading `$` (for example `body.value[0].name`). `Structra.paths` accepts both forms.

### 3.3 Boot (`src/app.js`)
Creates the first tab, syncs state with tabs, mounts the six view components into the view switcher, binds global shortcuts, drag and drop (json, txt, csv, tsv), wires engine ingest, starts DuckDB, attaches panel resizers, opens a `#share=` link if present, restores a session stub, saves tab metadata on unload.

### 3.4 Event names in use
State: `state:jsonData`, `state:currentPath`, `state:fileName`, `state:fileSize`, `state:duplicateKeys`.
Tabs: `tabs:changed`, `tabs:switched`, `tabs:closed`, `tabs:add`, `tabs:close-active`.
Navigation and tree: `nav:changed`, `bookmarks:changed`, `bookmark:add`, `tree:navigate-path`, `tree:node-selected`, `tree:expand-all`, `tree:collapse-all`, `tree:collapse-depth`, `tree:toggle-wrap`.
Engine: `engine:ingested`, `engine:active`, `engine:removed`, `engine:filter-changed`, `engine:data-modified`, `engine:duckdb-ready`, `engine:duckdb-failed`.
UI and overlays: `command-palette:toggle`, `command:run`, `command:exec`, `overlay:close`, `drawer:tab-switched`, `view:switched`, `validate:open`, `charts:open`, `diff:open`, `pivot:open`, `nullfinder:open`, `snippets:open`, `workspace:open`, `typedef:open`, `shortcuts:open`, `heatmap:toggle`, `minimap:toggle`, `editor:repair`, `editor:format`, `editor:minify`, `toast`, `loading:show`, `loading:hide`.

## 4. Core modules (`src/core/`)

| File | What it is |
|---|---|
| `logger.js`, `settings.js`, `constants.js`, `dom-shim.js` | Logger (`dev`/`normal`/`off`), persisted settings (`structra.` keys), shortcut and view constants, `Structra.dom.esc` and friends |
| `worker-pool.js` | `Structra.createWorkerPool`, `parseJsonAsync`, `parseCsvAsync` and the other parsers. Blob URL fallback for `file://` |
| `virtual-list.js` | Generic chunk, sentinel, recycle, rehydrate controller. Options include `root` (scroll box), `chunkTag` and `sentinelTag` so it can build `<tbody>` chunks inside a table |
| `json-tree.js` | Virtualized tree renderer (chunks of 100, recycling, filters, bookmarks, inline edit) |
| `engine.js` | Per-tab datasets, query pipeline (DuckDB first, JS fallback), analysis helpers. Public API now includes `sql`, `summarizeTable`, `getSchemaDb` |
| `duckdb.js` | DuckDB WASM adapter, loaded through `Structra.libs` |
| `persistence.js` | IndexedDB `structra-store` (recents, raw files, session, api history) |
| `libs.js` | `Structra.libs.require(name)`: loads jsonrepair, jsonpath, ajv, html2canvas (scripts) and duckdb (module) from a CDN, with retry |
| `paths.js` | `Structra.paths`: `tokenize`, `resolve`, `setNested`, `strip`, `lastKey`, `powerAutomate`, `powerFx` |
| `expressions.js` | `Structra.expressions`: `powerAutomate(path, value)`, `powerFx(path, value)` return `[{label, code}]`; `helpers(data)` returns sections |
| `schema-gen.js` | `Structra.schemaGen.basic` and `.smart` (reads every array item for optional and nullable keys) |
| `json-tools.js` | `Structra.jsonTools`: `repair` (jsonrepair), `findDuplicateKeys(text)`, `patch(from, to)` (RFC 6902), `validate(data, schema)` (Ajv) |
| `share.js` | `Structra.share` (`#share=g.<gzip base64url>` links, about 30 KB limit) and `Structra.capture.png(element)` (html2canvas) |
| `navigation.js` | `Structra.nav`: back and forward history per tab (Alt+Left, Alt+Right) |
| `bookmarks.js` | `Structra.bookmarks`: saved paths per file name in localStorage `structra_bookmarks` |
| `resizer.js` | `Structra.resizer.attach`: drag and keyboard resize for side panels, width saved in localStorage |

## 5. Components (`src/components/`)

Shell: `structra-header` (path bar, back, forward, bookmark, theme), `structra-tabs`, `structra-rail`, `structra-status` (file, SQL state, duplicate-key badge, log mode), `structra-toast`, `structra-breadcrumb`.
Canvas: `structra-canvas-header`, `structra-view-switcher`, `structra-drawer` (tabs: Analyze, Expressions, Schema Gen), `structra-drawer-stats`, `structra-expressions`, `structra-schemagen`, `structra-input-panel`, `structra-find`, `structra-filter`.
Views: `structra-tree`, `structra-table`, `structra-graph`, `structra-schema`, `structra-editor`, `structra-stats`.
Panels: `structra-query` (left, resizable), `structra-context` (right, resizable, includes the bookmarks list).
Overlays: `structra-command` (palette), `structra-typedef`, `structra-shortcuts`, `structra-loading`, `structra-diff`, `structra-nullfinder`, `structra-pivot`, `structra-minimap`, `structra-snippets`, `structra-workspace`, `structra-heatmap`, `structra-zoom`, `structra-autocomplete`, `structra-validate`, `structra-charts`.

Notable behaviours:
- Table: sort, per-column filters, hide (with an "N hidden" chip to restore), move left or right, non-destructive expand of object columns with a key picker, "Chart this column". Above 200 rows it uses the virtual list with `<tbody>` chunks. Row selection paths follow the real row index even after sort or filter.
- Path autocomplete: resolves everything before the last separator in the open document and lists keys or array indexes. Tab or Enter accepts.
- Editor: Format, Minify, Repair (jsonrepair), Apply.
- Validate overlay: paste a schema or infer one, errors link to the tree.
- Diff overlay: includes Copy JSON Patch.
- Charts overlay: numeric histogram, trend and summary, or top values for text columns. Inline SVG.
- Tree right-click menu (in `structra-tree`): copy path, value, subtree, Copy As (TypeScript, Python, C#, Go, Rust, Java, SQL), mock data, bookmark, filter to this.

## 6. Shortcuts (`constants.js`, shown by `structra-shortcuts`)
Ctrl+K palette, Ctrl+F find, Ctrl+H find and replace, Ctrl+Shift+F filter, Ctrl+L path bar, Ctrl+B bookmark, Alt+Left and Alt+Right back and forward, Alt+N new tab, Alt+W close tab, Ctrl+1 to Ctrl+5 views (tree, table, graph, schema, stats), Ctrl+E editor, Ctrl+Shift+S sort keys, Ctrl+Shift+E export CSV, Ctrl+Shift+P mask, Ctrl+D compare, Ctrl+Z and Ctrl+Y undo and redo, Alt+T theme, Escape close.
Ctrl+T and Ctrl+W were removed because browsers do not let pages intercept them.

## 7. Command palette
Views, sort, flatten, unflatten, mask, mock, sample, type generation (TypeScript, Python, Go, C#, Rust, SQL), export CSV, YAML, XML, copy share link, export view as image, repair, format, minify, find, filter, fuzzy search, SQL, validate, charts, distribution, undo, redo, theme, shortcuts, diff, null finder, pivot, minimap, snippets, workspace, heatmap, zoom.

## 8. CSS
`variables.css` (all tokens, light and dark), `layout.css` (grid shell), `components.css`. Rule: use `var(--*)` tokens, no raw hex or px sizes except 1px borders. Fonts: Inter and JetBrains Mono.

## 9. What changed from the earlier notes
- The engine crash (`sql`, `summarizeTable`, `getSchemaDb` exported but undefined) is fixed, so V2 boots with no console errors.
- All V1 code copies (`src/ui`, `src/expressions`, five utils) are deleted. `Structra.libs` replaced the old loader, `Structra.paths` replaced `Structra.path`.
- Added: Power Platform expressions, Parse JSON schema, history and breadcrumb, real bookmarks, repair, schema validation, duplicate keys, JSON Patch export, share links, image export, charts, table improvements, autocomplete rewrite, panel resizers.
- Fixed: table virtual scroll rendered rows as plain text, and table row paths pointed at the wrong row after sorting.

## 10. Test results (V1 vs V2, 2026-10-22)
All 30 small V1 fixtures plus perf_100k and perf_150k_complex were loaded through each app's real file input. V2 matches V1 line counts everywhere V1 renders, with no view errors. V1 itself threw page errors on test7_mixed and test9_edge.
Bugs found and fixed in V2: infinite recursion in `findFirstObjectArray` on null values, a blank screen for documents that are just null, and the broken virtual-scroll table.
Timings (first tree render): perf_100k V2 4.8 s vs V1 2.9 s, perf_150k V2 12.2 s vs V1 13.7 s. Heap on perf_150k: V2 562 MB, V1 454 MB.
Stats view is the slow spot in V2: about 6.7 s on 100k rows and 17.7 s on 150k rows.

## 11. Known gaps and ideas
- Documents that are only null, false, 0 or an empty string cannot be opened (jsonData doubles as the has-data flag). V2 shows a message instead of a blank screen.
- Session restore is still a stub (only tab metadata is saved on unload, not data).
- `structra-v2.html` and `samples/` are design prototypes and can be archived or deleted.
- `docs/` is old. Treat it as history, or delete it.
- DuckDB init gates the reveal of the app shell (up to 90 s on a slow network).
- No automated tests yet. A Playwright smoke test using the V1 fixtures would be the next step.
- The engine keeps a stale sorted index when the table sort is cleared in code (the UI cannot clear a sort, only flip it).
- Share links are limited to about 30 KB of encoded data.
