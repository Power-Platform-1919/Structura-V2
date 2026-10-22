# Structra V1 — Complete UI Element Catalog

## 1. `<head>` — Metadata & Resources

| Element | ID/Class | Purpose |
|---|---|---|
| `<link>` favicon | — | SVG icon at `icons/icon.svg?v=2` |
| `<link>` stylesheet | `id="mainCSS"` | Loads `src/css/styles.css` |
| Inline `<script>` | — | Cache-busts the CSS with `Date.now()` |

---

## 2. Input Overlay (Landing Screen)

**Container:** `<div class="input-overlay" id="inputOverlay">`

| Element | ID / Class | Purpose | Section |
|---|---|---|---|
| Theme toggle button | `id="overlayThemeToggle"`, `class="overlay-theme-toggle"` | Toggle dark/light theme on landing page | Overlay top-right |
| Lucide icon inside toggle | `data-lucide="moon"` | Moon icon | — |
| Brand heading `<h2>` | — | SVG brand icon + "Structra" text | Overlay header |
| Sub-heading `<div class="sub">` | — | Tagline: "Explore your JSON data…" | Overlay header |

### 2a. Input Tabs

**Container:** `<div class="input-tabs">`

| Button | `data-t` | Label | Purpose |
|---|---|---|---|
| `class="input-tab-btn active"` | `file` | Upload File | Switch to file upload panel |
| `class="input-tab-btn"` | `text` | Paste JSON | Switch to paste panel |
| `class="input-tab-btn"` | `csv` | Import CSV | Switch to CSV import panel |
| `class="input-tab-btn"` | `url` | Load URL | Switch to URL/API panel |
| `class="input-tab-btn"` | `recent` | Recent | Switch to recent files panel |

### 2b. Input Panel — File Upload (`id="ip-file"`)

| Element | ID / Class | Purpose |
|---|---|---|
| Drop area | `id="dropArea"`, `class="drop-area"` | Drag-and-drop target for JSON files |
| Icon inside drop area | `<div class="icon">` | File emoji (📄) |
| Paragraph | — | "Drop JSON file here or click to browse" |
| Hidden file input | `id="fileInput"` | `<input type="file" accept=".json,.txt">` |

### 2c. Input Panel — Paste JSON (`id="ip-text"`)

| Element | ID / Class | Purpose |
|---|---|---|
| Textarea | `id="pasteInput"`, `class="paste-input"` | Manual JSON paste area |
| Load button | `id="btnGo"`, `class="btn-go"` | "▶ Load & Explore" — parse pasted JSON |

### 2d. Input Panel — CSV Import (`id="ip-csv"`)

| Element | ID / Class | Purpose |
|---|---|---|
| Textarea | `id="csvInput"`, `class="paste-input"` | Paste CSV/TSV data |
| Parse button | `id="btnCsvGo"`, `class="btn-go"` | "▶ Parse CSV & Load" |

### 2e. Input Panel — Load URL / API (`id="ip-url"`)

| Element | ID / Class | Purpose |
|---|---|---|
| HTTP method dropdown | `id="apiMethod"`, `class="api-method"` | GET/POST/PUT/PATCH/DELETE selector |
| URL text input | `id="apiUrlInput"`, `class="api-url"` | URL endpoint field |
| Send button | `id="btnApiSend"`, `class="btn-go api-send"` | "▶ Send" — fire API request |

**API Options sub-tabs** (`<div class="api-option-tabs">`):

| Tab button | `data-ap` | Label |
|---|---|---|
| `class="api-opt-tab active"` | `auth` | Auth |
| `class="api-opt-tab"` | `headers` | Headers |
| `class="api-opt-tab"` | `body` | Body |

**Auth panel** (`id="ap-auth"`):

| Element | ID / Class | Purpose |
|---|---|---|
| Auth type dropdown | `id="apiAuthType"`, `class="api-auth-type"` | None / Bearer / Basic / API Key |
| Auth fields container | `id="apiAuthFields"` | Dynamic auth input fields |

**Headers panel** (`id="ap-headers"`):

