# Workspace Exploration - JsonAnalyzerV2

## Complete File Structure

### Root Files
- `index.html` — Main entry point (script loading order documented)
- `structra-v2.html` — Alternative complete prototype/design mockup

### Core Directory (`src/core/`)
- `base.js` — StructraElement base class (custom element parent)
- `logger.js` — Centralized logger (dev/normal/off modes)
- `state.js` — Global state & event bus (Structra.state, Structra.events, Structra.tabs)
- `constants.js` — Shared config (VIEWS, SHORTCUTS, RAIL_ITEMS, etc.)
- `dom-shim.js` — DOM shim for V1 json-view.js compatibility
- `worker-pool.js` — Worker pool factory + async parser bindings

**MISSING (NOT FOUND):**
- `settings.js` ❌
- `data-engine.js` ❌
- `duckdb-adapter.js` ❌
- `persistence.js` ❌

### Utils Directory (`src/utils/`)
- `path.js` — Path tokenization, resolution, Power Platform path builders
- `storage.js` — localStorage + IndexedDB (dual-tier: <500KB in LS, large files in IDB)
- `json-utils.js` — Lint (dup key detection), operations (sort/flatten/search-replace), RFC 6902 patch
- `code-gen.js` — Code generation utilities
- `format-convert.js` — Format conversion helpers
- `data-mask.js` — Data masking utilities
- `dom.js` — DOM utilities
- `lib-loader.js` — Library loading
- `mock-gen.js` — Mock data generation
- `primitives.js` — Primitive type utilities
- `stats.js` — Statistics calculations
- `transform-ops.js` — Transform operations
- `traverse.js` — Tree traversal utilities
- `undo-stack.js` — Undo/redo stack

### Components Directory (`src/components/`) - 21 Components
**Shell Layer:**
- `structra-toast.js` — Toast notifications
- `structra-header.js` — Brand, path bar, toolbar
- `structra-tabs.js` — Tab management
- `structra-rail.js` — Left sidebar rail
- `structra-status.js` — Status bar

**Canvas Layer:**
- `structra-canvas-header.js` — Canvas header
- `structra-insight-strip.js` — Insight strip
- `structra-view-switcher.js` — View panel manager
- `structra-drawer.js` — Drawer panel
- `structra-tree.js` — Tree view (delegates to V1 json-view renderer)
- `structra-input-panel.js` — Input/upload panel
- `structra-find.js` — Find/search bar

**Views:**
- `structra-table.js` — Table view (sortable, selectable)
- `structra-graph.js` — Graph view
- `structra-schema.js` — Schema view
- `structra-editor.js` — Editor view
- `structra-stats.js` — Stats view

**Panels:**
- `structra-query.js` — Query/filter panel (path/jsonpath/regex/js modes)
- `structra-context.js` — Context panel

**Overlays:**
- `structra-command.js` — Command palette
- `structra-loading.js` — Loading overlay

### Workers Directory (`src/workers/`)
- `json-parse-worker.js` — JSON parsing (Transferable ArrayBuffer support)
- `csv-parse-worker.js` — CSV parsing (PapaParse)
- `xml-parse-worker.js` — XML parsing
- `yaml-parse-worker.js` — YAML parsing (js-yaml)
- `toml-parse-worker.js` — TOML parsing

### Expressions Directory (`src/expressions/`)
- `helpers.js` — Power Platform expression helpers
- `schema-gen.js` — JSON Schema generator (smart multi-sample inference)
- `power-platform.js` — Power Automate/Automate integration

### Libraries (`src/libs/`)
- `papaparse.min.js` — CSV parser
- `js-yaml.min.js` — YAML parser
- `toml.min.js` — TOML parser

### CSS (`src/css/`)
- `variables.css` — CSS variables
- `layout.css` — Layout styles
- `components.css` — Component styles

### Docs Directory
- `plan.md`, `architecture.md`, `build-plan.md`
- `v1-tree-virtualization.md`, `v1-input-overlay-analysis.md`
- `audit-v1-elements.md`, `audit-v2-prototype.md`
- `data-utilities-analysis.md`, `client-side-data-engines-research.md`
- `v2-codebase-research.md`, `css-system.md`
- `structra-v2-logger.md`

### Samples (`samples/`)
- `option-a.html`, `option-a-interactive.html`
- `option-b.html`
- `option-c.html`, `option-c-interactive.html`

---

## Architecture Overview

### Script Loading Order (index.html)
1. **Core Layer** — logger.js → base.js → state.js → worker-pool.js → dom-shim.js → constants.js
2. **Phase 1: Shell** — toast, header, tabs, rail, status
3. **Phase 2: Canvas** — canvas-header, insight-strip, view-switcher, drawer, json-view, tree, input-panel, find
4. **Phase 3: Views** — table, graph, schema, editor, stats
5. **Phase 4: Panels** — query, context
6. **Phase 5: Overlays** — command, loading
7. **Bootstrap** — app.js

