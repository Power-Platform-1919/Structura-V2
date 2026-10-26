# Structra V2 Memory Bank

Reference notes for the V2 codebase. Companion: `..\structra-v1\memory-bank.md` (V1, for reference only).
Written from the code (the files in `docs/` are old and not trusted). Refreshed 2026-10-22 after the redesign, Overview, icon, Power Platform and test work.
The task list lives in `todo.json` at the repo root (tasks 1 to 12).

## 1. What the app is

A local JSON analyzer for everyone, with a built-in Power Platform add-on for makers of cloud flows and canvas apps.
- Main job: understand an unknown payload in under a minute (the Overview screen opens first).
- Power Platform add-on (always visible): Power Automate expressions, Power Fx, Parse JSON schema, flow action snippets for the selected value.
- Everything is processed in the browser. Hosting (for example GitHub Pages) is fine; data never leaves the page. Libraries and icons may load from a CDN, the data does not.
- Look: "calm workbench", light and dark themes, custom themes (JSON export and import).

## 2. Snapshot

| Item | Value |
|---|---|
| Location | the repo root (clone of Power-Platform-1919/Structura-V2) |
| Remote | https://github.com/Power-Platform-1919/Structura-V2 (public), branches dev, test, prod; main mirrors prod |
| Stack | Vanilla JS custom elements (no Shadow DOM), plain `<script>` tags, no build step, no ES modules in app code |
| Namespace | everything under `window.Structra`. No `window.App`, no V1 compatibility layers |
| Entry point | `index.html` (`structra-v2.html` and `samples/` are old design prototypes) |
| Dev dependency | `playwright` only, for the smoke and perf scripts |

## 3. Run and test

- Serve over HTTP: `npm run serve` (python on port 8765). Browsers cache scripts, so when testing by hand reload changed files with `fetch(url, { cache: 'reload' })` and open the page with a new query string.
- `npm test` runs the Node unit tests (`tests/unit`: engine analysis, schema generation, expressions and paths, insights). The harness loads the pure modules from `src/core` into Node.
- `npm run test:smoke` opens all 30 fixtures in `tests/fixtures` in a real browser, visits six views each, opens and closes ten dialogs, and fails on any page error. `PW_CHANNEL=msedge` uses the installed Edge instead of downloading Chromium.
- `node tests/perf/large.js <file.json> [overview]` measures time to first view and the longest page freeze. Large fixtures live in `..\structra-v1\Tests` (`perf_100k.json` 37 MB, `perf_150k_complex.json` 88 MB).
- Push: plain `git push` picks the wrong GitHub login. Use `git -c credential.helper= -c "credential.helper=!gh auth git-credential" push origin main`.
- Shell: the Bash tool breaks on backticks in heredocs. Write scripts with the file tool and run them from a file.

## 4. Architecture

- `StructraComponent` (`core/component-base.js`): `init`, `render`, `on/emit`, `queryOne`, `queryAll`. `StructraDialog` (`core/dialog-base.js`) extends it for every dialog: `mount({ title, body, foot, head, size })`, `open`, `close`, Escape, backdrop, focus trap. Sizes `sm md lg xl`; add `flush` for edge-to-edge content.
- State and events (`core/app-state-and-events.js`): `Structra.setState(key, value)` emits `state:<key>`. Views: `overview tree table graph schema editor` (`constants.VIEWS`; Ctrl+1 to Ctrl+5 map to tree, table, graph, schema, overview).
- Paths in `currentPath` have no leading `$`. `Structra.dataPaths` accepts both.
- Shared helpers: `Structra.sharedHelpers` (escapeHtml, jsonTypeOf, naming styles, formatBytes, timeAgo, debounce, yieldToBrowser, runWhenIdle, copyToClipboard, downloadFile, uniqueId). Write general logic there once.
- Icons: `Structra.icons.svg(name, { size, cls, color, stroke })` wraps the Lucide library (CDN with `src/vendor/lucide.min.js` fallback). `color` takes a theme token name (accent, success, warning, danger, info, muted, syn-*) or any CSS colour. `<i data-icon="name">` placeholders in HTML are filled on load.
- Theme (`core/theme-engine.js`): 17 base colours, the rest derived with `color-mix()`. Modes light, dark, system. 8 built-in themes, custom themes saved in localStorage `structra.theme`, JSON format `{ format: 'structra-theme', version: 1, name, mode, colors, fonts? }`. Appearance dialog: `structra-theme`.
- Engine (`core/data-engine.js`): per-tab datasets. Analysis is computed once per dataset (`getAnalysis`), time-sliced. DuckDB WASM is optional and loads on demand (`enableSql`); the JavaScript path is the fallback by design. `_tableOf(ds)` gives the DuckDB table name.
- Insights (`core/overview-insights.js`): pure logic that turns an analysis into the Overview: headline sentence, key figures, findings with a place to jump to, biggest lists (grouped by pattern).
- Session: tabs, view, path and the stored original are saved to IndexedDB and restored on load. The original is stored once the page is idle, so a reload within a few seconds of opening a file restores an empty tab.