| Element | ID / Class | Purpose |
|---|---|---|
| Header key-value list | `id="apiHeadersList"`, `class="api-kv-list"` | List of header rows |
| Header key input | `class="api-kv-key"` | Header name input |
| Header value input | `class="api-kv-val"` | Header value input |
| Remove row button | `class="api-kv-remove"` | ✕ — remove header row |
| Add header button | `id="apiAddHeader"`, `class="api-add-row"` | "+ Add Header" |

**Body panel** (`id="ap-body"`):

| Element | ID / Class | Purpose |
|---|---|---|
| Body type dropdown | `id="apiBodyType"`, `class="api-body-type"` | None / JSON / Plain Text / Form URL-Encoded |
| Body editor textarea | `id="apiBodyEditor"`, `class="api-body-editor"` | Request body editor (hidden by default) |

**Status/Error:**

| Element | ID / Class | Purpose |
|---|---|---|
| API status | `id="apiStatus"`, `class="api-status"` | Shows response status |
| URL error | `id="urlLandingError"`, `class="url-error"` | Error message display |

### 2f. Input Panel — Recent (`id="ip-recent"`)

| Element | ID / Class | Purpose |
|---|---|---|
| Recent list | `id="recentList"`, `class="recent-list"` | Recently loaded files list |
| Empty state | `class="recent-empty"` | "No recent files" placeholder |

### 2g. Input Error

| Element | ID / Class | Purpose |
|---|---|---|
| Error display | `id="inputError"`, `class="input-error"` | Global input error message area |

---

## 3. Toolbar

**Container:** `<div class="toolbar">`

| Element | ID / Class | Purpose | Keyboard Shortcut |
|---|---|---|---|
| Brand label | `class="brand"` | SVG icon + "Structra" text | — |
| Separator | `class="sep"` | Visual divider | — |
| Back button | `id="btnBack"` | Navigate back in path history | `Alt+Left` |
| Forward button | `id="btnForward"` | Navigate forward in path history | `Alt+Right` |
| Path label | `<span class="label">` | "Path" label | — |
| Path input | `id="pathInput"`, `class="path-input"` | Type/display JSON path | — |
| Copy path button | `id="btnCopy"`, `class="toolbar-btn"` | Copy current path to clipboard | — |
| Bookmark button | `id="btnBookmark"`, `class="toolbar-btn"` | Bookmark current path | `Ctrl+B` |
| Separator | `class="sep"` | Visual divider | — |
| Search button | `id="btnSearch"`, `class="toolbar-btn"` | Open search bar | `Ctrl+F` |
| Advanced filter button | `id="btnTreeFilter"`, `class="toolbar-btn"` | Open advanced tree filter | `Ctrl+Shift+F` |
| Table view button | `id="btnTable"`, `class="toolbar-btn"` | Switch to table view | `Ctrl+2` |

### 3a. Views Dropdown Group

**Trigger:** `class="toolbar-btn toolbar-group-trigger"` — Eye icon + chevron-down

| Menu Item | ID | Icon | Label | Shortcut |
|---|---|---|---|---|
| Graph View | `id="btnGraph"` | `git-fork` | Graph View | — |
| Schema Preview | `id="btnSchema"` | `file-json` | Schema Preview | `Ctrl+3` |
| Generate Types | `id="btnTypeDef"` | `file-type` | Generate Types | — |
| Compare JSON | `id="btnDiff"` | `columns-2` | Compare JSON | — |

### 3b. Transform Button

| Element | ID | Icon | Shortcut |
|---|---|---|---|
| Transform | `id="btnTransform"` | `wand-2` | `Ctrl+T` |

### 3c. Export & Share Dropdown Group

**Trigger:** Download icon + chevron-down

| Menu Item | ID | Icon | Label |
|---|---|---|---|
| Export CSV | `id="btnExport"` | `file-spreadsheet` | Export CSV |
| Convert format | `id="btnConvert"` | `repeat-2` | Convert format |
| Export as Image | `id="btnImg"` | `image` | Export as Image |
| Share URL | `id="btnShare"` | `external-link` | Share URL |
| Save/Load Workspace | `id="btnWorkspaceExport"` | `hard-drive-download` | Save or Load Workspace |

**Hidden:** `<input type="file" id="workspaceImportInput" accept=".json" style="display:none">` — for workspace import

### 3d. Analyze Dropdown Group

