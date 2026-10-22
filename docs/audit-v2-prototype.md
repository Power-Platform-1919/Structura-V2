# Structra V2 Prototype — Complete UI Catalog

## 1. TOAST NOTIFICATION

| Element | ID/Class | Purpose |
|---------|----------|---------|
| Toast container | `#toast`, `.toast` | Fixed bottom-center notification popup |
| Toast message | `#toastMsg` | Text content of the toast |
| Toast checkmark SVG | inside `.toast` | Success indicator icon |

**Behavior:** `showToast(msg)` — slides up from bottom, auto-hides after 2200ms. Uses `.show` class to animate in.

---

## 2. HEADER (Section: `header`)

| Element | ID/Class | Purpose | Section |
|---------|----------|---------|---------|
| Header bar | `.header` | 52px top bar, contains branding + toolbar | Header |
| Brand logo + text | `.brand` | "Structra" text with hexagon SVG icon | Header |
| Header separator | `.header-sep` | 1px vertical divider line (used 2x) | Header |
| **Search/Path bar** | `.search-bar` | Combined path display + input | Header |
| Path label | `.sb-label` | "Path" micro-label | Header |
| Path input | `#pathInput` | Text input for JSON path (e.g. `$.users[0].name`) | Header |
| Copy Path button | `.toolbar-btn` `onclick="copyPath()"` | Copies current path to clipboard | Header |
| Bookmark Path button | `.toolbar-btn` `onclick="bookmarkPath()"` | Bookmarks current path | Header |
| Theme toggle button | `.toolbar-btn` `onclick="toggleTheme()"` | Toggles light/dark theme | Header (right) |
| Command Palette button | `.toolbar-btn` `onclick="toggleCmd()"` | Opens command palette, shows `Cmd+K` kbd | Header (right) |
| Header right group | `.header-right` | Right-aligned button container | Header |

---

## 3. DOCUMENT TAB BAR (Section: `doc-tab-bar`)

| Element | ID/Class | Purpose |
|---------|----------|---------|
| Tab bar container | `#docTabBar`, `.doc-tab-bar` | Horizontal tab strip for multi-document |
| Tab scroll area | `#docTabScroll`, `.doc-tab-scroll` | Scrollable tab container |
| Individual tab | `.doc-tab` | A single document tab (generated dynamically) |
| Tab icon | `.dt-icon` | JSON file SVG icon per tab |
| Tab label | `.dt-label` | Tab name text (double-click to rename) |
| Tab modified dot | `.dt-modified` | 6px dot indicating unsaved changes |
| Tab close button | `.dt-close` | x button to close tab |
| Tab rename input | `.dt-input` | Inline text input when renaming |
| Add tab button | `.doc-tab-add` `onclick="docTabs.add()"` | "+" button to create new tab |

**Behaviors:**
- Click -> switch tab (`switchTo`)
- Double-click -> rename tab (`startRename`)
- Drag & drop -> reorder tabs (`reorder`)
- Max 8 tabs enforced
- `Ctrl+T` -> new tab
- `Ctrl+W` -> close active tab

---

## 4. LEFT RAIL (Section: `rail`)

| Element | Title/ID | Purpose |
|---------|----------|---------|
| Rail container | `.rail` | 48px vertical icon sidebar |
| Explorer button | `.rail-btn` title="Explorer" | Default active rail button |
| Query & Filter button | `.rail-btn` title="Query & Filter" | Toggles the Query Panel sidebar |
| Power Platform button | `.rail-btn` title="Power Platform" | Shows Power Platform context |
| Stats button | `.rail-btn` title="Stats" | Opens Stats, expands drawer to analyze panel |
| Transform button | `.rail-btn` title="Transform" | Transform panel placeholder |
| Settings button | `.rail-btn` title="Settings" | Shows toast "Settings" |
| Rail badge | `.rail-badge` | Red dot notification badge (on Stats button) |
| Rail spacer | `.rail-spacer` | Flex spacer pushing Settings to bottom |

**Behavior:** `switchRail(btn, msg)` — toggles `.active` class on rail buttons with left-edge accent indicator.

