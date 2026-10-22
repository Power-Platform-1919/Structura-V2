# Structra V2 Memory Bank

Reference notes on the V2 codebase (the rebuild of Structra V1). Companion file: `..\structra-v1\memory-bank.md`.
Source of truth is the code. Re-verify file and line references before relying on them.

## 1. Snapshot

| Item | Value |
|---|---|
| Location | `C:\Users\228295\Personal Github Repos\structra-v2` |
| Remote | none yet (local repo only) |
| Git | `main`, 2 commits: `4b7ad65` Initial commit, `a3c57aa` Point workspace at structra-v1 |
| Workspace file | `Structra Development.code-workspace` (V1 at `../structra-v1`, V2 at `.`) |
| Stack | Vanilla JS Custom Elements (no Shadow DOM), plain `<script>` tags, no build step, no ES modules, no framework |
| Decided | 2026-06-20 (see `docs/architecture.md`) |
| Size | about 24k lines total, but a large part is V1 code copied in and not loaded (see section 3) |
| Run | Serve over HTTP (`python -m http.server`, or `npx serve`). Open `index.html`. The app targets GitHub Pages (HTTPS). `file://` is partly supported through Blob worker fallbacks |
| Entry points | `index.html` (modular app, 177 lines) and `structra-v2.html` (1069 line single-file design prototype) |

Goal: same Power-Platform-focused JSON explorer as V1, rebuilt as a modular component app with a data engine (JS core plus DuckDB WASM for SQL), IndexedDB persistence, a worker pool, and a proper design-token CSS system.

## 2. Current status (important)

**The app does not boot cleanly right now.** Opened at `http://127.0.0.1:8765/index.html` in Playwright on 2026-10-22: page shell loads, 9 console errors, no data can be loaded.

Root cause found by reading the code:
- `src/core/engine.js` ends with a public API `return { ... }` (around lines 1749 to 1828) that lists `sql` (line 1774), `summarizeTable` (line 1790) and `getSchemaDb` (line 1809).
- None of those three functions is defined anywhere in `engine.js` (the grep only finds local `const sql = ...` template strings inside `jsonExtract` and `unnest`).
- Returning an undefined identifier throws `ReferenceError: sql is not defined`. The IIFE therefore throws, `Structra.engine` is never assigned.
- Everything that touches the engine then fails with `Cannot read properties of undefined`:
  - `duckdb.js:80` `Structra.engine.onDuckDBReady()` (message "DuckDB Init failed")
  - `Structra.engine.getActive` in `structra-table`, `structra-filter`, `structra-schema`, `structra-stats`, `structra-drawer-stats`
  - `Structra.engine.getQuery` in `structra-graph`
- Other noise: `favicon.ico` 404 (no `<link rel="icon">` in `index.html`; `icons/` folder does not exist in V2).

Likely fix (not applied): implement or remove the three missing exports. The header comment documents `engine.sql(query)` as "DuckDB SQL (when ready)" and `runSql` already exists (line 676), so `sql` is probably meant to alias `runSql`. `summarizeTable` and `getSchemaDb` need to be written (DuckDB `SUMMARIZE` and a schema query) or dropped.

## 3. Repository layout

```
index.html                   thin shell with custom element tags and a hand-ordered script list
structra-v2.html             complete single-file prototype (CSS and design finalized there)
src/app.js                   bootstrap (307 lines)
src/core/                    namespace, state, engine, duckdb, workers, persistence, virtualization (LOADED)
src/components/              33 custom elements, one file each (LOADED)
src/css/                     variables.css, layout.css, components.css (LOADED)
src/workers/                 6 parse and engine workers (json, xml, engine loaded as scripts; csv, yaml, toml via pool)
src/libs/                    vendored papaparse, js-yaml, toml (LOADED)
src/utils/                   path, lib-loader, primitives, transform-ops, data-mask, mock-gen, undo-stack, code-gen, format-convert (LOADED);
                             also dom, json-utils, stats, storage, traverse (V1 copies, NOT loaded by index.html)
src/ui/                      about 40 V1 UI modules (NOT loaded, kept as reference for porting)
src/expressions/             V1 power-platform.js, helpers.js, schema-gen.js (NOT loaded, still to port)
samples/                     option-a, option-b, option-c (plus interactive) design options
docs/                        16 design and analysis documents (section 11)
```