**Trigger:** Activity icon + chevron-down

| Menu Item | ID | Icon | Label |
|---|---|---|---|
| Find Null/Empty | `id="btnNullFinder"` | `search-x` | Find Null or Empty |
| Size Heatmap | `id="btnHeatmap"` | `flame` | Size Heatmap |
| Data Charts | `id="btnCharts"` | `bar-chart-2` | Data Charts |
| Data Profile | `id="btnProfile"` | `scan-line` | Data Profile |
| Tree Overview | `id="btnMinimap"` | `map` | Tree Overview |
| Pivot Table | `id="btnPivot"` | `table-2` | Pivot Table |

### 3e. Tools Dropdown Group

**Trigger:** Settings icon + chevron-down

| Menu Item | ID | Icon | Label |
|---|---|---|---|
| Validate Schema | `id="btnValidate"` | `shield-check` | Validate Schema |
| Load from URL | `id="btnUrl"` | `globe` | Load from URL |
| Repair JSON | `id="btnRepair"` | `wrench` | Repair JSON |
| Snippet Library | `id="btnSnippets"` | `library` | Snippet Library |
| Mask Sensitive Data | `id="btnMask"` | `eye-off` | Mask Sensitive Data |

### 3f. Standalone Toolbar Buttons (right side)

| Element | ID | Icon | Purpose |
|---|---|---|---|
| Sort Keys | `id="btnSort"` | `arrow-down-a-z` | Sort JSON keys |
| Flatten/Unflatten | `id="btnFlatten"` | `layout-grid` | Flatten or unflatten JSON |
| Compact/Expand | `id="btnMinify"` | `braces` | Minify or pretty-print |
| Clear & Load New | `id="btnNew"`, `class="btn-clear"` | `trash-2` | Reset and load new JSON |
| Toggle theme | `id="btnDark"` | `moon` | Dark/light theme toggle |
| Command Palette | `id="btnCmdPalette"` | `terminal` | Open command palette | `Ctrl+K` |

---

## 4. Breadcrumb Bar

| Element | ID / Class | Purpose |
|---|---|---|
| Breadcrumb | `id="breadcrumb"`, `class="breadcrumb-bar"` | Path breadcrumb trail below toolbar |

---

## 5. Main Content Area

**Container:** `<div class="main">`

### 5a. JSON Panel (`<div class="json-panel">`)

#### Panel Header

| Element | ID / Class | Purpose |
|---|---|---|
| Title span | — | "JSON Document" |
| Doc metadata | `id="docMeta"`, `class="meta"` | Shows document stats (size, etc.) |

**Panel Header Buttons** (`<div class="panel-btns">`):

| Button | ID | Label/Title | Purpose |
|---|---|---|---|
| Expand All | `id="btnExpandAll"` | "+All" | Expand all tree nodes |
| Collapse All | `id="btnCollapseAll"` | "−All" | Collapse all tree nodes |
| Depth 1 | `id="btnDepth1"` | "D1" | Collapse to depth 1 |
| Depth 2 | `id="btnDepth2"` | "D2" | Collapse to depth 2 |
| Depth 3 | `id="btnDepth3"` | "D3" | Collapse to depth 3 |
| Word Wrap | `id="btnWrap"` | "Wrap" | Toggle word wrap |
| Edit JSON | `id="btnEdit"` | "Edit" | Switch to edit mode |
| Separator | `id="treeZoomSep"`, `class="panel-separator"` | Visual divider |

**Zoom Controls** (`id="treeZoomGroup"`):

| Element | ID | Purpose | Shortcut |
|---|---|---|---|
| Zoom Out | `id="btnZoomOut"` | Decrease zoom | `Ctrl+-` |
| Zoom Select | `id="zoomSelect"`, `class="zoom-select"` | Dropdown: 50%–200% | — |
| Zoom In | `id="btnZoomIn"` | Increase zoom | `Ctrl+=` |
| Zoom Fit | `id="btnZoomFit"` | Auto-fit zoom | — |

**Zoom Select Options:** 50%, 75%, 80%, 90%, 100% (default), 110%, 125%, 150%, 175%, 200%

#### Tree Filter Bar (`id="treeFilterBar"`, hidden by default)