---

## 5. CANVAS AREA (Section: `canvas`)

### 5a. Find Bar (Overlay, transient)

| Element | ID/Class | Purpose |
|---------|----------|---------|
| Find bar | `#findBar`, `.find-bar` | Floating search bar, top-right of canvas |
| Find input | `#findInput` | Text input for search term |
| Match count | `#findCount`, `.fb-count` | Shows "N/M" match navigation |
| Previous match button | `.fb-btn` `onclick="findPrev()"` | Navigate to previous match |
| Next match button | `.fb-btn` `onclick="findNext()"` | Navigate to next match |
| Separator | `.fb-sep` | Vertical divider |
| Replace toggle button | `.fb-btn` `onclick="toggleReplace()"` | Toggles replace mode |
| Close button | `.fb-btn` `onclick="closeFindBar()"` | Closes find bar |

**Behavior:** `Ctrl+F` toggles. Highlights `.tree-line.find-hl` matches. Enter/Shift+Enter for next/prev. Esc closes.

### 5b. Query Panel (Persistent sidebar, via rail)

| Element | ID/Class | Purpose |
|---------|----------|---------|
| Panel container | `#queryPanel`, `.query-panel` | 260px left sidebar for filtering |
| Header | `.qp-header` | "Query & Filter" title + close button |
| Close button | `.qp-close` | Closes query panel |
| Mode pills | `.qp-modes` | Mode selector row |
| Mode: Path | `.qp-mode` `onclick="setQueryMode(this,'path')"` | Glob-style path filtering (default active) |
| Mode: JSONPath | `.qp-mode` `onclick="setQueryMode(this,'jsonpath')"` | JSONPath query mode |
| Mode: Regex | `.qp-mode` `onclick="setQueryMode(this,'regex')"` | Regex pattern mode |
| Mode: JS | `.qp-mode` `onclick="setQueryMode(this,'js')"` | JavaScript expression mode |
| Query textarea | `#queryInput`, `.qp-input` | Multi-line input for queries |
| Run button | `.qp-run` `onclick="runQuery()"` | Executes the query |
| Results area | `#queryResults`, `.qp-results` | Shows matched results list |
| Result items | `.qp-result-item` | Individual clickable result rows |
| Result summary | `.qp-summary` | "N / M nodes matched" text |

**Behavior:** `toggleQueryPanel()` — slides panel open/closed. `runQuery()` searches tree lines, highlights matches, populates result list.

### 5c. Canvas Header (View switching toolbar)

| Element | ID/Class | Purpose |
|---------|----------|---------|
| Canvas header | `.canvas-header` | Sub-toolbar below tab bar |
| View tab group | `.view-tabs` | Pill-style tab switcher |
| Tree tab | `.view-tab` `onclick="switchView('tree')"` | Switch to Tree view (default) |
| Table tab | `.view-tab` `onclick="switchView('table')"` | Switch to Table view |
| Graph tab | `.view-tab` `onclick="switchView('graph')"` | Switch to Graph view |
| Schema tab | `.view-tab` `onclick="switchView('schema')"` | Switch to Schema view |
| Editor tab | `.view-tab` `onclick="switchView('editor')"` | Switch to Editor view |
| Stats tab | `.view-tab` `onclick="switchView('stats')"` | Switch to Stats view |
| Canvas separator | `.canvas-sep` | Vertical dividers (2x) |
| Expand All button | `.toolbar-btn` `onclick="expandAll()"` | Expands all tree nodes, label "+All" |
| Collapse All button | `.toolbar-btn` `onclick="collapseAll()"` | Collapses all tree nodes, label "-All" |
| Depth 1 button | `.toolbar-btn` `onclick="collapseToDepth(1)"` | Collapse to depth 1, label "D1" |
| Depth 2 button | `.toolbar-btn` `onclick="collapseToDepth(2)"` | Collapse to depth 2, label "D2" |
| Wrap button | `.toolbar-btn` | Toggles word wrap (toast only) |
| Edit button | `.toolbar-btn` `onclick="switchView('editor')"` | Switch to Editor view (with pencil icon) |
| Copy button | `.toolbar-btn` `onclick="copyJSON()"` | Copies full JSON to clipboard |
| Canvas right group | `.canvas-right` | Right-aligned toolbar buttons |

