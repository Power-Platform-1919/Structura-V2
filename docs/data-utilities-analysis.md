# V2 Data Utilities Analysis

## traverse.js - Traversal Engine
**Stack-based, maxDepth=20 by default**
- `walk(obj, visitor, opts)` - Core iterative DFS
- `collectPaths(obj)` - Schema paths with type info
- `findArrays(obj)` - All arrays with metadata
- `findAllArrays(obj)` - Deep discovery with cycle detection
- `findArrayOfObjects(obj)` - First meaningful array
- `searchValues(obj, regex, signal)` - Async value search (fast path for root arrays)
- `searchKeys(obj, keyName, signal)` - Exact key search
- `countPathMatches(obj, regex, signal)` - Path regex counter

**Optimizations:**
- Fast path: direct property scan for root array of objects
- Cycle detection via Set in findAllArrays
- Reused counter object (_leafCounter) to avoid allocations
- Async yield every 10000 ops

## stats.js - Analysis & Stats UI
**Main entry: renderStats(jsonData, evaluatePath)**
- Mini-grid: rows, keys, gaps
- Arrays table (all discovered arrays)
- Key coverage table (per-key presence/empty/missing analysis)
- Drill-up capability via drillStack
- Event delegation on single listener
- Nested key expansion/collapse
- Array drilling via collectArrayItems

**Popups:**
- showMissingObjects/showEmptyObjects - shows indices
- showIndicesPopup - generic renderer (limited to 50 items)

## data-profiler.js - Field Statistics
**profile(arr)** → quality score + field metadata
- Per-field: count, coverage%, nullPct, types, min/max/avg/sum, unique, topValues
- Quality: completeness (40%) + consistency (35%) + uniqueness (25%)
- Issue detection: null saturation, mixed types, low uniqueness

## state.js - Global State Management
- `Structra.state` - global state object
- `Structra.set/get` - state helpers with event emission
- `Structra.events` - event bus (on/off/emit)
- Theme persisted to localStorage
- Tab state management

## constants.js
- VIEWS: [tree, table, graph, schema, editor, stats]
- DRAWER_STATES: [collapsed, medium, expanded]
- DRAWER_TABS: [analyze, expressions, schema-gen]
- SHORTCUTS: Ctrl+K/F/H/L/T/W/1-5/E/Esc
- QUERY_MODES: [path, jsonpath, regex, js]

## Path Format
- Dot: `key.subkey`
- Bracket: `[index]`
- Combined: `arr[0].items[2].name`
- Wildcard drill: `[*].fieldName`

## Caching/Indexing
- Cycle detection: Set in findAllArrays
- Shared counter object: _leafCounter in searchValues
- Event delegation: single stats listener
- Module refs: currentMainArr, currentJsonData, drillStack in stats.js
- Async yield: every N ops (10000/8000/5000)
- Cancellation support via signal?.cancelled
- Fast path for root arrays (direct scan vs stack)
- First item only for schema in collectPaths