Rule of thumb: `src/ui/*`, `src/expressions/*` and several `src/utils/*` files are **V1 source copied as-is for reference/porting** and use the old `window.App` namespace. The live V2 code uses `window.Structra`.
Mixed namespace warning: `src/utils/lib-loader.js` and `src/utils/path.js` still define `window.App.*` and V2 code calls them (`App.libLoader.require('duckdb')` in `duckdb.js:47`).

## 4. Architecture

### 4.1 Rules (from `docs/architecture.md`)
- Custom Elements, no Shadow DOM (shared CSS custom properties for theming).
- No ES modules (so it can still work from `file://`). Regular `<script>` tags in dependency order.
- No frameworks. Vanilla only.
- One file, one class, one tag per component.
- Global namespace `window.Structra`, console friendly: `Structra.state`, `Structra.tabs`, `Structra.engine`, `Structra.duckdb`, `Structra.log`, `Structra.settings`, `Structra.persistence`.

### 4.2 Base class (`src/core/base.js`)
`class StructraElement extends HTMLElement`:
- `connectedCallback` runs once: `_readProps()` (attributes to camelCase `this.props`), `init()`, `render()`.
- `attributeChangedCallback` updates `props` and calls `update()` (default: `render()`).
- Helpers: `set/get` props, `emit(name, detail)` (bubbling, composed CustomEvent), `on/off` (proxy to the global bus), `$` and `$$` (scoped query).
- Subclasses override `init()` and `render()` (usually set `this.innerHTML`).

### 4.3 State and events (`src/core/state.js`)
- `Structra.events`: tiny bus with `on`, `off`, `emit`, `once`. Listener exceptions are logged and **re-thrown** (one bad listener aborts the rest of the emit).
- `Structra.state`: `theme, activeView, currentPath, jsonData, fileName, fileSize, drawerState, queryPanelOpen, contextPanelOpen, findBarOpen`.
- `Structra.set(key, value)`: skips if identical, assigns, logs, emits `state:<key>` with `{key, value, old}`. `Structra.get(key)`.
- `Structra.tabs = { list, activeId, nextId }` where a tab is `{id, label, data, path, view, modified, fileName, fileSize}`.
- Theme: `applyTheme`, `toggleTheme`, backed by `Structra.settings`. `Structra.toast(msg)` emits `toast`.

### 4.4 Event names in use (counted from source)
State: `state:jsonData`, `state:fileName`, `state:fileSize`, and others via `set`.
Tabs: `tabs:changed`, `tabs:switched`, `tabs:closed`, `tabs:add`, `tabs:close-active`.
Views and tree: `view:switched`, `tree:navigate-path`, `tree:node-selected`, `tree:search-key`, `tree:expand-all`, `tree:collapse-all`, `tree:collapse-depth`, `tree:toggle-wrap`, `tree:inline-edit`.
Engine: `engine:ingested`, `engine:active`, `engine:removed`, `engine:filter-changed`, `engine:data-modified`, `engine:duckdb-ready`, `engine:duckdb-registered`, `engine:duckdb-failed`.
UI: `loading:show`, `loading:hide`, `toast`, `command-palette:toggle`, `command:run`, `command:exec`, `overlay:close`, `shortcut`, `find:toggle`, `find:toggle-replace`, `find:results`, `filter:toggle`, `drawer:tab-switched`, `rail:switch`, `rail:action`, `zoom:in/out/reset`, `theme:toggle`, `settings:changed`, `settings:reset`, `bookmarks:changed`, `bookmark:add`, and overlay openers `diff:open`, `pivot:open`, `nullfinder:open`, `snippets:open`, `workspace:open`, `typedef:open`, `shortcuts:open`, `heatmap:toggle`, `minimap:toggle`.