### 5d. Insight Strip

| Element | ID/Class | Purpose |
|---------|----------|---------|
| Strip container | `#insightStrip`, `.insight-strip` | Horizontal scrollable chip bar |
| Keys chip | `.chip.chip-blue` | Shows total key count (blue dot), clicks -> Stats |
| Depth chip | `.chip.chip-green` | Shows max depth (green dot) |
| Arrays chip | `.chip.chip-amber` | Shows array count (amber dot) |
| Strings chip | `.chip.chip-purple` | Shows string count (purple dot) |
| Nulls chip | `.chip.chip-red` | Shows null count (red dot) |
| Objects chip | `.chip.chip-gray` | Shows object count (gray dot) |
| File info chip | `.chip.chip-file` | Shows filename + size (right-aligned, non-interactive) |

Each chip has: `.chip-dot` (colored circle), `.chip-val` (bold number).

---

## 6. VIEW PANELS (Section: `canvas-main`, each `.view-panel`)

### 6a. Tree View

| Element | ID/Class | Purpose |
|---------|----------|---------|
| Panel | `#view-tree`, `.view-panel` | Default active view |
| Tree container | `#treeView`, `.tree-container` | Scrollable tree rendering area |
| Tree line | `.tree-line` | Individual line (key-value pair) |
| Line number | `.ln` | Left gutter line numbers |
| Code content | `.code` | The JSON content (indented) |
| Key span | `.j-key` | Quoted key name (purple) |
| String value | `.j-str` | String value (blue) |
| Number value | `.j-num` | Numeric value (blue) |
| Boolean value | `.j-bool` | Boolean value (red) |
| Null value | `.j-null` | Null value (gray italic) |
| Brace/bracket | `.j-brace` | `{`, `}`, `[`, `]` characters |
| Collapse arrow | `.j-arrow` | Toggle triangle |
| Item badge | `.j-badge` | Pill showing "N items" or "N keys" |
| Children container | `.j-children` | Collapsible wrapper div |
| Inline type hint | `.j-inline-hint` | Appears on hover, shows value type |
| Find highlight | `.tree-line.find-hl` | Yellow highlight for search matches |
| Active line | `.tree-line.active` | Blue highlight for selected node |

**Behavior:** Click line -> `selectNode()` updates path bar, status bar, context panel, expressions. Click arrow -> `toggle()` collapses/expands children.

### 6b. Table View