| Element | ID / Class | Purpose |
|---|---|---|
| Filter textarea | `id="treeFilterInput"` | Multi-line filter input (path, pattern, expression) |
| Run button | `id="ufRun"`, `class="uf-run"` | Execute filter (hidden by default) |
| Filter info | `id="treeFilterInfo"`, `class="tree-filter-info"` | Match count/info |
| Help link | `id="ufHelpBtn"`, `class="uf-help-link"` | "?" syntax help |
| Clear button | `id="treeFilterClear"` | ✕ — clear filter |

#### Universal Filter Results (`id="ufResults"`, hidden)

| Element | ID / Class | Purpose |
|---|---|---|
| Results container | `id="ufResults"`, `class="uf-results"` | Displays filter results |

#### Search Bar (`id="searchBar"`, `class="search-bar"`)

**Search Row:**

| Element | ID / Class | Purpose |
|---|---|---|
| Search input | `id="searchInput"` | "Search keys or values…" |
| Search info | `id="searchInfo"`, `class="search-info"` | "0/0" match counter |
| Previous match | `id="searchPrev"` | ↑ button |
| Next match | `id="searchNext"` | ↓ button |
| Toggle Replace | `id="searchToggleReplace"` | ↕ toggle replace row | `Ctrl+H` |
| Close search | `id="searchClose"` | ✕ close search bar |

**Replace Row** (`id="replaceRow"`):

| Element | ID / Class | Purpose |
|---|---|---|
| Replace input | `id="replaceInput"` | "Replace with…" |
| Replace One | `id="replaceOne"`, `class="replace-btn"` | Replace current match |
| Replace All | `id="replaceAll"`, `class="replace-btn"` | Replace all matches |
| Pattern checkbox | `id="searchRegex"` | Enable regex search |
| Keys checkbox | `id="searchKeys"` | Search keys only |

#### View Containers

| Container | ID / Class | Purpose |
|---|---|---|
| JSON Tree View | `id="jsonView"`, `class="json-view"` | Main tree rendering area |
| Graph View | `id="graphView"`, `class="graph-view hidden"` | Node-graph visualization |
| JSON Editor | `id="jsonEditor"`, `class="json-editor hidden"` | Raw edit mode |
| Simple Table View | `id="simpleTableView"`, `class="simple-table-view"` | Tabular view of data |
| Schema View | `id="schemaView"`, `class="schema-view"` | Schema preview panel |

#### Graph View Zoom Toolbar (`id="graphZoomToolbar"`)

| Button | ID | Title | Shortcut |
|---|---|---|---|
| Zoom to Fit | `id="gzFit"` | Zoom to fit | `Ctrl+Shift+1` |
| Separator | `class="gz-sep"` | — | — |
| Zoom Out | `id="gzOut"` | Zoom out | `Ctrl+-` |
| Zoom Level | `id="gzLevel"`, `class="gz-level"` | "100%" display | — |
| Zoom In | `id="gzIn"` | Zoom in | `Ctrl+=` |
| Separator | `class="gz-sep"` | — | — |
| Reset | `id="gzReset"` | Reset to 100% | — |

#### JSON Editor Toolbar (`class="je-toolbar"`)

| Element | ID / Class | Purpose | Shortcut |
|---|---|---|---|
| Apply button | `id="jeApply"`, `class="je-btn je-btn-primary"` | "▶ Apply" changes | `Ctrl+Enter` |
| Format button | `id="jeFormat"`, `class="je-btn"` | Pretty-print | — |
| Minify button | `id="jeMinify"`, `class="je-btn"` | Minify JSON | — |
| Undo button | `id="jeUndo"`, `class="je-btn"` | Undo edit | `Ctrl+Z` |
| Status span | `id="jeStatus"`, `class="je-status"` | Edit status display | — |

**Editor Body** (`class="je-body"`):

| Element | ID / Class | Purpose |
|---|---|---|
| Line numbers | `id="jeLines"`, `class="je-lines"` | Line number gutter |
| Textarea | `id="jeTextarea"`, `class="je-textarea"` | Main editing textarea |

### 5b. Panel Resizer