## 5. Power Platform (`core/power-platform-expressions.js`, `core/parse-json-schema-generator.js`, `core/data-paths.js`)

- Source model: `Structra.powerPlatformExpressions.getSource()/setSource()` (kind action, trigger, item or custom; name; Power Fx variable; whole-output detection). Saved in localStorage `structra.ppSource`. Emits `expressions:source-changed`.
- Power Automate paths are null-safe at every step (`?['key']`, `?[0]`). A whole action output (`statusCode`, `headers`, `body`) is detected so `body` is not repeated.
- Power Fx: reads `ParseJSON(variable)`; typed tables convert each column by its real type (Value, Boolean, DateValue, DateTimeValue, Text); nested columns are left out; names that are not plain identifiers are single-quoted. Syntax checked against Microsoft Learn.
- Flow actions (`flowActions(path, value)`): Select, Filter array (Query), Apply to each (Foreach), Compose, Condition (If) as paste-ready action JSON. `empty()` is only used on text, lists and objects; numbers and flags are checked against null.
- Parse JSON schema: `smart(value, { integers, required })`: nullable keys as type lists (`["string","null"]`), objects and lists merged across rows, mixed scalars as type lists, "number" by default (safe), optional integer typing and optional `required`.
- UI: drawer tabs Analyze, Expressions (sub-tabs Power Automate, Canvas app, Flow actions, Helpers; a Source bar), Schema Gen (toggles for integers and required). Rail button "Power Platform" opens the Expressions tab.

## 6. Files

Core (`src/core`): `base overlay util logger settings constants theme state icons libs paths expressions schema-gen insights json-tools share navigation bookmarks resizer persistence worker-pool virtual-list json-tree engine duckdb code-gen data-mask format-convert mock-gen transform-ops undo-stack`.
Components (`src/components`): shell (`header tabs rail status toast breadcrumb canvas-header view-switcher drawer`), views (`overview tree table graph schema editor`), drawer panels (`drawer-stats expressions schemagen`), panels (`query context`), input (`input-panel find filter autocomplete`), dialogs on the overlay base (`theme welcome validate charts shortcuts typedef diff nullfinder pivot snippets workspace`), others (`command loading minimap heatmap zoom`).
CSS (`src/css`, load order): `tokens base ui layout shell overview panels overlays components theme-panel`. Use `var(--*)` tokens; shared patterns (dialogs, `.seg`, `.tabs`, `.menu`, `.field`, `.card`, `.tag`) live in `ui.css`. `components.css` still holds older view styles (tree, table, graph, input panel).
Workers: `src/workers` (csv, yaml, toml, xml parsers, engine worker). JSON itself is parsed on the main thread (copying data to a worker cost more than parsing it).

## 7. Behaviours worth knowing

- A new document opens on the Overview (up to 120 MB; above that, the tree).
- Toolbar buttons can be hidden with a right-click; hidden ones sit under "..." with "Show all buttons" (also a palette command). Saved in localStorage `structra.toolbarHidden`.
- Welcome dialog shows once (`structra.welcomeSeen`); reopen from the palette ("Welcome"). Ctrl+V on an empty tab loads the clipboard. One-time tip after the first document (`structra.tipExpressions`).
- Rail buttons: Explorer (new tab on Recent), Query, Power Platform, Overview, Transform, Settings (Appearance). The highlight shows what is open.
- Palette (Ctrl+K) covers every toolbar action plus views, tools, code generation, export, analysis, zoom (including fit), unmask, navigation, new tab, load from URL.
- Table: sort, column filters, hide, move, expand object columns, chart a column; virtual list above 200 rows.
- Documents that are only null, false, 0 or an empty string cannot be opened (jsonData doubles as the has-data flag); the app says so.

## 7b. Code boxes (added later)

SQL editor, JSON editor and the read-only code come from `Structra.codeView` (`core/code-view.js`) on CodeMirror 6 (`src/libs/codemirror6`, built by `npm run build:editor` from `tools/editor/entry.js`, MIT). See docs/DEVELOPER-GUIDE.md section 6 for the API and the rules for large text. Editor view: opens files up to 100 MB; text typed but not applied is kept per tab; the validity check waits longer for bigger text.

## 8. Measured performance (Edge, `tests/perf/large.js`)

| File | First view | Worst page freeze | Heap |
|---|---|---|---|
| perf_100k.json, 37 MB | 0.5 s | 0.15 s | 77 MB |
| perf_150k_complex.json, 88 MB | 2.0 s | 0.67 s | 210 MB |

## 9. Known gaps and ideas

- No cancel button for very large files, and no progress beyond the loading overlay steps.
- Unit tests (47) cover engine analysis, schema generation, expressions, paths and insights. The DuckDB paths and the views are covered only by the browser smoke test.
- Share links are limited to about 30 KB of encoded data.
- `components.css` is still large (view styles for tree, table, graph and the input panel); more can move to the shared patterns.
- `docs/` (except DEVELOPER-GUIDE.md), `samples/` and `structra-v2.html` are history and can be deleted.
- Overview and the new toolbar menu have been checked in dark mode more than light mode.