| Element | ID/Class | Purpose |
|---------|----------|---------|
| Panel | `#view-table`, `.view-panel` | Table view |
| Table container | `.table-container` | Scrollable wrapper |
| Data table | `.data-table` | Full-width table |
| Table headers | `th` (5 columns: #, name, email, role, active) | Sortable headers (click -> toast) |
| Table body | `#tableBody` | Dynamic row container |
| Bool badge | `.bool-badge`, `.bool-true`/`.bool-false` | Green/red pill for boolean values |
| Selected row | `tr.row-sel` | Blue highlight for selected row |

**Behavior:** Click header -> shows sort toast. Click row -> `selectTableRow()` selects row, updates path + context panel.

### 6c. Graph View

| Element | ID/Class | Purpose |
|---------|----------|---------|
| Panel | `#view-graph`, `.view-panel` | Graph/node visualization |
| Graph container | `.graph-container` | Centered flex layout |
| Graph node | `.graph-node` | Clickable node box (shows toast on click) |
| Root node | `.graph-node.root` | Accent-bordered root node `{ root }` |
| Graph edge | `.graph-edge` | Horizontal connector line between nodes |
| Hint text | `<p>` | "Click nodes to inspect" |

**Static demo** — two rows of nodes: root -> users -> [0], and settings -> theme -> lang.

### 6d. Schema View

| Element | ID/Class | Purpose |
|---------|----------|---------|
| Panel | `#view-schema`, `.view-panel` | JSON Schema display |
| Schema container | `#schemaView`, `.schema-container` | Monospace schema output |
| Schema key | `.s-key` | Property name |
| Schema type | `.s-type` | Type annotation |
| Required marker | `.s-req` | Red "required" label |

**Behavior:** `renderSchema()` — generates indented type tree on first view. Lazy-rendered.

### 6e. Editor View

| Element | ID/Class | Purpose |
|---------|----------|---------|
| Panel | `#view-editor`, `.view-panel` | Raw JSON editor |
| Editor container | `.editor-container` | Flex column layout |
| Editor toolbar | `.editor-toolbar` | Top toolbar |
| Apply button | `.toolbar-btn.active` `onclick="applyEdit()"` | Parses and applies edited JSON |
| Format button | `.toolbar-btn` `onclick="formatJSON()"` | Pretty-prints JSON |
| Minify button | `.toolbar-btn` `onclick="minifyJSON()"` | Minifies JSON |
| Validation status | `#edStatus`, `.ed-status` | Shows "Valid JSON" or "Invalid" |
| Editor textarea | `#editorArea`, `.editor-textarea` | Full-size monospace textarea |

**Behavior:** `oninput="validateEditor()"` — live validation. `applyEdit()` parses and shows toast. `formatJSON()`/`minifyJSON()` reformats in-place.

### 6f. Stats View

| Element | ID/Class | Purpose |
|---------|----------|---------|
| Panel | `#view-stats`, `.view-panel` | Full stats dashboard |
| Stats container | `#statsView`, `.stats-view` | Scrollable stats area |
| Hero cards grid | `.stats-hero` | Auto-fit grid of summary cards |
| Hero card | `.hero-card` | Individual stat card (value + label + sub) |
| Hero value | `.hc-value` | Large number display |
| Hero label | `.hc-label` | Uppercase label |
| Hero sub | `.hc-sub` | Secondary description |
| Stats section | `.stats-section` | Titled section with line divider |
| Section title | `.stats-section-title` | Uppercase section heading |
| Type pills | `.type-pills` | Flex-wrapped type breakdown |
| Type pill | `.type-pill` | Individual type count + mini bar |
| Arrays table | `.arr-table` | Table of found arrays (path, items, type) |
| Array path | `.arr-path` | Clickable path link (updates path bar) |
| Coverage table | `.cov-table` | Key coverage analysis table |
| Coverage key | `.cov-key` | Key name (clickable -> highlights in tree) |
| Coverage bar | `.cov-bar` / `.cov-bar-fill` | Mini progress bar for coverage % |

**Hero cards shown:** Total Keys, Max Depth, Arrays, Total Nodes, Nulls, Size.

---

## 7. BOTTOM DRAWER (Section: `bottom-drawer`)

| Element | ID/Class | Purpose |
|---------|----------|---------|
| Drawer container | `#drawer`, `.bottom-drawer` | Collapsible bottom panel |
| Drawer handle | `.drawer-handle` `onclick="cycleDrawer()"` | 34px drag/click bar to resize |
| Drawer chevron | `.drawer-chevron` | Up arrow, rotates when open |
| Drawer stats text | `.drawer-stats` | "Expressions - Schema Gen" label |
| Drawer body | `.drawer-body` | Content area below handle |
| Drawer nav | `.drawer-nav` | Tab button row |
| Stats tab | `.drawer-nav-btn` `onclick="switchDrawerTab(this,'dp-analyze')"` | Stats/Analysis tab (default active) |
| Expressions tab | `.drawer-nav-btn` `onclick="switchDrawerTab(this,'dp-expr')"` | Power Platform expressions tab |
| Schema Gen tab | `.drawer-nav-btn` `onclick="switchDrawerTab(this,'dp-schema')"` | Schema generation tab |

### Drawer Panels

| Panel | ID | Content |
|-------|----|---------|
| Stats/Analyze panel | `#dp-analyze` | Key coverage table with interactive rows |
| Analyze content | `#analyzeContent` | Dynamic coverage analysis |
| Expressions panel | `#dp-expr` | Power Platform expression cards |
| Expression content | `#exprContent` | Dynamic expression output |
| Schema Gen panel | `#dp-schema` | Parse JSON schema card |
| Schema card | `.expr-card` | Clickable card to copy schema JSON |

**Size states:** `.drawer-sm` (34px, collapsed), `.drawer-md` (200px, default), `.drawer-lg` (320px, expanded). `cycleDrawer()` cycles sm->md->lg->sm.

### Drawer Analyze Panel — Interactive Features

| Element | Class | Behavior |
|---------|-------|----------|
| Coverage key cell | `.cov-key` | `onclick="highlightKeyInTree('key')"` — scrolls to and highlights matching tree lines |
| Missing count cell | (inline style) | `onclick="highlightMissing('key')"` — shows which array rows are missing the key |
| Array selector | `<select>` `.analyze-arr-select` | `onchange="switchAnalyzeArray(path)"` — switches coverage analysis to a different array |

### Expression Cards (generated dynamically)

| Expression | Format |
|------------|--------|
| Power Automate | `body('Parse_JSON')?['key']` syntax |
| Canvas App (Power Fx) | `ParseJSON(jsonText).path` syntax |
| JSONPath | `$.path.to.value` syntax |

Each `.expr-card` has `onclick="copyText(...)"` and a `.copy-hint` "Click to copy" that appears on hover.

---

## 8. CONTEXT PANEL (Right sidebar)

| Element | ID/Class | Purpose |
|---------|----------|---------|
| Panel container | `#ctxPanel`, `.context-panel` | 290px right sidebar |
| Header | `.ctx-header` | "Node" label + path + close button |
| Path display | `#ctxPath`, `.ctx-path` | Current node path (monospace, accent color) |
| Close button | `.ctx-close` `onclick="closeCtx()"` | x button to hide panel |
| Body | `.ctx-body` | Scrollable content area |
| Value section | `.ctx-section` | Shows node value |
| Value display | `#ctxValue`, `.ctx-value` | Formatted value in monospace box |
| Properties section | `.ctx-section` | Shows node metadata |
| Meta grid | `#ctxMeta`, `.ctx-meta` | Definition list: Type, Length/Items/Keys |
| Actions section | `.ctx-section` | Action buttons |
| Copy Value button | `.ctx-btn` | Copies value text |
| Copy Path button | `.ctx-btn` | Copies path text |
| Bookmark button | `.ctx-btn` | Bookmarks node (toast) |
| Filter button | `.ctx-btn` | Filters to node (toast) |
| Mock button | `.ctx-btn` | Generates mock data (toast) |

**Toggle:** `.hidden` class controls visibility (width: 0, opacity: 0). Opens on node selection, closes via x or Esc.

---

## 9. STATUS BAR (Section: `status-bar`)

| Element | ID/Class | Purpose |
|---------|----------|---------|
| Status bar | `.status-bar` | 26px bottom bar |
| Ready indicator | `.st-dot` | Green dot + "Ready" text |
| Filename | (inline `<span>`) | Shows "sample-data.json" |
| Current path | `#statusPath` | Right-aligned, shows current JSON path |

---

## 10. COMMAND PALETTE (Overlay/Modal)

| Element | ID/Class | Purpose |
|---------|----------|---------|
| Overlay backdrop | `#cmdOverlay`, `.cmd-overlay` | Full-screen backdrop with blur |
| Command box | `.cmd-box` | 520px centered dialog |
| Search input area | `.cmd-search` | Search icon + input |
| Search input | `#cmdInput` | Text input for filtering commands |
| Group title | `.cmd-group-title` | "Views" section header |
| Command list | `#cmdList`, `.cmd-list` | Scrollable list (max 340px) |
| Footer | `.cmd-footer` | Keyboard hints: Up/Down Navigate, Enter Run, Esc Close |

### Command Items (`.cmd-item`)

| Command | `data-cmd` | Action | Shortcut |
|---------|-----------|--------|----------|
| Tree View | `tree` | `switchView('tree')` | `Ctrl+1` |
| Table View | `table` | `switchView('table')` | `Ctrl+2` |
| Graph View | `graph` | `switchView('graph')` | `Ctrl+3` |
| Schema View | `schema` | `switchView('schema')` | `Ctrl+4` |
| Editor | `editor` | `switchView('editor')` | `Ctrl+E` |
| Stats & Analysis | `stats` | `switchView('stats')` | `Ctrl+5` |
| Export as CSV | `export-csv` | Toast "Exported 2 rows as CSV" | `Ctrl+Shift+E` |
| Flatten (dot notation) | `flatten` | Toast "JSON flattened to dot notation" | — |
| Sort Keys A->Z | `sort` | Toast "Keys sorted A->Z" | — |
| Generate TypeScript Types | `types` | Toast "TypeScript interfaces generated!" | — |
| Mask Sensitive Data | `mask` | Toast "2 emails masked" | — |
| Compare / Diff JSON | `compare` | Toast "Paste second JSON to compare..." | — |
| Validate Schema | `validate` | Toast "Schema validation passed" | — |

**Behavior:** `toggleCmd()` opens/closes. `filterCmds(q)` filters by text. Click item -> executes command. Click backdrop -> closes.

---

## 11. INPUT ZONE (Empty tab landing page)

| Element | ID/Class | Purpose |
|---------|----------|---------|
| Container | `.input-zone` | Centered column layout in empty tree view |
| Icon | `.iz-icon` | Large file-plus SVG |
| Title | `.iz-title` | "Load JSON" heading |
| Hint | `.iz-hint` | "Drop a file, paste from clipboard, or type below" |
| Textarea | `#izTextarea`, `.iz-textarea` | Dashed-border input area for pasting JSON |
| Parse JSON button | `.iz-btn.iz-btn-primary` `onclick="loadFromInput()"` | Primary action — parses and loads JSON |
| Load Sample button | `.iz-btn` `onclick="loadSampleData()"` | Loads built-in sample data |
| Shortcuts hints | `.iz-shortcuts` | Shows `Ctrl+V` Paste, `Ctrl+T` New Tab |

---

## 12. ALL KEYBOARD SHORTCUTS

| Shortcut | Action | Function |
|----------|--------|----------|
| `Ctrl+K` / `Cmd+K` | Open/close Command Palette | `toggleCmd()` |
| `Ctrl+F` | Open/close Find Bar | `toggleFindBar()` |
| `Escape` | Close command palette, context panel, find bar | Multiple close calls |
| `Ctrl+1` | Switch to Tree view | `switchView('tree')` |
| `Ctrl+2` | Switch to Table view | `switchView('table')` |
| `Ctrl+3` | Switch to Graph view | `switchView('graph')` |
| `Ctrl+4` | Switch to Schema view | `switchView('schema')` |
| `Ctrl+5` | Switch to Stats view | `switchView('stats')` |
| `Ctrl+E` | Switch to Editor view | `switchView('editor')` |
| `Ctrl+L` | Focus path input | `pathInput.focus()` |
| `Ctrl+T` | New tab | `docTabs.add()` |
| `Ctrl+W` | Close active tab | `docTabs.close(activeId)` |
| `Enter` (in find bar) | Next match | (implicit via `findNext`) |
| `Shift+Enter` (in find bar) | Previous match | (implicit via `findPrev`) |
| `Ctrl+H` | Toggle Replace mode | (via find bar button) |

---

## 13. ALL JS FUNCTIONS

| Function | Purpose |
|----------|---------|
| `showToast(msg)` | Display notification |
| `showInputZone()` | Render empty-tab landing page |
| `loadFromInput()` | Parse JSON from input zone textarea |
| `loadSampleData()` | Load built-in sample data |
| `docTabs.init()` | Initialize tab system |
| `docTabs.add(label, data)` | Create new tab |
| `docTabs.close(id)` | Close a tab |
| `docTabs.switchTo(id)` | Switch to tab |
| `docTabs.setActiveData(data, label)` | Update active tab's data |
| `docTabs.markModified()` | Mark tab as modified |
| `docTabs.render()` | Re-render tab bar |
| `copyText(t)` | Copy text to clipboard |
| `copyJSON()` | Copy full JSON to clipboard |
| `copyPath()` | Copy current path |
| `bookmarkPath()` | Bookmark current path |
| `toggleFindBar()` | Toggle find bar visibility |
| `closeFindBar()` | Close find bar |
| `clearFindHighlights()` | Remove all find highlights |
| `doFind(q)` | Execute find search |
| `findNext()` / `findPrev()` | Navigate matches |
| `toggleReplace()` | Toggle replace mode |
| `toggleQueryPanel(btn)` | Toggle query panel sidebar |
| `closeQueryPanel()` | Close query panel |
| `setQueryMode(el, mode)` | Switch query mode (path/jsonpath/regex/js) |
| `runQuery()` | Execute query and show results |
| `toggleTheme()` | Toggle light/dark theme |
| `switchView(v)` | Switch between 6 view panels |
| `switchRail(btn, msg)` | Switch rail button active state |
| `renderTree()` | Render JSON tree |
| `buildNode(parent, obj, indent, path)` | Recursive tree builder |
| `treeLine(num, indent, html, path, value)` | Create single tree line |
| `fmtVal(v)` | Format a primitive value as HTML |
| `toggle(id, arrow)` | Toggle tree node collapse |
| `expandAll()` / `collapseAll()` | Expand/collapse all tree nodes |
| `collapseToDepth(depth)` | Collapse tree to specific depth |
| `selectNode(el, path)` | Select a tree node |
| `resolvePath(path)` | Resolve a JSON path to its value |
| `closeCtx()` | Close context panel |
| `updateExpressions(path)` | Generate Power Platform expressions |
| `renderTable()` | Render table from `jsonData.users` |
| `selectTableRow(row, idx)` | Select a table row |
| `renderSchema()` | Render schema view (lazy) |
| `formatJSON()` / `minifyJSON()` | Format/minify editor content |
| `applyEdit()` | Apply editor changes |
| `validateEditor()` | Live JSON validation |
| `cycleDrawer()` | Cycle drawer size (sm->md->lg->sm) |
| `switchDrawerTab(btn, id)` | Switch drawer tab |
| `toggleCmd()` | Toggle command palette |
| `filterCmds(q)` | Filter command palette items |
| `renderAnalyzeDrawer()` | Render key coverage analysis |
| `findArrays(obj, path, result)` | Find all arrays in JSON recursively |
| `highlightKeyInTree(key)` | Highlight all lines with a key |
| `highlightMissing(key)` | Show rows missing a key |
| `switchAnalyzeArray(path)` | Switch coverage analysis to different array |
| `analyzeData(data)` | Full JSON statistics analysis |
| `analyzeKeyCoverage(arr)` | Key presence/coverage analysis |
| `renderStatsView()` | Render full stats dashboard |

---

## 14. CSS THEME SYSTEM

- **Light mode:** Default (`:root` variables)
- **Dark mode:** `[data-theme="dark"]` attribute on `<body>`
- Toggled via `toggleTheme()` — swaps all CSS custom properties
- Dark-mode overrides for: `.j-key`, `.j-str`, `.j-num`, `.j-bool`, `.s-key`, `.s-type`, `.bool-false`, `.tree-line.find-hl`, `.toolbar-btn kbd`

---

## 15. LAYOUT SUMMARY

```
+---------------------------------------------------+
|  HEADER (brand, path bar, toolbar buttons)        |
+---------------------------------------------------+
|  DOC TAB BAR (multi-document tabs + "+" button)   |
+----+------------------------------------+---------+
|    |  CANVAS HEADER (view tabs + tools) |         |
|    +------------------------------------+         |
|    |  INSIGHT STRIP (stat chips)        |         |
| R  +------------------------------------+  CTX    |
| A  |                                    |  PANEL  |
| I  |  VIEW PANEL (tree/table/graph/     |  (290)  |
| L  |    schema/editor/stats)            |         |
|    |                                    |         |
|(48)+------------------------------------+         |
|    |  BOTTOM DRAWER (stats/expr/schema) |         |
+----+------------------------------------+---------+
|  STATUS BAR                                       |
+---------------------------------------------------+
     ^ Query Panel (260px) slides in from left
```