| Element | ID / Class | Purpose |
|---|---|---|
| Resizer handle | `id="panelResizer"`, `class="resizer"` | Drag to resize panels |
| Collapse toggle | `id="resizerCollapse"`, `class="resizer-collapse"` | ▶ Collapse/expand right panel |

### 5c. Right Panel (`id="rightPanel"`, `class="right-panel"`)

All right-panel sections are **accordions** with `class="accordion"` (some with `class="accordion open"`):

#### Stats Accordion (`id="accStats"`, open by default)

| Element | ID / Class | Purpose |
|---|---|---|
| Header | — | Icon (`bar-chart-3`) + "Stats" |
| Chevron | `class="chevron"` | ▶ expand/collapse indicator |
| Body | `id="statsBody"`, `class="acc-inner"` | Stats content |
| Empty state | `class="no-result"` | "Load JSON to see stats" |

#### Bookmarks Accordion (`id="accBookmarks"`, collapsed)

| Element | ID / Class | Purpose |
|---|---|---|
| Header | — | Icon (`bookmark`) + "Bookmarks" |
| Body | `id="bookmarksBody"`, `class="acc-inner"` | Bookmarks list |
| Empty state | `class="no-result"` | "No bookmarks yet" |

#### Path Result Accordion (`id="accResult"`, open)

| Element | ID / Class | Purpose |
|---|---|---|
| Header | — | Icon (`file-text`) + "Path Result" |
| Badge | `id="resultBadge"`, `class="acc-badge"` | Result count badge |
| Body | `id="resultBody"`, `class="acc-inner"` | Path result content |
| Empty state | `class="no-result"` | "Click any element…" |

#### Power Platform Expressions Accordion (`id="accExpr"`, open)

| Element | ID / Class | Purpose |
|---|---|---|
| Header | — | Icon (`zap`) + "Power Platform Expressions" |
| Body | `id="exprBody"`, `class="acc-inner"` | Expression content |

**Expression Sub-tabs** (`class="expr-subtabs"`):

| Tab | `data-et` | Icon | Label |
|---|---|---|---|
| Active tab | `automate` | `zap` | Power Automate |
| Inactive tab | `canvas` | `paintbrush` | Canvas App |

| Pane | ID | Default Content |
|---|---|---|
| Power Automate | `id="ep-automate"`, `class="expr-pane active"` | "Select a path to see expressions" |
| Canvas App | `id="ep-canvas"`, `class="expr-pane"` | "Select a path to see expressions" |

#### Power Platform Helpers Accordion (`id="accHelpers"`, collapsed)

| Element | ID / Class | Purpose |
|---|---|---|
| Header | — | Icon (`wrench`) + "Power Platform Helpers" |
| Body | `id="helpersBody"`, `class="acc-inner"` | Helper utilities |
| Empty state | `class="no-result"` | "Load JSON for utilities" |

#### Parse JSON Schema Accordion (`id="accSchema"`, collapsed)

| Element | ID / Class | Purpose |
|---|---|---|
| Header | — | Icon (`file-code`) + "Parse JSON Schema" |
| Body | `id="schemaGenBody"`, `class="acc-inner"` | Schema gen content |
| Empty state | `class="no-result"` | "Load JSON to generate schema" |
| Schema content wrapper | `id="schemaGenContent"`, `class="schema-gen-content"` | Holds toolbar + output |
| Copy Schema button | `id="btnCopySchema"`, `class="btn-go schema-copy-btn"` | "📋 Copy Schema" |
| Hint | `class="schema-hint"` | "Paste directly into Parse JSON action" |
| Schema output | `id="schemaOutput"`, `class="schema-output"` | `<pre>` block for schema JSON |

---

## 6. Context Menu (`id="ctxMenu"`, `class="ctx-menu"`)

| Item | `data-action` | Icon | Label |
|---|---|---|---|
| Copy Path | `copy-path` | 📋 | Copy Path |
| Copy Value | `copy-value` | 📄 | Copy Value |
| Copy Subtree | `copy-subtree` | 🌳 | Copy Subtree (JSON) |
| Copy As… (submenu) | `copy-as` | 💻 | Copy As… |
| Bookmark | `bookmark` | ⭐ | Bookmark |
| Generate Mock | `gen-mock` | ⚡ | Generate Mock Data |

