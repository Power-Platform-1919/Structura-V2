# V2 Codebase Architecture Research

## Key Findings

### 1. File Structure (Under `src/`)
```
app.js                          # Bootstrap & initialization
core/
  base.js                       # StructraComponent base class
  state.js                      # Global state + event bus
  worker-pool.js               # Generic worker pool for parsing
  logger.js                    # Centralized logging
  dom-shim.js                  # DOM utilities
  constants.js                 # Shared config
components/
  structra-*.js               # 21 Web Components for UI
  structra-tree.js            # Tree view (delegates to V1 json-view)
  structra-table.js           # Table view with sorting
  structra-stats.js           # Stats dashboard
  structra-graph.js           # Node graph viz
  structra-schema.js          # Schema inference
  structra-editor.js          # Raw JSON editor
  structra-view-switcher.js   # View panel manager
  structra-header.js          # Path bar + toolbar
  structra-tabs.js            # Multi-tab manager
  structra-rail.js            # Left sidebar icons
  structra-input-panel.js     # File/paste/URL input
  (and 8 more shell components)
ui/
  json-view.js               # V1 virtualized tree renderer (150+ lines of chunking/recycling)
  (28 other V1 UI modules - most legacy)
workers/
  json-parse-worker.js       # JSON worker
  csv-parse-worker.js        # CSV worker
  xml-parse-worker.js        # XML worker
  yaml-parse-worker.js       # YAML worker
  toml-parse-worker.js       # TOML worker
utils/
  path.js                    # Path resolution + Power Platform builders
  json-utils.js              # JSON utilities
  traverse.js                # Tree traversal
  stats.js                   # Analysis functions
  storage.js                 # LocalStorage helpers
  (and 9 more utility modules)
```

### 2. Data Flow: Input → State → Views

