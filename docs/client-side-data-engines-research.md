# Plan: Structra V2 Data Engine (Revised)

## TL;DR
Build a **pluggable Data Engine** (`Structra.engine`) with a unified query API. Deployment on **GitHub Pages** (HTTP). Uses **DuckDB WASM as primary SQL engine** (loaded from CDN, ~3MB, cached by browser) + Custom JS Core for tree operations. Manages **named datasets** (one per tab) with cross-tab operations (diff, compare). All filter modes (path, JSONPath, regex, JS, SQL) route through the engine. Internet required for first load only (libraries cached). Data never leaves the browser. For local dev: `npx serve` or `python -m http.server`.

---

## Addressing Your Concerns

### 1. Portability (VS Code ext, web app, GitHub Pages)
The engine API is **environment-agnostic** — same interface everywhere:
- **GitHub Pages (primary deployment)**: Full power — DuckDB WASM + CDN libraries
- **VS Code extension webview**: Same as above (proper origin)
- **Local dev**: Open HTML via localhost (e.g., `npx serve`) — DuckDB WASM works fine
- **Offline**: Low priority — can add Service Worker to cache CDN assets later (acceptable tradeoff: first load needs internet)

**Internet OK** — libraries loaded from CDN (jsdelivr), cached by browser after first load.
**Data stays local** — never sent to any external API. All processing in-browser WASM sandbox.
**Large files OK** — DuckDB WASM (~3MB) downloaded once, browser-cached indefinitely.

The engine auto-selects the best available backend (DuckDB primary, JS Core while WASM loads).

### 2. Universal Filter Integration
Every filter mode maps directly to an engine method:

| Filter Mode | Engine Method | Returns |
|-------------|--------------|---------|
| Path (`*.email`) | `engine.searchPaths(regex)` | `{matchedPaths, total}` |
| JSONPath (`$.users[*].name`) | `engine.pathQuery(expr)` | `{results, pointers, matchedPaths}` |
| Regex (`/pattern/i`) | `engine.searchValues(regex)` | `{matchedPaths, total}` |
| JS (`=data.filter(...)`) | `engine.evaluate(expr)` | any result |
| SQL (NEW: `SELECT ...`) | `engine.sql(query)` | `Array<Object>` |
| Future modes | `engine.query({mode, expr})` | extensible `QueryResult` |

The filter bar tells the engine "query X" → engine returns a `QueryResult` → all views receive the same result via `engine:query-result` event.

### 3. Data Storage + Multi-Tab

```
engine.datasets = Map<tabId, Dataset>

Dataset = {
  id: 'tab-1',
  raw: Object|Array,         // the parsed data
  rawText: String|null,      // original text (for export/diff)
  meta: { name, size, format, timestamp, shape },
  indexes: { paths, columns, types },
  cache: LRU<queryKey, result>,   // per-dataset query cache
  duckTable: 'tab_1_data',       // DuckDB table name (if loaded)
}
```

- **Tab switch** → `engine.setActive(tabId)` → all queries operate on that dataset
- **Cross-tab ops**: `engine.diff(tabId1, tabId2)`, `engine.join(tabId1, tabId2, key)`
- **Persistence**: Raw data in IndexedDB, indexes rebuilt on reload
- **Memory**: Only active tab's indexes are in RAM; inactive tabs store raw only

---

## Tiered Backend Architecture

```
┌─────────────────────────────────────────────────────────┐
│             ENGINE API (same always)                    │
│  .slice() .filter() .sort() .search()                   │
│  .aggregate() .sql() .pathQuery()                       │
│  .getSchema() .getStats() .diff()                       │
└───────────────────────┬─────────────────────────────────┘
                        │ routes to best backend
              ┌─────────┼─────────┐
              ▼                   ▼
┌─────────────────────┐ ┌─────────────────────┐
│  DuckDB WASM        │ │  JS Core            │
│  (primary, CDN)     │ │  (immediate/always) │
│                     │ │                     │
│ • Full SQL OLAP     │ │ • slice/pagination  │
│ • 400K-1M+ rows    │ │ • path index        │
│ • GROUP BY, JOIN    │ │ • tree search       │
│ • JSON functions    │ │ • sort/filter       │
│ • columnar storage  │ │ • schema inference  │
│ • sub-second query  │ │ • Web Worker offload│
│ • ~3s init from CDN │ │ • works instantly   │
└─────────────────────┘ └─────────────────────┘
```