**Copy As Submenu** (`id="ctxCopyAs"`):

| Item | `data-lang` |
|---|---|
| TypeScript | `typescript` |
| Python | `python` |
| C# | `csharp` |
| Go | `go` |
| Rust | `rust` |
| Java | `java` |
| SQL | `sql` |

---

## 7. Diff Overlay (`id="diffOverlay"`, `class="diff-overlay"`)

| Element | ID / Class | Purpose |
|---|---|---|
| Header title | — | "JSON Diff" |
| Show All button | `id="diffShowAll"` | Toggle unchanged lines visibility |
| Close button | `id="diffClose"` | Close diff overlay |
| Tab select dropdown | `id="diffTabSelect"`, `class="diff-tab-select"` | Load JSON from another tab |
| Diff input textarea | `id="diffInput"`, `class="diff-input"` | Paste second JSON to compare |
| Compare button | `id="btnDiffRun"`, `class="btn-go diff-run-btn"` | Run comparison |
| Patch button | `id="btnDiffPatch"` | Copy RFC 6902 JSON Patch |
| Left diff pane | `id="diffLeft"`, `class="diff-pane"` | Left side of diff |
| Right diff pane | `id="diffRight"`, `class="diff-pane"` | Right side of diff |

---

## 8. Convert Format Modal (`id="convertModal"`, `class="modal-overlay"`)

| Element | ID / Class | Purpose |
|---|---|---|
| Header title | — | "Convert Format" |
| Close button | `id="convertClose"` | Close modal |
| YAML tab | `data-cv="yaml"` (active) | Switch to YAML output |
| XML tab | `data-cv="xml"` | Switch to XML output |
| Body | `id="convertBody"`, `class="modal-body"` | Converted output |
| Copy button | `id="convertCopy"`, `class="primary"` | "Copy to Clipboard" |

---

## 9. URL Modal (`id="urlModal"`, `class="modal-overlay"`)

Mirrors the landing-page API panel but in a modal context:

| Element | ID / Class | Purpose |
|---|---|---|
| Header title | — | "Load JSON from API" |
| Close button | `id="urlClose"` | Close modal |
| HTTP method | `id="modalApiMethod"` | GET/POST/PUT/PATCH/DELETE |
| URL input | `id="modalApiUrl"` | API endpoint |
| Send button | `id="modalApiSend"` | "▶ Send" |

**Modal API Option Tabs** (`data-mp`):

| Tab | `data-mp` | Panel ID |
|---|---|---|
| Auth | `mauth` | `id="mp-mauth"` |
| Headers | `mheaders` | `id="mp-mheaders"` |
| Body | `mbody` | `id="mp-mbody"` |

**Auth panel:** `id="modalAuthType"` (dropdown), `id="modalAuthFields"` (dynamic)
**Headers panel:** `id="modalHeadersList"` (KV list), `id="modalAddHeader"` (+ Add Header)
**Body panel:** `id="modalBodyType"` (dropdown), `id="modalBodyEditor"` (textarea)
**Status/Error:** `id="modalApiStatus"`, `id="urlError"`

---

## 10. Type Definition Modal (`id="typeDefModal"`, `class="modal-overlay"`)

| Element | ID / Class | Purpose |
|---|---|---|
| Header title | — | "Type Definitions" |
| Close button | `id="typeDefClose"` | Close modal |
| Body | `id="typeDefBody"`, `class="modal-body"` | Generated type definitions |
| Copy button | `id="typeDefCopy"`, `class="primary"` | "Copy to Clipboard" |

**Language Tabs** (`data-td`):

| Tab | `data-td` | Label |
|---|---|---|
| Active | `ts` | TypeScript |
| — | `csharp` | C# |
| — | `powerfx` | Power Fx Type |
| — | `go` | Go |
| — | `python` | Python |
| — | `rust` | Rust |
| — | `sql` | SQL DDL |

---

## 11. Global Utilities

| Element | ID / Class | Purpose |
|---|---|---|
| Toast notification | `id="toast"`, `class="toast"` | Transient notification popup |
| Global loading overlay | `id="gLoading"`, `class="g-loading"` | Full-screen loading spinner |
| Loading spinner | `class="g-loading-spinner"` | Animated spinner |
| Loading message | `id="gLoadingMsg"`, `class="g-loading-msg"` | "Loading…" text |

