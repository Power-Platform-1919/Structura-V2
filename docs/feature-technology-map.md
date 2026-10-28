# Feature and technology map: what each part is built with, why, and what we plan to change

Written 2026-10-27 from the code (every file under `src/`), the vendored libraries, the tests, and web research. Where a reason is written down in a code comment or doc, it is marked **recorded**. Where I worked out the reason from the code, it is marked **inferred**. Where there is no way to tell, it says so.

## Where things stand (2026-10-27)

| Item | State |
|---|---|
| Pull request #6 (deep-dive fixes, accessibility, Firefox and WebKit tests) | open against `dev`; CI green for lint, unit, Chromium, Firefox and the UI audit |
| Pull request #7 (JSONPath through json-p3), stacked on #6 | open |
| Table branch (`feature/table-grid`) | built and tested in three engines; you chose to keep the library (Q1); being finished (wrap the library in one module) and merged |
| Your answers | recorded in [QUESTIONS.md](QUESTIONS.md) (answered log); still open: Q3 (path model, explained there), Q18 (offline install, explained there), Q21 (archive folder name) |
| Merged, promoted to `test` or `prod` | nothing from this work yet; nothing moves without your word |
| This map and the task list | `docs/TODO.md` (made from `todo.json`) tracks every step: 66 of 299 steps done, 14 waiting on a decision. Open questions: [QUESTIONS.md](QUESTIONS.md) |

**To see or change progress:** `node tools/todo.mjs list` shows every task, `node tools/todo.mjs list 18.1` shows one task with all its steps, `node tools/todo.mjs set 18.1.3 done` marks a step. The parent task, `docs/TODO.md` and the unit test follow. Each planned change in section 3 names its task.

Important: the first version of this map was incomplete, and an audit of every file against it found gaps (section 1.2). A second audit ran hand-written code against standards and mature libraries and found real bugs (sections 2.9 and 8). Treat sections 1.2, 2.9 and 8 as part of the map.

How this document is organised: section 1 is the app in numbers, section 2 goes through every UI component function by function (what it is built with, whether it is hand-written, what it depends on, who uses it, what we plan), section 3 explains each planned change with reasons, pros and cons, section 4 is the suggested order, 5 and 6 are what I could not verify and the sources, 7 is what I need from you.

Companion documents: [deep-dive-analysis-2026-10.md](deep-dive-analysis-2026-10.md) (bugs found and fixed), [mature-libraries-plan.md](mature-libraries-plan.md) (measurements and the CodeMirror Tree MVP).

Verdict words used below:

| Word | Meaning |
|---|---|
| KEEP | stays as it is |
| FIX | stays our own code, with a known problem to fix |
| UPGRADE | same library, newer version |
| REPLACE | swap our code or an old library for a better one |
| PLATFORM | use a browser feature instead of our code |
| WATCH | wait for something outside our control |
| DECIDE | needs your decision |
| DONE / IN PR | already changed (the pull request number is given) |

## 1. The app in numbers

- Vanilla JavaScript custom elements. No framework, no build for the app. Everything hangs off one global, `window.Structra`.
- 41 components (11,106 lines), 34 core modules (9,378 lines), 5 workers, 3,890 lines of CSS in 12 files. The biggest files: `structra-table.js` (1,394), `data-engine.js` (2,094), `json-tree-renderer.js` (1,078), `structra-input-panel.js` (941), `power-platform-expressions.js` (862).
- Tests: 10 unit test files, 32 browser test files (35 runs), 9 UI audit scripts (one of them axe-core), CI with 4 jobs. Browsers: Chromium, Firefox and WebKit.
- Hosting: static files, GitHub Pages from the `prod` branch. Data never leaves the page (recorded in `memory-bank.md`). Everything including fonts and icons is served from the app's own folder (recorded in `library-loader.js` and `fonts.css`).

### Libraries inside the app (vendored in `src/libs`, `src/vendor`)

| Library | Version here | Latest | Size here | Used for | Notes |
|---|---|---|---|---|---|
| CodeMirror 6 | built with esbuild from npm | current | 800 KB folder, lazy | every code box | modern, mature |
| DuckDB-Wasm | engine v1.1.1 (September 2024) | npm 1.33.1-dev57; 2.0 announced as a draft | 35.7 MB wasm, lazy | SQL, filter, pivot, find at scale | about two years behind |
| jsondiffpatch | 0.7.x | 0.7.6 | 143 KB | Compare | current |
| Ajv | **6.12.6 (2020)** | **8.20.0** | 122 KB | schema validation | end of life, see 3.6 |
| jsonrepair | current | 3.15.0 | 6 KB | "Fix it for me" | current |
| PapaParse | 5.5.3 | 5.5.x | 19 KB | CSV | current |
| yaml | 2.9.1 | 2.9.1 | 98 KB | YAML | REPLACED js-yaml on 2026-10-28 (task 31.5): the official suite showed js-yaml refusing 17 multi-document files and 26 valid ones; `yaml` accepts all 274 |
| toml | **4.1.1** | **5.0.1 (TOML 1.1)** | 33 KB | TOML | one major behind |
| html2canvas | **1.4.1 (January 2022)** | same, no newer release | 199 KB, lazy | save as PNG | not updated in almost 5 years |
| Lucide | **1.63.0** (was 0.468.0) | 1.63.0 | **25 KB, only the 130 icons the code names** (was 358 KB, the whole set) | icons | 79 names in icon calls |
| json-p3 | 3.0.1 | 3.0.1 | 64 KB | JSONPath | IN PR #7 |
| jsonc-parser | 3.3.1 | 3.3.1 | 21 KB | where JSON is broken | IN PR #6 |
| @tanstack/virtual-core | 3.19.8 | 3.19.8 | 33 KB | Table scrollbar | Table branch, not merged |
| IBM Plex Sans, JetBrains Mono | self-hosted woff2 | | | fonts | offline and private |

### 1.2 Parts of the product that are not UI components

An audit of every file in the repository against this document found these were missing from the first version. They are part of the product and of its upkeep.

| Part | What it is | Notes and plan |
|---|---|---|
| Deployment | `deploy-pages.yml`: every push to `prod` publishes `index.html`, `src` and `icons` to GitHub Pages | DONE 2026-10-28: `samples/` (old design prototypes) was published to the public site; it is now in `archive/` and no longer published (3.20) |
| Branch mirror | `mirror-prod-to-main.yml`: makes `main` identical to `prod` | KEEP |
| CI | `ci.yml`: lint and unit tests; Chromium browser tests; Firefox and WebKit (not blocking yet); UI audit with axe-core | KEEP |
| Old prototypes | `archive/structra-v2.html` and `archive/samples/` | DONE 2026-10-28: moved out of the root into `archive/` (see `archive/README.md`, review and delete later) |
| `templates/` | an empty folder (not in git) | delete |
| `todo.json` | the task list carried over from V1 (tasks 1 to 12) | KEEP; refresh |
| Tooling | `eslint.config.js`, `package.json` (dev dependencies: Playwright, axe-core), the VS Code workspace file | KEEP |
| `tools/` | build scripts that produce vendored libraries once (`fetch-json-test-suite.mjs`, `fetch-json-schema-test-suite.mjs`, `fetch-csv-spectrum.mjs`, `fetch-toml-test.mjs` and `fetch-yaml-test-suite.mjs` and `fetch-xml-conformance.mjs`, which collect the JSONTestSuite, JSON Schema Test Suite, csv-spectrum, toml-test, YAML Test Suite and W3C XML conformance cases; `build-yaml.mjs` builds the yaml library; `build-lucide.mjs` builds the icon file): CodeMirror (`build-editor.mjs`), jsonc-parser, virtual-core | KEEP |
| CSS system (12 files, all own, no CSS framework) | `fonts.css` self-hosted fonts; `tokens.css` design tokens (colours, spacing, type); `base.css` reset, typography, `.sr-only`; `ui.css` shared patterns (dialogs, segmented buttons, menus, fields, cards, tags); `layout.css` the app grid; `shell.css` header, rail, tab bar, status bar; `overview.css`; `panels.css` query and node panels; `codeview.css` the CodeMirror look; `overlays.css`; `components.css` (2,116 lines, the older view styles: tree, table, graph, input panel); `theme-panel.css` | KEEP; split `components.css` by view when touched |
| Small shared modules | `component-base.js` (the base class); `dialog-base.js` (`StructraDialog`, and `Structra.closeTop`, which makes Escape close one thing at a time); `safe-storage.js` (a memory store when the browser blocks localStorage); `src/libs/csv-typing.js` (own: types CSV cells, reads "1,200.00" as 1200, keeps decimals) | KEEP; the base classes get cleanup (3.14) |
| `archive/engine-worker.js` (was `src/workers/engine-worker.js`) | claimed to move search, filter, sort and aggregate of large data into a worker | DONE 2026-10-28: nothing started it, but `index.html` loaded it as a plain script, so it took over `window.onmessage` on the page. Script tag removed, file archived (3.20) |
| Saved in the browser | localStorage keys: `structra.theme`, `structra.welcomeSeen`, `structra.toolbarHidden`, `structra.drawerH`, `structra.panelWidth.<name>`, `structra.logMode`, `structra.ppSource`, `structra.sqlHistory`, one-time tip flags, `structra_setting_<name>` (font size, page size ...), `structra_bookmarks`, `structra_query_history`, `structra_recent`, `structra_snippets`. IndexedDB: recents, the original text of each file (by content hash), the session, URL history. DuckDB's database file in OPFS (claimed in the adapter, to be re-checked, 3.7) | KEEP; `Settings` can clear it |
| Not present | a service worker or web manifest (no install, no offline cache); a **global error handler** (an uncaught error reaches only the console); a Content-Security-Policy | see 3.20 |

## 2. UI components, function by function

How to read this section. Each heading is one UI component (a custom element such as `<structra-tree>`, or a piece of the page shell). Under it, each row is one thing a person can do with it, or one job it does.

| Column | Meaning |
|---|---|
| **Built with** | what actually does the work |
| **Origin** | **Own** = hand-written by us. **Library** = a third-party library does the work. **Browser** = a feature of the browser itself. **Own + library** and **Own + browser** = our code around one of them. |
| **Depends on** | the shared modules (section 2.7) and libraries it calls |
| **Used by** | who embeds this component or calls this function; for events, who listens |
| **Plan** | the verdict (words at the top of this document); details in section 3 |

