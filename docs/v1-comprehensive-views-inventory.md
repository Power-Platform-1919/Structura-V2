# V1 Comprehensive Views & Features Inventory

## Overview
**Application Name:** Structra (JSON Path Explorer)  
**Architecture:** Vanilla JavaScript with modular UI components, chunked rendering for performance, worker-based JSON parsing  
**Main Dependencies:** Lucide icons, jsondiffpatch, Ajv (for schema validation), external libraries lazy-loaded via libLoader

---

## Part 1: UI/View Modules (src/ui/)

### 1. **json-view.js** - Core JSON Tree Renderer
**Purpose:** Main interactive JSON tree view with lazy-loading, search highlighting, and chunked DOM recycling  
**Key Features:**
- Chunked rendering (100 items per chunk) for 200k+ array handling
- IntersectionObserver-based forward loading + DOM recycling
- Data-level filtering (preserves across chunk rehydration)
- Line counter for file-like viewing
- Search highlight persistence via `setHighlight()` API
- Re-hydration of offscreen chunks when scrolled back

**DOM IDs Referenced:** `jsonView`  
**Dependencies:** `App.dom`, `App.traverse`, `App.path`, `App.contentPreview`  
**CSS Classes:** `.j-line`, `.j-key`, `.j-bracket`, `.j-value`, `.filter-hidden`, `.wrap-mode`  

---

### 2. **search.js** - Find/Replace in JSON Data
**Purpose:** Data-level search (not DOM), find/replace values and keys  
**Key Features:**
- Regex pattern support
- Find next/previous navigation
- Replace single or all occurrences
- Search state persists across view reloads
- Case-sensitive options

**DOM IDs Referenced:** `searchBar`, `searchInput`, `searchInfo`, `replaceRow`, `searchPrev`, `searchNext`  
**Dependencies:** `App.dom`, `App.traverse`, `App.jsonView`  
**Toolbar Control:** `btnSearch` (Ctrl+F)  

---

### 3. **stats-panel.js** - JSON Statistics & Key Analysis
**Purpose:** Right-side panel showing data statistics and array introspection  
**Key Features:**
- Key frequency analysis
- Array item counts and drilldown
- "Missing keys" detection popup for sparse arrays
- Nested object analysis
- Expandable array selector
- Click handlers for array navigation

**DOM IDs Referenced:** `statsBody`, `accStats`  
**Dependencies:** `App.dom`, `App.traverse`, `App.path`, `App.jsonUtils`  
**CSS Classes:** `.missing-panel`, `.missing-indices`  

---

### 4. **graph-view.js** - SVG Tree/Node Graph
**Purpose:** Interactive visual tree structure of JSON hierarchy  
**Key Features:**
- Lightweight SVG-based (no external graph libs)
- Pan and zoom controls
- Collapsible nodes
- Node width/height constants: NODE_W=140, NODE_H=28
- Tree layout algorithm
- Reset/fit-to-view buttons

**DOM IDs Referenced:** `graphView`, `graphZoomToolbar`, `gzLevel`, `gzFit`, `gzOut`, `gzIn`, `gzReset`  
**Dependencies:** `App.dom`  
**CSS Classes:** `.graph-container`, `.graph-svg`, `.graph-zoom-toolbar`  
**Toolbar Control:** `btnGraph`  

---

### 5. **simple-table.js** - Tabular Array View
**Purpose:** Convert arrays of objects into sortable, filterable HTML table  
**Key Features:**
- Column sorting (ascending/descending)
- Advanced column filtering (by values or conditions)
- Hidden column management
- Global search with wildcard support (*, ?)
- Date column auto-detection
- CSV export integration
- Row highlighting for filtered results
- Column context menu (right-click)

**DOM IDs Referenced:** `simpleTableView`, `stFilterPanel`  
**Dependencies:** `App.dom`, `App.dateHelpers`, `App.csvExport`, `App.path`, `App.jsonUtils`  
**CSS Classes:** `.simple-table-view`, `.st-table`, `.st-filter-panel`, `.st-row-highlight`  
**Toolbar Control:** `btnTable` (Ctrl+2)  

---

### 6. **data-profiler.js** - Field-Level Data Statistics
**Purpose:** Per-field statistical analysis for arrays of objects  
**Key Features:**
- Data type detection per field
- Null/empty percentage
- Min/max/avg/sum for numeric fields
- Unique value count and percentage
- Top N values for string/boolean fields
- Coverage percentage (present/missing)
- Sample value display