---

## 12. All Keyboard Shortcuts Referenced in HTML

| Shortcut | Action | Element |
|---|---|---|
| `Alt+Left` | Back | `btnBack` |
| `Alt+Right` | Forward | `btnForward` |
| `Ctrl+B` | Bookmark path | `btnBookmark` |
| `Ctrl+F` | Search | `btnSearch` |
| `Ctrl+Shift+F` | Advanced Filter | `btnTreeFilter` |
| `Ctrl+2` | Table View | `btnTable` |
| `Ctrl+3` | Schema Preview | `btnSchema` |
| `Ctrl+T` | Transform | `btnTransform` |
| `Ctrl+K` | Command Palette | `btnCmdPalette` |
| `Ctrl+H` | Toggle Replace | `searchToggleReplace` |
| `Ctrl+-` | Zoom Out (tree & graph) | `btnZoomOut` / `gzOut` |
| `Ctrl+=` | Zoom In (tree & graph) | `btnZoomIn` / `gzIn` |
| `Ctrl+Shift+1` | Graph Zoom to Fit | `gzFit` |
| `Ctrl+Enter` | Apply editor changes | `jeApply` |
| `Ctrl+Z` | Undo (editor) | `jeUndo` |

---

## 13. Script Tags (load order)

**External CDN:**
- `https://unpkg.com/lucide@latest/dist/umd/lucide.min.js` — Lucide icon library
- Inline: `lucide.createIcons(...)` — initializes all `data-lucide` icons (14×14, stroke-width 1.5)

**Application Scripts** (loaded via dynamic `document.write`, cache-busted with `Date.now()`):

| # | Path | Category |
|---|---|---|
| 1 | `src/utils/primitives.js` | Utility |
| 2 | `src/utils/traverse.js` | Utility |
| 3 | `src/utils/storage.js` | Utility |
| 4 | `src/utils/undo-stack.js` | Utility |
| 5 | `src/utils/dom.js` | Utility |
| 6 | `src/utils/json-utils.js` | Utility |
| 7 | `src/utils/data-mask.js` | Utility |
| 8 | `src/utils/code-gen.js` | Utility |
| 9 | `src/utils/path.js` | Utility |
| 10 | `src/utils/lib-loader.js` | Utility |
| 11 | `src/utils/mock-gen.js` | Utility |
| 12 | `src/utils/format-convert.js` | Utility |
| 13 | `src/ui/stats-panel.js` | UI |
| 14 | `src/expressions/power-platform.js` | Expression |
| 15 | `src/expressions/helpers.js` | Expression |
| 16 | `src/expressions/schema-gen.js` | Expression |
| 17 | `src/ui/graph-view.js` | UI |
| 18 | `src/ui/content-preview.js` | UI |
| 19 | `src/ui/json-view.js` | UI |
| 20 | `src/ui/views.js` | UI |
| 21 | `src/ui/table-filter.js` | UI |
| 22 | `src/ui/simple-table.js` | UI |
| 23 | `src/ui/help-modal.js` | UI |
| 24 | `src/ui/autocomplete.js` | UI |
| 25 | `src/ui/universal-filter.js` | UI |
| 26 | `src/utils/transform-ops.js` | Utility |
| 27 | `src/ui/transform-panel.js` | UI |
| 28 | `src/ui/validator.js` | UI |
| 29 | `src/ui/shortcuts-overlay.js` | UI |
| 30 | `src/ui/command-palette.js` | UI |
| 31 | `src/ui/data-viz.js` | UI |
| 32 | `src/ui/data-profiler.js` | UI |
| 33 | `src/ui/minimap.js` | UI |
| 34 | `src/ui/pivot-table.js` | UI |
| 35 | `src/ui/multi-tab.js` | UI |
| 36 | `src/ui/snippet-library.js` | UI |
| 37 | `src/ui/toolbar-pin.js` | UI |
| 38 | `src/ui/workspace-export.js` | UI |
| 39 | `src/ui/search.js` | UI |
| 40 | `src/ui/json-editor.js` | UI |
| 41 | `src/app.js` | Main |