### 4.5 Boot sequence (`src/app.js`)
1. `__splashStep` updates the splash. Logs bootstrap. `Structra.applyTheme()`.
2. Pushes an initial tab (id 1) into `Structra.tabs.list`, emits `tabs:changed`.
3. Bidirectional sync between global state and the active tab object (`tabs:switched` loads tab data into state, `state:*` events write back into the tab).
4. Canvas visibility toggle: when `jsonData` is set, show canvas header and view switcher, hide the empty input panel.
5. Mounts view components into the view switcher panels: tree, table, graph, schema, editor, stats.
6. Global keyboard handler maps combos through `Structra.constants.SHORTCUTS` to actions and events (details in section 8).
7. Drag and drop: accepts `json, txt, csv, tsv`; CSV via `Structra.parseCsvAsync`, JSON via `Structra.parseJsonAsync`; then sets state (`jsonData`, `fileName`, `fileSize`, `currentPath`).
8. Engine wiring: `tabs:switched` calls `engine.setActive`; `tabs:closed` calls `engine.remove`; `state:jsonData` calls `engine.ingest` unless already ingested.
9. DuckDB init (non-blocking) with a 90 s splash safety timeout. On success toast "DuckDB SQL engine ready"; on failure the splash shows an error for 2 s, then the app is revealed without SQL.
10. Session restore from IndexedDB (only logs for now: "Session restore logic will be expanded in future phases"). Session save on `beforeunload` (tabs metadata only).

Note: the app shell stays `visibility:hidden` until DuckDB init resolves or times out. If `engine` is broken (section 2), init fails and the shell is shown after the error delay.

## 5. Core modules (`src/core/`)

