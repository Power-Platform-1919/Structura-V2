# STRUCTRA V2 - Complete Component & View Type Audit

**Date**: June 2026  
**Scope**: `c:\Users\228295\Downloads\C_Temp\Personal Experiments\JsonAnalyzerV2\`

---

## EXECUTIVE SUMMARY

**23 Web Components** organized into 5 phases:
- **Phase 1 (Shell)**: Header, Tabs, Rail, Toast, Status
- **Phase 2 (Canvas)**: Canvas-header, Insight-strip, View-switcher, Drawer, Tree, Input-panel, Find, Filter
- **Phase 3 (Views)**: Table, Graph, Schema, Editor, Stats
- **Phase 4 (Panels)**: Query, Context
- **Phase 5 (Overlays)**: Command, Loading

**6 Primary Views** switchable in real-time: Tree | Table | Graph | Schema | Editor | Stats

**Core APIs**: Structra.engine, Structra.state, Structra.events, Structra.log, Structra.duckdb, Structra.jsonTree, Structra.virtualList

---

## PHASE 1: SHELL COMPONENTS

### 1. **structra-header.js** `<structra-header>`
- **Purpose**: Top branding bar with path input and toolbar
- **Features**:
  - Brand logo + "Structra" title
  - Search/path bar for manual path entry (e.g., `$.users[0].name`)
  - Toolbar buttons:
    - Copy path (clipboard)
    - Bookmark path
    - Toggle theme (light/dark)
    - Command palette trigger (⌘K)
- **Events emitted**: `command-palette:toggle`
- **Events listened**: `state:currentPath`
- **State used**: `currentPath`
- **Key methods**: `_copyPath()`

### 2. **structra-tabs.js** `<structra-tabs>`
- **Purpose**: Multi-document tab bar (similar to VS Code tabs)
- **Features**:
  - Create new tab (Ctrl+T)
  - Switch between tabs (click)
  - Close tab (click X or Ctrl+W)
  - Tab rename (double-click)
  - Unsaved indicator (modified dot)
  - Max 8 tabs (Structra.constants.MAX_TABS)
- **Events emitted**: `tabs:changed`, `tabs:switched`
- **Events listened**: `tabs:changed`, `tabs:add`, `tabs:close-active`
- **State used**: `Structra.tabs` (list, activeId, nextId)
- **Key methods**: `_addTab()`, `_closeTab()`, `_switchTab()`, `_startRename()`

### 3. **structra-rail.js** `<structra-rail>`
- **Purpose**: Left icon sidebar for feature selection
- **Features**:
  - Explorer (active by default)
  - Query & Filter (toggle queryPanelOpen)
  - Power Platform (expressions module)
  - Stats (switch to stats view)
  - Transform (future feature)
  - Settings (bottom, placeholder)
- **Events emitted**: `rail:action`
- **State used**: `queryPanelOpen`, `activeView`
- **Toggle actions**: Query panel, view switching, settings

### 4. **structra-status.js** `<structra-status>`
- **Purpose**: Bottom status bar with metadata
- **Features**:
  - Ready indicator (green dot)
  - Current file name
  - DuckDB status (✓ ready / ⟳ loading / ✗ failed)
  - Current path display
  - Log mode toggle (Off / Normal / Dev) cycling
- **Events listened**: `state:currentPath`, `state:fileName`, `tabs:switched`, `engine:duckdb-ready`
- **State used**: `currentPath`, `fileName`
- **Key methods**: `_cycleLogMode()`, `_updateDuckStatus()`

### 5. **structra-toast.js** `<structra-toast>`
- **Purpose**: Floating notification overlay
- **Features**:
  - Auto-hide (2.2s default)
  - Checkmark icon + message text
  - Customizable duration via `duration` attribute
- **Events listened**: `toast`
- **Key methods**: `show(msg)`

---

## PHASE 2: CANVAS COMPONENTS

### 6. **structra-canvas-header.js** `<structra-canvas-header>`
- **Purpose**: View tabs + tree toolbar (below main header)
- **Features**:
  - **View tabs**: Tree | Table | Graph | Schema | Editor | Stats (switchable)
  - **Tree controls**:
    - Expand All (+All)
    - Collapse All (−All)
    - Depth 1 (D1)
    - Depth 2 (D2)
  - **Right toolbar**:
    - Find (Ctrl+F) → opens find bar
    - Filter (Ctrl+Shift+F) → opens filter panel
    - Wrap → toggle word wrap mode
    - Edit → switch to editor view
    - Copy → copy full JSON to clipboard
- **Events emitted**: `tree:expand-all`, `tree:collapse-all`, `tree:collapse-depth`, `tree:toggle-wrap`
- **State used**: `activeView`
- **Key methods**: `_updateTabs()`, `_copyJson()`

### 7. **structra-insight-strip.js** `<structra-insight-strip>`
- **Purpose**: Quick stats chips below canvas header
- **Features**: Displays inline stats from `Structra.engine.analyze()`:
  - Keys count (blue)
  - Max depth (green)
  - Arrays found (amber)
  - String count (purple)
  - Null count (red)
  - Object count (gray)
  - Optional: File name + size chip
- **Events listened**: `state:jsonData`, `state:fileName`
- **Key methods**: `_compute()`

### 8. **structra-view-switcher.js** `<structra-view-switcher>`
- **Purpose**: Lightweight view container manager (not visual)
- **Features**:
  - Renders divs for each view (tree, table, graph, schema, editor, stats)
  - Only one view `.active` at a time (CSS display: none others)
  - Emits `view:switched` event when active view changes
  - Provides `getPanel(viewName)` method
- **Events listened**: `state:activeView`
- **State used**: `activeView`
- **Key methods**: `_switch(view)`, `getPanel(view)`

### 9. **structra-tree.js** `<structra-tree>`
- **Purpose**: Primary hierarchical JSON view (virtualized)
- **Features**:
  - Virtualized rendering via `Structra.jsonTree` (handles 200k+ nodes)
  - Chunked lazy loading with DOM recycling
  - Collapse/expand with depth control
  - Path highlighting + selection
  - Inline value display (strings, numbers, booleans, null)
  - Word wrap mode toggle
  - Filter integration (highlights matched paths)
- **Events emitted**: `tree:node-selected`
- **Events listened**: `state:jsonData`, `state:currentPath`, `tree:expand-all`, `tree:collapse-all`, `tree:collapse-depth`, `tree:navigate-path`, `tree:toggle-wrap`, `engine:filter-changed`
- **State used**: `jsonData`, `activeView`
- **Key methods**: `renderTree()`, `_expandAll()`, `_collapseAll()`, `_collapseToDepth()`, `_highlightPath()`
- **Toolbar actions** (from canvas-header): Expand/Collapse, Depth control, Wrap toggle

### 10. **structra-find.js** `<structra-find>`
- **Purpose**: Find & Replace bar (always-on, toggleable)
- **Features**:
  - **Find modes**: text, /regex/, key:name, $.path, SQL SELECT
  - DuckDB-backed search when available, falls back to in-memory
  - Previous/Next navigation (Shift+Enter / Enter)
  - Replace UI (toggle with Ctrl+H)
  - Replace One / Replace All buttons
  - Match counter (e.g., "5/12")
  - Clear button
- **Events emitted**: `engine:filter-changed` (for DuckDB integration)
- **Events listened**: `state:findBarOpen`, `overlay:close`, `engine:data-modified`
- **State used**: `findBarOpen`
- **Key methods**: `_doFind()`, `_doDbFind()`, `_doSqlFind()`, `_prev()`, `_next()`

### 11. **structra-filter.js** `<structra-filter>`
- **Purpose**: Advanced filter panel with structured conditions
- **Features**:
  - **Operators**: contains, not contains, eq, neq, gt, lt, gte, lte, startswith, endswith, isnull, notnull
  - **Logic**: AND / OR between conditions
  - Dynamic column selector (from active dataset)
  - Value input with Enter-to-apply
  - DuckDB-backed execution when available
  - Apply / Clear buttons
- **Events listened**: `state:filterBarOpen`, `overlay:close`, `engine:ingested`, `engine:active`
- **State used**: `filterBarOpen`
- **Key methods**: `_addCondition()`, `_apply()`, `_clear()`, `_refreshColumns()`

### 12. **structra-input-panel.js** `<structra-input-panel>`
- **Purpose**: Unified data input UI (shown in overlay + inline in tree)
- **Features**:
  - **5 tabs**:
    1. Upload File (drag-drop, file browser) - supports JSON, CSV, XML, YAML, TOML
    2. Paste Data (format auto-detect or manual select)
    3. Load URL (GET/POST/PUT/PATCH/DELETE, auth, headers, body)
    4. Recent (recent files list)
  - **API tab options**: Auth (Bearer/Basic/APIKey), Headers, Body
  - Error display + sample data button
- **Events emitted**: Data loaded → ingested into engine
- **Uses**: Format detection, file parsing, API calls
- **Key methods**: `_wireEvents()`, file/text/URL parsing handlers

### 13. **structra-drawer.js** `<structra-drawer>`
- **Purpose**: Collapsible bottom drawer with tabs (Analyze | Expressions | Schema Gen)
- **Features**:
  - **3 states**: collapsed (36px) → medium (40vh) → expanded (80vh)
  - Cycle via handle chevron or drawer button
  - Manual resize (drag bar) with custom height
  - Double-click bar resets to medium
  - Tab navigation (nav buttons switch panels)
  - Renders `<structra-drawer-stats>` in Analyze tab
- **Events emitted**: `drawer:tab-switched`
- **Events listened**: `state:drawerState`, `state:jsonData`
- **State used**: `drawerState`, `jsonData`
- **Key methods**: `_cycle()`, `_initResize()`, `_applyState()`, `_switchTab()`, `getPanel(id)`

### 14. **structra-drawer-stats.js** `<structra-drawer-stats>`
- **Purpose**: Compact stats panel rendered inside drawer's Analyze tab
- **Features**:
  - Mini 6-card grid (Nodes, Keys, Rows, Gaps, Nulls, Depth)
  - Data quality bar (Completeness / Consistency / Uniqueness %)
  - Type summary (str, num, bool, null, obj, arr pills)
  - Engine indicator (🦆 DuckDB vs 🧠 In-Memory)
  - Debounced rendering (only renders when tab is active)
- **Events listened**: `engine:ingested`, `engine:duckdb-registered`, `state:jsonData`, `engine:active`, `engine:data-modified`, `drawer:tab-switched`
- **Key methods**: `_tryRender()`, `_renderContent()`, `_debouncedRender()`

---

## PHASE 3: VIEW COMPONENTS (Switchable)

### 15. **structra-table.js** `<structra-table>`
- **Custom tag**: `<structra-table>`
- **Purpose**: Tabular array view with sorting + pagination + virtual scroll
- **Features**:
  - **Engine-backed**: Uses `Structra.engine.sort()` for database-level sorting
  - **Pagination**: Configurable page size (default 50, from settings)
  - **Virtual scroll**: Auto-enables for 200+ rows (virtual DOM recycling)
  - **Sticky header** with sort indicators (↑↓)
  - **Row selection** → updates currentPath
  - **Column sort** (click header) with asc/desc toggle
  - **Page actions**: First, Prev, Next, Last
  - **Page size selector** dropdown (25, 50, 100, 250)
  - **Filtered query support**: can render SQL result rows
- **Events emitted**: `tree:node-selected`
- **Events listened**: `state:jsonData`, `view:switched`, `engine:ingested`, `settings:changed`, `engine:filter-changed`
- **State used**: `jsonData`, `activeView`
- **Data sources**: 
  - Active query rows (if filter active)
  - Engine flat-array (database-backed if available)
  - Raw data fallback (find first object array)
- **Key methods**: `_resolveData()`, `_sortRows()`, `renderTable()`, `_handlePageAction()`

### 16. **structra-graph.js** `<structra-graph>`
- **Custom tag**: `<structra-graph>`
- **Purpose**: SVG node graph visualization (tree-like layout)
- **Features**:
  - **Zoom toolbar**: Fit, In/Out, Reset, Level indicator
  - **Pan & Zoom**: Mouse drag to pan, scroll to zoom (0.2x → 3x)
  - **Expand nodes**: Click ellipsis nodes to show hidden children
  - **Layout**: Hierarchical tree layout (custom positioning)
  - **Max depth**: Configurable (default 4), prevents rendering too deep
  - **Node types**: array, object, string, number, boolean, null, ellipsis
  - **Labels**: key names + data summaries (e.g., `users [42]`, `active: true`)
  - **Visual encoding**: Color by type (different stroke colors for types)
  - **Filter support**: Re-renders on filter change
- **Events listened**: `state:jsonData`, `view:switched`, `engine:ingested`, `engine:filter-changed`
- **State used**: `jsonData`, `activeView`
- **Props**: `max-depth` attribute (integer)
- **Constants**: NODE_W=140, NODE_H=28, ZOOM_MIN=0.2, ZOOM_MAX=3
- **Key methods**: `renderGraph()`, `_buildTree()`, `_layoutTree()`, `_redraw()`, `_handleZoom()`, `_handlePan()`

### 17. **structra-schema.js** `<structra-schema>`
- **Custom tag**: `<structra-schema>`
- **Purpose**: Inferred JSON schema display (read-only)
- **Features**:
  - Schema inference from data shape
  - Line-by-line display: key, type, required flag
  - Nested indentation (depth * 16px)
  - Type inference: object, array, string, number, integer, boolean, null
  - Array item schema (inferred from first item, merged from all items for accuracy)
  - Caches schema in `Structra.engine.getSchema()` for reuse
- **Events listened**: `state:jsonData`, `view:switched`, `engine:ingested`
- **State used**: `jsonData`, `activeView`
- **Key methods**: `renderSchema()`, `_inferSchema()`, `_mergeArrayItems()`, `_typeOf()`

### 18. **structra-editor.js** `<structra-editor>`
- **Custom tag**: `<structra-editor>`
- **Purpose**: Raw JSON editor (format, minify, validate, apply)
- **Features**:
  - Full JSON.stringify display (guards against very large files >10MB)
  - **Toolbar**:
    - Apply (parse + set as jsonData) - re-renders all views
    - Format (pretty-print with indent 2)
    - Minify (single-line JSON)
  - **Status indicator**: "✓ Valid JSON" | "✗ Invalid" (real-time validation)
  - Input validation via `Structra.parseJsonAsync()` (worker-based for large payloads)
  - Too-large warning (displays message instead of stringifying)
- **Events listened**: `state:jsonData`, `view:switched`
- **State used**: `jsonData`, `activeView`
- **Capabilities**: Full JSON editing for small files; validation + apply workflow
- **Key methods**: `_loadData()`, `_validate()`, `_format()`, `_minify()`, `_apply()`

### 19. **structra-stats.js** `<structra-stats>`
- **Custom tag**: `<structra-stats>`
- **Purpose**: Comprehensive data analytics dashboard (read-only)
- **Features**:
  - **Engine indicator**: 🦆 DuckDB vs 🧠 In-Memory
  - **1. Hero cards**: Nodes, Keys, Depth, Arrays, Nulls, File Size
  - **2. Type distribution**: Type bars (Strings, Numbers, Booleans, Nulls, Objects, Arrays)
  - **3. Data quality** (if array dataset):
    - Completeness, Consistency, Uniqueness percentages
    - Overall quality score with color coding (green ≥80%, amber ≥50%, red <50%)
    - Donut chart visualization
  - **4. Arrays found**: Clickable list of all arrays in data
  - **5. Key coverage table** (for active array):
    - Present %, Empty %, Missing % per column
    - Drill into nested arrays
  - **6. Field profiler table**:
    - Type, Coverage, Min/Max/Avg, Top 5 values per field
  - **Drill stack**: Back button to return to previous array
  - **DuckDB-powered** analysis when available, in-memory fallback
- **Events emitted**: `engine:analysisComplete`
- **Events listened**: `state:jsonData`, `view:switched`, `engine:ingested`, `engine:duckdb-registered`
- **State used**: `jsonData`, `activeView`
- **Key methods**: `renderStats()`, `_renderHero()`, `_renderTypes()`, `_renderQuality()`, `_renderArraysFound()`, `_renderKeyCoverage()`, `_renderProfiler()`, `_onClick()`

---

## PHASE 4: PANEL COMPONENTS (Togglable)

### 20. **structra-query.js** `<structra-query>`
- **Custom tag**: `<structra-query>`
- **Purpose**: Query panel for advanced searching (toggled via rail)
- **Features**:
  - **4 query modes** (tab buttons):
    1. **Path**: `$.users[0].name` or `*.email` (JSONPath-like)
    2. **JSONPath**: `$..name` (recursive descent)
    3. **Regex**: `/^[A-Z]/` (regex search on string values)
    4. **JS**: `=data.filter(x => x.active)` (JavaScript evaluation)
  - **Textarea input** with placeholder examples
  - **Run button** (Ctrl+Enter)
  - **Results panel**: Shows matched paths + value preview (up to 100 results)
  - **Click result** → navigates tree to path
- **Events listened**: `state:queryPanelOpen`
- **State used**: `queryPanelOpen`, `jsonData`, `currentPath`
- **Key methods**: `_runQuery()`, `_queryPath()`, `_queryJsonPath()`, `_queryRegex()`, `_queryJs()`

### 21. **structra-context.js** `<structra-context>`
- **Custom tag**: `<structra-context>`
- **Purpose**: Right detail panel for selected node
- **Features**:
  - **Header**: Displays selected path
  - **Value section**: Shows value (truncated to 200 chars for objects)
  - **Meta section**: Type, Length (for arrays/strings), Keys (for objects)
  - **Actions**:
    - Copy Value
    - Copy Path
    - Bookmark
    - Filter (placeholder)
    - Mock (placeholder)
  - **Auto-shows** when tree node selected, auto-hides on close overlay
- **Events emitted**: `tree:node-selected` (listener)
- **Events listened**: `tree:node-selected`, `state:contextPanelOpen`, `overlay:close`
- **State used**: `contextPanelOpen`, `jsonData`
- **Key methods**: `_show(path)`, `_resolve()`, `_copyValue()`, `_copyPath()`

---

## PHASE 5: OVERLAY COMPONENTS

### 22. **structra-command.js** `<structra-command>`
- **Custom tag**: `<structra-command>`
- **Purpose**: Command palette (Ctrl+K or button)
- **Features**:
  - **15 commands** searchable:
    - View commands: Tree (Ctrl+1), Table (Ctrl+2), Graph (Ctrl+3), Schema (Ctrl+4), Editor (Ctrl+E), Stats (Ctrl+5)
    - Action commands: Export CSV, Flatten, Sort, Generate TS Types, Mask Data, Compare/Diff, Validate Schema
  - **Search filter** (case-insensitive, real-time)
  - **Keyboard nav**: ↑↓ highlight, ↵ run, Esc close
  - **Selected item highlight** + scroll into view
  - **Click overlay to close**
- **Events listened**: `command-palette:toggle`, `overlay:close`
- **Key methods**: `_toggle()`, `_renderList()`, `_exec()`, `_highlightItem()`

### 23. **structra-loading.js** `<structra-loading>`
- **Custom tag**: `<structra-loading>`
- **Purpose**: Full-screen loading overlay with spinner
- **Features**:
  - Backdrop blur (g-loading class)
  - Centered card with spinner animation
  - Message text (customizable)
  - Attribute-based control: `active`, `message`
  - Show/hide methods + event listeners
- **Events listened**: `loading:show`, `loading:hide`
- **Key methods**: `show(msg)`, `hide()`, `update(name)`

---

## CORE API MODULES

### **Structra.engine** - Data Ingestion & Querying Engine
**File**: `src/core/engine.js`

#### Dataset Management
- `ingest(tabId, data, meta={})` → indexes + stores dataset
- `remove(tabId)` → cleanup dataset
- `setActive(tabId)` → switch context
- `getActive()` → current Dataset object

#### Data Operations
- `slice(offset, limit)` → paginated rows
- `sort(key, dir)` → sort active dataset (asc/desc)
- `search(pattern, opts)` → search values/keys/paths
- `filter(predicate)` → filter active array

#### Analysis & Querying
- `analyze(data)` → stats (nodes, keys, depth, arrays, nulls, types)
- `analyzeDb()` → DuckDB-backed analysis (async)
- `profileFields(rows)` → field-level profiling (types, coverage, nulls)
- `findFirstObjectArray(data)` → locate tabular data
- `countGaps(rows)` → count missing fields
- `getSchema()` → cached inferred schema
- `getStats()` → stats summary

#### Advanced
- `pathQuery(expr)` → JSONPath query
- `sql(query)` → DuckDB SQL (when ready)
- `diff(tabId1, tabId2)` → structural diff
- `findInDb(query)` → DuckDB-backed find (multi-mode)
- `getQuery()` → active query result (if filter/find applied)
- `formatSize(bytes)` → human-readable size

#### Events
- `engine:ingested` → {tabId, meta}
- `engine:active` → {tabId, dataset}
- `engine:removed` → {tabId}
- `engine:query-result` → {mode, result, duration}
- `engine:duckdb-ready` → {}
- `engine:filter-changed` → {query}
- `engine:error` → {message, context}

#### Internal State
- `_datasets` Map (tabId → Dataset)
- `_activeFilter` (query result cache)

### **Structra.state** - Application State (Reactive)
**File**: `src/core/state.js`

#### State Object
```javascript
Structra.state = {
  theme: 'light' | 'dark',
  activeView: 'tree' | 'table' | 'graph' | 'schema' | 'editor' | 'stats',
  currentPath: '$',
  jsonData: null | any,
  fileName: null | string,
  fileSize: 0 | number,
  drawerState: 'collapsed' | 'medium' | 'expanded',
  queryPanelOpen: false | true,
  contextPanelOpen: false | true,
  findBarOpen: false | true,
  filterBarOpen: false | true,  // managed by filter component
}
```

#### API
- `Structra.set(key, value)` → updates state + emits `state:${key}` event
- `Structra.get(key)` → reads state
- `Structra.toggleTheme()` → switch theme
- `Structra.applyTheme()` → apply to DOM

#### Events
- `state:${key}` → { key, value, old }

### **Structra.events** - Event Bus (Pub/Sub)
**File**: `src/core/state.js`

#### API
- `on(event, fn)` → subscribe to event
- `off(event, fn)` → unsubscribe
- `emit(event, data)` → fire event to all listeners
- `once(event, fn)` → subscribe for one-time execution

### **Structra.log** - Centralized Logging
**File**: `src/core/logger.js`

#### Modes
- `'dev'` - all logs (debug, info, warn, error, perf)
- `'normal'` - main logs (info, warn, error)
- `'off'` - errors only

#### API
- `log.info(tag, msg, data?)`
- `log.debug(tag, msg, data?)`
- `log.warn(tag, msg, data?)`
- `log.error(tag, msg, data?)`
- `log.perf(tag, action, durationMs)`
- `log.group(tag, label)`
- `log.groupEnd()`
- `log.setMode(mode)`
- `log.getMode()`

#### Tag Colors (Component-specific)
- Core: App, State, EventBus, WorkerPool
- Components: Tree, Table, Stats, Schema, Graph, Editor, etc.

### **Structra.duckdb** - DuckDB WASM Adapter
**File**: `src/core/duckdb.js`

#### Capabilities
- Non-blocking async initialization (loads in background)
- OPFS persistence (optional, requires COOP/COEP headers)
- In-memory fallback (works on file:// protocol)
- Registers JSON shapes: flat-array, nested-array, object
- Native JSON functions: json_extract, json_keys, unnest, json_type

#### API
- `init()` → start loading (called by app.js)
- `ready` → Promise<boolean>
- `query(sql)` → Promise<Array<Object>>
- `registerDataset(dataset)` → CREATE TABLE from dataset
- `getTableColumns(table)` → column names + types
- `dropTable(name)` → DROP TABLE
- `close()` → shutdown

#### Events
- `engine:duckdb-ready` → {}
- `engine:duckdb-failed` → {} (if WASM load fails)

### **Structra.jsonTree** - Virtualized JSON Renderer
**File**: `src/core/json-tree.js`

#### Chunking Strategy
- CHUNK_SIZE: 100 items per chunk
- OFFSCREEN_MARGIN: 3000px buffer before DOM recycling
- IntersectionObserver-based lazy loading
- DOM reuse (recycled chunks replaced with height placeholders)

#### API
- `render(container, data, opts)` → render tree (full lifecycle)
- `expandAll(container)` → expand all nodes
- `collapseAll(container)` → collapse all nodes
- `collapseToDepth(container, depth)` → collapse to depth N
- `highlightPath(container, path)` → highlight + scroll to path
- `highlightPaths(container, paths)` → highlight multiple paths
- `setFilter(container, matchedPaths)` → filter to paths
- `setFilterByRegex(container, regex)` → filter by regex
- `clearFilter(container)` → remove filter

#### Options (render)
```javascript
{
  onPathSelect: (path) => {},  // click handler
}
```

#### Visual Elements
- Syntax highlighting: keys (blue), strings (green), numbers (orange), booleans (amber), null (red), escapes (gray)
- Collapse/expand toggles on arrays/objects
- Line numbers + depth indentation
- Inline value display

### **Structra.virtualList** - Generic Virtual Scrolling
**File**: `src/core/virtual-list.js`

#### Use Cases
- Table virtual scroll (200+ rows)
- Tree chunking (large arrays)
- Graph rendering optimization

#### API
- `create(opts)` → VirtualListController

#### Options
```javascript
{
  container: HTMLElement,
  totalItems: number,
  chunkSize: 100,
  offscreenPx: 3000,
  buildChunk: (start, end, total) => string|HTMLElement,
  rehydrate: (chunkEl, start, end, total) => void,
  sentinelHtml: (remaining, start) => string,
  onChunkLoaded: (chunkEl, start, end) => void,
}
```

#### Controller Methods
- `loadAll()` - force-load all remaining chunks
- `destroy()` - cleanup
- `getChunk(index)` - get chunk element
- `scrollToItem(idx)` - scroll to item
- `applyToChunks(fn)` - iterate chunks
- `reset(totalItems)` - reset total count

### **Structra.constants** - Shared Configuration
**File**: `src/core/constants.js`

#### Key Constants
```javascript
MAX_TABS: 8,
VIEWS: ['tree', 'table', 'graph', 'schema', 'editor', 'stats'],
DRAWER_STATES: ['collapsed', 'medium', 'expanded'],
QUERY_MODES: ['path', 'jsonpath', 'regex', 'js'],
DRAWER_TABS: [{id, label}, ...],
SHORTCUTS: {
  'ctrl+k': 'command-palette',
  'ctrl+f': 'find',
  'ctrl+shift+f': 'filter',
  'ctrl+1-5': view commands,
  ...
}
```

---

## EXPRESSION MODULES

### **src/expressions/helpers.js**
- Generic helper functions (placeholder in V2)
- Expected utilities: path building, type checking

### **src/expressions/power-platform.js** `window.App.powerPlatform`
- **Power Automate expressions**: Access, array ops, object ops, string ops, conditions
- **Power Fx (Canvas Apps)**: Formulas for gallery/form controls
- Common patterns: Apply to Each, Compose, Initialize Variable
- Examples: `body('Parse_JSON')?['key']`, `items('Apply_to_each')['field']`

### **src/expressions/schema-gen.js** `window.App.schemaGen`
- **generateJsonSchema(value)** → JSON Schema from single sample
- **generateSmartSchema(data)** → Multi-sample schema inference (detects nullable, required, mixed types)
- Used in drawer's Schema Gen tab
- Detects required fields by scanning all array items

---

## STYLESHEET STRUCTURE

### **src/css/variables.css**
- CSS custom properties for theme, spacing, typography, colors
- Light/dark mode variants (data-theme attribute)

### **src/css/layout.css**
- Grid-based shell: header | tabs | [rail | query | canvas | context] | status
- Responsive flex layouts
- View-specific panels sizing

### **src/css/components.css**
- Reusable component classes:
  - `.brand` - branding element
  - `.search-bar` - path input
  - `.btn`, `.btn-primary` - buttons
  - `.toolbar-btn` - icon buttons
  - `.chip` - stat badges
  - `.card` - card containers
  - Input/select/textarea styles
  - Drawer, table, tree display styles

---

## INITIALIZATION ORDER (index.html)

1. **Phase 0: Polyfills** - settings.js, logger.js
2. **Phase 1: Core** - base.js, state.js, worker-pool.js, constants.js
3. **Phase 2: Data layer** - json-tree.js, virtual-list.js, persistence.js, engine.js, duckdb.js
4. **Phase 3: Shell** - Toast, Header, Tabs, Rail, Status
5. **Phase 4: Canvas** - Canvas-header, Insight-strip, View-switcher, Drawer, Tree, Input-panel, Find, Filter
6. **Phase 5: Views** - Table, Graph, Schema, Editor, Stats
7. **Phase 6: Panels** - Query, Context
8. **Phase 7: Overlays** - Command, Loading
9. **Phase 8: Bootstrap** - app.js

---

## KEY FEATURES MATRIX

| Feature | Component | Backend API |
|---------|-----------|-------------|
| Tree view | structra-tree | Structra.jsonTree, Structra.virtualList |
| Table view | structra-table | Structra.engine.sort, slice |
| Graph visualization | structra-graph | Structra.state.jsonData |
| Schema inference | structra-schema | Structra.engine.getSchema |
| Raw JSON edit | structra-editor | Structra.parseJsonAsync |
| Stats dashboard | structra-stats | Structra.engine.analyze, profileFields |
| Find & replace | structra-find | Structra.engine.findInDb (DuckDB) |
| Advanced filter | structra-filter | Structra.engine.filter (DuckDB/memory) |
| Multi-tab support | structra-tabs | Structra.tabs, Structra.engine.ingest |
| Path navigation | structra-context | Path resolver, tree selection |
| Query builder | structra-query | Custom path/regex/JS evaluators |
| Command palette | structra-command | View switching, action dispatch |
| Drawer analytics | structra-drawer-stats | Structra.engine.analyze, profileFields |

---

## STATE FLOW

```
User loads JSON
  ↓