**DOM IDs Referenced:** (created dynamically, typically opened in modal)  
**Dependencies:** `App.dom`, `App.jsonUtils`  
**Toolbar Control:** `btnProfile`  

---

### 7. **help-modal.js** - Reusable Documentation Popup Builder
**Purpose:** Data-driven helper to display structured documentation  
**Key Features:**
- Section-based layout (heading, intro, code, tables, examples, tips, links)
- Automatic table generation from row data
- Example grouping with titles
- External link rendering

**DOM IDs Referenced:** (dynamic modal with id parameter)  
**Dependencies:** None (pure utility)  

---

### 8. **command-palette.js** - Fuzzy-Search Command Executor
**Purpose:** Ctrl+K global command palette for quick action access  
**Key Features:**
- Fuzzy matching with scoring
- Category grouping
- Keyboard navigation (↑↓ Enter Esc)
- Dynamic filtering as user types
- Selected item highlighting

**DOM IDs Referenced:** (created dynamically)  
**Dependencies:** `App.dom`  
**Toolbar Control:** `btnCmdPalette` (Ctrl+K)  

---

### 9. **null-finder.js** - Null/Empty Value Locator
**Purpose:** Highlights and navigates null, empty string, empty array/object paths  
**Key Features:**
- Data-level path collection (no DOM scanning)
- Persistent highlighting across chunk recycling
- Next/previous navigation
- Toggle on/off with status
- Automatically dismisses conflicting filters/search

**DOM IDs Referenced:** `btnNullFinder`  
**Dependencies:** `App.dom`, `App.jsonUtils`, `App.jsonView`  
**Toolbar Control:** `btnNullFinder`  

---

### 10. **transform-panel.js** - jq-style Data Transformation
**Purpose:** Safe expression-based filtering, mapping, sorting  
**Key Features:**
- Predefined transformation examples (map, filter, sort, unique, flatten, etc.)
- Safe evaluation (no eval(), predefined operations only)
- Help modal with documentation
- Expression input with syntax hints

**DOM IDs Referenced:** `transformPanel`, `tfHelpBtn`  
**Dependencies:** `App.dom`, `App.transformOps`  
**Toolbar Control:** `btnTransform` (Ctrl+T)  

---

### 11. **data-viz.js** - Size Heatmap & Mini Charts
**Purpose:** Visual indicators for JSON element sizes and data patterns  
**Key Features:**
- Size heatmap (color-coded by byte size)
- Sparkline/bar charts for numeric sequences
- Dynamic color scaling based on max size
- Toggle on/off heatmap mode
- Performance tuning constants (COLORS map)

**DOM IDs Referenced:** (applies CSS background colors to `[data-path]` elements)  
**Dependencies:** `App.dom`, `App.traverse`, `App.format`  
**Toolbar Control:** `btnHeatmap`  

---

### 12. **universal-filter.js** - Multi-Mode Advanced Filter
**Purpose:** Flexible path/JSONPath/Regex/JS expression-based filtering  
**Key Features:**
- Four filter modes: Path wildcard, JSONPath, Regex, JS expression
- Mode auto-detection
- History management (localStorage)
- Autocomplete path suggestions
- Debounced execution
- Abort token (runGeneration) for stale operation cancellation
- Help modal with syntax examples

**DOM IDs Referenced:** `treeFilterBar`, `treeFilterInput`, `treeFilterInfo`, `ufRun`, `ufResults`, `ufHelpBtn`  
**Dependencies:** `App.dom`, `App.autocomplete`, `App.helpModal`, `App.jsonView`  
**Toolbar Control:** `btnTreeFilter` (Ctrl+Shift+F)  

---

### 13. **validator.js** - JSON Schema Validator (Ajv-based)
**Purpose:** Validate JSON data against JSON Schema  
**Key Features:**
- Paste schema input
- Validation results display
- Generate schema from current data
- Lazy-loads Ajv library on first use
- Error highlighting and messages

**DOM IDs Referenced:** `validatorPanel`, `valInput`, `valRun`, `valResults`, `valGenerate`  
**Dependencies:** `App.dom`, `App.libLoader`, `App.schemaGen`  
**Toolbar Control:** `btnValidate`  

---