| File | Lines | Role |
|---|---|---|
| `logger.js` | 176 | `Structra.log` with modes `dev` / `normal` / `off`, stored in localStorage `structra-log-mode`; `debug, info, warn, error, perf, group`; colour-coded tags per component |
| `settings.js` | n/a | `Structra.settings`: localStorage keys prefixed `structra.`. Defaults: theme light, logMode normal, fontSize 14, pageSize 50, sidebarW 320, defaultFmt auto, autoDetect true, animations true, confirmClose true, sqlHistory true, treeChunk 100, maxDepth 20. `get, set, getAll, reset, export, import`, emits `settings:changed`. Loaded synchronously to avoid theme flash |
| `base.js` | about 90 | `StructraElement` (4.2) |
| `state.js` | about 110 | State, events, tabs, theme (4.3) |
| `constants.js` | about 60 | `MAX_TABS 8`, `VIEWS`, `DRAWER_STATES`, `RAIL_ITEMS`, `SHORTCUTS`, `QUERY_MODES`, `DRAWER_TABS` |
| `dom-shim.js` | n/a | `Structra.dom`: `esc`, `$`, `toast`, `showLoading`, `hideLoading` (compat for ported V1 code) |
| `worker-pool.js` | 371 | `Structra.createWorkerPool(config)`: lazy, scaling pool (max workers 4, queue 64, 200 tasks per worker, 30 s task timeout, 60 s idle termination, optional Transferable threshold). Falls back to a Blob URL built from inline worker source when `new Worker(url)` is blocked (file://). Exposes `parseJsonAsync`, `parseCsvAsync`, etc. Worker URLs get `?v=Date.now()` |
| `virtual-list.js` | 261 | `Structra.virtualList.create(opts)`: generic chunk + sentinel + recycle + rehydrate controller via IntersectionObserver. Used by tree, table, graph. Controller: `loadAll, destroy, getChunk, scrollToItem, applyToChunks, reset` |
| `json-tree.js` | 918 | `Structra.jsonTree`: port of V1 `json-view.js` as a reusable renderer. `render(container, data, opts)`, `expandAll/collapseAll/collapseToDepth`, `highlightPath(s)`, `setFilter/setFilterByRegex/clearFilter`, inline edit, key occurrence highlight, bookmarks highlight. `CHUNK_SIZE 100`, `OFFSCREEN_MARGIN 3000` |
| `persistence.js` | 261 | IndexedDB `structra-store` v1 with stores `recents`, `raw_files` (Blob keyed by content hash), `session`, `api_history`. API: `ready`, `recents.*`, `raw.*`, `session.save/load`, `api.*`, `clearAll` |
| `engine.js` | 1829 | The data engine (section 6). Currently crashes at load |
| `duckdb.js` | 201 | DuckDB WASM adapter (section 7) |

## 6. Data engine (`Structra.engine`, `src/core/engine.js`)

Concept: named datasets, one per tab, with a unified query API. JS core works immediately; DuckDB takes over SQL-style work when ready.

- Dataset: `{ id, raw, meta{name,fileName,fileSize,format,timestamp,shape,rowCount}, indexes{paths,columns,sorted}, cache(Map, LRU at 50), duckTable: 'tab_<id>' }`.
- Shapes from `detectShape`: `empty`, `empty-array`, `flat-array` (array of objects), `nested-array`, `object`, `primitive`.
- Column index samples the first 1000 rows (`buildColumnIndex`).
- Lifecycle: `ingest(tabId, data, meta)`, `remove`, `setActive`, `getActive`, `getDataset`; datasets exposed as `engine.datasets`, `engine.activeId`.
- Data ops: `slice`, `sort`, `search`, `filter`, `aggregate`, `getSchema`, `getStats`, `pathQuery`, `diff`.
- Query pipeline (DuckDB first, JS fallback): `findInDb`, `replaceInData`, `filterDb` (conditions to SQL via `_conditionsToSql`), `runSql`, then an active-query slot (`_setActiveQuery`, `clearQuery`, `getQuery`, `getQueryRows`, `getQueryData`) that all views read, so one filter drives tree, table, schema, graph and stats.
- DuckDB JSON helpers: `describeTable`, `jsonExtract`, `unnest`, `topKValues`, `analyzeDistribution`, `correlation`, `fuzzySearch`, `regexSearch`, `exportData`, `sampleData`, `pivotData`.
- Consolidated analysis helpers (moved from V1 utils): `walk`, `analyze`, `analyzeDb`, `findFirstObjectArray`, `findAllArrays`, `collectKeys`, `analyzeKeys`, `analyzeNestedKeys`, `collectArrayItems`, `profileFields` (DuckDB and JS variants), `computeQuality`, `countGaps`, `formatSize`.
- Flags: `duckReady`, `duckFailed`, `canUseDuck`, `isDuckAvailable`; handlers `onDuckDBReady` / `onDuckDBFailed` (re-register datasets once ready).
- Session: `scheduleSessionSave`.
- **Missing definitions in the export list:** `sql`, `summarizeTable`, `getSchemaDb` (section 2).

## 7. DuckDB adapter (`Structra.duckdb`, `src/core/duckdb.js`)
- Loads the ESM bundle through `App.libLoader.require('duckdb')` (jsdelivr `@duckdb/duckdb-wasm@1.29.0/+esm`), selects a bundle via `getJsDelivrBundles()`, runs the main worker from a Blob `importScripts(...)`, opens an in-memory DB (OPFS not used because it needs COOP/COEP headers).
- `init()` is idempotent (cached promise). `query(sql)` converts the Arrow result to objects. Also `registerDataset`, `getTableColumns`, `dropTable`, `close`, `ready` per the header comment.
- On success calls `Structra.engine.onDuckDBReady()`; on failure emits `engine:duckdb-failed`.
- `lib-loader.js` supports UMD scripts and ESM `import()` with a list of fallback URLs per lib.

## 8. UI shell and components

### 8.1 Layout (`index.html`, CSS grid in `layout.css`)
Rows: `structra-header`, `structra-tabs`, workspace, `structra-status`. Workspace columns: `structra-rail` (left icon bar), togglable `structra-query` (filter panel), `main#canvas`, togglable `structra-context` (right details). The canvas holds `structra-find`, `structra-filter`, `structra-canvas-header`, `structra-view-switcher` (views mounted by `app.js`), an empty state with `structra-input-panel mode="inline"`, and `structra-drawer` (collapsed, medium, expanded).
Overlays (siblings of `.app`): toast, command, typedef, shortcuts, loading, diff, nullfinder, pivot, minimap, snippets, workspace, heatmap, zoom, autocomplete, plus the full `.io-overlay` input panel.
Splash screen `#appSplash` shown until DuckDB init resolves.

### 8.2 Components (33 files, line counts from `wc -l`)
Shell: `structra-header` 72, `structra-tabs` 142, `structra-rail` 59, `structra-status` 91, `structra-toast` 32.
Canvas: `structra-canvas-header` 100, `structra-view-switcher` 34, `structra-drawer` 128, `structra-drawer-stats` 136, `structra-input-panel` 715, `structra-find` 311, `structra-filter` 299.
Views: `structra-tree` 272, `structra-table` 823, `structra-graph` 344, `structra-schema` 116, `structra-editor` 126, `structra-stats` 723.
Panels: `structra-query` 253, `structra-context` 220.
Overlays and features: `structra-command` 416, `structra-typedef` 142, `structra-shortcuts` 127, `structra-loading` 51, `structra-diff` 296, `structra-nullfinder` 213, `structra-pivot` 235, `structra-minimap` 135, `structra-snippets` 173, `structra-workspace` 152, `structra-heatmap` 123, `structra-zoom` 63, `structra-autocomplete` 156.
Not in V2 yet (planned in `docs/build-plan.md`): a dedicated URL/API modal, a separate convert (YAML/XML) modal, a context menu component (a `structra-context` panel exists but it is the right detail panel).

### 8.3 Keyboard shortcuts (`constants.js`)
`ctrl+k` command palette, `ctrl+f` find, `ctrl+h` find and replace, `ctrl+shift+f` filter, `ctrl+l` focus path, `ctrl+t` new tab, `ctrl+w` close tab, `ctrl+1..5` tree, table, graph, schema, stats, `ctrl+e` editor, `ctrl+shift+s` sort, `ctrl+shift+e` export CSV, `ctrl+shift+p` mask, `ctrl+d` compare, `ctrl+z` / `ctrl+y` undo and redo, `alt+t` theme, `escape` close overlay.
Differences from V1: V1 used Ctrl+T for Transform and Ctrl+4 for Graph with Schema on Ctrl+3. V2 moved things around (for example Ctrl+T now opens a tab, which collides with the browser).

### 8.4 Drawer tabs and query modes
Drawer: `analyze`, `expressions`, `schema-gen`. Query modes: `path`, `jsonpath`, `regex`, `js` (SQL mode is planned through the engine).

## 9. CSS system (`docs/css-system.md`)
- Three files: `variables.css` (all tokens, light and `[data-theme="dark"]`), `layout.css` (grid shell), `components.css` (shared components).
- Rule: no hex colours and no raw px sizes in layout or components, except 1px borders, 2px indicators and media query breakpoints.
- Tokens: sizing (`--header-h`, `--rail-w`, `--status-h`, panel widths), font scale `--fs-xxs` (9px) to `--fs-xl` (16px), icon scale `--icon-xs` to `--icon-xl`, spacing `--sp-1` to `--sp-8`, surfaces, borders, text, accent set, semantic set (success, warning, error, danger, info, each with `-soft`), syntax colours (`--syn-*` for tree and schema), overlay, tree and drawer sizes.
- Fonts: Inter (400, 500, 600) and JetBrains Mono (400, 500) from Google Fonts.
- When adding a component: define tokens first (both themes), use only `var(--*)`, update the doc.

## 10. Workers
`src/workers/`: `json-parse-worker.js` (dual-mode: registers its source when loaded by script tag so the pool can build a Blob URL, and runs directly when loaded as a Worker; accepts string or transferred ArrayBuffer), `csv-parse-worker.js`, `xml-parse-worker.js`, `yaml-parse-worker.js`, `toml-parse-worker.js`, `engine-worker.js` (163 lines: path index builder, search, filter, sort, aggregate for datasets over 10k items, request `{op,data,params,id}`, reply `{op,result,id,duration}`).
Sync fallbacks rely on the vendored `papaparse`, `js-yaml`, `toml` in `src/libs/` (loaded in `index.html` so `file://` works).
Performance notes from `docs/structra-v2-logger.md`: non-active views defer rendering through a `_stale` flag, the insight strip is capped at 200k nodes, table preview is capped at 1000 rows, editor skips `JSON.stringify` over 10 MB.

## 11. Documentation in `docs/` (read these before redesigning)
| File | Content |
|---|---|
| `architecture.md` | Decision record for custom elements (read) |
| `build-plan.md` | Phased component plan and V1 to V2 feature mapping (read) |
| `css-system.md` | Token and CSS rules (read) |
| `structra-v2-logger.md` | Logger API and perf notes (read) |
| `plan.md` (473 lines) | Data engine plan: DuckDB primary, JS core, three-tier persistence, filter modes mapped to engine calls (first 60 lines read) |
| `client-side-data-engines-research.md` (331) | Comparison research for in-browser engines |
| `data-utilities-analysis.md` (68) | Analysis of utility modules |
| `audit-v1-elements.md`, `audit-v2-prototype.md` (504) | Element audits |
| `v1-comprehensive-views-inventory.md` (730), `v1-input-overlay-analysis.md` (313), `v1-tree-virtualization.md` (74) | V1 deep dives |
| `v2-codebase-full-analysis.md` (438), `v2-codebase-research.md` (248), `v2-complete-component-audit.md` (827), `workspace-exploration-complete.md` (210) | Earlier analyses of V2 and the workspace |
Some of these were generated analyses. Treat them as leads and check them against the code.

## 12. Planned design decisions worth remembering
- Engine plan: DuckDB WASM as primary SQL engine, loaded from CDN and cached; JS core covers tree operations and the period before WASM is ready; datasets are per-tab; cross-tab ops (`diff`, later `join`).
- Persistence tiers: localStorage for settings (sync), IndexedDB for raw files, recents, session, API history; OPFS for DuckDB file only if COOP/COEP can be provided (currently in-memory).
- Every filter mode routes through the engine and all views read the shared active query result.
- Internet is required on first load (fonts, DuckDB). Offline support via a service worker is a deferred idea.
- Data never leaves the browser.

## 13. Risks and open issues
1. Engine export list references three undefined functions, so the whole data layer is dead at load (section 2). Highest priority.
2. Event bus re-throws listener errors, so one failing listener stops later listeners for that event.
3. Mixed namespaces (`App` and `Structra`), plus V1 copies sitting beside live code, make it easy to edit a file that is never loaded.
4. App reveal is gated on DuckDB init (up to 90 s). A slow or blocked CDN delays first paint of the shell content.
5. `Ctrl+T` and `Ctrl+W` are bound to new tab and close tab, which browsers reserve.
6. Worker URLs use `Date.now()` cache busting, so workers are re-downloaded every load.
7. Session restore is a stub; only tab metadata is saved on unload, not data.
8. `index.html` has no favicon link (404 on every load) and `icons/` is missing.
9. Duplicated DOM-less utilities between `engine.js` (analysis helpers) and the V1 `utils/` copies.
10. No automated tests in V2. V1's `Tests/` fixtures (including `perf_100k.json` and `perf_150k_complex.json`) are in `..\structra-v1\Tests` and could be reused.

## 14. Next steps (suggested)
1. Fix `engine.js` exports (define or remove `sql`, `summarizeTable`, `getSchemaDb`), reload, and recheck the console.
2. Load a V1 fixture and walk each view (tree, table, graph, schema, stats, editor), then record real failures.
3. Port remaining V1 features listed in `docs/build-plan.md` (expressions panel, URL/API modal, convert, context menu).
4. Decide whether to delete or move the unloaded V1 copies in `src/ui`, `src/expressions` and the unused `src/utils` files.
5. Add a favicon and a minimal automated smoke test (Playwright) using the fixtures.

## 15. How this file was produced
Read directly: `index.html`, `src/app.js`, `src/core/base.js`, `state.js`, `constants.js`, heads of `settings.js`, `dom-shim.js`, `worker-pool.js`, `persistence.js`, `json-tree.js`, `virtual-list.js`, `engine.js` (head, function index, last 90 lines), `duckdb.js` (first 110 lines), `engine-worker.js` and `json-parse-worker.js` (heads), `utils/lib-loader.js` (head), `docs/architecture.md`, `build-plan.md`, `css-system.md`, `structra-v2-logger.md`, first 60 lines of `plan.md`, plus a grep of event names and a listing of all components.
Not read in detail: the 33 component bodies (only names and sizes), `css/*.css`, most of `engine.js` and `json-tree.js`, `structra-v2.html`, `samples/*`, and most `docs/*.md`. Statements about those come from headers, docs and function names, and have not been verified line by line.