### Core State Management (state.js)
- `Structra.state` — Centralized state object
- `Structra.events` — Event bus (pub/sub)
- `Structra.tabs` — Tab list + activeId tracking
- State keys: `theme`, `activeView`, `currentPath`, `jsonData`, `fileName`, `fileSize`, `drawerState`, `queryPanelOpen`, `contextPanelOpen`, `findBarOpen`
- Getters/setters: `Structra.get(key)`, `Structra.set(key, value)`
- Event emissions: `state:{key}` for all mutations

### Worker Pool Pattern (worker-pool.js)
**Features:**
- Lazy worker creation (creates on-demand, up to maxWorkers)
- Auto-scaling based on queue depth (poolThreshold)
- Task timeout management (default 60s for parsing)
- Idle worker termination (60s idle timeout)
- Transferable ArrayBuffer support for large files (JSON: 10MB threshold)
- Blob URL fallback for file:// origin (Worker creation blocked)
- Sync fallback (CSV uses PapaParse, YAML uses js-yaml if worker fails)

**Parser Instances:**
- JSON: max 4 workers, 60s timeout, 10MB transfer threshold
- CSV: max 4 workers, PapaParse + sync fallback
- XML: max 2 workers
- YAML: max 2 workers, js-yaml sync fallback
- TOML: max 2 workers, toml.js sync fallback

**API:**
- `Structra.parseJsonAsync(text)` → Promise<data>
- `Structra.parseCsvAsync(text, options)` → Promise<{data, meta, errors}>
- `Structra.parseXmlAsync(text)` → Promise<data>
- `Structra.parseYamlAsync(text)` → Promise<data>
- `Structra.parseTomlAsync(text)` → Promise<data>

### Storage System (storage.js)
**Dual-Tier Architecture:**
- **localStorage** — Recent files metadata, theme, bookmarks (< 500KB)
- **IndexedDB** — Large file data (> 500KB)

**DB Schema:**
- DB Name: `jpe_store`, Version: 1
- Store: `large_files` (key-value)
- Recent key format: `${name}__${size}`

**API Functions:**
- `getTheme()`, `setTheme(theme)`
- `getBookmarks()`, `setBookmarks(arr)`
- `getRecent()` → [{name, timestamp, size, ...}]
- `addRecent(name, data)` — Auto-routes to LS or IDB based on size
- `idbGet(key)`, `idbPut(key, value)`, `idbDelete(key)`, `idbClear()`

### Base Element Class (base.js)
- All custom elements extend `StructraElement`
- Auto-init: `connectedCallback()` → `_readProps()` → `init()` → `render()`
- Helpers: `on(event, fn)`, `$(selector)`, `$$(selector)`, `emit(event, data)`
- Props from HTML attributes (camelCase conversion)

### Initialization Flow (app.js)
1. Apply saved theme (localStorage)
2. Create initial tab (id=1, "Untitled 1", view='tree')
3. Set activeTab id=1, nextId=2
4. Emit `tabs:changed`
5. Mount view components into view-switcher panels
6. Set up tab-state coordination (bidirectional sync)
7. Show input overlay
8. Register global keyboard shortcuts
9. Set up file drop handler (JSON, CSV, TSV, XML, YAML support)
10. Parse dropped files via appropriate async parser
11. Update state (jsonData, fileName, fileSize, currentPath)

### Input Methods
1. **Drop Files** — Drag/drop support (app.js)
2. **Overlay Tabs** — structra-input-panel.js:
   - Upload File, Paste JSON, Import CSV, Load URL, Recent

---

## Key Missing Components
No dedicated storage/persistence layer files found:
- `settings.js` — app settings/preferences
- `data-engine.js` — query/filtering engine
- `duckdb-adapter.js` — DuckDB integration for analytics
- `persistence.js` — save/restore workflows

## Observations
1. **Storage** — Only localStorage + IndexedDB, no server-side persistence
2. **Parsing** — Multi-format support (JSON, CSV, XML, YAML, TOML) via worker pool
3. **Architecture** — Web component-based with central event bus + state
4. **Performance** — Worker pool with task timeouts, Transferable ArrayBuffer for large files
5. **Compatibility** — file:// origin fallbacks for Worker creation (Blob URL)
6. **State Management** — Simple pub/sub pattern, no Redux/store
7. **Views** — 6 views (tree, table, graph, schema, editor, stats) + overlays/panels
8. **Expressions** — Power Platform code generation helpers
9. **Data Utilities** — Lint, transform, RFC 6902 patch, stats