structra-input-panel → parse (worker or sync)
  ↓
Structra.set('jsonData', data) 
  ↓
state:jsonData emitted
  ↓
All views subscribe: tree, table, graph, schema, editor, stats
  ↓
Structra.engine.ingest(tabId, data, meta) → builds indexes, registers with DuckDB
  ↓
User selects path (click tree node)
  ↓
Structra.set('currentPath', path) → tree:node-selected emitted
  ↓
structra-context updates with value/meta
```

---

## EVENTS & SUBSCRIPTIONS SUMMARY

### **Data Flow Events**
- `state:jsonData` ← tab switched, file loaded, editor applied
- `state:currentPath` ← tree node click, path bar Enter
- `state:activeView` ← canvas-header view tab click
- `engine:ingested` ← new dataset indexed
- `engine:filter-changed` ← find/filter applied
- `engine:duckdb-ready` ← DuckDB WASM loaded

### **UI Events**
- `tabs:switched` ← tab click (managed by Structra.tabs)
- `tree:node-selected` ← tree click propagates to context
- `tree:expand-all`, `tree:collapse-all` ← canvas-header buttons
- `view:switched` ← view-switcher broadcasts active view change
- `rail:action` ← rail icon clicks
- `drawer:tab-switched` ← drawer nav clicks
- `command:exec` ← command palette action

### **Overlay Events**
- `toast` ← user action feedback
- `loading:show` / `loading:hide` ← async operations
- `overlay:close` ← Escape key or close button

---

## PERFORMANCE OPTIMIZATIONS

### **Virtualization**
- Tree: Chunked rendering 100 items per chunk, DOM recycling
- Table: Virtual scroll for 200+ rows, row height caching
- Graph: Lazy node rendering, depth limiting

### **Caching**
- Engine: Per-dataset LRU cache (50 queries)
- Schema: Cached in engine.getSchema()
- Indexes: Column metadata cached after first scan

### **Async Operations**
- JSON parsing: Worker-based for large files (non-blocking)
- DuckDB: Loads in background, queries run async
- Find/Filter: Debounced input (250ms delay before query)

### **Lazy Loading**
- DuckDB: Non-blocking, falls back to in-memory until ready
- Drawer: Stats tab only renders when visible
- Expressions: Loaded on-demand from drawer tabs

---

## TESTING CONSIDERATIONS

### **Views to Test**
1. Tree - large nested objects, arrays, mixed types, 200k+ nodes
2. Table - pagination, sorting, virtual scroll, filtered results
3. Graph - zoom/pan, node expansion, depth limiting
4. Schema - recursive structures, nullable detection, array items
5. Editor - format/minify round-trip, invalid JSON recovery
6. Stats - quality scoring, field profiling, drill-down navigation

### **Interactions to Test**
1. Multi-tab workflow (create, switch, close, rename)
2. Find → highlight → context panel → copy path
3. Filter → apply → update all views
4. Editor → apply → refresh all views
5. Command palette → view switch + action dispatch
6. Drawer resize + state cycling

### **Data Edge Cases**
- Empty arrays, null values, deeply nested objects (10+ levels)
- Very large files (10MB+), circular references, mixed-type arrays
- Unicode strings, special characters, number precision

---

## SUMMARY QUICK REFERENCE

**23 Components** | **6 Views** | **5 Core APIs** | **Virtualized** | **Multi-tab** | **DuckDB-backed**

```
┌─────────────────────────────────────┐
│         structra-header             │  Path bar + Toolbar
├─────────────────────────────────────┤
│         structra-tabs               │  Multi-document tabs
├──┬──────────────────────────────────┤
│◁ │   structra-canvas-header        │  View switcher
│  ├────────────────────────────────┤
│  │ structra-insight-strip        │  Quick stats
│  ├────────────────────────────────┤
│  │ structra-view-switcher        │  [ACTIVE VIEW]
│  │ ┌──────────────────────────┐  │
│  │ │ structra-tree ✓          │  │ Primary: Virtualized tree
│  │ │ structra-table ✓         │  │ Tabular: Sort, paginate
│  │ │ structra-graph ✓         │  │ Visual: SVG graph
│  │ │ structra-schema ✓        │  │ Schema: Inferred types
│  │ │ structra-editor ✓        │  │ JSON: Edit + validate
│  │ │ structra-stats ✓         │  │ Analytics: Dashboard
│  │ └──────────────────────────┘  │
│  ├────────────────────────────────┤
│  │ structra-drawer (collapsed)    │  Drawer (Analyze | Expr | Schema)
│  │                                │  ↓ structra-drawer-stats
│  │ structra-find (overlay)        │  Find & Replace bar
│  │ structra-filter (overlay)      │  Advanced filter panel
│  └────────────────────────────────┘
├─────────────────────────────────────┤
│       structra-status               │  File, Path, Log mode, DuckDB status
├─────────────────────────────────────┤
│ Panels (toggleable):                │
│ - structra-query (left)             │  Query builder
│ - structra-context (right)          │  Node details
│                                     │
│ Overlays (full-screen):             │
│ - structra-input-panel (.io-overlay)│  File/URL/Paste input
│ - structra-command (#cmdOverlay)    │  Command palette
│ - structra-loading (#loadingOverlay)│  Spinner
│ - structra-toast                    │  Notifications
└─────────────────────────────────────┘
```