Every component is built on one small base class, `StructraComponent` (own, 94 lines). Twelve of them (Charts, Compare, Null finder, Pivot, Settings, Shortcuts, Snippets, Theme, Typedef, Validate, Welcome, Workspace) are dialogs built on our own `StructraDialog` (plan: the browser's `<dialog>`, see 3.4). The command palette and the input panel are overlays with their own code. All the Lucide icons come through one module, `Structra.icons`.

### 2.1 The page frame

#### Page shell and bootstrap: `index.html`, `src/app.js`, `layout.css`, `shell.css`

| Function | Built with | Origin | Depends on | Used by | Plan |
|---|---|---|---|---|---|
| Lay out the header, tab bar, rail, query panel, canvas, context panel, status bar | CSS grid | Own | design tokens (`tokens.css`) | everything | KEEP |
| Create the first tab, mount the six views into their panels, wire keyboard shortcuts (find, filter, new tab, close tab, zoom) | plain JavaScript | Own | `Structra.tabs`, `constants` (shortcut map) | the whole app | KEEP; split later (372 lines) |
| Load libraries on demand | `Structra.libraryLoader` (82 lines) | Own | the vendored files in `src/libs` | CodeMirror, DuckDB, jsondiffpatch, Ajv, jsonrepair, html2canvas, jsonc-parser, json-p3, virtual-core | KEEP |

#### View switcher: `<structra-view-switcher>`

| Function | Built with | Origin | Depends on | Used by | Plan |
|---|---|---|---|---|---|
| Show one of six view panels (overview, tree, table, graph, schema, editor) and announce `view:switched` | CSS classes and an event | Own | `constants.VIEWS` | `app.js`; listeners of `view:switched`: editor, graph, heatmap, minimap, overview, schema, table | KEEP |

#### Header: `<structra-header>`

| Function | Built with | Origin | Depends on | Used by | Plan |
|---|---|---|---|---|---|
| Brand and a hidden page heading | HTML | Own | icons | `index.html` | KEEP (heading added in PR #6 for accessibility) |
| Back and forward through the paths you visited (Alt+Left, Alt+Right) | `Structra.pathHistory`, one history per tab | Own | pathHistory | the header; also the command palette | KEEP |
| Path bar: type a path or click an element, press Enter | text input plus `dataPaths` | Own | dataPaths | emits `tree:navigate-path`, which the Tree listens to | KEEP |
| Copy the path | Clipboard API with a fallback | Own + browser | sharedHelpers | header, command palette | KEEP |
| Bookmark this path (Ctrl+B) and the list of bookmarks | `Structra.bookmarks`, saved in localStorage per file name | Own | bookmarks | Tree (markers), context panel (list), workspace export | KEEP |
| Light and dark switch | theme engine | Own | themeEngine | header | KEEP |
| Button that opens the command palette | HTML | Own | | header | KEEP |

#### Path suggestions: `<structra-autocomplete>` (inside the header)

| Function | Built with | Origin | Depends on | Used by | Plan |
|---|---|---|---|---|---|
| Suggest the next key or index while typing a path, from the open document itself | own completion logic | Own | dataPaths, sharedHelpers | header path bar | KEEP |

#### Breadcrumb: `<structra-breadcrumb>`

| Function | Built with | Origin | Depends on | Used by | Plan |
|---|---|---|---|---|---|
| Show the selected path as clickable segments; click one to jump back up | HTML | Own | dataPaths | `state:currentPath` | KEEP |

#### Document tabs: `<structra-tabs>`

| Function | Built with | Origin | Depends on | Used by | Plan |
|---|---|---|---|---|---|
| New tab (Alt+N), switch, close, reopen a closed tab | own tab model (`Structra.tabs`) | Own | dataEngine (one dataset per tab), constants | header, rail, command palette; `tabs:*` events are heard by editor, query, expressions, filter, overview, pivot, schemagen, status, undo stack, path history | KEEP |
| Rename a tab | HTML input | Own | | tabs | KEEP |
| Reorder tabs by dragging | native HTML drag and drop | Browser | | tabs | FIX: no keyboard way (3.13) |
| Arrow keys move between tabs, Enter or Space switches | key handler, `role="tablist"` | Own | | tabs | KEEP |
| Tab context menu | own positioned menu | Own | | tabs | KEEP |
| Save and restore the open tabs, their data and view | IndexedDB through `Structra.browserDatabase` (267 lines) | Own + browser | browserDatabase | dataEngine | KEEP |

#### Left rail: `<structra-rail>`

| Function | Built with | Origin | Depends on | Used by | Plan |
|---|---|---|---|---|---|
| Icon buttons: open data, Query and Transform, Power Platform, Overview, Themes, Settings | HTML buttons | Own | icons | `index.html`; opens the input panel, query panel, drawer, settings | KEEP |

#### Canvas header: `<structra-canvas-header>`

| Function | Built with | Origin | Depends on | Used by | Plan |
|---|---|---|---|---|---|
| View tabs (Overview, Tree, Table, Graph, Schema, Editor) | HTML | Own | constants | `state:activeView` | KEEP |
| Tree toolbar: expand all, collapse all, show levels 1, 2, 3, wrap long values | buttons that emit `tree:*` events | Own | | the Tree listens | KEEP |
| Find, Filter, Copy JSON buttons | buttons | Own + browser (clipboard) | sharedHelpers | find, filter bars | KEEP |
| Hide toolbar buttons you do not use, "more" menu | context menu, saved in localStorage | Own | | canvas header | KEEP |

#### Status bar: `<structra-status>`

| Function | Built with | Origin | Depends on | Used by | Plan |
|---|---|---|---|---|---|
| Ready dot, file name and size, current path | HTML | Own | dataEngine | `state:*` events | KEEP |
| Duplicate keys warning | engine finding | Own | `state:duplicateKeys` | status | KEEP |
| SQL engine state (idle, starting, ready, failed) | `engine:duckdb-*` events | Own | dataEngine | status | KEEP |
| Developer: console log mode (click to cycle) | `Structra.log` | Own | log | status | KEEP |

#### Small shell parts

| Component | Function | Built with | Origin | Depends on / Used by | Plan |
|---|---|---|---|---|---|
| `<structra-toast>` | Floating message, can hold a button, stays while hovered, screen reader announces it (`aria-live`) | HTML, CSS | Own | listens to `toast`; used by almost every component | KEEP |
| `<structra-loading>` | Full-screen spinner while a big operation runs | HTML, CSS | Own | `loading:show`, `loading:hide` from data engine, editor, input panel, Tree | KEEP |
| `<structra-zoom>` | Ctrl plus and minus zoom, fit to screen, reset, remembered | CSS variable, localStorage | Own | keyboard shortcuts | KEEP |
| `<structra-welcome>` | First visit dialog: what the app is for, pick light or dark, open a sample | dialog base | Own | command palette, first run | KEEP |
| `<structra-settings>` | Appearance, shortcuts, turn the SQL engine on or off, clear what is saved in this browser | dialog base, localStorage | Own | rail, command palette; depends on appSettings, dataEngine | KEEP |
| `<structra-shortcuts>` | List of keyboard shortcuts by category | dialog base | Own | command palette, settings | KEEP |
| `<structra-workspace>` | Export or import everything (tabs and data, settings, bookmarks, query history, snippets, undo history) as one file | dialog base | Own | command palette | KEEP |
| `<structra-theme>` | Light, dark or system; 8 built-in themes; build your own with live preview and contrast check (4.5 to 1); export and import as JSON | dialog base, `themeEngine` (17 base colours, the rest derived with CSS `color-mix()`) | Own | rail, header, command palette | KEEP |
| Fonts | IBM Plex Sans and JetBrains Mono, self-hosted woff2 | Library (open fonts, our copy) | | `fonts.css` | KEEP |

### 2.2 Getting data in: `<structra-input-panel>` (941 lines, the same card in the empty state and as an overlay)

| Function | Built with | Origin | Depends on | Used by | Plan |
|---|---|---|---|---|---|
| Open a file by picker or drag and drop | File API, drag and drop | Own + browser | sharedHelpers | `index.html` empty state; rail and command palette show its tabs (`input:show-tab`) | KEEP |
| Paste text, or press Ctrl+V anywhere on an empty tab, with a banner when the clipboard looks like data | paste events | Own + browser | | the whole page | KEEP |
| Work out the format: JSON, CSV or TSV, XML, YAML, TOML, JSON lines; say plainly when a file is a zip or an Excel workbook | own detection (`_detectFormat`, `_binaryKind`) | Own | | input panel | KEEP |
| Read JSON | `JSON.parse` on the main thread, after a scan that keeps numbers the browser would round (`protectBigNumbers`) | Own + browser | parseJsonAsync | input panel, editor | KEEP (recorded: a worker is slower here) |
| Read CSV or TSV | PapaParse in a worker | Library | parseCsvAsync, worker pool | input panel | KEEP |
| Read XML | the browser's `DOMParser` in a worker | Browser | parseXmlAsync | input panel | KEEP |
| Read YAML | yaml 2.9.1 through `Structra.yamlIo`, in a worker | Library | parseYamlAsync | input panel | DONE 2026-10-28: several documents become a list, unknown tags keep their values, << merges work |
| Read TOML | toml 4.1.1 in a worker | Library | parseTomlAsync | input panel | UPGRADE to 5.0.1 (3.9) |
| Load from a URL: method, headers, auth fields, send | `fetch` | Own + browser | | input panel | KEEP (only works where the server allows it) |
| Decode a JWT (the pasted token's parts) | own decoding | Own | | input panel | KEEP |
| Recent files | list saved in IndexedDB and localStorage | Own + browser | browserDatabase | input panel | KEEP |
| Open a sample | built-in data | Own | | input panel, welcome | KEEP |
| Explain why text is not valid and offer "Fix it for me" | own message reading, jsonrepair | Own + library | jsonRepairAndValidation | input panel | **FIX**: the place ("around line N") is read from the browser's message, so Safari and Firefox show no place. Use jsonc-parser here too (3.14) |
| Command: Share as link, Export as CSV, YAML, XML, image | see the command palette (2.6) | | | | |

### 2.3 The views (mounted by `app.js` into the view switcher)

#### Overview: `<structra-overview>` (698 lines)

| Function | Built with | Origin | Depends on | Used by | Plan |
|---|---|---|---|---|---|
| One sentence on what the file is, headline figures, findings worth a look (each with a jump link), the biggest lists grouped by pattern | `Structra.overviewInsights` turns the engine's analysis into plain language | Own | dataEngine, overviewInsights, powerPlatformExpressions | first screen when a file opens; the rail | KEEP (the product's main idea) |
| Type distribution (bar pills) | HTML and CSS | Own | dataEngine | overview | KEEP |
| Data quality score (donut, completeness, consistency, uniqueness) | hand-made SVG | Own | dataEngine | overview | KEEP |
| Arrays found: click to open, drill into nested arrays, go back | HTML | Own | dataPaths | overview | KEEP |
| Key coverage table: present, empty, missing; show the rows that miss a key; nested drill; list of row numbers | HTML with its own windowing (`_setupVirtualScroll`) | Own | dataEngine | overview | KEEP |
| Field profiler: type, coverage, min, max, average, top values, distribution | HTML, SVG | Own | dataEngine | overview; also opened from the drawer stats | KEEP |
| Jump to the Tree, Find or drawer from a finding | events (`tree:node-selected`, `tree:search-key`, `drawer:show`) | Own | | Tree, Find, drawer | KEEP |

#### Tree: `<structra-tree>` and `json-tree-renderer.js` (1,410 lines together)

| Function | Built with | Origin | Depends on | Used by | Plan |
|---|---|---|---|---|---|
| Draw the document as an indented tree with a line-number margin | own renderer building HTML | Own | dataPaths | `app.js`; listeners: context panel (`tree:node-selected`), heatmap, minimap | DECIDE by numbers: one tree for the whole app, CodeMirror or our own (3.1) |
| Long lists drawn 100 items at a time while you scroll; chunks far away are emptied and drawn again | own chunking, `IntersectionObserver` | Own + browser | | Tree | KEEP in Classic |
| Collapse or expand a block, all blocks, or to depth 1, 2, 3 | own, state kept in `treeState` | Own | | canvas header buttons, command palette, keyboard | KEEP |
| Click a line to select its path; click a key to highlight the same key everywhere; double-click a key to find it; double-click a value to edit it | delegated events | Own | dataPaths | Tree | KEEP |
| Right-click menu: copy path, value, subtree; Power Automate expression; Power Fx formula; copy as type definition (7 languages); show as a table; open a text value that holds JSON in a new tab; find this value; copy mock data; bookmark | own menu | Own | powerPlatformExpressions, typeCodeGenerator, mockDataGenerator, bookmarks | Tree | KEEP |
| Keyboard: arrows, Home, End, PageUp, PageDown, Enter, Left and Right to fold | own key handler | Own | | Tree | KEEP |
| Wrap long values | CSS | Own | | canvas header | KEEP |
| Show Find matches and hide non-matching lines (filter) | classes set from the engine's matched paths | Own | dataEngine | Find, Filter | KEEP |
| Show bookmarked lines | class on the line | Own | bookmarks | Tree | KEEP |
| Hidden and direction-changing characters shown as marks | own list of characters | Own | | Tree | DONE (PR #6) |

#### Table: `<structra-table>` (1,394 lines)

| Function | Built with | Origin | Depends on | Used by | Plan |
|---|---|---|---|---|---|
| Rows and columns of the main list (or of a Find, Filter or SQL result) | engine data, own HTML builder | Own | dataEngine, dataPaths | `app.js`; consumers of its `tree:node-selected` | KEEP |
| Sort by a column (header click, Enter, or menu) | engine sort | Own | dataEngine | Table | KEEP |
| Filter a column: text, pick values, conditions | own filter panel | Own | | Table | KEEP |
| Hide, show, move columns; "draw more columns" past 80 | own | Own | | Table | KEEP |
| Split an object column into sub-columns and join back | own projection | Own | | Table | KEEP |
| Column menu: chart this column, summary, every different value, copy the column's values | own | Own | charts (opened by event) | Table | KEEP |
| Show nested values as readable text (Choice, Person, Lookup fields), decimals kept, numbers right-aligned | own formatter | Own | | Table | KEEP |
| Short lists a page at a time (25 to 500 per page) | own pager | Own | appSettings | Table | KEEP |
| Long lists: only the rows on screen are drawn, the scrollbar is the true length | `@tanstack/virtual-core` through `Structra.rowWindow` (the one door) | Own + library | libraryLoader | Table | decided: keep, merging (3.2) |
| Grid for screen readers and keyboard (roles, row index, arrows, Page keys, Home, End, Enter, Shift+F10) | WAI-ARIA grid pattern | Own | | Table | decided: keep, merging (3.2) |
| Selected row follows the path chosen in the Tree, the path bar or Find | `state:currentPath` | Own | | Table | decided: keep, merging (3.2) |

#### Graph: `<structra-graph>` (387 lines)

| Function | Built with | Origin | Depends on | Used by | Plan |
|---|---|---|---|---|---|
| Draw the document as nodes and lines (at most 5 items per list and 8 keys per object, depth limited) | own tree layout, SVG | Own | dataEngine | `app.js` | KEEP |
| Zoom in, out, fit, reset to 100 percent; drag to pan | own transform | Own | | Graph | KEEP |
| Expand a collapsed node or a "more" node | own | Own | | Graph | KEEP |
| Select a node (it becomes the current path) and keyboard activation | `role="button"` on each node | Own | | Graph | FIX: label rule (3.15) |

#### Schema: `<structra-schema>` (120 lines)

| Function | Built with | Origin | Depends on | Used by | Plan |
|---|---|---|---|---|---|
| List every field with its types and whether every record has it | engine inference | Own | dataEngine | `app.js` | KEEP |
| Copy as a JSON Schema ready for the Parse JSON action | `parseJsonSchemaGenerator` | Own | parseJsonSchemaGenerator | Schema | KEEP |

#### Editor: `<structra-editor>` (369 lines)

| Function | Built with | Origin | Depends on | Used by | Plan |
|---|---|---|---|---|---|
| Edit the raw JSON text with colours, line numbers, folding, bracket matching | CodeMirror 6 through `Structra.codeView` | Library | codeView | `app.js` | KEEP |
| Check the text as you type; say where and why it is wrong; click to go there | jsonc-parser | Library + own | jsonRepairAndValidation | Editor | DONE (PR #6) |
| Format, minify, repair, apply | `JSON.stringify`, jsonrepair | Own + library | parseJsonAsync, jsonRepairAndValidation | Editor, command palette | KEEP |
| Keep an unsent draft per tab; refuse to edit very large files | own | Own | undoStack | Editor | KEEP |

#### Minimap and heatmap

| Component | Function | Built with | Origin | Depends on / Used by | Plan |
|---|---|---|---|---|---|
| `<structra-minimap>` | Bird's-eye picture of the structure with a viewport box; click or drag to scroll | `<canvas>` | Own + browser | listens to view and Tree events | KEEP |
| `<structra-heatmap>` | Colour lines by the byte size of their values (Tree and Table) | own size walk, CSS | Own | command palette toggles it | KEEP |

### 2.4 Search and query

#### Find: `<structra-find>` (380 lines)

| Function | Built with | Origin | Depends on | Used by | Plan |
|---|---|---|---|---|---|
| Find text, `key:name`, `$.path` or `SELECT ...` | engine search, DuckDB when ready | Own + library | dataEngine, jsonpathQuery | canvas header, Ctrl+F; opened by the Tree (double-click a key), context panel, command palette | KEEP |
| Fuzzy mode: close matches (substring or Jaro-Winkler 0.8) | own | Own | dataEngine | Find | KEEP |
| Pattern mode: regular expression | `RegExp` | Browser | dataEngine | Find | KEEP |
| Enter and Shift+Enter step through matches, count announced | own | Own | | Find | DONE (PR #6) |
| Replace one or all (text values only) with Ctrl+Z | own | Own | undoStack | Find | KEEP |

#### Filter bar: `<structra-filter>` (328 lines)

| Function | Built with | Origin | Depends on | Used by | Plan |
|---|---|---|---|---|---|
| Structured conditions (column, operator, value, AND or OR) | DuckDB, JavaScript fallback | Own + library | dataEngine | canvas header, Ctrl+Shift+F; every view reads the result (`engine:filter-changed`: Tree, Table, Graph) | KEEP |
| Other modes: JSONPath, pattern, JavaScript expression | json-p3, `RegExp` and `new Function` in the sandbox worker | Own + library | jsonpathQuery, dataEngine, sandbox | Filter | DONE 2026-10-28: pattern and JavaScript run in the sandbox (3.8) |

#### Query panel: `<structra-query>` (722 lines)

| Function | Built with | Origin | Depends on | Used by | Plan |
|---|---|---|---|---|---|
| Path query (our own syntax) | `dataPaths` | Own | dataPaths | rail "Query and Transform" | KEEP |
| JSONPath query | json-p3 | Library + own adapter | jsonpathQuery | Query panel | DONE (PR #7) |
| Pattern query | `RegExp` with a freeze check | Browser + own | | Query panel | KEEP |
| JavaScript query | `new Function` in the sandbox worker (`Structra.sandbox.evaluate`) | Own + browser | sandbox | Query panel | DONE 2026-10-28 (3.8): time limit, no page, no network; the old pre-check in `sharedHelpers.tryCodeInWorker` is removed |
| SQL: editor with suggestions, history, run, export CSV | CodeMirror editor, DuckDB | Library + own | codeView, dataEngine | Query panel | KEEP; DuckDB upgrade WATCH (3.7) |
| Results list: show in the Tree, copy Power Automate or Power Fx expression, copy or open all matches in a tab | own | Own | powerPlatformExpressions, jsonTreeRenderer | Query panel | KEEP |
| Transform: presets and steps (`map`, `filter`, `groupBy`, `sum` ...) | own registry of patterns, run in the sandbox worker (`Structra.sandbox.transform`) | Own + browser | transformStepOperations, sandbox | Query panel | DONE 2026-10-28 (3.8): the word blocklist is gone, the sandbox is the protection |
| Open Pivot | event `pivot:open` | Own | | Query panel | KEEP |

#### Null finder: `<structra-nullfinder>`

| Function | Built with | Origin | Depends on | Used by | Plan |
|---|---|---|---|---|---|
| Scan for null, empty and missing values; next and previous; show in the Tree | DuckDB `IS NULL` queries, in-memory fallback | Own + library | dataEngine, dataPaths | command palette | KEEP |

### 2.5 Side and bottom panels

#### Node panel: `<structra-context>` (the right panel)

| Function | Built with | Origin | Depends on | Used by | Plan |
|---|---|---|---|---|---|
| Show the selected value (preview in a code box), its type and size | CodeMirror for the preview | Library + own | codeView, dataPaths | `tree:node-selected` from Tree, Table, Graph, Overview, header | KEEP |
| Detect patterns in a text value (email, date, URL ...) | own regexes | Own | | Node panel | KEEP |
| Copy value, copy path, find every place this value appears | own | Own + browser | sharedHelpers | Node panel | KEEP |
| Bookmark and the list of bookmarks | `Structra.bookmarks` | Own | bookmarks | Node panel | KEEP |
| Copy the Power Automate or Power Fx expression; copy mock data | own | Own | powerPlatformExpressions, mockDataGenerator | Node panel | KEEP |

#### Bottom drawer: `<structra-drawer>` and its three tabs

| Component | Function | Built with | Origin | Depends on / Used by | Plan |
|---|---|---|---|---|---|
| `<structra-drawer>` | Tabbed panel that folds, grows and can be dragged taller | own | Own | constants, icons; opened by the rail, Overview, context panel, command palette | KEEP |
| `<structra-drawer-stats>` | Mini stats: rows, keys, gaps, quality bar, link to the profiler | own | Own | dataEngine | KEEP |
| `<structra-expressions>` | Power Automate and Power Fx expressions for the selected path: a source bar (action, trigger, item, custom), sub-tabs (Power Automate, Canvas app, Flow actions, Helpers), a column picker, click to copy | own logic, CodeMirror boxes | Own + library | powerPlatformExpressions, codeView | KEEP (our unique value) |
| `<structra-schemagen>` | Parse JSON schema with options: whole file or selected path, read every item for optional and nullable keys, integer typing, `required` | own generator, CodeMirror box | Own + library | parseJsonSchemaGenerator, codeView | KEEP |

### 2.6 Tools and dialogs

#### Command palette: `<structra-command>` (611 lines, Ctrl+K)

| Function | Built with | Origin | Depends on | Used by | Plan |
|---|---|---|---|---|---|
| Search about 55 commands by "contains" on label, id, category | own list and filter | Own | constants | header button, Ctrl+K | later: ranked fuzzy matching (3.12) |
| Switch view (tree, table, graph, schema, editor, overview) | `setState('activeView')` | Own | | | KEEP |
| Power Platform: expressions, copy Power Automate or Power Fx, Parse JSON schema, flow actions, columns | `powerPlatformExpressions`, `parseJsonSchemaGenerator` | Own | | | KEEP |
| Transform: sort keys, flatten, unflatten | own | Own | | | KEEP |
| Mask and unmask personal data | `personalDataMasker` (own regexes) | Own | | | KEEP |
| Mock data and sample data | `mockDataGenerator` (own, 145 lines) | Own | | | KEEP |
| Types: TypeScript, Python, Go, C#, Rust, SQL | `typeCodeGenerator` (own, 467 lines) | Own | | | KEEP |
| Export CSV, YAML, XML | `formatConversion` | Own + library (PapaParse, yaml) | | | KEEP |
| Share as a link | URL hash with gzip through `CompressionStream` | Own + browser | shareLink | | KEEP |
| Save as an image | html2canvas, loaded on first use | Library | imageCapture | | WATCH (3.10) |
| Repair, format, minify JSON | jsonrepair, `JSON.stringify` | Own + library | jsonRepairAndValidation | | KEEP |
| Undo and redo (Ctrl+Z, Ctrl+Y) | `Structra.undoStack` (snapshots, 60 MB per tab) | Own | undoStack | | later: differences (3.11) |
| Open Find, Filter, Fuzzy, SQL, Validate, Charts, Duplicate keys, Compare, Theme, Welcome, zoom, wrap, expand and collapse | events | Own | | | KEEP |

#### Compare: `<structra-diff>` (366 lines)

| Function | Built with | Origin | Depends on | Used by | Plan |
|---|---|---|---|---|---|
| Choose the two sides: an open tab or pasted text; swap sides | own | Own | | command palette | KEEP |
| Work out the differences (values only left, only right, changed; same list items that moved) | jsondiffpatch through `Structra.jsonDiff` | Library + own | jsonDiff | Compare | KEEP |
| Show them as a list, side by side with synchronized scrolling, or inline | CodeMirror panes | Library + own | codeView | Compare | KEEP |
| Copy the changes as a JSON Patch (RFC 6902) | jsondiffpatch's JSON Patch format | Library | jsonDiff | Compare | KEEP |

#### Pivot: `<structra-pivot>` (251 lines)

| Function | Built with | Origin | Depends on | Used by | Plan |
|---|---|---|---|---|---|
| Drag fields to rows, columns and values; choose count, sum, average and so on | native drag and drop | Browser + own | | Query panel, command palette | FIX: needs a keyboard way (3.13) |
| Run the grouping | DuckDB GROUP BY | Library | dataEngine | Pivot | KEEP |
| Copy every row for Excel; open every row as a table in a new tab | own | Own + browser | | Pivot | KEEP |

#### Charts: `<structra-charts>` (221 lines)

| Function | Built with | Origin | Depends on | Used by | Plan |
|---|---|---|---|---|---|
| For one column: summary, histogram, trend line (numbers); most common values (text and flags) | hand-drawn inline SVG, no chart library | Own | dataEngine | Table column menu | KEEP |

#### Validate: `<structra-validate>` (114 lines)

| Function | Built with | Origin | Depends on | Used by | Plan |
|---|---|---|---|---|---|
| Paste a schema, or start from one inferred from the data | `parseJsonSchemaGenerator` | Own | | command palette | KEEP |
| Validate and list errors with "show the first one in the tree" | Ajv 6.12.6 | Library | jsonRepairAndValidation | Validate | KEEP Ajv 6: tested on real schemas, no benefit today (3.6) |

#### Type definitions: `<structra-typedef>`; Snippets: `<structra-snippets>`

| Function | Built with | Origin | Depends on | Used by | Plan |
|---|---|---|---|---|---|
| Show generated code per language tab with colours; copy; download | `typeCodeGenerator`, CodeMirror colouring | Own + library | codeView | Tree right-click, command palette | KEEP |
| Save, use, copy, delete reusable JSON fragments; filter the list | localStorage | Own + browser | sharedHelpers, dataPaths | command palette | KEEP |

### 2.7 Shared building blocks (core modules) and who uses them

The counts are taken from the code: how many files call the module.

| Module | What it is | Built with | Origin | Used by | Plan |
|---|---|---|---|---|---|
| `dataEngine` (2,094 lines) | the data model: one dataset per tab, analysis, search, sort, filter, aggregate, schema, stats, SQL registration, persistence | plain JavaScript, optional DuckDB | Own + library | 18 files: charts, command, drawer-stats, duckdb-adapter, filter, find, graph, input-panel, overview, pivot, power-platform-expressions, query, schema, settings, status, table, tabs, workspace | KEEP; split into modules |
| `duckdbAdapter` | loads DuckDB-Wasm, runs SQL; the JavaScript path is the fallback | DuckDB-Wasm v1.1.1 | Library | dataEngine | WATCH (3.7) |
| `dataPaths` | parse, resolve and format paths | own | Own | 16 files (header, tree, table, query, overview, context ...) | KEEP |
| `jsonpathQuery` | JSONPath | json-p3 plus an adapter | Library + own | query, data engine | DONE (PR #7) |
| `sharedHelpers` | small helpers (escape, debounce, clipboard, download, regex safety check, run code in a worker) | own | Own | about 30 files | KEEP |
| `icons` | every icon | Lucide 1.63.0, only the icons used | Library | 26 files | KEEP (trimmed and upgraded, 3.5) |
| `codeView` | every code box | CodeMirror 6 | Library + own wrapper | context, diff, editor, expressions, input-panel, query, schemagen, typedef | KEEP |
| `jsonTreeRenderer` | the Tree's renderer | own | Own | tree, query | see 3.1 |
| `powerPlatformExpressions` (862 lines) | Power Automate, Power Fx and flow action text for a path | own | Own | command, context, expressions, overview-insights, tree | KEEP (unique) |
| `parseJsonSchemaGenerator` | Parse JSON schema | own | Own | command, schema, schemagen, validate | KEEP (unique) |
| `typeCodeGenerator`, `mockDataGenerator`, `personalDataMasker` | code, sample data, masking | own | Own | tree, typedef, command, context | KEEP |
| `overviewInsights` | plain-language summary | own | Own | overview | KEEP |
| `jsonRepairAndValidation` | repair, duplicate keys, error place, schema validation | jsonrepair, jsonc-parser, Ajv | Library + own | command, editor, input-panel, json-diff, validate | see 3.6 |
| `jsonDiff` | compare two documents | jsondiffpatch | Library + own | diff | KEEP |
| `undoStack` | undo per tab | own snapshots | Own | command, diff, editor, find, workspace | later (3.11) |
| `bookmarks`, `pathHistory` | saved paths, back and forward | localStorage | Own | bookmarks: command, context, header, tree; history: command, header | KEEP |
| `formatConversion`, `shareLink`, `imageCapture` | export, share, PNG | PapaParse, yaml, CompressionStream, html2canvas | Own + library + browser | command | see 3.10 |
| `transformStepOperations` | Transform steps | own; loaded by the sandbox worker and by the unit tests, not by the page | Own | sandbox worker | KEEP |
| `themeEngine` | themes | own, CSS `color-mix()` | Own + browser | header, theme, welcome, workspace | KEEP |
| `appSettings`, `safeStorage`, `browserDatabase` | settings, storage fallbacks, IndexedDB | localStorage, IndexedDB | Own + browser | data engine, input panel, logger, settings, table | KEEP |
| `workerPool` and the parse workers | CSV, XML, YAML, TOML parsing off the main thread | own pool, PapaParse, DOMParser, yaml, toml | Own + library | input panel | FIX: cache (3.14) |
| `libraryLoader` | load libraries on first use | own | Own | code view, DuckDB, diff, repair, JSONPath, share, table | KEEP |
| `rowWindow` (`row-window.js`) | the one door to virtual-core: which rows are on screen, total height, scroll to a row | own wrapper | Own + library | table | KEEP (rule 3, one door per library) |
| `errorReporter` (`error-reporter.js`) | catches uncaught errors and unhandled promise rejections, keeps the last 20, shows one short message with a "Copy a bug report" button, builds a bug report with no document data | own | Own | whole app, worker pool, command palette | KEEP (task 18.4; the planned GitHub issue button is task 28) |
| `yamlIo` (`yaml-io.js`) | the one door to the yaml library: parse (several documents become a list, unknown tags keep their value, << merges) and stringify. The page and the YAML worker load the same file | own wrapper | Own + library | YAML worker, format conversion, worker pool fallback | KEEP (task 31.5, rule 3) |
| `treeModel` (`tree-model.js`) | the rows of the Tree that are showing (typed arrays: kind, depth, parent, index, file line, span), opening and closing blocks as changes to apply to the document, path to row and row to path, windows for huge lists. Knows nothing about CodeMirror or the page | own | Own | the Tree renderer | NEW (task 20.9.2): proved against JSON.stringify and a random open and close walk (tests/unit/tree-model.test.js) |
| `sandbox` (`sandbox.js`) | the one place the person's own code and patterns run: JavaScript, filter expressions, Transform steps, patterns. Sends jobs to the sandbox worker, keeps one copy of the document there, ends the worker at the time limit | own | Own | Query panel, Filter, Find (Pattern), data engine | KEEP (task 19; written once, rule 4) |
| `sandbox-worker` (`src/workers/sandbox-worker.js`) | the worker: protocol `{ id, op, params }`, operations load, evaluate, filter, regex, transform; network, storage and nested workers are removed before any user code runs | own | Own | sandbox | KEEP (task 19) |
| `StructraComponent`, `StructraDialog`, `Structra.events`, `Structra.state`, `Structra.log`, `panelResizer` | base classes, event bus, state, logger, resizer | own | Own | all components | FIX (3.14), dialogs 3.4 |

### 2.8 How much is hand-written?

Counted from the function rows in section 2 (each row is one function of one component):

| Origin | Functions | Share |
|---|---|---|
| Own only | 92 | 66 percent |
| Own around a browser feature | 18 | 13 percent |
| Own around a library | 18 | 13 percent |
| Library only | 8 | 6 percent |
| Browser only | 3 | 2 percent |
| **All function rows** | **139** | |

By code volume it is the other way round. Our own JavaScript is about 1.0 MB (about 21,000 lines) plus 165 KB of CSS. The vendored third-party code is about 2.7 MB of JavaScript (DuckDB's loader 986 KB, CodeMirror 780 KB, Lucide 358 KB, html2canvas 199 KB, the rest about 420 KB) plus 36 MB of DuckDB WebAssembly. So we write most of the behavior, and libraries make up most of the bytes shipped. Only the Lucide set (358 KB) is loaded at the start; DuckDB, CodeMirror, html2canvas and the diff, validation and repair libraries load on first use.

Read it as: most of the app is our own code around the browser's features. The libraries sit behind a handful of modules (`codeView`, `dataEngine` and DuckDB, `jsonDiff`, `jsonRepairAndValidation`, `icons`, the parse workers). The things nothing else could provide are the Power Platform expressions, the Parse JSON schema generator, the Overview insights, the path model and the way all views follow one selected path.

### 2.9 Where the path of a value is written (one idea, six rules; FIXED 2026-10-28: one writer, Structra.dataPaths.child)

The path ("which value is this") is the center of the app, and it is written by hand in at least 16 places. They do not agree. A path written by one place cannot always be read back by another.

| Place | File | Rule it uses | Breaks on |
|---|---|---|---|
| Tree lines | `json-tree-renderer.js` | `.key`; `["key"]` only when the key contains `.` `[` or `]`; quotes in the key are not escaped | an empty key, a key that starts with `$`, a key with a quote |
| Graph nodes | `structra-graph.js` | `.key` for letters, digits and underscore; else `["key"]` with the quote escaped | a key with a quote (the reader cannot undo the escape) |
| Query results (JavaScript, pattern) | `structra-query.js` | `.key` for simple keys, else `['key']` with no escape | a key with a quote |
| Compare | `structra-diff.js` | always `.key` | any key with a dot or bracket |
| Find, Fuzzy, schema inference, path index, first array, all arrays | `data-engine.js` (about 8 places) | always `.key` | any key with a dot or bracket, an empty key |
| Duplicate-key finder | `json-repair-and-validation.js` | `.key` for simple keys, else `["key"]` with no escape | a key with a quote |
| Engine worker (archived) | `archive/engine-worker.js` | always `.key` | not used any more |
| JSONPath results | `jsonpath-query.js` | `.key` for simple keys, else `['key']` with backslash escapes (the standard's form) | the reader cannot read the escapes |
| **The reader** | `data-paths.js` (`tokenize`, `resolve`, `strip`) | reads `.key` up to the next `.` or `[`; `["..."]` up to the next quote and bracket; no escapes; `strip` treats a leading `$` as the root marker | a key with a dot written unquoted, a key that starts with `$`, an escaped quote |

Measured (see section 8): of 13 hostile keys, Find's paths failed to resolve for 5 (`odata.type`, `@odata.etag`, the Dataverse key `_createdby_value@OData.Community.Display.V1.FormattedValue`, `a[0]`, the empty key); the Tree's rule failed for 2 (the empty key and `$ref`); the JSONPath adapter's rule failed for 2 (a key with a quote and a key with a backslash). `$schema` and `$ref` as first-level keys do not resolve at all. Keys like these are normal in Power Platform payloads (OData, Dataverse) and in JSON Schema, OpenAPI and OData metadata documents. See 3.17.

## 3. Planned changes: reason, pros, cons

### 3.1 Tree: one tree for the whole app, on CodeMirror (BUILT 2026-10-28) [task 20]

- **Your rule (Q12):** one Tree, the same everywhere; CodeMirror if it meets every need on large files, otherwise our own renderer.
- **Result:** CodeMirror can, when the document it holds is **the rows that are showing** (a closed block is one line; opening a block replaces that line with the block's lines; the margin shows the file's own line numbers from a typed array). Full write-up with sources and tables: [codemirror-tree-research.md](codemirror-tree-research.md).
- **Numbers (Edge, a 94 MB list of 260,000 records, 6.5 million file lines):** open a block 6 ms (ours: 136 ms painted), 50 blocks in a row at most 12 ms, scroll to the end one frame (ours: 135 ms), **85 lines in the page (ours: 5,003)**. Same shape in Firefox and WebKit. Full file open is the same for both designs (the app's 1.2 to 1.5 s is reading and parsing).
- **Behaviors proven in the prototype:** file line numbers, keyboard (3 ms per key), text selection across rows, find and selection marks that appear when rows scroll in, and a screen reader tree (`role="tree"`, `treeitem` with level, open state and selected state): **axe-core 0 violations** after removing two attributes CodeMirror adds that a tree may not have.
- **Costs:** about 120 KB gzipped of CodeMirror on the critical path of the first Tree (mitigation: start loading when a file is chosen); roughly 600 to 800 new lines replacing 1,071; tests that look at recycling internals are rewritten, the rest keep working because the lines and markers keep the names `.j-line`, `.j-toggle`, `.highlighted` and `.find-match`.
- **Where a tree is drawn:** one place (`structra-tree.js`), so uniformity already holds; the change is the engine behind the same interface.
- **Status:** built (tasks 20.1 to 20.12): `Structra.treeModel` (rows, filter, windows) and the renderer on CodeMirror; every Tree test green in Edge, Firefox and WebKit; the old renderer is in `archive/src-core/json-tree-renderer.js` for review. Large-document budget test: `tests/smoke/tree-large.js`.

### 3.2 Table: true scrollbar, grid roles, keyboard (decided: keep the library; finishing and merging) [task 17]

- **Reason (measured):** the scrollbar knew only the rows already drawn (100,723 px for 100,000 rows), so you could not drag to row 80,000. No ARIA grid roles. No keyboard navigation. The selected row lost its mark when rows were redrawn. A row chosen in the Tree did not show.
- **What changed (branch `feature/table-grid`, not pushed):** only the rows on screen are drawn between two spacer rows, the scroll arithmetic comes from `@tanstack/virtual-core` (33 KB). The table is a grid (rowcount, rowindex, sort state), with arrows, Home, End, Page keys, Enter and Shift+F10. It follows the selected path. Lists above 400,000 rows are shown a page at a time (a browser cannot make an element taller than about 17 million px in Firefox). The old `virtual-list.js` was removed because nothing else used it; a copy goes to `archive/`. A new test (`table-grid.js`, 40 checks) passes in Chromium, Firefox and WebKit.
- **Pros:** a scrollbar that means something; usable with a keyboard and a screen reader; fewer lines of our own virtual-list code; edge cases tested (0, 1, 200, 201, 450,000 rows, 150 columns, window resize).
- **Cons:** a new library dependency (33 KB); lists above 400,000 rows lose continuous scrolling.
- **Your decision (Q1):** keep the library for the scroll arithmetic. To follow the "one door per library" rule it is wrapped in one small core module before the pull request.
- **Not recommended:** Tabulator (101 KB gzipped, arrow keys do nothing by default) and AG Grid Community (345 KB gzipped). Ours was already as fast and lighter.

### 3.3 JSONPath: json-p3 (done, PR #7) [task 16]

- **Reason:** our engine passed 34 percent of the official standard, accepted 126 invalid selectors, rejected 322 valid ones, and froze on `$[::-1]`.
- **Pros:** 715 of 715 tests, fastest of the candidates (122 ms for 200,000 records), MIT, 64 KB, one file.
- **If it fails to load (Q13):** a plain error message, as for most libraries (only DuckDB, jsonc-parser and virtual-core have fallbacks; CodeMirror, Ajv, jsonrepair, jsondiffpatch, html2canvas and PapaParse do not).
- **Cons:** two behavior changes (a `null` field now exists in `[?(@.x)]`; `==` no longer treats "5" and 5 as equal); the query call is now asynchronous; our `=~` pattern test needs a small adapter (done).

### 3.4 Dialogs: the browser's own `<dialog>` (proposed) [task 21.4]

- **Reason:** we maintain our own focus trap, Escape and backdrop logic.
- **Pros:** the browser makes the rest of the page inert and traps focus; one file changes and all 10 dialogs follow; supported since Chrome 37, Firefox 98, Safari 15.4 (MDN data).
- **Cons:** the look of the backdrop and animations must be re-checked; the layout and shell tests need a pass.

### 3.5 Icons: only the icons we use, Lucide 1.63.0 (done) [task 21.3]

- **Reason:** a blocking 358 KB script loads the full icon set (about 1,500 icons) at start, and only **41** are used. The version is 0.468.0 against 1.62.0 today.
- **Done:** `tools/build-lucide.mjs` reads the names the code writes as strings and copies just those icons out of the Lucide 1.63.0 package into `src/libs/lucide/lucide-icons.js` (130 icons, 25 KB, from 358 KB), with the same shape as Lucide's own build, so `Structra.icons` did not change. All 79 names the code asks for exist in 1.63.0 (none was renamed). The old file is in `archive/src-vendor/`.
- **Pros:** about 333 KB less on the first load (measured: 358 KB to 25 KB); newer artwork.
- **Cons:** a new icon name needs the build run once; `tests/unit/icons.test.js` fails when the code names an icon the file does not hold.

### 3.6 Schema validation: Ajv 6 or 8 (tested: keep Ajv 6) [task 22.1]

- **Question (Q14):** is there any benefit for us in upgrading Ajv? Ajv 6.12.6 is from 2020 and no longer maintained; Ajv 8 is current and dropped draft-04 (an add-on package brings it back).
- **Test with real data:** 23 real Parse JSON schemas from 15 of your flows. All 23 compile in Ajv 6 and in Ajv 8 (strict and not strict), with the same speed (about 100 ms to compile all of them; 100,000 records validate in about 3 ms in both). None uses `$schema` or a newer keyword, only `type`, `properties`, `items`, `required` and once `oneOf`. The only difference users would see is the error format (`dataPath` becomes `instancePath`, the wording changes, and Ajv 8 reports a missing required property more precisely).
- **Decision:** no benefit today, so **keep Ajv 6**. Upgrade when a schema needs draft 2019 or 2020, or a security advisory appears (watch list, task 30). The contract test for the validate adapter (task 24) makes a later upgrade safe.

### 3.7 DuckDB-Wasm (watch) [task 22.2]

- **Reason:** the engine is v1.1.1 from September 2024. Newer versions exist (npm 1.33.1-dev57), and a **2.0 announcement is drafted** (smaller binary, simpler bundles, larger-than-memory queries). A September 2026 DuckDB post says the npm "latest" at that time created OPFS files but never wrote to them, so a persistence claim in our adapter ("database file persists across reloads") should be re-checked.
- **Pros of upgrading:** performance, features, possibly a much smaller download.
- **Cons:** 35 MB to re-vendor, SQL behavior differences, a big test pass.
- **Your decision (Q19):** if it improves performance, upgrade; otherwise wait. **Plan:** benchmark the current engine against the newest available (load time, query time on 100,000 rows, memory, download size), decide by the numbers, and re-check the persistence claim now (task 22.2).

### 3.8 User-written code: run it in one sandboxed worker (BUILT 2026-10-28 except two guards, see below) [task 19]

- **Reason:** `new Function` runs user-typed JavaScript in four places (Query panel JavaScript mode, the row filter in the data engine, Transform steps, the engine worker). The Query panel tries the code in a worker first, then runs it again on the main thread. Transform blocks words like `constructor` with a regular expression, which is easy to get around. The user is running their own code, so this is not a break-in. It is a risk when someone pastes an expression from somewhere else, and it can still freeze the page if the second run behaves differently.
- **Plan (approved, Q6):** one worker runs all user code (no access to the page), keeps the data inside, is stopped when the time limit passes. Keep the current syntax. **Shared architecture (your point):** it is built as one generic job service with a single worker protocol that any module can use (user code, patterns, transforms, later other heavy work), written once, and documented so new features use it and do not write their own.
- **Pros:** safer; the page can never freeze; one mechanism instead of four.
- **Cons:** the data is copied into the worker (memory for very large files); results come back as copies; Transform steps must be reworked to run there.
- **Also considered:** JSONata (MIT, about 25 KB gzipped) or jq compiled to WebAssembly as safer expression languages. The research found nothing on how either handles untrusted expressions, and they would change the language users write, so this is an addition for later, not a replacement.

- **What was built:** `Structra.sandbox` (`src/core/sandbox.js`) and `src/workers/sandbox-worker.js`. One protocol (`{ id, op, params }`), four jobs: evaluate (JavaScript), filter (row expression), regex (pattern over the document), transform (steps). The document is copied in once (24 MB: about a quarter of a second, then 0 to 12 ms per job) and dropped when the data changes. A job that runs past its limit (5 seconds) ends the worker; the next job starts it again. Network, storage, nested workers and the page are not reachable (`tests/smoke/sandbox.js` counts the requests a server sees: none). It is a safeguard against accidents and the usual ways code leaks data, not a wall against a determined attacker (for instance `import()` is refused by a text check only).
- **Moved onto it:** Query panel JavaScript and pattern modes, the Filter bar expression, Find in Pattern mode, Transform steps. Removed: `sharedHelpers.tryCodeInWorker`, the Transform word blocklist, the unused engine worker (archived).
- **Tried in the sandbox first, then run on the page:** the pattern test inside JSONPath (`=~`) and the Table's pattern and wildcard filters (18.3.7, 18.3.8).

### 3.9 TOML: 4.1.1 to 5.0.1 (proposed, small) [task 21.2]

- **Reason:** 5.0.1 is TOML 1.1 compliant. `smol-toml` is another maintained option (also 1.1).
- **Pros:** newer spec, bug fixes. **Cons:** a new major version needs one re-test of the TOML fixtures.

### 3.10 Save as PNG: html2canvas (watch, low) [task 22.5]

- **Reason:** html2canvas 1.4.1 was published in January 2022 and has had no release since. `modern-screenshot` (4.7.0, April 2026) and `html-to-image` (1.11.13, February 2025) are maintained.
- **Pros of switching:** maintained code, fewer rendering gaps (comparisons say html-to-image is closer to the real page). **Cons:** the output differs a little for complex CSS; the sources are comparison articles, not benchmarks. It is only used for one lazy button, so this can wait.

### 3.11 Undo: store differences instead of whole copies (proposed) [task 22.3]

- **Reason:** each step is a full copy of the document, capped at 60 MB per tab (PR #6). jsondiffpatch is already in the app.
- **Pros:** much less memory on big files; more steps possible. **Cons:** a change to a core module; undo of an edit that touched many places must be tested well.

### 3.12 Command palette: ranked fuzzy matching (proposed, low) [task 22.4]

- **Reason:** it only matches by "contains". **Plan:** uFuzzy (4 KB gzipped, MIT) for typo tolerant, ranked results.
- **Pros:** finds "exp col" for "Expand collapse"; **Cons:** one more dependency; ranking needs a little tuning.

### 3.13 Keyboard alternatives for drag and drop (proposed) [tasks 21.8 and 21.9]

- **Reason:** tab reordering and Pivot field placement use drag and drop. The research is clear that SortableJS has no keyboard support and native drag and drop has none either, so a library would not fix it.
- **Plan:** "Move left, Move right" for tabs (a keyboard shortcut and a menu item) and "Add to rows, columns, values" buttons for Pivot. **Pros:** a real keyboard path. **Cons:** a little more UI.

### 3.14 Small fixes of our own code [tasks 21.1, 21.5, 21.6 and 25]

- Components: record subscriptions and remove them when an element is removed (`StructraComponent` never does). Also remove a `super.disconnectedCallback()` call in the Table that would throw, because the base class has no such method.
- Input panel: the place of a JSON error ("around line N") is still read from the browser's message, so Safari and Firefox show no place there. Use `explainParseError` (jsonc-parser), as the Editor now does.
- Worker pool: remove `?v=Date.now()` from worker URLs so workers are cached.
- `data-engine.js` (2,094 lines): split into modules.
- `components.css` (2,116 lines): split by view.
- **Pros:** fewer surprises, faster visits, easier to change. **Cons:** pure maintenance, no visible feature.

### 3.15 Graph node labels (decision from you needed) [task 21.7]

- axe-core flags 18 graph nodes: the visible text ends in an ellipsis, the accessible name is the whole label. You asked why not wrap the text. Wrapping fits: draw the label over 2 or 3 lines inside the node and make the node taller (the layout uses one fixed node height, so it needs a per-node height). **Pros:** the full label is visible and the rule passes. **Cons:** the tree layout becomes slightly taller, and the layout code must handle different node heights.

### 3.16 Considered and not recommended

| Option | Why not |
|---|---|
| Lit or another component framework | It would mean rewriting 41 components for a small gain. Sources say Lit is about 5 KB and handles updates for you, but we have no update problem that needs it. The listener bugs came from missing cleanup, which a small fix covers. |
| Tabulator, AG Grid, Perspective for the Table | Heavier, and our Table was already faster or equal (measured). |
| vanilla-jsoneditor for the Tree | 362 KB gzipped on top of CodeMirror, pages arrays 100 items at a time, different experience. |
| Cytoscape, elkjs for the Graph | The Graph is depth limited; elkjs is EPL or GPL licensed. |
| Chart.js, uPlot, ECharts | 22 to 100+ KB for charts that are about 220 lines of SVG. |
| quicktype-core, faker | Megabytes; ours is small and tuned for this app. |
| lossless-json | Our own scan already keeps risky numbers; it is also slower than native parsing. |
| SortableJS | No keyboard support. |
| CSS frameworks | The design tokens and 12 CSS files work; a framework would change every screen. |

### 3.17 One path model (correctness, first priority, proposed) [task 18.1]

- **Reason:** section 2.9. Find returns paths that cannot be read back for any key with a dot or bracket, which is common in the payloads this app exists for. Find's Next and Previous, the highlight, the counts and Compare all depend on it.
- **What mature code does:** JSON Pointer (RFC 6901) and the standard's normalized path (RFC 9535) define exactly how every possible key is written and read. json-p3, which we already ship, produces and reads both (`JSONPointer`, `normalizedPath`).
- **Option A (recommended):** keep our readable dotted form for display and for the Power Platform formatters. Add one function, `Structra.dataPaths.child(path, key)`, that writes every key so it reads back exactly (dotted when the key is simple, `["key"]` with JSON escapes otherwise). Make `tokenize` read escapes and `$`-prefixed keys. Replace the 16 hand-written copies with that one call. Use json-p3 as the oracle in a permanent property test: every path we write must resolve to the same value json-p3 finds with its own normalized path. Saved bookmarks and workspace files keep working, because the new form is a superset of the old.
- **Option B:** make JSON Pointer the internal form and convert to the dotted form only for display. Cleanest in theory. Cons: every saved bookmark, session and workspace file must be converted, and every consumer changes.
- **Pros of A:** fixes a real bug class, deletes duplicated code, one place to maintain, protected by a test. **Cons of A:** touches the data engine (2,094 lines) and six components, so it needs the full test run in three browsers.

### 3.18 CSV export through PapaParse (proposed, small) [task 18.2] (DONE 2026-10-28: one writer, Structra.formatConversion.writeCsv, used by every CSV the app saves)

- **Reason:** our own `escCsv` does not protect against **spreadsheet formula injection**: a cell that starts with `=`, `+`, `-` or `@` runs as a formula when the file is opened in Excel (measured: 4 of 8 dangerous cells came through unchanged). JSON from an API is untrusted text.
- **Plan (Q4):** `Papa.unparse(rows, { columns, escapeFormulae: true })`, always on, with no setting: a CSV file should never contain a formula. Tested with the PapaParse in the app: a text cell that starts with `=`, `+`, `-`, `@` or a tab gets a leading apostrophe; real numbers such as -5 are left alone.
- **Pros:** safe by default, one tested implementation, also handles line breaks, leading and trailing spaces. **Cons:** a cell that starts with `=` or `-` gets a leading apostrophe in the file (that is how the protection works), which some people will notice (a text cell like "-5" becomes '-5, a number does not).

### 3.19 Regular expressions: run them in the worker with a time limit (proposed) [task 18.3]

- **Reason:** the guard `isRiskyRegex` is a heuristic. Against ten well-known catastrophic patterns it caught 8 and missed `(a|aa)+$` and `^(([a-z])+.)+[A-Z]([a-z])+$`. A pattern that gets through freezes the page: it runs on the main thread in Find (Pattern mode), the Filter bar, the Query panel and the JSONPath `=~` test.
- **Plan:** run user patterns in the sandbox worker from 3.8 (a time limit, then the worker is stopped). A ReDoS analyzer library (such as `recheck`) could add an early warning; it is optional.
- **Pros:** the page can never freeze, whatever the pattern. **Cons:** matching a very large document means copying it into the worker (the same cost as 3.8).

- **Built 2026-10-28:** patterns in Find (Pattern mode) and in the Query panel now run in the sandbox worker with a 5 second limit; a stopped pattern says so in plain words ("Pattern too slow" in the Find bar). Firefox gives up on a runaway pattern with "too much recursion"; the service treats that the same way. Safari finishes the classic ones fast on its own.
- **The quick check stays** (`isRiskyRegex`, instant message): 10 of 15 known slow patterns are caught; the 5 it misses are stopped by the sandbox (`tests/unit/regex-guard.test.js` records both lists).
- **Analyzers evaluated (18.3.5):** redos-detector 6.1.4 caught all 15 but flagged `a.*b` and `id=\d+&` as risky and took 4.7 s for 29 patterns (880 KB): too slow and too noisy to run while typing. safe-regex2 5.1.2 caught 13 of 15, no false alarms, 1 ms: a fair early warning but a new dependency for little gain once the sandbox is the net. **Decision: not added.** Revisit if the plain message for the 5 missed patterns matters to people.
- **Patterns that must test once per value on the page** (JSONPath `=~`, the Table pattern and wildcard filter) are tried first in the sandbox on the longest real texts (`Structra.sandbox.probePattern`, 1.5 s) and refused with the plain message if slow (18.3.7, 18.3.8, DONE 2026-10-28). The probe uses real data but cannot prove a pattern safe for every possible text; it catches the usual cases.

### 3.20 Cleanup and hardening (proposed) [task 18.4] (DONE 2026-10-28 except the sandbox-dependent parts; see task 18.4. CSP study: [csp-study.md](csp-study.md); third-party list: [THIRD-PARTY.md](../THIRD-PARTY.md); archive: [archive/README.md](../archive/README.md))

- **Archive, do not delete (Q5):** create `archive/` at the top of the repository (never shipped, linted or published) with a README (what, why, date, review later), and move into it `src/workers/engine-worker.js` (unused), `structra-v2.html`, `samples/` and the old `virtual-list.js`. Delete only the empty `templates/` folder.
- Add `THIRD-PARTY.md`: name, version, license, source and build command for every vendored library (section 8.5).
- Stop publishing `samples/` (the deploy workflow copies it today).
- Add a **global error handler** (`window.onerror`, `unhandledrejection`): show a short message, keep the last errors, and offer "copy a bug report". Today an uncaught error only reaches the console and the person sees a broken screen. No library is needed.
- Consider a **Content-Security-Policy** (a `<meta>` tag, because GitHub Pages cannot send headers). The app is already fully self-contained. It cannot be strict yet because the JavaScript mode needs `unsafe-eval`; once all user code runs in the sandbox worker (3.8) the main page can drop it. DuckDB's WebAssembly needs `wasm-unsafe-eval`.
- Consider **offline install** (a web manifest and a service worker; Workbox is the mature tool). The app already makes no outside requests, so it is a small step. Optional.
- **Pros:** less to explain and maintain, a safer public site, errors that can be reported. **Cons:** the CSP needs care with workers and blobs; a service worker adds an update story to think through.

## 4. Suggested order

| Wave | What | Tracked as | Why this order |
|---|---|---|---|
| 0, correctness first | one path model (3.17), CSV formula protection (3.18), regular expressions in a worker (3.19, with 3.8), cleanup, global error handler, third-party list (3.20) | tasks 18 and 19 | real bugs found by the gap audit; the path one hits Power Platform payloads directly |
| 1, small and safe | worker cache fix, TOML 5, Lucide subset and upgrade, native `<dialog>`, component cleanup, input panel error place, graph labels, keyboard reorder for tabs and Pivot | task 21 | quick, measurable, low risk |
| 2, decisions made | Table (finish and merge), one Tree (research, prototype, decide by numbers) | tasks 17 and 20 | the biggest visible changes; the Tree needs the Table settled first |
| 3, when ready | Ajv 8 (after a real schema test), DuckDB 2.0 (when released), undo differences, palette fuzzy matching, PNG library | task 22 | each needs a measurement or an outside event first |
| Alongside | the keep-and-harden audits (section 8.3), the seam checks (8.5), upkeep, process | tasks 23, 24, 25, 26 | each audit becomes a permanent test; no user-visible change |

## 5. What I could not verify

- What Power Automate's Parse JSON action accepts as a schema draft (the searches found nothing).
- DuckDB-Wasm 2.0 is a draft announcement dated after today; its size and speed claims are unconfirmed.
- Whether jq in WebAssembly, JSONata or JMESPath evaluate untrusted expressions safely (no source found).
- The sizes of `modern-screenshot` and `html-to-image` (comparison sites disagree) and any rendering benchmark between them and html2canvas.
- Lucide's subset size: measured, 130 icons are 25 KB (about 190 bytes each).
- The reasons for some old choices are not written down anywhere (marked inferred).

## 6. Sources

- Ajv v6 to v8 migration, draft-04 removed: https://ajv.js.org/v6-to-v8-migration.html and the `ajv-draft-04` package: https://github.com/ajv-validator/ajv-draft-04
- DuckDB-Wasm OPFS post (September 2026): https://duckdb.org/2026/09/18/opfs-wasm ; the draft 2.0 announcement: https://github.com/duckdb/duckdb-web/pull/7539 ; releases: https://github.com/duckdb/duckdb-wasm/releases
- Lucide for vanilla JavaScript: https://lucide.dev/guide/lucide
- Compression Streams API (baseline widely available): https://developer.mozilla.org/en-US/docs/Web/API/Compression_Streams_API
- SortableJS and keyboard support: https://docs.tabler.io/ui/plugins/sortable
- smol-toml, TOML 1.1: https://cdn.jsdelivr.net/npm/smol-toml@1.9.0/README.md
- Screenshot libraries compared: https://dev.to/shaishav_patel_271fdcd61a/html2canvas-vs-dom-to-image-vs-html-to-image-browser-screenshot-library-comparison-4h5c
- Lit and web components 2026: https://attr-action.pages.dev/blog/2026-03-19-web-components-2026-adoption/
- Package versions and dates: the npm registry (read 2026-10-27). Browser support: MDN browser-compat-data.

## 7. Decisions I need from you

All open questions are in one file: [QUESTIONS.md](QUESTIONS.md). Each has an id (Q1 to Q20), my recommendation, the default I use if you have not answered, and the tasks it blocks. Two items are things I need from you and not decisions: real Power Automate schemas (D1) and exported flows (D2). Answered questions are kept in a log at the bottom of that file.

Most questions are answered (see the log in that file). Still open: Q3 (path model), Q18 (offline install) and Q21 (archive folder).

## 8. Gap audit: where our code misses cases that mature code handles

### 8.0 The rule

For every hand-written area we ask one question: **which is better, ours or the mature option?**

1. **Mature is better: replace ours.** (Examples: JSONPath, the CSV writer, the error place reader.)
2. **Ours is better** (it is tuned to this app, or nothing equivalent exists): **keep it, and add to it the cases and break points that mature code already handles**, so we do not miss them. The mature code and its test suites are the checklist, not the replacement. (Examples: the path model, the Power Platform expressions, the Parse JSON schema generator, the type generator, the Overview insights.)

3. **The goal is the best of both worlds, and neither world may cause trouble for the other.** A library must not break our code, and our code must not misuse or break a library. This is about the seams between them: who owns the data, who gets the keys and the focus, what happens when a library fails to load, what changes when a library is upgraded. Every library sits behind one of our modules, with a written list of the ways it behaves differently, and a test at that seam (section 8.5).

4. **Shared architecture: generic logic is written once.** If a job is needed in more than one place (writing a path, running user code, closing a menu, copying to the clipboard), it lives in one shared module and every place calls it. A new copy is a defect. This is also what keeps rule 3 cheap: one door per library, one worker service, one path writer. The duplicate scan and the shared pieces are task 27.

5. **Mature test suites are run against our code.** Wherever a library or a standard has an official test suite (RFC 9535 for JSONPath, JSONTestSuite for JSON, the JSON Schema test suite, csv-spectrum, yaml-test-suite, toml-test), it runs through our own integration, not only inside the library. Those suites hold cases we never thought of. The pass counts are recorded and a drop fails the build. This is task 31.

The second kind of area (keep and harden) is the easy one to miss, because nothing looks wrong until the odd input arrives. It applies only where ours is the better choice; where mature code wins, we replace and there is nothing to harden.

Sorting the audit results by this rule:

| Area | Which is better | Direction | Section |
|---|---|---|---|
| JSONPath | json-p3 | Replace (done, PR #7) | 3.3 |
| Where JSON is invalid | jsonc-parser | Replace (Editor done; input panel to do) | 3.14 |
| CSV export | PapaParse `unparse` | Replace our writer | 3.18 |
| Regex freeze protection | a worker with a time limit (and optionally recheck) | Replace our guess-based guard | 3.19 |
| Table scrollbar and grid | virtual-core for the arithmetic, the WAI-ARIA grid pattern | Replace the arithmetic, keep and harden the rest | 3.2 |
| Tree | CodeMirror, if the numbers allow it | **One tree** for the whole app: CodeMirror if it can meet every requirement on large files, otherwise our own renderer, hardened | 3.1 |
| Path model (the dotted form, the Power Platform formatters) | ours: no library knows our path language | **Keep and harden**: borrow JSON Pointer and normalized path rules | 3.17 |
| Power Automate and Power Fx expressions | ours: nothing else exists | **Keep and harden** (quoting, nulls, odd keys; checked against Microsoft's syntax rules) | 8.3 |
| Parse JSON schema generator | ours: tuned for the Parse JSON action | **Keep and harden** against the official JSON Schema suite and genson or quicktype on optional and nullable cases | 8.3 |
| Type code generator | ours: merges all rows, remembers nullable fields | **Keep and harden** (compile the output with real compilers; keywords and identifiers per language) | 8.3 |
| Overview insights, quality score, key coverage | ours: the product's main idea | **Keep and harden** (edge cases: empty lists, mixed types, huge arrays) | 8.3 |
| Number safety (`protectBigNumbers`) | ours: JSON.parse alone cannot do it | **Keep and harden** (JSONTestSuite and number edge cases; already passes 14 of 14) | 8.3 |
| CSV cell typing (`csv-typing.js`) | ours: thousands separators, decimals kept | **Keep and harden** (csv-spectrum cases) | 8.3 |
| XML mapping (JSON to and from XML) | our own mapping rules | **Keep and harden** (well-formedness, name collisions, attributes, CDATA) | 8.3 |
| Fuzzy search over data values | ours: a different job than list matching | **Keep and harden** (compare recall with uFuzzy and Fuse on typos) | 8.3 |
| Personal data masking | ours: small and tuned | **Keep and harden** (Luhn check for cards, tighter phone pattern) | 8.3 |
| Charts, Graph, Minimap, Heatmap | ours: small and tuned | **Keep and harden** (empty, single value, huge or negative values) | 8.3 |
| Undo, bookmarks, history, tabs, theme engine | ours | **Keep and harden** (limits and odd states; undo moves to differences later) | 3.11 |

The audits below follow this sorting: a "replace" area is fixed by replacing; a "keep and harden" area gets its mature oracle turned into permanent tests, and every failure becomes a fix to our code.

### 8.1 Method

For each hand-written area that we keep, find an **oracle**: a standard, an official test suite, or a mature library that answers the same question. Run our code against it with awkward input (hostile keys, huge numbers, odd whitespace, Unicode, very large files). Anything that disagrees is either a bug to fix or a reason to replace our code. Then keep the check as a permanent test, so it cannot regress.

### 8.2 Audits already run

| Area | Oracle | What I ran | Result | Action |
|---|---|---|---|---|
| JSONPath | the official RFC 9535 suite (715 tests) | our engine, then json-p3 | ours 243 (34 percent), hung on negative slices; json-p3 715 | DONE (PR #7) |
| Where JSON is invalid | the three browser engines | Editor in Chromium, Firefox, WebKit | Safari and Firefox lost the place | DONE for the Editor (PR #6); the input panel is still open (3.14) |
| Tree against an editor | CodeMirror 6 (source and probes) | state after recycling, jump to a row, handlers | 5 bugs | DONE (PR #6) |
| Find | expected behavior of any search bar | Enter, order of matches | 2 bugs | DONE (PR #6) |
| Paths | JSON Pointer and json-p3's normalized paths | 3 writers against 13 hostile keys | tree rule 2 fail; Find's rule 5 fail; JSONPath adapter 2 fail; first-level `$` keys unreadable | **open, 3.17** |
| CSV export | PapaParse (round trip), OWASP formula injection | 8 awkward cells | round trips all ok; 4 of 8 dangerous cells unprotected | **open, 3.18** |
| YAML export | yaml (round trip) | 17 values, several of which YAML reads as something else (yes, null, 1e3, 0x1f, dates ...) | all ok | none |
| Schema generator | Ajv (a schema must accept its own data) | 57 schemas: 19 test files that parse, 3 option sets each | all accepted | none; not yet compared with the official JSON Schema suite |
| Large numbers | BigInt arithmetic | 14 cases (numbers that must be protected, numbers that must not) | all ok | none |
| Regex guard | well-known catastrophic patterns | 10 patterns, 5 ordinary ones | 8 of 10 caught; 5 of 5 ordinary ok | **open, 3.19** |
| Power Automate and Power Fx quoting | Microsoft syntax rules | a key with a quote and a key with a space | ok | none |
| Type generator | each language's keywords | 7 languages, keyword-named keys | ok (TypeScript allows reserved words as property names; my first check was wrong) | none; not compiled with real compilers |
| Accessibility | axe-core | every view, light and dark | 54 findings, now 2 | DONE (PR #6); graph labels open |
| Browsers | Playwright, 3 engines | all 35 browser runs | 35 of 35 in each | DONE |
| Table | the WAI-ARIA grid pattern | the dedicated Table test | passes in 3 engines | decided: keep, merging (3.2) |

### 8.3 Audits still to run

| Area | Our code | Oracle | Why it matters |
|---|---|---|---|
| JSON reading | `JSON.parse` plus the number scan | JSONTestSuite (318 files of valid, invalid and ambiguous JSON) | confirms what we accept and reject, and the big-number scan on odd input |
| CSV and TSV import | `csv-typing.js` (own) plus PapaParse | the csv-spectrum cases; PapaParse's own tests | our own cell typing (thousands separators, leading zeros, decimals) is the risk |
| XML import and export | own mapping in the XML worker and `jsonToXml` | well-formedness through `DOMParser`; fast-xml-parser's behavior for attributes, namespaces, CDATA, repeated elements | the mapping is our own choice; two keys can collide (`a b` and `a_b`) |
| TOML and YAML import | toml, yaml | toml-test and yaml-test-suite | libraries are mature; confirms we pass options correctly (and covers the TOML upgrade) |
| JSON Patch | jsondiffpatch's JSON Patch output | the RFC 6902 test collection | Compare's "copy as JSON Patch" must apply cleanly |
| Schema generator | own | the official JSON Schema test suite, and a comparison with genson or quicktype on optional and nullable fields | the Parse JSON schema is the product's core output |
| Type generator | own | real compilers (tsc, go, rustc, dotnet) on the output | generated code must compile |
| Power Automate and Power Fx expressions | own | Microsoft's documented syntax, examples from real flows | no executor is available here; needs real flows from you |
| Fuzzy search | own Jaro-Winkler | uFuzzy and Fuse behavior on typos | to see if recall and speed match |
| Personal data masking | own regexes | a list of known PII formats, Luhn check for card numbers | the phone pattern is loose, the card pattern has no check digit |
| Startup cost | whole app | Lighthouse (and a bundle report) | the 358 KB icon set loads at start; DuckDB loads on demand |
| Security of generated HTML | own escaping | `hostile.js` exists; extend it to every view with markup in keys and values | the app builds HTML as text in many places |
| Large files | own | the 37 MB and 88 MB fixtures in all three engines | memory and time, per browser |

### 8.4 Keeping it from regressing

Each audit above becomes a permanent test in `tests/unit` (the path round trip, the CSV round trip and injection check, the regex guard list) or in the compliance tools in `tests/perf`. The unit suite already runs in CI. New hand-written code in these areas then has to pass the oracle before it merges.

### 8.5 The seams between our code and the libraries (rule 3)

Checked against the code on 2026-10-27. "Holds" means I verified it; "to check" means I have not.

| Seam | What could go wrong | How we guard it | Status |
|---|---|---|---|
| One door per library | a component calls a library directly, so a swap or upgrade touches many files | each library is used from exactly one of our modules: PapaParse and js-yaml in the format and worker modules, jsonc-parser, Ajv and jsonrepair in `json-repair-and-validation`, html2canvas in `share-and-capture`, Lucide in `icons`, CodeMirror in `code-view` | holds, with **one exception**: the Table calls virtual-core directly (my change on `feature/table-grid`). Wrap it in a small core module before that branch merges |
| Behavior differences that reach the user | the library does something different from what people were used to | the adapter writes every difference down and tests it: json-p3 treats a `null` field as existing and `==` as strict, both documented and covered by the 27 unit tests | holds for JSONPath; do the same for every future swap: list the differences before swapping |
| A library fails to load or throws | a blank feature or a crash | fallbacks exist for DuckDB (the JavaScript path, by design), jsonc-parser (the browser's message), virtual-core (paging). json-p3 has none: if it fails to load, JSONPath shows an error | decide: acceptable for json-p3, or add a simple fallback |
| Keys and focus | a library's shortcuts fight ours (CodeMirror's own undo against our document undo) | the global shortcut handler ignores editable targets (`app.js` line 134), so CodeMirror keeps its own keys inside a code box; `editor.js` and `codeview.js` cover it | holds |
| Who owns the document | a library changes the document, or keeps a reference to it | json-p3 and jsonc-parser only read; DuckDB gets its own copy; jsondiffpatch's use is behind `jsonDiff` | to check: a test that freezes the document and runs every library path, so anything that changes it fails |
| Global names | libraries add globals (`Papa`, `YAML`, `lucide`, `Ajv`, `JSONRepair`, `html2canvas`, `JSONC`) that could clash with each other or with the page | no clash today; not isolated | low risk; gather them under `Structra.libs` if a clash ever appears |
| Styles | library CSS leaks into ours (CodeMirror injects its own) | `codeview.css` scopes our changes to `.cv`; the theme and axe audits run in all themes | holds |
| Speed | a library blocks the page (DuckDB, a big diff, a big JSONPath) | DuckDB and the parsers are in workers or lazy; analysis is time-sliced; json-p3 measured 122 ms for 200,000 records on the main thread | holds; re-measure on the large fixtures when the data engine changes |
| Memory | two copies of a big document (ours and the library's) | measured: about 660 MB for the 88 MB file with the CodeMirror Tree plan; budgets are in the plan | holds as a plan; add a memory check to the large-file test |
| Offline and privacy | a library fetches from another site | `offline.js` blocks every outside request and must stay green when a library is added | holds |
| Versions and licenses | a silent upgrade, or an unknown license | libraries are vendored and loaded only from our own folder; most carry a version banner | **gap**: add `THIRD-PARTY.md` with name, version, license, source and build command for every vendored library, and keep it in the map test |
| Browser differences | a library works in one engine only | all 35 browser runs in three engines (this found the jsonc-parser case) | holds |
| A test at every seam | an adapter changes and nothing notices | JSONPath 27 unit tests, parse errors 9, the Table test, `codeview.js`, `editor.js` | **gap**: add contract tests for the Ajv, jsondiffpatch, share link and parse-worker adapters |
| Upgrades | a new version changes behavior | pinned and vendored; upgrades are a deliberate pull request | add a checklist: re-run the library's oracle (for example the JSONPath suite), the three browsers, the offline test, and update `THIRD-PARTY.md` |

### 8.6 Check against real Power Platform data (2026-10-27)

Done with your permission, read-only, in your own developer environments only (IHSM_DEV, IHSM_Developer_Environment_2 and your personal environment). Nothing from them is stored in the repository; the analysis files are in a scratch folder.

- **How it was done:** the Power Platform plugin lists environments but cannot list flows here, because the company network inspects HTTPS and the tool does not trust the certificate. I did not turn certificate checks off. I used the Azure CLI you are signed into (certificate checks on) for the same read-only calls. If you want the plugin itself to work, IT can give you the company CA file to set as `NODE_EXTRA_CA_CERTS` (optional, task 29).
- **What was read:** 125 flows listed; the definitions of the 15 that contain a Parse JSON action.
- **Parse JSON schemas (D1):** 23 real schemas, 83 to 1,706 characters. None has a `$schema` key. Keywords seen: `type` (248), `properties` (55), `items` (35), `required` (14), `oneOf` (1). All compile in Ajv 6 and Ajv 8 (section 3.6).
- **Expressions (D2):** 481 real expressions. Functions used, most to least: `outputs` (323), `items` (297), `body` (231), `item` (104), `empty` (91), `triggerBody` (81), `coalesce` (54), `first` (47), `workflow` (40), `triggerOutputs` (35), `length` (30), `variables` (5). **Our generators already produce every one of them.**
- **Keys:** 258 distinct real property names; 61 contain a slash (the dynamic-content form `outputs('Action')?['body/field']`), 2 contain a dot, 2 contain `@`, none contain spaces, quotes, brackets or start with `$`. So the hostile keys in section 2.9 (dots, `@`, quotes, `$`) are the standard cases from SharePoint, Dataverse and OData payloads and from JSON Schema documents, even though this sample of flows did not contain many.
- **One gap found:** real flows write many keys in the dynamic-content form (`body/field`). Our generator writes the equivalent `body('Action')?['field']`. Both work, but offering the dynamic-content form as an extra copy option would match what makers see in their flows (task 29).

### 8.7 Official test suites run against our own code (rule 5, task 31)

A suite runs through OUR integration (the parse path, the adapter, the worker), not only inside the library. Cases are collected once into `tests/suites` with their licence (never downloaded when tests run). The pass counts are written in the test; a change fails it.

| Library or standard | Suite | Through which of our code | Cases | Result | What it found |
|---|---|---|---|---|---|
| JSONPath (RFC 9535) | the official compliance test suite | `Structra.jsonpathQuery.queryStrict` and the compliance tool | 715 | 715 pass (712 with the conveniences, 3 deliberate differences) | done in PR #7 |
| JSON parsing | JSONTestSuite (nst), commit 1ef36fa | `Structra.parseJsonAsync` (accept or reject) and `explainParseError` (a place for every rejection, none for an accepted text) | 318 (95 must accept, 188 must reject, 35 either) | y 95 of 95, n 188 of 188, i 32 accepted 3 rejected | two real bugs, fixed: (1) `{9999E9999:1}` and a malformed number such as `01234567890123456` were turned into valid JSON by the big-number protection; (2) the error place crashed with a stack overflow on 100,000 nested arrays |
| JSON Schema validation | JSON Schema Test Suite (drafts 4, 6, 7; optional folder and refRemote left out), commit 89e83a7 | `Structra.jsonRepairAndValidation.validate` (Ajv 6.12.6 with our options) | 906 (draft 7), 818 (draft 6), 601 (draft 4) | draft 7: 901 pass (before the fixes 873); draft 6: 809; draft 4 checked as draft 7: 572 | three real gaps, fixed: (1) a property named constructor, toString or __proto__ was judged from what every object inherits (now a copy without inherited names when the schema mentions one); (2) a format Ajv does not know (OpenAPI's int32) made the whole schema fail (now ignored, as the standard says); (3) a schema naming draft-04 or draft-06 failed (now checked as draft 7, and the person is told). Still different: $ref next to $id, empty $ref tokens, one __proto__ case (limits of Ajv 6). **Ajv 8.20 passes only 898 of the same 906 draft-07 tests**, so upgrading would not help (reinforces the decision in 3.6) |
| CSV | csv-spectrum 2.0.0 (the npm package; its git repository changes the line breaks) | the real CSV worker (PapaParse + typing) and `Structra.formatConversion.generateCsv` (round trip) | 12 files (24 checks) | all 24 pass | no bug in our code. The suite disagrees with itself once (a phone number differs between its CSV and its JSON); the CSV is taken as the input and the correction is written in the test |
| TOML (1.0.0) | toml-test, commit 96fd088 | the real TOML worker (toml 4.1.1) | 208 valid + 509 invalid | accepts 207 of 208 valid (the empty file is refused on purpose), 204 with the right value, rejects 494 of 509 invalid | the 15 invalid texts it accepts are TOML 1.1 forms (8) or invalid UTF-8 that the file reader replaces first (7). Three dates lose fractional seconds. **Upgrade to toml 5.0.1 measured: accepts 206, 203 right, rejects 494; smol-toml 1.9.1: 206, 203, 488. No gain, so task 21.2 is closed as not needed** |
| YAML | YAML Test Suite (data-2022-01-17), commit 6e6c296 | the real YAML worker (now the yaml library through Structra.yamlIo) | 402 (274 with a JSON answer, 94 that must be rejected) | **was js-yaml 4.1.0: 231 valid accepted, 83 of 94 invalid rejected, 17 multi-document files refused, 26 valid files refused, 18 wrong values. Now yaml 2.9.1: 274 of 274 accepted, 269 same value, 92 of 94 rejected** | the biggest finding of task 31, **replaced js-yaml** (rule 1): a file with several documents (Kubernetes) did not open; unknown tags (CloudFormation's !Ref, !GetAtt) failed; valid flow forms failed. The bundle grows from 39 KB to 98 KB. YAML export now uses the same library (`Structra.yamlIo.stringify`) |
| Repair ("Fix it for me") | the 318 JSONTestSuite texts as input, with the promise "the result is valid JSON or an error" | `Structra.jsonRepairAndValidation.repair` (jsonrepair 3.x plus our second pass) | 127 valid, 191 invalid | valid: 127 of 127 unchanged. invalid: 148 repaired, 43 refused, **0 still broken (was 6)** | 6 texts came back from jsonrepair still invalid: numbers with a leading zero or a leading dot (`-01`, `.2e-3`, `-.5`) and a backslash followed by a raw tab or NUL. Fixed with a second pass; `repair()` now always returns valid JSON or throws (the Editor used to say "Repaired" over broken text) |
| Compare and its JSON Patch (RFC 6902) | every valid JSONTestSuite document taken in pairs, patch applied by an independent implementation (fast-json-patch 3.1.1, a dev dependency) | `Structra.jsonRepairAndValidation.patch` (our position-mode patch) and `Structra.jsonDiff.compare` + `patchOps` (smart mode on jsondiffpatch) | 16,129 pairs (position mode), 2,305 pairs (smart mode) | all round-trip: 0 wrong, 0 refused | no bug found. Also checked: equal documents give an empty patch, the left document is not changed, keys with ~ and / are written ~0 and ~1 |
| XML | W3C XML Conformance Test Suite (xmltest standalone files: 120 valid, 186 not well-formed) | the real XML opener (`Structra.parseXmlAsync`: browser DOMParser, our error detection and XML-to-JSON step) in all three engines | 306 | valid opened: Edge 116, Firefox 116, WebKit 114 of 120. Not well-formed refused: **Edge 125, Firefox 183, WebKit 181 of 186** | no bug in our code. Chromium (Chrome and Edge) implements XML 1.0 5th edition, in which many names and characters that the suite (written for earlier editions) marks as not well-formed are legal, so it opens 61 of them. Our refusal messages are always one line in all engines. Per-engine minimums are written in the test |