**No AlaSQL needed** — DuckDB covers everything AlaSQL does and better.
**Routing**: While DuckDB loads (~3s), JS Core handles all ops. Once ready, SQL routes to DuckDB. Tree/path ops always use JS Core.
**Internet**: Libraries loaded from CDN. **Data never leaves the browser.**
└──────────────┘ └──────────────┘ └──────────────┘
```

**Auto-routing logic:**
- `engine.sql()` → DuckDB (primary), JS Core aggregate fallback while DuckDB loads
- `engine.search()` → JS Core (Web Worker for >10K items)
- `engine.aggregate()` → DuckDB if ready, else JS Core
- `engine.pathQuery()` → JS Core (JSONPath is tree-native)
- `engine.slice()` → always JS Core (instant, just array windowing)

---

## Capacity (with DuckDB WASM)

| Scenario | Backend Used | Response Time | Memory |
|----------|-------------|---------------|--------|
| 1-10K rows, any query | JS Core | <50ms | <20 MB |
| 10-50K rows, SQL | AlaSQL | 100-500ms | 20-100 MB |
| 50-200K rows, SQL | DuckDB WASM | <200ms | 100-400 MB |
| 400-600K rows, SQL | DuckDB WASM | 200-500ms | 400-800 MB |
| 1M+ rows, SQL | DuckDB WASM | 500ms-2s | 1-2 GB |
| 400K rows, regex search | JS Core + Worker | 1-3s | same |
| Deep nesting (20 levels) | JS Core | 1-3s index | 50-200 MB |

---

## Steps

### Phase 1: Engine Foundation

1. **Create `src/core/data-engine.js`** — unified engine singleton
   - `Structra.engine` on global namespace
   - `datasets` Map for multi-tab
   - `setActive(tabId)` / `getActive()` / `removeDataset(tabId)`
   - `ingest(tabId, data, meta)` — store data, trigger indexing
   - Emits: `engine:ready`, `engine:query-result`, `engine:error`
   *depends on: nothing*

2. **JS Core: Path Index + Schema** *(parallel with step 3)*
   - `_buildPathIndex(data)` → `Map<path, {type, depth, childCount, arrayLength}>`
   - `_buildColumnIndex(data)` → for arrays of objects: `{columns: [{name, type, nullCount, distinctEstimate}]}`
   - `_inferSchema(data)` → cached schema object
   - `_detectShape(data)` → 'object' | 'flat-array' | 'nested-array' | 'primitive'
   - Runs in Web Worker for data >10K items
   *depends on step 1*

3. **JS Core: Data Access Methods** *(parallel with step 2)*
   - `getAtPath(path)` → resolve path to value (reuse `path.js` resolvePath)
   - `getChildren(path, {offset, limit, sortKey, sortDir})` → paginated children
   - `slice(offset, limit)` → array window (for table/list views)
   - `getShape()` / `getSchema()` / `getMeta()`
   *depends on step 1*

4. **JS Core: Search & Filter**
   - `search(pattern, {mode: 'values'|'keys'|'paths', signal})` → `{matchedPaths, total}`
   - `filter(predicate)` → filtered array reference (cached)
   - `sort(key, dir)` → sorted array reference (cached)
   - Auto-delegates to Web Worker for >10K items
   - Cancellable via abort signal (reuse existing `runGeneration` pattern)
   *depends on steps 1-3*

5. **JS Core: Aggregation**
   - `aggregate(key, fn)` → result
   - Functions: count, sum, avg, min, max, distinct, countDistinct, histogram, percentile
   - Works on active dataset's main array
   *depends on steps 1-3*

### Phase 2: DuckDB WASM Integration

6. **Load DuckDB WASM from CDN**
   - Use jsdelivr CDN bundle pattern (creates Blob URL for worker internally)
   - Init async on page load; engine is usable immediately via JS Core
   - Emits `engine:duckdb-ready` when WASM loaded (~3s)
   - If load fails (offline): SQL queries return error with helpful message
   *depends on: nothing, parallel with Phase 1*

7. **DuckDB adapter: register datasets as tables**
   - On `ingest()`: `registerFileText('tab_N.json', JSON.stringify(data))` → `CREATE TABLE tab_N AS SELECT * FROM read_json_auto('tab_N.json')`
   - `engine.sql(query)` → `conn.query(query)` → convert Arrow result to JS objects
   - Per-dataset DuckDB table lifecycle (create on ingest, drop on removeDataset)
   *depends on steps 1, 6*

8. **DuckDB JSON functions for nested data**
   - Use `json_extract`, `unnest()`, `json_keys()` for nested queries
   - Auto-flatten deeply nested structures into queryable columns
   - Example: `SELECT json_extract_string(col, '$.address.city') FROM tab_1`
   *depends on step 7*

### Phase 3: Multi-Tab + Cross-Tab

9. **Dataset lifecycle management**
    - `engine.ingest(tabId, data, meta)` — creates/replaces dataset for tab
    - `engine.removeDataset(tabId)` — cleanup on tab close (free memory, drop DuckDB table)
    - `engine.setActive(tabId)` — switch context, rebuild active indexes if needed
    - Tab events: listen to `tabs:switched`, `tabs:closed` from existing tab system
    *depends on steps 1-3*

10. **Cross-tab operations**
    - `engine.diff(tabId1, tabId2)` → structural diff (lazy-load jsondiffpatch from lib-loader)
    - `engine.compareSchemas(tabId1, tabId2)` → schema comparison
    - `engine.crossQuery(sql)` → SQL across datasets (DuckDB: JOIN tab1 WITH tab2)
    - Future: merge, transform between tabs
    *depends on steps 7, 9*

### Phase 5: Persistence

13. **IndexedDB storage for datasets**
    - On ingest: if rawText >500KB → store in IndexedDB (reuse `storage.js` IDB)
    - On page load: check for persisted datasets → offer "Restore session?"
    - Store: `{tabId, rawText, meta, timestamp}`
    - Indexes are NOT persisted (rebuilt on load — faster than storing)
    *depends on steps 1, 11*

14. **Query result caching (LRU)**
    - Per-dataset cache: `Map<queryHash, {result, timestamp, hits}>`
    - Max 50 entries per dataset
    - Invalidated on `ingest()` or `removeDataset()`
    - Cache key: `JSON.stringify({method, args})` → hash
    *depends on steps 1-5*

### Phase 6: Worker Infrastructure

15. **Create `src/workers/engine-worker.js`** — heavy ops worker
    - Self-registering IIFE (like json-parse-worker.js) for Blob URL on file://
    - Operations: buildPathIndex, search, filter, sort, aggregate
    - Receives: `{op, data, params}` → returns `{op, result}`
    - For DuckDB: NOT in this worker (DuckDB has its own internal workers)
    *depends on steps 1-5*

16. **Engine worker pool** (via existing `createWorkerPool`)
    - `Structra._enginePool = createWorkerPool({name:'Engine', workerCode: Structra._engineWorkerSource, maxWorkers:2})`
    - Engine methods auto-route: <10K items → sync JS; >10K → worker pool
    *depends on step 15*

### Phase 7: View Rewiring

17. **Rewire input flow** *(parallel with 18-22)*
    - `_loadSuccess()` → `engine.ingest(activeTabId, data, {name, size, format})`
    - Engine emits `engine:ready` → views respond
    - Keep `Structra.state.jsonData` as alias to `engine.getActive().raw` (backward compat)
    *depends on steps 1-3, 11*

18. **Rewire table view** *(parallel with 17, 19-22)*
    - Replace: direct array access → `engine.slice(offset, limit)`
    - Add: pagination controls (page size selector, prev/next, page number)
    - Sort: `engine.sort(key, dir)` then `engine.slice()`
    - Remove: 1000-row hard cap
    - Virtual scrolling: render only visible rows (50-100 at a time)
    *depends on steps 3-4*

19. **Rewire tree view** *(parallel with 17-18, 20-22)*
    - Keep existing chunked virtualization (it works well)
    - Path index from engine replaces `collectPaths()` calls
    - `engine.getChildren(path, {offset, limit})` for lazy node expansion
    *depends on steps 2-3*

20. **Rewire stats/schema/graph** *(parallel with 17-19, 21-22)*
    - Stats: `engine.getStats()` / `engine.aggregate(key, fn)`
    - Schema: `engine.getSchema()`
    - Graph: `engine.getChildren(path, {maxDepth})` for node building
    *depends on steps 2-3, 5*

21. **Rewire Universal Filter** *(parallel with 17-20, 22)*
    - Path mode → `engine.search(regex, {mode:'paths'})`
    - JSONPath mode → `engine.pathQuery(expr)`
    - Regex mode → `engine.search(regex, {mode:'values'})`
    - JS mode → `engine.evaluate(expr)` (keep current new Function approach)
    - SQL mode (NEW) → `engine.sql(query)` — add 'sql' to mode detection
    - All modes return unified `QueryResult` → views subscribe to `engine:query-result`
    *depends on steps 4-5, 7*

22. **Add SQL mode to Universal Filter**
    - Detect: prefix `SELECT` or `sql:` → mode = 'sql'
    - Autocomplete: table columns, SQL keywords
    - Help modal: SQL syntax guide with examples
    - Results display: table format for rows, scalar for aggregates
    *depends on step 21*

---

## Relevant Files

### Create
- `src/core/data-engine.js` — engine singleton (~600-800 lines)
- `src/workers/engine-worker.js` — heavy ops worker (~200 lines)
- `src/libs/alasql.min.js` — bundled AlaSQL (200KB)
- `src/core/duckdb-adapter.js` — optional DuckDB WASM adapter (~150 lines)

### Modify
- `src/components/structra-input-panel.js` — `_loadSuccess` → `engine.ingest()`
- `src/components/structra-table.js` — engine pagination
- `src/components/structra-tree.js` — engine path index
- `src/components/structra-stats.js` — `engine.getStats()`
- `src/components/structra-schema.js` — `engine.getSchema()`
- `src/components/structra-graph.js` — `engine.getChildren()`
- `src/ui/universal-filter.js` — route through engine, add SQL mode
- `src/utils/lib-loader.js` — add alasql, duckdb entries
- `src/app.js` — init engine, tab↔dataset sync
- `index.html` — script tags for new files

### Reuse (patterns, don't rewrite)
- `src/utils/traverse.js` — `walk()` → engine worker indexing
- `src/utils/stats.js` — `analyzeArray()` → engine stats
- `src/utils/path.js` — `resolvePath()` → engine path access
- `src/core/worker-pool.js` — pool factory → engine worker
- `src/utils/storage.js` — IDB → engine persistence

---

## Verification

1. `engine.ingest(1, largeArray, {name:'test'})` — 100K rows ingest <2s
2. `engine.slice(0, 50)` — returns 50 rows in <10ms
3. `engine.search(/alice/i)` — 100K rows in <1s (worker)
4. `engine.sql('SELECT COUNT(*) FROM data WHERE age > 30')` — returns correct count
5. `engine.sort('name', 'asc')` then `engine.slice(0, 50)` — sorted first page
6. `engine.diff(tab1, tab2)` — produces structural diff
7. Tab switch: `engine.setActive(2)` → queries now operate on tab 2's data
8. DuckDB: 400K rows, `SELECT city, COUNT(*) GROUP BY city` — <500ms
9. Offline: If DuckDB CDN unreachable, JS Core handles all ops (with performance tradeoff for large SQL)
10. Memory: load 400K rows, run queries, close tab → memory freed (no leaks)
11. Universal Filter SQL mode: type `SELECT name FROM data LIMIT 10` → shows results
12. Persistence: reload page → "Restore session?" → data reloads from IndexedDB

---

## Decisions
- **DuckDB WASM = primary SQL engine**, loaded from CDN, browser-cached after first load
- **No AlaSQL** — DuckDB covers all SQL needs better; removes redundant dependency
- **JS Core handles tree operations** — no SQL engine handles arbitrary JSON nesting well
- **Internet required for first load** (CDN downloads), offline works after caching
- **Local dev**: `npx serve` or `python -m http.server` (NOT file://)
- **One dataset per tab**, cross-tab via explicit operations (diff, join)
- **Backward compat**: `Structra.state.jsonData` remains as alias
- **Worker threshold**: <10K sync, >10K worker, >50K DuckDB
- **No data leaves the browser** — only library downloads from CDN
- **Service Worker** (future): cache all CDN assets for true offline support

## Open Questions (resolved)
- Storage: **In-memory (primary) + IndexedDB (persistence for large data)**
- Multi-tab: **Separate datasets, cross-tab ops for diff/compare**
- Filter integration: **All modes route through engine.query() → unified QueryResult**
- Portability: **Same API everywhere; backend auto-selected by environment**