### 14. **snippet-library.js** - Reusable JSON Snippet Storage
**Purpose:** Save, load, and manage JSON value snippets  
**Key Features:**
- Save current path value as snippet
- Save entire document as snippet
- LocalStorage-based persistence
- Snippet name input
- Load/delete snippets from list

**DOM IDs Referenced:** `snippetModal`, `snippetList`, `snippetClose`, `snippetSaveCurrent`, `snippetSaveAll`  
**Dependencies:** `App.dom`, `App.storage`  
**Toolbar Control:** `btnSnippets`  

---

### 15. **autocomplete.js** - Reusable Input Autocomplete Widget
**Purpose:** Attach autocomplete dropdown to any input element  
**Key Features:**
- Configurable data source (getItems callback)
- Three match modes: prefix, contains, fuzzy
- Keyboard navigation (↑↓ Enter Esc)
- Custom item type display
- Hot-swap item list (updateItems)
- Cleanup on destroy

**DOM IDs Referenced:** (created dynamically)  
**Dependencies:** `App.dom`  
**Used by:** Path input, filter bar, command palette  

---

### 16. **type-def-modal.js** - Type Definition Generator
**Purpose:** Generate TypeScript/Python/Go/Java/etc. type definitions from JSON  
**Key Features:**
- Multi-language support (TypeScript, Python, Go, Rust, C#, Java, SQL)
- Tab-based language selection
- Copy-to-clipboard button
- Modal overlay display

**DOM IDs Referenced:** `typeDefModal`, `typeDefBody`, `typeDefClose`, `typeDefCopy`, `btnTypeDef`  
**Dependencies:** `App.dom`, `App.codeGen`  
**Toolbar Control:** `btnTypeDef`  

---

### 17. **json-editor.js** - Inline Text Editor Mode
**Purpose:** Switch JSON view to editable textarea with format/minify  
**Key Features:**
- Syntax validation with error highlighting
- Format (pretty-print)
- Minify
- Undo changes
- Line number display (js-lines)
- Status message display

**DOM IDs Referenced:** `jsonEditor`, `jeTextarea`, `jeLines`, `jeApply`, `jeFormat`, `jeMinify`, `jeUndo`, `jeStatus`  
**Dependencies:** `App.dom`, `App.undoStack`  
**Toolbar Control:** `btnEdit`  

---

### 18. **content-preview.js** - Auto-Detect String Content Types
**Purpose:** Visual hints for recognized string patterns (URLs, colors, emails, UUIDs, IP addresses, etc.)  
**Key Features:**
- 20+ pattern detectors (color, URL, email, UUID, JWT, IP, date, cron, phone, coordinates, etc.)
- Color preview boxes (hex/rgb/hsl)
- Image preview for URLs
- Country code → flag emoji mapping
- HTTP status code meanings
- Base64 decoding preview
- Relative time display for ISO dates
- Inline badges/icons for detected types

**DOM IDs Referenced:** (applies preview elements inline in tree)  
**Dependencies:** `App.dom`, `App.primitives`  

---

### 19. **minimap.js** - Tree Overview Canvas
**Purpose:** Mini visual summary of JSON structure with viewport indicator  
**Key Features:**
- Canvas-based rendering (lightweight)
- Color-coded by node type (key, string, number, boolean, null)
- Viewport rectangle indicator
- Drag to navigate
- LINE_HEIGHT=2px constant
- MINIMAP_WIDTH=80px constant

**DOM IDs Referenced:** `minimapContainer`, `btnMinimap`  
**Dependencies:** None (pure canvas)  
**Toolbar Control:** `btnMinimap`  

---

### 20. **multi-tab.js** - Multiple Document Tabs
**Purpose:** Hold multiple JSON documents in tabs, switch between them  
**Key Features:**
- Max 8 tabs
- Session persistence (localStorage)
- Double-click to rename tab
- Scroll position persistence per tab
- Tab creation/deletion
- Active tab highlighting

**DOM IDs Referenced:** `tabBar`, `tabItems`, `tabAdd`  
**Dependencies:** `App.dom`, `App.storage`  
**CSS Classes:** `.tab-bar`, `.tab-item`, `.tab-active`  

---

### 21. **zoom.js** - Font-Size Zoom Control
**Purpose:** Zoom in/out JSON viewer text (keyboard + mouse wheel + toolbar)  
**Key Features:**
- Range: 40% to 200%
- Step: 10%
- Keyboard: Ctrl+±, Ctrl+0 (reset)
- Mouse wheel over tree (with Ctrl held)
- Zoom level indicator tooltip
- Persistent select element

**DOM IDs Referenced:** `zoomSelect`, `btnZoomOut`, `btnZoomIn`, `btnZoomFit`  
**Dependencies:** `App.dom`  

---

### 22. **table-filter.js** - Column Filter Popup
**Purpose:** Per-column filter UI with values/conditions tabs  
**Key Features:**
- Value-based filtering (checkboxes for unique values)
- Condition-based filtering (operators + values)
- Logic operators (AND/OR)
- Positioned near column header
- Unique value extraction
- Current filter state loading

**DOM IDs Referenced:** `stFilterPanel`  
**Dependencies:** `App.dom`  
**Used by:** `simple-table.js`  

---

### 23. **workspace-export.js** - Save/Load Workspace State
**Purpose:** Export workspace settings, bookmarks, snippets as JSON file  
**Key Features:**
- Collect theme, bookmarks, snippets, toolbar state, filter history, tabs
- Export to JSON file (with timestamp)
- Import workspace state
- Version tracking (v1)
- Full state restoration

**DOM IDs Referenced:** `btnWorkspaceExport`, `workspaceImportInput`  
**Dependencies:** `App.dom`, `App.storage`, `App.multiTab`  

---

### 24. **shortcuts-handler.js** - Global Keyboard Bindings
**Purpose:** Wire all keyboard shortcuts to UI actions  
**Key Features:**
- Primary shortcuts: Ctrl+F (search), Ctrl+B (bookmark), Alt+Arrow (history)
- View switches: Ctrl+1/2/3/4 for Tree/Table/Schema/Graph
- Zoom shortcuts: Ctrl+±, Ctrl+0 (only active when hovering tree)
- Editor shortcuts: Ctrl+Z (undo), Ctrl+Y (redo)
- Search shortcuts: Enter (next), Shift+Enter (prev), Esc (close)
- Tree navigation: Arrow keys to navigate lines
- Double-click to search key name

**Dependencies:** `App.dom`, `App.search`, `App.universalFilter`, `App.zoom`, `App.jsonView`  

---

### 25. **input-handler.js** - Multi-Source JSON Loading
**Purpose:** Handle file upload, paste, CSV import, URL fetch, recent files  
**Key Features:**
- File drag-and-drop
- File picker input
- Paste JSON text
- CSV/TSV parsing
- HTTP request builder (GET/POST/PUT/PATCH/DELETE with auth/headers/body)
- Authentication types: None, Bearer, Basic Auth, API Key
- Recent files list
- Auto-detect JSON from clipboard
- Error display

**DOM IDs Referenced:** `dropArea`, `fileInput`, `pasteInput`, `csvInput`, `apiMethod`, `apiUrlInput`, `apiAuthType`, `recentList`, `inputError`  
**Dependencies:** `App.dom`, `App.formatConvert` (CSV parser)  

---

### 26. **toolbar-actions.js** - Toolbar Button Handler Delegation
**Purpose:** Wire toolbar button clicks to module actions  
**Key Features:**
- Collapse/expand tree (all, depth 1/2/3)
- Word wrap toggle
- Dark/light theme toggle
- Sort, flatten, minify operations
- Diff view toggle
- Heatmap toggle
- Various export/conversion dialogs

**DOM IDs Referenced:** `btnExpandAll`, `btnCollapseAll`, `btnDepth1/2/3`, `btnWrap`, `btnDark`, `btnSort`, `btnFlatten`, `btnMinify`, etc.  
**Dependencies:** `App.dom`, `App.jsonView`, `App.search`, `App.jsonOps`, `App.storage`  

---

### 27. **toolbar-pin.js** - Hide/Show Toolbar Buttons
**Purpose:** Right-click toolbar buttons to toggle visibility, overflow menu  
**Key Features:**
- Pin/unpin buttons to overflow dropdown
- Persistent hidden button list (localStorage)
- Always-visible buttons (copy, bookmark, search, dark, new)
- Overflow "More" menu dynamically built

**DOM IDs Referenced:** `btnMore`, `toolbarMoreMenu`  
**Dependencies:** `App.dom`, `App.storage`  

---

### 28. **shortcuts-overlay.js** - Help/Shortcuts Modal
**Purpose:** Press ? to show all keyboard shortcuts  
**Key Features:**
- Organized by category (Navigation, Views, Zoom, General)
- Modal overlay display
- Keyboard binding reference
- Help button to toggle

**DOM IDs Referenced:** (dynamic modal)  
**Dependencies:** `App.dom`  

---

### 29. **views.js** - Schema & Diff View Renderers
**Purpose:** Additional view types beyond tree (schema skeleton, diff)  
**Key Features:**
- **Schema View:** Lightweight recursive schema skeleton showing types/array lengths
- **Diff View:** RFC 6902 JSON Patch generation, jsondiffpatch-powered, show/hide unchanged, side-by-side display
- Lazy-loads jsondiffpatch on first use

**DOM IDs Referenced:** `schemaView`, `diffOverlay`, `diffLeft`, `diffRight`, `diffShowAll`, `diffClose`  
**Dependencies:** `App.dom`, `App.libLoader`  
**Toolbar Controls:** `btnSchema` (Ctrl+3), `btnDiff` (Ctrl+D)  

---

### 30. **command-registry.js** - Command Palette Registry
**Purpose:** Register all available commands for command palette  
**Key Features:**
- Centralized command list with shortcuts
- Categories: Search, Filter, Query, Schema, Views, Tools, Export, Edit
- Delegates to toolbar buttons or module actions
- ~35 commands registered

**Dependencies:** `App.dom`, `App.commandPalette`, `App.universalFilter`  

---

### 31. **panel-resizer.js** - Left/Right Panel Drag Resizer
**Purpose:** Drag vertical resizer to resize left (tree) and right (stats) panels  
**Key Features:**
- Mouse drag interaction
- Grid layout adjustment (CSS Grid)
- Collapse/expand right panel button
- Min/max width constraints (15% - 85%)
- Cursor feedback

**DOM IDs Referenced:** `panelResizer`, `resizerCollapse`  
**Dependencies:** `App.dom`  

---

## Part 2: Utility Modules (src/utils/)

### **path.js** - JSON Path Tokenization & Resolution
**Exports:** `tokenizePath()`, `resolvePath()`, `buildPAPath()`, `buildFxPathFull()`, `getLastKey()`, `setNestedValue()`  
**Purpose:** Parse and resolve dot/bracket notation paths (e.g., `root.items[0].name`)  
**Used by:** Nearly all modules for path handling

### **traverse.js** - Tree Walking & Analysis
**Exports:** `walk()`, `collectPaths()`, `collectArrayItemPaths()`, `findAllArrays()`, `findArrays()`, `findNullPaths()`, `searchValues()`  
**Purpose:** Recursive traversal with visitor pattern, array/null finding  
**Used by:** stats, search, null-finder, views, profile

### **json-utils.js** - JSON Transformation & Analysis
**Exports:** `sortKeys()`, `sortArray()`, `flatten()`, `unflatten()`, `searchReplace()`, `analyzeKeys()`, `profileKeys()`, `diff()`, `apply()`, `detectDuplicateKeys()`, etc.  
**Purpose:** Core JSON manipulation operations  
**Also exports:** `App.jsonLint`, `App.jsonOps`, `App.jsonPatch`

### **dom.js** - DOM Utility Functions
**Exports:** `$()`, `toast()`, `esc()`, `escCode()`, `copyAndToast()`, `exprRow()`, `showLoading()`, `hideLoading()`  
**Purpose:** Shared DOM helpers, HTML escaping, toast notifications

### **code-gen.js** - Multi-Language Code Generation
**Exports:** `generate(language, jsonData)` for TypeScript, Python, Go, Rust, C#, Java, SQL  
**Purpose:** Convert JSON to type definitions

### **format-convert.js** - Format Conversion & CSV Export
**Exports:** `generateCsv()`, `downloadCsv()`, `toYaml()`, `toXml()`, `toToml()`  
**Purpose:** Convert between JSON, CSV, YAML, XML, TOML  
**Also exports:** `App.csvExport`

### **data-mask.js** - Sensitive Data Masking
**Exports:** `maskValue()`, `toggleMask()`, `applyMask()`, `removeMask()`  
**Purpose:** Redact/blur sensitive patterns (SSN, credit card, email, etc.)

### **mock-gen.js** - Generate Mock Data
**Exports:** `generateMock(schema)`, `generateMockValue(type)`  
**Purpose:** Create realistic mock data for testing

### **primitives.js** - Type & Format Helpers
**Exports:** `formatSize()`, `formatTime()`, `relativeTime()`, `getByteSize()`, `typeOf()`, `typeFlags()`, `isDateValue()`, `parseDate()`, `detectDateColumns()`, plus case converters (camelCase, pascalCase, snakeCase)  
**Also exports:** `App.format`, `App.typeHelpers`, `App.dateHelpers`

### **storage.js** - LocalStorage Wrapper
**Exports:** `get()`, `set()`, `remove()`, `getTheme()`, `setTheme()`, `getBookmarks()`, `setBookmarks()`  
**Purpose:** Persistent settings & data storage

### **lib-loader.js** - Dynamic Library Loader
**Exports:** `require(libName)` - async loader for jsondiffpatch, Ajv, yaml, xml2js, toml  
**Purpose:** Lazy-load non-essential libraries on first use

### **transform-ops.js** - Safe Expression Evaluation
**Exports:** `evaluateExpression(expr, data)`  
**Purpose:** Safe evaluation with predefined operations (map, filter, sort, etc.), no eval()  
**Blocked patterns:** eval, Function, import, require, fetch, DOM access, etc.

### **stats.js** - Shared Stats & Array Discovery (deprecated/partial - now in json-utils.js)**

### **undo-stack.js** - Undo/Redo State Management
**Exports:** `push()`, `undo()`, `redo()`, `clear()`, `canUndo()`, `canRedo()`  
**Purpose:** Track document mutations

---

## Part 3: Expression Modules (src/expressions/)

### **power-platform.js** - Power Automate & Canvas App Expressions
**Purpose:** Generate ready-to-use expressions for Power Platform  
**Exports:** `generatePA(path, value)`, `generateFx(path, value, tokens)`  
**Key Features:**
- Power Automate (cloud flows): dynamic content expressions
- Canvas App (Power Fx): custom formula syntax
- Array operations: length, first, last, slice, filter, map
- Path reference formats (body.value[], items('Apply_to_each')?['field'])
- Object field access via bracket notation
- Datetime, string, and object manipulation functions

### **helpers.js** - Power Platform Helper Patterns
**Purpose:** Detect connector response shapes and generate common patterns  
**Key Features:**
- OData response detection (body.value[], d.results[])
- Apply to Each iterator suggestions
- Connection patterns for SharePoint, Dataverse, HTTP
- Child key extraction (e.g., 'Apply_to_each'?['field'])

### **schema-gen.js** - JSON Schema Generation
**Purpose:** Generate JSON Schema (draft-7) from data  
**Exports:** `generateJsonSchema()`, `generateSmartSchema()`, `inferArrayItemSchema()`  
**Key Features:**
- Single-sample inference
- Smart multi-sample inference (null detection, required fields, mixed types)
- Used by Parse JSON action in Power Automate

---

## Part 4: Workers (src/workers/)

### **json-parser.js** - Off-Main-Thread JSON Parsing
**Purpose:** Offload JSON.parse() to worker for large files (>1MB)  
**Features:**
- Accepts both string and Transferable ArrayBuffer
- Avoids structured clone overhead for huge strings
- Fallback to sync parse if worker fails
- Error handling via postMessage

---

## Part 5: Main Application State (app.js)

**Global State Managed:**
- `jsonData` - parsed JSON object
- `rawJsonText` - original JSON string
- `fileName` - loaded file name
- `pathHistory` - navigation history
- `historyIndex` - current position in history
- `bookmarks` - bookmarked paths
- `currentView` - active view mode ('json', 'table', 'schema', 'graph')
- `allPaths` - flattened path list for quick access
- `focusedLineIdx` - selected tree line index

**Core Event Handlers:**
- Path selection → renders right-side result/expressions
- Tree click → updates breadcrumb, path input, highlights
- View switch → toggles visibility of view containers
- JSON reload → re-parses via worker, clears state

---

## Part 6: DOM Structure Overview (index.html)

### Main Containers:
- `.input-overlay` - Initial JSON load UI (file/paste/CSV/URL/recent)
- `.toolbar` - Top button bar (Views, Export, Tools, etc.)
- `.breadcrumb-bar` - Path navigation crumbs
- `.main` - Grid layout: `[json-panel | resizer | right-panel]`
  - `.json-panel` - Left side: tree/table/schema/graph views
  - `.right-panel` - Right side: 5 accordions

### Right Panel Accordions:
1. **Stats** (accStats) - Key counts, array discovery, missing key analysis
2. **Bookmarks** (accBookmarks) - Saved path list
3. **Path Result** (accResult) - Value/code for selected path
4. **Power Platform Expressions** (accExpr) - Power Automate + Canvas App expressions
5. **Power Platform Helpers** (accHelpers) - Pattern suggestions
6. **Parse JSON Schema** (accSchema) - Schema generation output

### View Containers (toggled visibility):
- `#jsonView` - JSON tree (default visible)
- `#graphView` - Graph visualization
- `#simpleTableView` - Table view
- `#schemaView` - Schema skeleton
- `#jsonEditor` - Editor mode

### Overlay Dialogs:
- `#inputOverlay` - Initial data load
- `#diffOverlay` - Diff compare UI
- `#convertModal` - YAML/XML conversion
- `#urlModal` - API request builder
- `#typeDefModal` - Type definition output
- `#validatorPanel` - Schema validator
- `#snippetModal` - Snippet library
- `#transformPanel` - Transform expressions

### Toolbar Groups (dropdown menus):
1. **Views** - Graph, Schema, Types, Diff
2. **Export & Share** - CSV, Convert, Image, Share URL, Workspace
3. **Analyze** - Null Finder, Heatmap, Charts, Profile, Minimap, Pivot
4. **Tools** - Validate, URL Load, Repair, Snippets, Mask

---

## Part 7: CSS System (styles.css)

### Theme Variables:
- CSS custom properties with light/dark variants
- `--primary`, `--bg`, `--surface`, `--border`, `--text`, `--text-sec`, `--text-muted`, `--highlight`, `--search-hl`, `--search-cur`

### Layout:
- `.toolbar` - sticky top bar (z-index 100)
- `.main` - CSS Grid (3 columns: left | resizer | right)
- `.json-panel` - flex column, contains tree, table, schema, editor views
- `.right-panel` - scrollable, contains accordion sections

### Component Classes:
- `.j-line` - Single JSON line
- `.j-key` - Object key
- `.j-bracket` - Array/object brackets
- `.j-value` - Value display
- `.accordion` - Collapsible section (.open for expanded)
- `.search-bar` - Find/replace input row (display:none until toggled)
- `.tree-filter-bar` - Advanced filter input area
- `.toolbar-btn` - Standardized button
- `.modal-overlay` - Centered modal backdrop
- `.tab-bar` - Multi-tab container

---

## Summary Statistics

| Category | Count |
|----------|-------|
| UI View Modules | 31 |
| Utility Modules | 14 |
| Expression Modules | 3 |
| Worker Files | 1 |
| Right Panel Accordions | 6 |
| Toolbar Button Groups | 4 |
| DOM View Containers | 5 |
| Overlay Dialogs | 8 |
| Total .js files in src/ | ~60+ |

---

## Key Dependencies Graph

```
app.js
├── jsonView.js → traverse.js, path.js, contentPreview.js
├── search.js → traverse.js, jsonView.js
├── stats.js → traverse.js, path.js, jsonUtils.js
├── simpleTable.js → dateHelpers, jsonUtils.js, path.js
├── graphView.js
├── dataProfiler.js → jsonUtils.js
├── universalFilter.js → autocomplete.js, helpModal.js, jsonView.js
├── commandPalette.js → commandRegistry.js
├── transformPanel.js → transformOps.js
├── validator.js → libLoader.js (lazy-loads Ajv)
├── typeDefModal.js → codeGen.js
├── views.js → libLoader.js (lazy-loads jsondiffpatch)
├── powerPlatform.js → path.js, traverse.js
├── schemaGen.js
└── Storage, Theme, Bookmarks managed via storage.js
```

---

## Conclusion

The V1 codebase is a **feature-rich, modular JSON explorer** with:
- **31 distinct UI view/feature modules** serving different data exploration needs
- **Performance optimizations**: chunked DOM, web workers, lazy library loading
- **Power Platform integration**: native expression generation
- **Comprehensive data analysis**: profiling, diffing, validation, transformation
- **Keyboard-friendly**: 30+ shortcuts, command palette, accessibility focus
- **Extensible**: modular architecture, pluggable filters, custom transformations

All views are tightly orchestrated through `app.js` which manages global state, orchestrates module initialization, and handles view switching.