**INPUT PHASE:**
1. User loads file/pastes JSON/URL in `structra-input-panel.js`
2. Panel calls `Structra.parseJsonAsync(text)` or `Structra.parseCsvAsync(text)`
3. These methods in `worker-pool.js` use worker pool to parse off-main-thread
4. Fallback to sync parse if workers fail (file:// protocol issue)
5. Parse result passed to `onJsonLoaded()` callback

**STATE PHASE:**
1. Input panel calls `Structra.set('jsonData', data)` with parsed data
2. Also sets: `fileName`, `fileSize`, `currentPath` 
3. Updates active tab's `.data` property: `Structra.tabs.list[activeId].data = data`
4. `Structra.events.emit('state:jsonData', { key, value, old })`

**VIEW PHASE:**
1. Each view component listens to `'state:jsonData'` event
2. Views set `_stale = true` if not currently active (lazy rendering)
3. When view becomes active, `view:switched` event triggers full render
4. Views read from `Structra.state.jsonData` directly (pass full object reference)
5. Each view is responsible for slicing/filtering data as needed

### 3. State Management System

**Global State Object (`Structra.state`):**
```javascript
{
  theme: 'light',              // Persisted to localStorage
  activeView: 'tree',          // Current view ID
  currentPath: '$',            // Selected node path
  jsonData: null,              // Parsed data object
  fileName: null,              // File name
  fileSize: 0,                 // Bytes
  drawerState: 'collapsed',    // collapsed|medium|expanded
  queryPanelOpen: false,       // Right panel visibility
  contextPanelOpen: false,     // Right panel visibility
  findBarOpen: false,          // Find bar visibility
}
```

**Event Bus (`Structra.events`):**
- Simple pub/sub with listeners map
- Emit pattern: `emit(event, data)`
- Subscribe: `on(event, handler)` / `off(event, handler)`
- Event naming: `'state:KEY'` for state changes, `'view:switched'`, `'tree:node-selected'`, etc.

**State Helpers:**
- `Structra.set(key, value)` - sets state + emits `'state:KEY'` event
- `Structra.get(key)` - reads state
- Theme persisted to localStorage
- Toast quick access: `Structra.toast(msg)`

**Tab State:**
```javascript
Structra.tabs = {
  list: [{ id, label, data, path, view, modified }],
  activeId: number,
  nextId: number,
}
```

### 4. How Views Consume Data

**PATTERN: All views receive FULL jsonData object, then slice/filter as needed**

| View | Data Consumption | Lazy Render? | Pagination |
|------|------------------|-------------|-----------|
| **Tree** | Full object → V1 json-view.js handles chunking | YES | Chunk-based with IntersectionObserver |
| **Table** | Full object → finds first array → slices to 1000 rows | YES | Hard cap at 1000 rows (perf) |
| **Stats** | Full object → analyzes entire tree (depth, keys, types, nulls) | YES | Batches 1000 rows for key collection |
| **Schema** | Full object → infers schema by traversing all objects/arrays | YES | Full traversal on demand |
| **Graph** | Full object → builds node graph limited by maxDepth prop | YES | Depth-limited by `props.maxDepth` (default 4) |
| **Editor** | Full object → JSON.stringify(data, null, 2) | YES | Skips if fileSize > 10MB |
| **JSON View (V1)** | Full array/object → splits into CHUNK_SIZE chunks | YES (✓) | Yes - detailed chunking |

### 5. Worker Pool Architecture

**Structra.createWorkerPool(config):**
- Generic pool factory returning pool object with `.enqueue(text, options?)`
- Lazy worker creation: starts with 0 workers, scales up as needed
- Config keys: `name`, `workerUrl`, `maxWorkers` (default 4), `poolThreshold` (4), `maxTasksPerWorker` (200)
- Queue size limits: `maxQueueSize` (64 items)
- Idle timeout: `idleTimeout` (60s) before terminating idle workers
- Transfer optimization: `transferThreshold` for Transferable ArrayBuffer

**JSON Parser Flow:**
1. `Structra.parseJsonAsync(text)` creates promise
2. Enqueues parsing task to pool
3. Pool either finds idle worker or scales up (if queue > poolThreshold)
4. Worker posts message with `{ id, text, options }`
5. Worker parses and returns `{ id, data }`
6. Main thread receives, clears task timer, drains queue
7. Promise resolves with parsed data
8. Fallback: if worker creation fails (file://), tries sync JSON.parse()

**CSV Parser:**
- Similar flow but uses PapaParse library
- `Structra.parseCsvAsync(text, options)`
- Returns `{ data: [], errors: [] }`

### 6. Existing Virtualization & Lazy Rendering

**json-view.js (V1 Renderer Delegated by Tree View):**
- ✓ Chunked rendering: CHUNK_SIZE = 100 items per chunk
- ✓ Forward loading: IntersectionObserver + sentinel DOM elements detect scrolling
- ✓ DOM recycling: offscreen chunks replaced with height-preserving placeholders
- ✓ Re-hydration: chunks re-rendered when scrolled back into view
- ✓ Data persistence: `window.App._jsonDataRef` holds reference to original data
- ✓ Path-based filtering: `_filterMatchedPaths` set survives chunk recycle/rehydrate
- Line counting: Tracks `fileLine` (actual file lines) vs `lineCounter` (DOM lines) for accurate scrolling

**Other Views:**
- Table: Hard-capped at 1000 rows (not scrollable pagination)
- Stats: Analyzes full tree (no virtualization)
- Schema: Full traversal (no virtualization)
- Graph: Depth-limited (no virtualization)
- Editor: Skips rendering if > 10MB (guard)

### 7. Base Element Class (StructraComponent)

```javascript
class StructraComponent extends HTMLElement {
  // Lifecycle hooks
  connectedCallback()         // Mount: calls init() → render()
  attributeChangedCallback()  // Observed attr change: calls update()
  
  // Override points
  init()                      // One-time setup (listeners, subscriptions)
  render()                    // Set this.innerHTML
  update(name, oldVal, newVal) // Handle specific prop changes
  
  // Utilities
  _readProps()                // Read HTML attrs into this.props (camelCase)
  set(key, value)             // Set prop (converts to kebab-case attr)
  get(key)                    // Get prop value
  $(selector)                 // this.querySelector
  $$(selector)                // this.querySelectorAll
  emit(name, detail)          // Dispatch custom event (bubbles)
  on(event, handler)          // Subscribe to Structra.events
  off(event, handler)         // Unsubscribe
}
```

### 8. App.js Bootstrap Sequence

1. Log setup info
2. Apply saved theme
3. Create initial tab: `{ id: 1, label: 'Untitled 1', data: null, path: '$', view: 'tree' }`
4. Sync tab-state coordination:
   - `tabs:switched` event → sync tab.data to global state
   - `state:jsonData` event → sync global state back to tab.data
   - `state:fileName` event → update tab.label
   - `state:fileSize` event → update tab.fileSize
5. Show input overlay
6. Mount view components into view-switcher panels
7. Setup global keyboard shortcuts (Ctrl+K, Ctrl+F, Ctrl+T, Ctrl+W, etc.)
8. Setup file drop handler (reads file, parses, sets state)

### 9. Component List & Data Dependencies

**Shell/Layout (Always Visible):**
- `structra-header` → reads `state:currentPath`, updates path input
- `structra-tabs` → listens to `tabs:changed`, manages tab switching
- `structra-rail` → emits `rail:action`, toggles panels
- `structra-status` → displays file/path info

**Canvas (Main Content):**
- `structra-view-switcher` → listens to `state:activeView`, manages panel visibility
- `structra-canvas-header` → breadcrumbs, expand/collapse buttons
- `structra-insight-strip` → quick stats banner
- `structra-find` → search/filter UI
- `structra-drawer` → Analyze/Expressions/Schema-Gen tabs

**Views (Consume Full jsonData):**
- `structra-tree` → delegates to V1 json-view.js (chunked rendering)
- `structra-table` → finds first array, slices to 1000 rows
- `structra-graph` → builds node graph (depth-limited)
- `structra-schema` → infers schema (full traversal)
- `structra-editor` → JSON.stringify + live validation
- `structra-stats` → analyzes data (full traversal)

**Panels (Side Drawers):**
- `structra-query` → query builder (toggleable via queryPanelOpen)
- `structra-context` → context panel (toggleable via contextPanelOpen)

**Overlays:**
- `structra-toast` → notifications
- `structra-command` → command palette
- `structra-loading` → global loading indicator
- `structra-input-panel` → file/paste/URL input (shown on load)

### 10. Key Insights

- **No Redux/Vuex:** Pure Structra.events pub/sub pattern
- **No React/Vue:** Vanilla Web Components with custom element lifecycle
- **Chunked Rendering:** V1's json-view.js is the workhorse for tree virtualization
- **Lazy View Rendering:** Views wait for `view:switched` event before rendering if not active
- **Data Efficiency:** Pass full object refs, views slice as needed (no data copying)
- **Theme Persistence:** Stored in localStorage, applied on boot
- **Worker Pool Scaling:** Starts with 0 workers, scales up on demand, scales down on idle
- **Path Resolution:** Supports dot notation, bracket notation, wildcards, quoted keys
- **Multi-Tab:** Tab state synced bidirectionally with global state
