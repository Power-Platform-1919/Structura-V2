/* ============================================================
   STRUCTRA V2 — Data Engine
   Unified query API managing named datasets (one per tab).

   API:
     Structra.engine.ingest(tabId, data, meta)  → index + store dataset
     Structra.engine.remove(tabId)              → cleanup dataset
     Structra.engine.setActive(tabId)           → switch context
     Structra.engine.getActive()                → current Dataset
     Structra.engine.slice(offset, limit)       → paginated rows
     Structra.engine.sort(key, dir)             → sort active dataset
     Structra.engine.search(pattern, opts)      → search values/keys/paths
     Structra.engine.filter(predicate)          → filter active array
     Structra.engine.aggregate(key, fn)         → aggregation result
     Structra.engine.getSchema()                → inferred schema
     Structra.engine.getStats()                 → stats summary
     Structra.engine.pathQuery(expr)            → JSONPath query
     Structra.engine.sql(query)                 → DuckDB SQL (when ready)
     Structra.engine.diff(tabId1, tabId2)       → structural diff

   Events:
     'engine:ingested'    → {tabId, meta}
     'engine:active'      → {tabId, dataset}
     'engine:removed'     → {tabId}
     'engine:query-result' → {mode, result, duration}
     'engine:duckdb-ready' → {}
     'engine:error'        → {message, context}

   Console:
     Structra.engine.getActive()
     Structra.engine.runSql('SELECT COUNT(*) FROM data')
   ============================================================ */

window.Structra = window.Structra || {};

Structra.engine = (() => {
  /* --- Internal State --- */
  const _datasets = new Map();  // tabId → Dataset
  let _activeId = null;
  let _duckReady = false;
  let _duckFailed = false;

  /* --- Active Filter State ---
     When a universal filter/query is active, all views render
     from this filtered subset instead of the full dataset.
     Format:
       _activeFilter = {
         query: string,          // original query text
         mode: 'values'|'keys'|'paths'|'sql', // search mode
         matchedPaths: string[], // for tree/path-based results
         rows: Array|null,       // for SQL / tabular results
         total: number,          // total match count
         data: any,              // filtered data object (for stats/schema/graph)
       }
     null = no filter active (show all data)
  */
  let _activeFilter = null;

  /* --- Dataset Structure --- */
  function createDataset(tabId, data, meta) {
    const shape = detectShape(data);
    return {
      id: tabId,
      raw: data,
      meta: {
        name: meta.name || meta.fileName || 'Untitled',
        fileName: meta.fileName || meta.name || 'Untitled',
        fileSize: meta.fileSize || meta.size || 0,
        size: meta.fileSize || meta.size || 0,
        format: meta.format || 'json',
        timestamp: Date.now(),
        shape,
        rowCount: shape === 'flat-array' ? data.length : (shape === 'nested-array' ? data.length : null),
      },
      indexes: {
        paths: null,     // built lazily or via worker
        columns: null,   // column metadata for arrays of objects
        sorted: null,    // {key, dir, refs} — current sort
      },
      cache: new Map(),  // queryKey → result (LRU eviction at 50 entries)
      duckTable: 'tab_' + tabId,
    };
  }

  /* --- Shape Detection --- */
  function detectShape(data) {
    if (data === null || data === undefined) return 'empty';
    if (Array.isArray(data)) {
      if (data.length === 0) return 'empty-array';
      const first = data[0];
      if (first && typeof first === 'object' && !Array.isArray(first)) return 'flat-array';
      return 'nested-array';
    }
    if (typeof data === 'object') return 'object';
    return 'primitive';
  }

  /* --- Column Index (for flat arrays of objects) --- */
  function buildColumnIndex(data) {
    if (!Array.isArray(data) || data.length === 0) return null;
    const sample = data.slice(0, Math.min(data.length, 1000));
    const columns = {};

    for (const row of sample) {
      if (!row || typeof row !== 'object') continue;
      for (const [key, val] of Object.entries(row)) {
        if (!columns[key]) {
          columns[key] = { name: key, types: new Set(), count: 0, nulls: 0 };
        }
        columns[key].count++;
        if (val === null || val === undefined) {
          columns[key].nulls++;
        } else {
          columns[key].types.add(Array.isArray(val) ? 'array' : typeof val);
        }
      }
    }

    // Convert sets to arrays for serialization
    return Object.values(columns).map(col => ({
      name: col.name,
      types: [...col.types],
      coverage: col.count / sample.length,
      nullRate: col.nulls / col.count,
    }));
  }

  /* --- Cache with LRU eviction --- */
  const MAX_CACHE = 50;
  function cacheGet(dataset, key) { return dataset.cache.get(key); }
  function cacheSet(dataset, key, value) {
    if (dataset.cache.size >= MAX_CACHE) {
      const first = dataset.cache.keys().next().value;
      dataset.cache.delete(first);
    }
    dataset.cache.set(key, value);
  }
  function cacheClear(dataset) { dataset.cache.clear(); }

  /* ============================
     PUBLIC API
     ============================ */

  /* --- Ingest --- */
  async function ingest(tabId, data, meta = {}) {
    const t0 = performance.now();
    const dataset = createDataset(tabId, data, meta);

    // Build column index for arrays of objects
    if (dataset.meta.shape === 'flat-array' || dataset.meta.shape === 'nested-array') {
      dataset.indexes.columns = buildColumnIndex(data);
    } else if (dataset.meta.shape === 'object') {
      // For single objects, treat top-level keys as "columns"
      dataset.indexes.columns = buildColumnIndex([data]);
    }

    _datasets.set(tabId, dataset);

    // If this is the only dataset or active, set as active
    if (_activeId === null || _activeId === tabId) {
      _activeId = tabId;
    }

    const duration = performance.now() - t0;
    Structra.log.info('Engine', `Ingested tab ${tabId}: ${dataset.meta.shape}, ${dataset.meta.rowCount || '?'} rows (${duration.toFixed(1)}ms)`);

    // Persist raw text to IndexedDB (async, non-blocking)
    if (meta.rawText) {
      Structra.persistence.raw.put(meta.rawText, { format: meta.format, name: meta.name })
        .then(hash => {
          dataset.meta.hash = hash;
          Structra.persistence.recents.add({
            name: meta.name,
            format: meta.format,
            size: meta.size,
            hash,
            tabId,
          });
        })
        .catch(err => Structra.log.error('Engine', 'Persistence failed', err));
    }

    // Emit immediately so views render without waiting for DuckDB
    Structra.events.emit('engine:ingested', { tabId, meta: dataset.meta, duration });

    // Register with DuckDB in background (non-blocking — analytics use it when ready)
    if (_duckAvailable()) {
      Structra.duckdb.registerDataset(dataset)
        .then(() => {
          Structra.log.info('Engine', `DuckDB registration complete for tab ${tabId}`);
          Structra.events.emit('engine:duckdb-registered', { tabId });
        })
        .catch(err => Structra.log.error('Engine', 'DuckDB register failed', err));
    }

    return dataset;
  }

  /* --- Remove --- */
  function remove(tabId) {
    const dataset = _datasets.get(tabId);
    if (!dataset) return;
    cacheClear(dataset);
    _datasets.delete(tabId);
    if (_activeId === tabId) {
      _activeId = _datasets.size > 0 ? _datasets.keys().next().value : null;
    }
    // Drop DuckDB table if ready
    if (_duckAvailable()) {
      Structra.duckdb.dropTable(dataset.duckTable).catch(() => {});
    }
    Structra.log.info('Engine', `Removed dataset: tab ${tabId}`);
    Structra.events.emit('engine:removed', { tabId });
  }

  /* --- Active Dataset --- */
  function setActive(tabId) {
    if (!_datasets.has(tabId)) {
      _activeId = null;
      _activeFilter = null;
      return;
    }
    _activeId = tabId;
    const dataset = _datasets.get(tabId);
    Structra.events.emit('engine:active', { tabId, dataset });
  }

  function getActive() {
    return _activeId ? _datasets.get(_activeId) : null;
  }

  function getDataset(tabId) {
    return _datasets.get(tabId);
  }

  /* --- Slice (pagination) --- */
  function slice(offset = 0, limit = 50) {
    const ds = getActive();
    if (!ds) return { rows: [], total: 0 };
    const arr = ds.indexes.sorted ? ds.indexes.sorted.refs : ds.raw;
    if (!Array.isArray(arr)) return { rows: [], total: 0 };
    return { rows: arr.slice(offset, offset + limit), total: arr.length };
  }

  /* --- Sort --- */
  function sort(key, dir = 'asc') {
    const ds = getActive();
    if (!ds || !Array.isArray(ds.raw)) return;

    const cacheKey = `sort:${key}:${dir}`;
    const cached = cacheGet(ds, cacheKey);
    if (cached) { ds.indexes.sorted = cached; return; }

    const refs = [...ds.raw].sort((a, b) => {
      const av = a && a[key];
      const bv = b && b[key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av < bv) return dir === 'asc' ? -1 : 1;
      if (av > bv) return dir === 'asc' ? 1 : -1;
      return 0;
    });

    const sortObj = { key, dir, refs };
    ds.indexes.sorted = sortObj;
    cacheSet(ds, cacheKey, sortObj);
  }

  /* --- Search --- */
  function search(pattern, opts = {}) {
    const ds = getActive();
    if (!ds) return { matchedPaths: [], total: 0 };
    const { mode = 'values' } = opts; // 'values' | 'keys' | 'paths'
    const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern, 'i');
    const matched = [];

    // Stack-based traversal
    const stack = [{ val: ds.raw, path: '$', depth: 0 }];
    const maxDepth = Structra.settings.get('maxDepth');

    while (stack.length > 0) {
      const { val, path, depth } = stack.pop();
      if (depth > maxDepth) continue;

      if (val && typeof val === 'object') {
        const entries = Array.isArray(val)
          ? val.map((v, i) => [i, v])
          : Object.entries(val);
        for (const [k, v] of entries) {
          const childPath = Array.isArray(val) ? `${path}[${k}]` : `${path}.${k}`;
          // Check match based on mode
          if (mode === 'keys' && regex.test(String(k))) {
            matched.push(childPath);
          } else if (mode === 'values' && v !== null && typeof v !== 'object' && regex.test(String(v))) {
            matched.push(childPath);
          } else if (mode === 'paths' && regex.test(childPath)) {
            matched.push(childPath);
          }
          if (v && typeof v === 'object') {
            stack.push({ val: v, path: childPath, depth: depth + 1 });
          }
        }
      }
    }

    return { matchedPaths: matched, total: matched.length };
  }

  /* --- Filter --- */
  function filter(predicate) {
    const ds = getActive();
    if (!ds || !Array.isArray(ds.raw)) return [];
    return ds.raw.filter(predicate);
  }

  /* --- Aggregate --- */
  function aggregate(key, fn) {
    const ds = getActive();
    if (!ds || !Array.isArray(ds.raw)) return null;

    const values = ds.raw
      .map(row => row && row[key])
      .filter(v => v !== null && v !== undefined);

    switch (fn) {
      case 'count': return values.length;
      case 'sum': return values.reduce((a, b) => a + (Number(b) || 0), 0);
      case 'avg': {
        const nums = values.filter(v => typeof v === 'number');
        return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
      }
      case 'min': {
        const nums = values.filter(v => typeof v === 'number');
        if (!nums.length) return null;
        let mn = nums[0]; for (let i = 1; i < nums.length; i++) { if (nums[i] < mn) mn = nums[i]; }
        return mn;
      }
      case 'max': {
        const nums = values.filter(v => typeof v === 'number');
        if (!nums.length) return null;
        let mx = nums[0]; for (let i = 1; i < nums.length; i++) { if (nums[i] > mx) mx = nums[i]; }
        return mx;
      }
      case 'distinct': return [...new Set(values)];
      case 'countDistinct': return new Set(values).size;
      default: return null;
    }
  }

  /* --- Schema Inference --- */
  function getSchema() {
    const ds = getActive();
    if (!ds) return null;

    const cacheKey = 'schema';
    const cached = cacheGet(ds, cacheKey);
    if (cached) return cached;

    const schema = inferSchema(ds.raw, '$', 0);
    cacheSet(ds, cacheKey, schema);
    return schema;
  }

  function inferSchema(val, path, depth) {
    if (depth > 5) return { type: 'unknown', path };
    if (val === null) return { type: 'null', path };
    if (Array.isArray(val)) {
      const items = val.length > 0 ? inferSchema(val[0], path + '[0]', depth + 1) : { type: 'unknown' };
      return { type: 'array', path, length: val.length, items };
    }
    if (typeof val === 'object') {
      const properties = {};
      for (const [k, v] of Object.entries(val)) {
        properties[k] = inferSchema(v, path + '.' + k, depth + 1);
      }
      return { type: 'object', path, properties };
    }
    return { type: typeof val, path };
  }

  /* --- Stats --- */
  function getStats() {
    const ds = getActive();
    if (!ds) return null;

    const cacheKey = 'stats';
    const cached = cacheGet(ds, cacheKey);
    if (cached) return cached;

    const stats = {
      shape: ds.meta.shape,
      rowCount: ds.meta.rowCount,
      format: ds.meta.format,
      size: ds.meta.size,
      columns: ds.indexes.columns,
      timestamp: ds.meta.timestamp,
    };

    // Count nodes for objects
    if (ds.meta.shape === 'object') {
      stats.keyCount = Object.keys(ds.raw).length;
    }

    cacheSet(ds, cacheKey, stats);
    return stats;
  }

  /* --- JSONPath Query (placeholder — needs jsonpath-plus) --- */
  function pathQuery(expr) {
    const ds = getActive();
    if (!ds) return { results: [], matchedPaths: [] };
    // Will integrate with jsonpath-plus via lib-loader
    Structra.log.warn('Engine', 'JSONPath not yet integrated');
    return { results: [], matchedPaths: [], expr };
  }

  /* --- Diff (structural comparison between two datasets) --- */
  function diff(tabId1, tabId2) {
    const ds1 = _datasets.get(tabId1);
    const ds2 = _datasets.get(tabId2);
    if (!ds1 || !ds2) return null;

    const result = {
      tabs: [tabId1, tabId2],
      shape: [ds1.meta.shape, ds2.meta.shape],
      shapeDiff: ds1.meta.shape !== ds2.meta.shape,
      rowCount: [ds1.meta.rowCount, ds2.meta.rowCount],
      changes: [],
    };

    // For flat arrays: compare schemas (columns)
    if (ds1.meta.shape === 'flat-array' && ds2.meta.shape === 'flat-array') {
      const cols1 = new Set((ds1.indexes.columns || []).map(c => c.name));
      const cols2 = new Set((ds2.indexes.columns || []).map(c => c.name));
      const added = [...cols2].filter(c => !cols1.has(c));
      const removed = [...cols1].filter(c => !cols2.has(c));
      const common = [...cols1].filter(c => cols2.has(c));
      result.columns = { added, removed, common };
      result.changes.push(`Columns: +${added.length} added, -${removed.length} removed, ${common.length} shared`);
    }

    // For objects: compare top-level keys
    if (ds1.meta.shape === 'object' && ds2.meta.shape === 'object') {
      const keys1 = new Set(Object.keys(ds1.raw));
      const keys2 = new Set(Object.keys(ds2.raw));
      const added = [...keys2].filter(k => !keys1.has(k));
      const removed = [...keys1].filter(k => !keys2.has(k));
      const common = [...keys1].filter(k => keys2.has(k));
      const typeDiffs = common.filter(k => typeof ds1.raw[k] !== typeof ds2.raw[k]);
      result.keys = { added, removed, common, typeDiffs };
      result.changes.push(`Keys: +${added.length} added, -${removed.length} removed, ${typeDiffs.length} type changes`);
    }

    Structra.log.info('Engine', `Diff tab ${tabId1} vs ${tabId2}: ${result.changes.join('; ')}`);
    return result;
  }

  /* --- DuckDB Ready Hook --- */
  function onDuckDBReady() {
    _duckReady = true;
    Structra.log.info('Engine', 'DuckDB WASM ready — SQL queries enabled');
    Structra.events.emit('engine:duckdb-ready');
    // Register all existing datasets with DuckDB
    for (const [, dataset] of _datasets) {
      if (Structra.duckdb) {
        Structra.duckdb.registerDataset(dataset).catch(() => {});
      }
    }
  }

  function onDuckDBFailed() {
    _duckFailed = true;
    Structra.log.warn('Engine', 'DuckDB WASM failed — using JS fallback for all analysis');
  }

  // Listen for DuckDB failure
  if (Structra.events) {
    Structra.events.on('engine:duckdb-failed', onDuckDBFailed);
  }

  /* --- Session Persistence (debounced) --- */
  let _saveTimer = null;
  function scheduleSessionSave() {
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(() => {
      const state = {
        activeId: _activeId,
        tabs: [..._datasets.entries()].map(([id, ds]) => ({
          id,
          meta: ds.meta,
        })),
      };
      Structra.persistence.session.save(state).catch(() => {});
    }, 2000);
  }

  /* ============================
     UNIVERSAL QUERY PIPELINE
     All find/filter operations go through DuckDB when available,
     fall back to in-memory JS when not.
     Views render from _activeQuery result with virtualization.
     ============================ */

  /*
   * _activeQuery = {
   *   source: 'find'|'filter'|'sql',  // what produced it
   *   query: string,                   // original query text or SQL
   *   conditions: Array|null,          // structured filter conditions
   *   rows: Array,                     // result rows (always an array)
   *   matchedPaths: string[]|null,     // for tree highlighting (non-SQL)
   *   total: number,
   *   columns: string[],              // column names in result
   * }
   */

  /**
   * Find text in the active dataset via DuckDB.
   * Searches all columns (including nested STRUCT/LIST cast to VARCHAR) for ILIKE match.
   * Works for all shapes: flat-array, nested-array, object.
   * @param {string} text — search text
   * @returns {Promise<Object>} query result
   */
  async function findInDb(text) {
    const ds = getActive();
    if (!ds) return null;

    // DuckDB path: any registered dataset
    if (_canUseDuck(ds)) {
      const tableName = ds.duckTable.replace(/[^a-z0-9_]/gi, '_');
      const cols = _getDuckColumnNames(ds);
      if (cols.length === 0) return _findInMemory(ds, text);

      // Build WHERE clause: cast every column (including STRUCT/LIST) to VARCHAR for search
      const escapedText = text.replace(/'/g, "''");
      const whereClauses = cols.map(c =>
        `CAST("${c}" AS VARCHAR) ILIKE '%${escapedText}%'`
      ).join(' OR ');
      const sqlQuery = `SELECT * FROM "${tableName}" WHERE ${whereClauses}`;

      try {
        const rows = await Structra.duckdb.query(sqlQuery);
        const result = {
          source: 'find',
          query: text,
          conditions: null,
          rows,
          matchedPaths: _rowsToMatchedPaths(ds, rows, text),
          total: rows.length,
          columns: cols,
        };
        _setActiveQuery(result);
        return result;
      } catch (err) {
        Structra.log.warn('Engine', 'DuckDB find failed, falling back to in-memory', err.message);
      }
    }

    // Fallback: in-memory search
    return _findInMemory(ds, text);
  }

  /** In-memory find (no DuckDB) */
  function _findInMemory(ds, text) {
    const searchResult = search(text, { mode: 'values' });
    const rows = _matchedPathsToRows(ds, searchResult.matchedPaths);
    const result = {
      source: 'find',
      query: text,
      conditions: null,
      rows,
      matchedPaths: searchResult.matchedPaths,
      total: searchResult.total,
      columns: rows.length > 0 ? Object.keys(rows[0]) : [],
    };
    _setActiveQuery(result);
    return result;
  }

  /**
   * Replace matched values in the active dataset.
   * @param {string} findText — text to find
   * @param {string} replaceText — replacement text
   * @param {boolean} all — replace all occurrences or just first
   * @returns {Object} { replaced: number }
   */
  function replaceInData(findText, replaceText, all = false) {
    const ds = getActive();
    if (!ds) return { replaced: 0 };
    let count = 0;

    function walkReplace(obj) {
      if (Array.isArray(obj)) {
        for (let i = 0; i < obj.length; i++) {
          if (typeof obj[i] === 'string' && obj[i].includes(findText)) {
            obj[i] = obj[i].split(findText).join(replaceText);
            count++;
            if (!all) return true;
          } else if (obj[i] && typeof obj[i] === 'object') {
            if (walkReplace(obj[i]) && !all) return true;
          }
        }
      } else if (obj && typeof obj === 'object') {
        for (const k of Object.keys(obj)) {
          if (typeof obj[k] === 'string' && obj[k].includes(findText)) {
            obj[k] = obj[k].split(findText).join(replaceText);
            count++;
            if (!all) return true;
          } else if (obj[k] && typeof obj[k] === 'object') {
            if (walkReplace(obj[k]) && !all) return true;
          }
        }
      }
      return false;
    }

    walkReplace(ds.raw);

    if (count > 0) {
      // Clear caches, re-register with DuckDB
      cacheClear(ds);
      if (_duckAvailable()) {
        Structra.duckdb.registerDataset(ds).catch(() => {});
      }
      Structra.log.info('Engine', `Replaced ${count} occurrence(s) of "${findText}" → "${replaceText}"`);
      Structra.events.emit('engine:data-modified', { tabId: ds.id, action: 'replace', count });
    }
    return { replaced: count };
  }

  /**
   * Apply structured filter conditions via DuckDB.
   * @param {Array<Object>} conditions — [{field, op, value, logic}]
   *   op: 'eq'|'neq'|'gt'|'lt'|'gte'|'lte'|'contains'|'notcontains'|'startswith'|'endswith'|'isnull'|'notnull'
   *   logic: 'AND'|'OR' (how this condition joins with previous)
   * @returns {Promise<Object>} query result
   */
  async function filterDb(conditions) {
    const ds = getActive();
    if (!ds) return null;
    if (!conditions || conditions.length === 0) {
      clearQuery();
      return null;
    }

    // DuckDB path — works for all registered shapes
    if (_canUseDuck(ds)) {
      const tableName = ds.duckTable.replace(/[^a-z0-9_]/gi, '_');
      const cols = _getDuckColumnNames(ds);
      const sqlWhere = _conditionsToSql(conditions, cols);
      if (!sqlWhere) return _filterInMemory(ds, conditions);

      const sqlQuery = `SELECT * FROM "${tableName}" WHERE ${sqlWhere}`;
      try {
        const rows = await Structra.duckdb.query(sqlQuery);
        const result = {
          source: 'filter',
          query: sqlQuery,
          conditions,
          rows,
          matchedPaths: null,
          total: rows.length,
          columns: cols,
        };
        _setActiveQuery(result);
        return result;
      } catch (err) {
        Structra.log.warn('Engine', 'DuckDB filter failed, falling back to in-memory', err.message);
      }
    }

    return _filterInMemory(ds, conditions);
  }

  /** Execute raw SQL, store as active query */
  async function runSql(sqlText) {
    if (!_duckAvailable()) {
      return { error: 'DuckDB not ready' };
    }
    const t0 = performance.now();
    try {
      const rows = await Structra.duckdb.query(sqlText);
      const duration = performance.now() - t0;
      const cols = rows.length > 0 ? Object.keys(rows[0]) : [];
      const result = {
        source: 'sql',
        query: sqlText,
        conditions: null,
        rows,
        matchedPaths: null,
        total: rows.length,
        columns: cols,
      };
      _setActiveQuery(result);
      Structra.log.info('Engine', `SQL executed: ${rows.length} rows (${duration.toFixed(0)}ms)`);
      return result;
    } catch (err) {
      Structra.log.error('Engine', 'SQL execution failed', err.message);
      return { error: err.message };
    }
  }

  /** Build SQL WHERE clause from structured conditions */
  function _conditionsToSql(conditions, validCols) {
    const colSet = new Set(validCols);
    const parts = [];

    for (let i = 0; i < conditions.length; i++) {
      const c = conditions[i];
      if (!colSet.has(c.field)) continue;

      const field = `"${c.field}"`;
      const val = String(c.value || '').replace(/'/g, "''");
      let clause = '';

      switch (c.op) {
        case 'eq':           clause = `${field} = '${val}'`; break;
        case 'neq':          clause = `${field} != '${val}'`; break;
        case 'gt':           clause = `${field} > '${val}'`; break;
        case 'lt':           clause = `${field} < '${val}'`; break;
        case 'gte':          clause = `${field} >= '${val}'`; break;
        case 'lte':          clause = `${field} <= '${val}'`; break;
        case 'contains':     clause = `CAST(${field} AS VARCHAR) ILIKE '%${val}%'`; break;
        case 'notcontains':  clause = `CAST(${field} AS VARCHAR) NOT ILIKE '%${val}%'`; break;
        case 'startswith':   clause = `CAST(${field} AS VARCHAR) ILIKE '${val}%'`; break;
        case 'endswith':     clause = `CAST(${field} AS VARCHAR) ILIKE '%${val}'`; break;
        case 'isnull':       clause = `${field} IS NULL`; break;
        case 'notnull':      clause = `${field} IS NOT NULL`; break;
        default:             clause = `CAST(${field} AS VARCHAR) ILIKE '%${val}%'`; break;
      }

      if (parts.length > 0) {
        parts.push((c.logic || 'AND').toUpperCase());
      }
      parts.push(clause);
    }

    return parts.length > 0 ? parts.join(' ') : null;
  }

  /** In-memory structured filter (no DuckDB) */
  function _filterInMemory(ds, conditions) {
    if (!Array.isArray(ds.raw)) return null;

    const rows = ds.raw.filter(row => {
      if (!row || typeof row !== 'object') return false;
      let pass = true;

      for (let i = 0; i < conditions.length; i++) {
        const c = conditions[i];
        const val = row[c.field];
        const target = c.value;
        let match = false;

        switch (c.op) {
          case 'eq':          match = String(val) === String(target); break;
          case 'neq':         match = String(val) !== String(target); break;
          case 'gt':          match = Number(val) > Number(target); break;
          case 'lt':          match = Number(val) < Number(target); break;
          case 'gte':         match = Number(val) >= Number(target); break;
          case 'lte':         match = Number(val) <= Number(target); break;
          case 'contains':    match = String(val || '').toLowerCase().includes(String(target).toLowerCase()); break;
          case 'notcontains': match = !String(val || '').toLowerCase().includes(String(target).toLowerCase()); break;
          case 'startswith':  match = String(val || '').toLowerCase().startsWith(String(target).toLowerCase()); break;
          case 'endswith':    match = String(val || '').toLowerCase().endsWith(String(target).toLowerCase()); break;
          case 'isnull':      match = val === null || val === undefined; break;
          case 'notnull':     match = val !== null && val !== undefined; break;
          default:            match = String(val || '').toLowerCase().includes(String(target).toLowerCase()); break;
        }

        if (i === 0) {
          pass = match;
        } else {
          pass = (c.logic || 'AND') === 'OR' ? (pass || match) : (pass && match);
        }
      }
      return pass;
    });

    const cols = ds.indexes.columns ? ds.indexes.columns.map(c => c.name) : (rows.length > 0 ? Object.keys(rows[0]) : []);
    const result = {
      source: 'filter',
      query: conditions.map(c => `${c.field} ${c.op} ${c.value || ''}`).join(', '),
      conditions,
      rows,
      matchedPaths: null,
      total: rows.length,
      columns: cols,
    };
    _setActiveQuery(result);
    return result;
  }

  /** Convert DuckDB result rows back to matchedPaths for tree highlighting */
  function _rowsToMatchedPaths(ds, resultRows, findText) {
    if (!Array.isArray(ds.raw)) return [];
    const regex = new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const paths = [];
    for (let i = 0; i < ds.raw.length; i++) {
      const row = ds.raw[i];
      if (!row || typeof row !== 'object') continue;
      for (const [k, v] of Object.entries(row)) {
        if (v !== null && typeof v !== 'object' && regex.test(String(v))) {
          paths.push(`$[${i}].${k}`);
        }
      }
    }
    return paths;
  }

  /** Convert matchedPaths to row objects for tabular views */
  function _matchedPathsToRows(ds, matchedPaths) {
    if (!Array.isArray(ds.raw) || !matchedPaths) return [];
    const rowIdxs = new Set();
    for (const p of matchedPaths) {
      const m = p.match(/^\$\[(\d+)\]/);
      if (m) rowIdxs.add(parseInt(m[1], 10));
    }
    return [...rowIdxs].sort((a, b) => a - b).map(i => ds.raw[i]).filter(Boolean);
  }

  /** Store query result and notify views */
  function _setActiveQuery(result) {
    _activeFilter = result;
    Structra.events.emit('engine:filter-changed', result);
  }

  /** Clear active query — views revert to full dataset */
  function clearQuery() {
    if (!_activeFilter) return;
    _activeFilter = null;
    Structra.log.info('Engine', 'Query cleared');
    Structra.events.emit('engine:filter-changed', null);
  }

  /** Get current active query result, or null */
  function getQuery() {
    return _activeFilter;
  }

  /**
   * Get the rows that views should render.
   * If a query is active, returns query result rows.
   * Otherwise returns full dataset (as array if possible).
   */
  function getQueryRows() {
    if (_activeFilter && _activeFilter.rows) return _activeFilter.rows;
    const ds = getActive();
    if (!ds) return null;
    return Array.isArray(ds.raw) ? ds.raw : null;
  }

  /**
   * Get the data object views should render.
   * For query results, returns rows array.
   * Otherwise returns full raw data.
   */
  function getQueryData() {
    if (_activeFilter && _activeFilter.rows) return _activeFilter.rows;
    const ds = getActive();
    return ds ? ds.raw : null;
  }

  /* ============================
     DUCKDB ROUTING HELPERS
     Central routing logic — all functions use these to decide
     SQL (DuckDB) vs JS (in-memory) execution path.
     ============================ */

  /** Check if a dataset has been registered with DuckDB */
  function _isDuckRegistered(ds) {
    return ds && ds._duckColumns && ds._duckColumns.length > 0;
  }

  /* ================================================================
     ENGINE ROUTING — Centralized DuckDB vs JS decision
     ================================================================
     _canUseDuck(ds)  → true if DuckDB is ready AND dataset is registered
     _duckOrNull(ds)  → returns dataset if DuckDB usable, else null (for early-return patterns)
     _duckAvailable() → true if DuckDB engine is alive (doesn't check dataset)
     ================================================================ */

  /** Can we run SQL on this dataset? (DuckDB ready + not failed + dataset registered) */
  function _canUseDuck(ds) {
    return _duckReady && !_duckFailed && !!Structra.duckdb && _isDuckRegistered(ds);
  }

  /** Is DuckDB engine available at all? (ignores dataset registration) */
  function _duckAvailable() {
    return _duckReady && !_duckFailed && !!Structra.duckdb;
  }

  /** Get column names from DuckDB-registered dataset */
  function _getDuckColumnNames(ds) {
    if (ds._duckColumns) return ds._duckColumns.map(c => c.name);
    if (ds.indexes.columns) return ds.indexes.columns.map(c => c.name);
    return [];
  }

  /**
   * Describe the DuckDB table for the active dataset.
   * Returns column names, types, and whether they are nested (STRUCT/LIST).
   * @returns {Promise<Array<{name, type, nested}>>}
   */
  async function describeTable() {
    const ds = getActive();
    if (!ds || !_duckAvailable()) return [];
    if (ds._duckColumns) return ds._duckColumns;
    const tableName = ds.duckTable.replace(/[^a-z0-9_]/gi, '_');
    const cols = await Structra.duckdb.getTableColumns(tableName);
    ds._duckColumns = cols;
    return cols;
  }

  /**
   * Extract values at a JSON path from the DuckDB table.
   * Uses json_extract_string for nested access.
   * @param {string} path — dot-separated path (e.g. 'address.city' or 'items[0].name')
   * @returns {Promise<Array<Object>>}
   */
  async function jsonExtract(path) {
    const ds = getActive();
    if (!ds || !_canUseDuck(ds)) return [];
    const tableName = ds.duckTable.replace(/[^a-z0-9_]/gi, '_');

    // Convert dot path to DuckDB json_extract path: address.city → $.address.city
    const jsonPath = path.startsWith('$') ? path : '$.' + path;

    try {
      // First try struct access (DuckDB auto-creates STRUCT columns from nested JSON)
      // If the path is a direct column or nested struct, struct access is faster
      const structPath = path.replace(/\./g, '.');
      const cols = _getDuckColumnNames(ds);
      const topKey = path.split('.')[0].split('[')[0];

      if (cols.includes(topKey)) {
        // Column exists — use struct access for nested or direct select
        const sqlPath = path.replace(/\[(\d+)\]/g, '[$1+1]'); // DuckDB uses 1-based list indexing
        const sql = `SELECT "${sqlPath}" AS value FROM "${tableName}" WHERE "${sqlPath}" IS NOT NULL`;
        try {
          return await Structra.duckdb.query(sql);
        } catch {
          // Struct access failed — fall through to json_extract
        }
      }

      // Fallback: json_extract on each column
      const sql = `SELECT json_extract_string(CAST(ROW(*) AS JSON), '${jsonPath}') AS value FROM "${tableName}"`;
      return await Structra.duckdb.query(sql);
    } catch (err) {
      Structra.log.warn('Engine', `jsonExtract("${path}") failed: ${err.message}`);
      return [];
    }
  }

  /**
   * Unnest/flatten an array column or nested array via DuckDB.
   * @param {string} column — column name containing LIST/array values
   * @returns {Promise<Array<Object>>}
   */
  async function unnest(column) {
    const ds = getActive();
    if (!ds || !_canUseDuck(ds)) return [];
    const tableName = ds.duckTable.replace(/[^a-z0-9_]/gi, '_');
    try {
      return await Structra.duckdb.query(`SELECT UNNEST("${column}") AS item FROM "${tableName}"`);
    } catch (err) {
      Structra.log.warn('Engine', `unnest("${column}") failed: ${err.message}`);
      return [];
    }
  }

  /* ============================
     ANALYSIS — Unified traversal & analytics
     Consolidates all analysis functions so components never
     duplicate walks, coverage, profiling, or quality scoring.
     ============================ */

  /**
   * Iterative depth-first walk (stack-based, no recursion overflow).
   * @param {*} obj — root value
   * @param {function} visitor — (value, path, depth) → return false to skip children
   * @param {object} opts — { maxDepth: 20 }
   */
  function walk(obj, visitor, opts = {}) {
    const { maxDepth = 20 } = opts;
    const stack = [{ val: obj, path: '$', depth: 0 }];
    while (stack.length > 0) {
      const { val, path, depth } = stack.pop();
      if (depth > maxDepth) continue;
      const action = visitor(val, path, depth);
      if (action === false) continue;
      if (val && typeof val === 'object') {
        if (Array.isArray(val)) {
          for (let i = val.length - 1; i >= 0; i--) {
            stack.push({ val: val[i], path: `${path}[${i}]`, depth: depth + 1 });
          }
        } else {
          const entries = Object.entries(val);
          for (let i = entries.length - 1; i >= 0; i--) {
            const [k, v] = entries[i];
            stack.push({ val: v, path: `${path}.${k}`, depth: depth + 1 });
          }
        }
      }
    }
  }

  /**
   * Full stats analysis — counts all node types, depth, arrays detail.
   * Used by stats view, insight strip, drawer stats.
   * @param {*} data — raw JSON data (or pass null to use active dataset)
   * @returns {{ keys, depth, arrays, objects, strings, numbers, booleans, nulls, totalNodes, arraysDetail }}
   */
  function analyze(data) {
    if (data === undefined || data === null) {
      const ds = getActive();
      data = ds ? ds.raw : null;
    }
    if (!data) return null;

    const s = { keys: 0, depth: 0, arrays: 0, objects: 0, strings: 0, numbers: 0, booleans: 0, nulls: 0, totalNodes: 0, arraysDetail: [] };
    walk(data, (val, path, depth) => {
      if (depth > s.depth) s.depth = depth;
      s.totalNodes++;
      if (Array.isArray(val)) {
        s.arrays++;
        s.arraysDetail.push({
          path: path || '(root)',
          count: val.length,
          sample: val.length > 0 ? (typeof val[0] === 'object' && val[0] !== null ? 'object' : typeof val[0]) : 'empty',
        });
      } else if (val && typeof val === 'object') {
        s.objects++;
        s.keys += Object.keys(val).length;
      } else if (typeof val === 'string') s.strings++;
      else if (typeof val === 'number') s.numbers++;
      else if (typeof val === 'boolean') s.booleans++;
      else if (val === null) s.nulls++;
    });
    return s;
  }

  /**
   * Find the first array of plain objects in a data structure.
   * Used by stats, table, drawer-stats, insight strip.
   * @param {*} data — root JSON value (or null → active dataset)
   * @param {string} path — base path
   * @returns {{ rows: Array, path: string } | null}
   */
  function findFirstObjectArray(data, path) {
    if (data === undefined || data === null) {
      const ds = getActive();
      data = ds ? ds.raw : null;
    }
    if (!data) return null;
    path = path || '$';
    if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object' && data[0] !== null && !Array.isArray(data[0])) {
      return { rows: data, path };
    }
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      for (const k of Object.keys(data)) {
        const result = findFirstObjectArray(data[k], `${path}.${k}`);
        if (result) return result;
      }
    }
    return null;
  }

  /**
   * Find ALL arrays in a JSON structure at any depth.
   * Handles circular refs via seen set. Returns { path, count, data }.
   * @param {*} obj
   * @param {string} path
   * @returns {Array<{path, count, data}>}
   */
  function findAllArrays(obj, path, _seen) {
    if (obj === undefined || obj === null) {
      const ds = getActive();
      obj = ds ? ds.raw : null;
    }
    if (!obj) return [];
    const seen = _seen || new Set();
    if (obj && typeof obj === 'object') {
      if (seen.has(obj)) return [];
      seen.add(obj);
    }
    const result = [];
    path = path || '$';
    if (Array.isArray(obj)) {
      result.push({ path, count: obj.length, data: obj });
      for (let i = 0; i < obj.length; i++) {
        const item = obj[i];
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          for (const [k, v] of Object.entries(item)) {
            if (v && typeof v === 'object') {
              const cp = `${path}[*].${k}`;
              if (!result.some(r => r.path === cp)) {
                const sub = findAllArrays(v, cp, seen);
                for (const s of sub) {
                  if (!result.some(r => r.path === s.path)) result.push(s);
                }
              }
            }
          }
        }
      }
    } else if (obj && typeof obj === 'object') {
      for (const [k, v] of Object.entries(obj)) {
        const sub = findAllArrays(v, path === '$' ? k : `${path}.${k}`, seen);
        for (const s of sub) result.push(s);
      }
    }
    return result;
  }

  /**
   * Collect unique column names from an array of objects.
   * Used by table view and filter bar.
   * @param {Array} rows — array of objects (or null → active dataset rows)
   * @param {number} sampleLimit — max rows to scan (default 1000)
   * @returns {string[]}
   */
  function collectKeys(rows, sampleLimit) {
    if (!rows) {
      const ds = getActive();
      rows = ds && Array.isArray(ds.raw) ? ds.raw : [];
    }
    const limit = Math.min(rows.length, sampleLimit || 1000);
    const keys = [];
    const keySet = new Set();
    for (let i = 0; i < limit; i++) {
      const row = rows[i];
      if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
      for (const k of Object.keys(row)) {
        if (!keySet.has(k)) { keySet.add(k); keys.push(k); }
      }
    }
    return keys;
  }

  /**
   * Analyze key presence/missing/empty across an array of objects.
   * @param {Array} arr — array of objects
   * @returns {Array<{key, present, missing, empty, pct, types: Set}>}
   */
  function analyzeKeys(arr) {
    if (!arr || arr.length === 0) return [];
    const keyMap = Object.create(null);
    const total = arr.length;
    for (let i = 0; i < total; i++) {
      const row = arr[i];
      if (!row || typeof row !== 'object') continue;
      for (const key of Object.keys(row)) {
        if (!keyMap[key]) keyMap[key] = { key, present: 0, missing: 0, empty: 0, pct: 0, types: new Set() };
        const entry = keyMap[key];
        entry.present++;
        const val = row[key];
        if (val === null || val === undefined || val === '') entry.empty++;
        if (val !== null && val !== undefined) {
          entry.types.add(Array.isArray(val) ? 'array' : typeof val);
        }
      }
    }
    const entries = Object.values(keyMap);
    for (const e of entries) {
      e.missing = total - e.present;
      e.pct = Math.round((e.present / total) * 100);
    }
    return entries;
  }

  /**
   * Analyze nested keys for a parent key's object-typed values.
   * @param {Array} arr — parent array of objects
   * @param {string} parentKey — key whose value is an object
   * @returns {Array<{key, present, missing, empty, pct}>}
   */
  function analyzeNestedKeys(arr, parentKey) {
    if (!arr || arr.length === 0) return [];
    const keyMap = Object.create(null);
    let count = 0;
    for (let i = 0; i < arr.length; i++) {
      const row = arr[i];
      if (!row || typeof row !== 'object') continue;
      const nested = row[parentKey];
      if (!nested || typeof nested !== 'object' || Array.isArray(nested)) continue;
      count++;
      for (const key of Object.keys(nested)) {
        if (!keyMap[key]) keyMap[key] = { key, present: 0, missing: 0, empty: 0, pct: 0 };
        keyMap[key].present++;
        const v = nested[key];
        if (v === null || v === undefined || v === '') keyMap[key].empty++;
      }
    }
    if (count === 0) return [];
    const entries = Object.values(keyMap);
    for (const e of entries) {
      e.missing = count - e.present;
      e.pct = count > 0 ? Math.round((e.present / count) * 100) : 0;
    }
    return entries.sort((a, b) => b.missing - a.missing);
  }

  /**
   * Collect all values of a key from array items, flattening arrays.
   * Used for drill-into nested arrays.
   * @param {Array} data — parent array
   * @param {string} key — key name
   * @returns {Array}
   */
  function collectArrayItems(data, key) {
    const merged = [];
    for (let i = 0; i < data.length; i++) {
      const val = data[i] && data[i][key];
      if (Array.isArray(val)) {
        for (let j = 0; j < val.length; j++) merged.push(val[j]);
      }
    }
    return merged;
  }

  /**
   * Profile all fields across an array of objects.
   * Returns per-field: coverage, null%, types, min/max/avg, unique count, top values.
   * @param {Array} arr — array of objects (or null → active dataset)
   * @returns {{ fields, rowCount, fieldCount, quality } | null}
   */
  function profileFields(arr) {
    if (!arr) {
      const ds = getActive();
      arr = ds ? (Array.isArray(ds.raw) ? ds.raw : null) : null;
      if (!arr) {
        const fa = findFirstObjectArray();
        arr = fa ? fa.rows : null;
      }
    }
    if (!Array.isArray(arr) || arr.length === 0 || typeof arr[0] !== 'object') return null;

    // DuckDB SUMMARIZE path (returns a Promise — callers must handle async)
    const ds = getActive();
    if (_canUseDuck(ds)) {
      return _profileFieldsDuck(ds, arr);
    }

    // JS fallback path
    return _profileFieldsJS(arr);
  }

  /**
   * DuckDB-powered field profiling via SUMMARIZE + approx_top_k.
   */
  async function _profileFieldsDuck(ds, arr) {
    const tableName = ds.duckTable.replace(/[^a-z0-9_]/gi, '_');
    try {
      const summary = await Structra.duckdb.query(`SUMMARIZE "${tableName}"`);
      if (!summary || summary.length === 0) return _profileFieldsJS(arr);

      const fields = [];
      for (const row of summary) {
        const field = {
          key: row.column_name,
          count: Number(row.count || 0),
          total: arr.length,
          coverage: ((1 - (Number(row.null_percentage || 0) / 100)) * 100).toFixed(0),
          nullPct: String(row.null_percentage != null ? Number(row.null_percentage).toFixed(0) : '0'),
          types: {},
          primaryType: _duckTypeToJS(row.column_type),
          min: row.min != null ? row.min : undefined,
          max: row.max != null ? row.max : undefined,
          avg: row.avg != null ? row.avg : undefined,
          std: row.std != null ? row.std : undefined,
          q25: row.q25 != null ? row.q25 : undefined,
          q50: row.q50 != null ? row.q50 : undefined,
          q75: row.q75 != null ? row.q75 : undefined,
          unique: Number(row.approx_unique || 0),
          uniquePct: ((Number(row.approx_unique || 0) / Math.max(Number(row.count || 1), 1)) * 100).toFixed(0),
          columnType: row.column_type,
        };
        field.types[field.primaryType] = Number(row.count || 0);
        fields.push(field);
      }

      // Fetch top values for string columns
      for (const f of fields) {
        if (f.primaryType === 'string' || f.primaryType === 'boolean') {
          const topK = await topKValues(f.key, 5);
          if (topK.length > 0) {
            f.topValues = topK.map(r => ({ val: r.val != null ? String(r.val) : '', cnt: Number(r.cnt || 0) }));
          }
        }
      }

      Structra.log.info('Engine', `profileFields via SUMMARIZE: ${fields.length} columns`);
      return { fields, rowCount: arr.length, fieldCount: fields.length, quality: computeQuality(fields), source: 'duckdb' };
    } catch (err) {
      Structra.log.warn('Engine', 'SUMMARIZE profileFields failed, using JS fallback', err.message);
      return _profileFieldsJS(arr);
    }
  }

  /** Map DuckDB type string to JS type name */
  function _duckTypeToJS(duckType) {
    if (!duckType) return 'unknown';
    const t = duckType.toUpperCase();
    if (t.includes('INT') || t.includes('FLOAT') || t.includes('DOUBLE') || t.includes('DECIMAL') || t.includes('NUMERIC') || t === 'BIGINT' || t === 'UBIGINT' || t === 'HUGEINT' || t === 'SMALLINT' || t === 'TINYINT') return 'number';
    if (t === 'VARCHAR' || t.includes('TEXT') || t === 'STRING') return 'string';
    if (t === 'BOOLEAN' || t === 'BOOL') return 'boolean';
    if (t.includes('TIMESTAMP') || t.includes('DATE') || t.includes('TIME')) return 'string';
    if (t.includes('STRUCT')) return 'object';
    if (t.includes('LIST') || t.includes('ARRAY') || t.startsWith('[')) return 'array';
    if (t.includes('MAP')) return 'object';
    if (t === 'JSON') return 'object';
    return 'unknown';
  }

  /** JS-only field profiling (original implementation, used as fallback). */
  function _profileFieldsJS(arr) {

    const fields = [];
    const keySet = new Map();
    const limit = Math.min(arr.length, 1000);
    for (let i = 0; i < limit; i++) {
      if (!arr[i] || typeof arr[i] !== 'object') continue;
      for (const k of Object.keys(arr[i])) {
        if (!keySet.has(k)) keySet.set(k, { key: k, present: 0, total: arr.length });
        keySet.get(k).present++;
      }
    }

    for (const [key, meta] of keySet) {
      const values = arr.map(obj => (obj && obj[key] !== undefined) ? obj[key] : undefined);
      const defined = values.filter(v => v !== undefined);
      const nonNull = defined.filter(v => v !== null && v !== '');

      const field = {
        key,
        count: meta.present,
        total: arr.length,
        coverage: ((meta.present / arr.length) * 100).toFixed(0),
        nullPct: (((meta.present - nonNull.length) / arr.length) * 100).toFixed(0),
        types: {},
        primaryType: 'unknown',
      };

      for (const v of defined) {
        const t = v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;
        field.types[t] = (field.types[t] || 0) + 1;
      }
      field.primaryType = Object.entries(field.types).sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';

      // Numeric stats
      const nums = nonNull.filter(v => typeof v === 'number');
      if (nums.length > 0) {
        let mn = nums[0], mx = nums[0], sum = 0;
        for (let i = 0; i < nums.length; i++) {
          const n = nums[i];
          if (n < mn) mn = n;
          if (n > mx) mx = n;
          sum += n;
        }
        field.min = mn;
        field.max = mx;
        field.avg = (sum / nums.length).toFixed(2);
      }

      // Unique values
      const uniq = new Set(nonNull.map(v => typeof v === 'object' ? JSON.stringify(v) : String(v)));
      field.unique = uniq.size;
      field.uniquePct = ((uniq.size / Math.max(nonNull.length, 1)) * 100).toFixed(0);

      // Top values (strings/booleans)
      if (field.primaryType === 'string' || field.primaryType === 'boolean') {
        const freq = {};
        for (const v of nonNull) { const s = String(v); freq[s] = (freq[s] || 0) + 1; }
        field.topValues = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([val, cnt]) => ({ val, cnt }));
      }

      fields.push(field);
    }

    return { fields, rowCount: arr.length, fieldCount: keySet.size, quality: computeQuality(fields) };
  }

  /**
   * Compute data quality score from profiled fields.
   * Weights: completeness 40% + consistency 35% + uniqueness 25%.
   * @param {Array} fields — from profileFields().fields
   * @returns {{ overall, completeness, consistency, uniqueness, issues }}
   */
  function computeQuality(fields) {
    if (!fields || fields.length === 0) return { overall: 100, completeness: 100, consistency: 100, uniqueness: 100, issues: [] };

    const avgNull = fields.reduce((s, f) => s + parseFloat(f.nullPct), 0) / fields.length;
    const completeness = Math.max(0, 100 - avgNull);

    const consistentCount = fields.filter(f => {
      const typeKeys = Object.keys(f.types).filter(t => t !== 'null');
      return typeKeys.length <= 1;
    }).length;
    const consistency = (consistentCount / fields.length) * 100;

    const uniqFields = fields.filter(f => f.primaryType === 'string' || f.primaryType === 'number');
    const uniqueness = uniqFields.length > 0
      ? uniqFields.reduce((s, f) => s + parseFloat(f.uniquePct), 0) / uniqFields.length
      : 100;

    const overall = Math.round(completeness * 0.4 + consistency * 0.35 + uniqueness * 0.25);

    const issues = [];
    for (const f of fields) {
      const np = parseFloat(f.nullPct);
      if (np >= 30) issues.push({ field: f.key, msg: `${np}% null`, severity: np >= 60 ? 'high' : 'med' });
      const typeKeys = Object.keys(f.types).filter(t => t !== 'null');
      if (typeKeys.length > 1) issues.push({ field: f.key, msg: `mixed types (${typeKeys.join(', ')})`, severity: 'high' });
      if (f.primaryType === 'string' && parseFloat(f.uniquePct) < 5 && parseFloat(f.coverage) > 50) {
        issues.push({ field: f.key, msg: `only ${f.uniquePct}% unique`, severity: 'med' });
      }
    }
    issues.sort((a, b) => (a.severity === 'high' ? 0 : 1) - (b.severity === 'high' ? 0 : 1));

    return { overall, completeness: Math.round(completeness), consistency: Math.round(consistency), uniqueness: Math.round(uniqueness), issues: issues.slice(0, 5) };
  }

  /**
   * Count gaps (missing keys) across rows of an object array.
   * @param {Array} rows
   * @returns {number}
   */
  function countGaps(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return 0;
    const allKeys = new Set();
    for (const r of rows) {
      if (r && typeof r === 'object') Object.keys(r).forEach(k => allKeys.add(k));
    }
    let gaps = 0;
    for (const r of rows) {
      if (!r || typeof r !== 'object') continue;
      for (const k of allKeys) {
        if (!Object.prototype.hasOwnProperty.call(r, k)) gaps++;
      }
    }
    return gaps;
  }

  /**
   * Format byte count to human-readable string.
   * @param {number} bytes
   * @returns {string}
   */
  function formatSize(bytes) {
    if (!bytes) return '—';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  /**
   * Get top-k most frequent values per column via DuckDB GROUP BY.
   * @param {string} column
   * @param {number} k
   * @returns {Promise<Array>}
   */
  async function topKValues(column, k = 10) {
    const ds = getActive();
    if (!ds || !_canUseDuck(ds)) return [];
    const tableName = ds.duckTable.replace(/[^a-z0-9_]/gi, '_');
    try {
      return await Structra.duckdb.query(
        `SELECT UNNEST(approx_top_k("${column}", ${k})) AS val FROM "${tableName}"`
      );
    } catch {
      // Fallback: regular GROUP BY
      try {
        return await Structra.duckdb.query(
          `SELECT "${column}" AS val, COUNT(*) AS cnt FROM "${tableName}" WHERE "${column}" IS NOT NULL GROUP BY "${column}" ORDER BY cnt DESC LIMIT ${k}`
        );
      } catch { return []; }
    }
  }

  /**
   * DuckDB-backed analysis: run aggregate queries when DuckDB is ready.
   * Falls back to in-memory analyze() otherwise.
   * @returns {Promise<Object>} — extended stats object
   */
  async function analyzeDb() {
    const ds = getActive();
    if (!ds) return null;

    // DuckDB path — uses SUMMARIZE for per-column stats
    if (_canUseDuck(ds)) {
      const tableName = ds.duckTable.replace(/[^a-z0-9_]/gi, '_');
      try {
        // SUMMARIZE gives us everything in one statement
        const summary = await Structra.duckdb.query(`SUMMARIZE "${tableName}"`);
        const countResult = await Structra.duckdb.query(`SELECT COUNT(*) AS cnt FROM "${tableName}"`);
        const rowCount = Number(countResult[0]?.cnt || 0);

        const fieldStats = (summary || []).map(r => ({
          key: r.column_name,
          type: r.column_type,
          present: Number(r.count || 0),
          nulls: Math.round(Number(r.null_percentage || 0) * rowCount / 100),
          unique: Number(r.approx_unique || 0),
          coverage: ((1 - Number(r.null_percentage || 0) / 100) * 100).toFixed(0),
          nullPct: String(r.null_percentage != null ? Number(r.null_percentage).toFixed(0) : '0'),
          min: r.min,
          max: r.max,
          avg: r.avg,
          std: r.std,
          q25: r.q25,
          q50: r.q50,
          q75: r.q75,
        }));

        // Also get in-memory stats for type distribution / depth (DuckDB doesn't track these)
        const memStats = analyze(ds.raw);

        return {
          ...memStats,
          rowCount,
          fieldStats,
          source: 'duckdb',
        };
      } catch (err) {
        Structra.log.warn('Engine', 'DuckDB analyze failed, using in-memory', err.message);
      }
    }

    // Fallback
    const memStats = analyze(ds.raw);
    if (memStats) memStats.source = 'memory';
    return memStats;
  }

  /* ============================ */
  /*   PHASE D: DISTRIBUTION      */
  /*   (SQL-only — no JS fallback) */
  /* ============================ */

  /**
   * Analyze statistical distribution of a single column via DuckDB.
   * Returns median, mode, stddev, skewness, kurtosis, entropy, histogram, percentiles.
   * @param {string} column
   * @returns {Promise<Object|null>}
   */
  async function analyzeDistribution(column) {
    const ds = getActive();
    if (!ds || !_canUseDuck(ds)) return null;
    const tableName = ds.duckTable.replace(/[^a-z0-9_]/gi, '_');
    try {
      const result = await Structra.duckdb.query(`
        SELECT
          median("${column}") AS median,
          mode("${column}") AS mode,
          stddev_samp("${column}") AS stddev,
          var_samp("${column}") AS variance,
          skewness("${column}") AS skewness,
          kurtosis("${column}") AS kurtosis,
          entropy("${column}") AS entropy,
          quantile_cont("${column}", [0.1, 0.25, 0.5, 0.75, 0.9]) AS percentiles,
          min("${column}") AS min_val,
          max("${column}") AS max_val,
          avg("${column}") AS avg_val,
          count("${column}") AS non_null_count,
          count(*) AS total_count
        FROM "${tableName}"
      `);
      const r = result[0] || {};
      return {
        column,
        median: r.median,
        mode: r.mode,
        stddev: r.stddev,
        variance: r.variance,
        skewness: r.skewness,
        kurtosis: r.kurtosis,
        entropy: r.entropy,
        percentiles: r.percentiles,
        min: r.min_val,
        max: r.max_val,
        avg: r.avg_val,
        nonNullCount: Number(r.non_null_count || 0),
        totalCount: Number(r.total_count || 0),
        source: 'duckdb',
      };
    } catch (err) {
      Structra.log.warn('Engine', `analyzeDistribution("${column}") failed`, err.message);
      return null;
    }
  }

  /**
   * Compute correlation between two columns via DuckDB.
   * @param {string} col1
   * @param {string} col2
   * @returns {Promise<number|null>}
   */
  async function correlation(col1, col2) {
    const ds = getActive();
    if (!ds || !_canUseDuck(ds)) return null;
    const tableName = ds.duckTable.replace(/[^a-z0-9_]/gi, '_');
    try {
      const result = await Structra.duckdb.query(`SELECT corr("${col1}", "${col2}") AS r FROM "${tableName}"`);
      return result[0]?.r ?? null;
    } catch { return null; }
  }

  /* ============================ */
  /*   PHASE E: ENHANCED SEARCH   */
  /*   (SQL-only — no JS fallback) */
  /* ============================ */

  /**
   * Fuzzy search across all VARCHAR columns using jaro_winkler_similarity.
   * @param {string} text — search text
   * @param {number} threshold — minimum similarity (0-1), default 0.8
   * @returns {Promise<Array>}
   */
  async function fuzzySearch(text, threshold = 0.8) {
    const ds = getActive();
    if (!ds || !_canUseDuck(ds)) return [];
    const tableName = ds.duckTable.replace(/[^a-z0-9_]/gi, '_');
    const cols = (ds._duckColumns || []).filter(c =>
      c.type && (c.type.toUpperCase() === 'VARCHAR' || c.type.toUpperCase().includes('TEXT'))
    ).map(c => c.name);
    if (cols.length === 0) return [];

    const conditions = cols.map(c =>
      `jaro_winkler_similarity(CAST("${c}" AS VARCHAR), '${text.replace(/'/g, "''")}') >= ${threshold}`
    ).join(' OR ');

    try {
      return await Structra.duckdb.query(`SELECT * FROM "${tableName}" WHERE ${conditions} LIMIT 200`);
    } catch (err) {
      Structra.log.warn('Engine', `fuzzySearch failed`, err.message);
      return [];
    }
  }

  /**
   * Regex search across all VARCHAR columns using regexp_matches.
   * @param {string} pattern — regex pattern
   * @returns {Promise<Array>}
   */
  async function regexSearch(pattern) {
    const ds = getActive();
    if (!ds || !_canUseDuck(ds)) return [];
    const tableName = ds.duckTable.replace(/[^a-z0-9_]/gi, '_');
    const cols = (ds._duckColumns || []).filter(c =>
      c.type && (c.type.toUpperCase() === 'VARCHAR' || c.type.toUpperCase().includes('TEXT'))
    ).map(c => c.name);
    if (cols.length === 0) return [];

    const conditions = cols.map(c =>
      `regexp_matches(CAST("${c}" AS VARCHAR), '${pattern.replace(/'/g, "''")}')`
    ).join(' OR ');

    try {
      return await Structra.duckdb.query(`SELECT * FROM "${tableName}" WHERE ${conditions} LIMIT 500`);
    } catch (err) {
      Structra.log.warn('Engine', `regexSearch failed`, err.message);
      return [];
    }
  }

  /* ============================ */
  /*   PHASE F: DATA TRANSFORMS   */
  /*   (SQL primary, JS fallback)  */
  /* ============================ */

  /**
   * Export data as CSV or JSON string via DuckDB COPY TO.
   * Returns the string content for download.
   * @param {'csv'|'json'} format
   * @returns {Promise<string|null>}
   */
  async function exportData(format = 'csv') {
    const ds = getActive();
    if (!ds || !_canUseDuck(ds)) {
      // JS fallback: export raw data as JSON
      return ds ? JSON.stringify(ds.raw, null, 2) : null;
    }
    const tableName = ds.duckTable.replace(/[^a-z0-9_]/gi, '_');
    try {
      if (format === 'csv') {
        const rows = await Structra.duckdb.query(`SELECT * FROM "${tableName}"`);
        if (!rows || rows.length === 0) return '';
        const headers = Object.keys(rows[0]);
        const csvLines = [headers.join(',')];
        for (const r of rows) {
          csvLines.push(headers.map(h => {
            const v = r[h];
            if (v == null) return '';
            const s = String(v);
            return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
          }).join(','));
        }
        return csvLines.join('\n');
      }
      // JSON export
      const rows = await Structra.duckdb.query(`SELECT * FROM "${tableName}"`);
      return JSON.stringify(rows, null, 2);
    } catch (err) {
      Structra.log.warn('Engine', `exportData failed`, err.message);
      return ds ? JSON.stringify(ds.raw, null, 2) : null;
    }
  }

  /**
   * Random sample of N rows via DuckDB SAMPLE.
   * @param {number} n — number of rows
   * @returns {Promise<Array>}
   */
  async function sampleData(n = 100) {
    const ds = getActive();
    if (!ds || !_canUseDuck(ds)) {
      // JS fallback: random pick from raw array
      if (ds && Array.isArray(ds.raw)) {
        const copy = ds.raw.slice();
        for (let i = copy.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return copy.slice(0, n);
      }
      return [];
    }
    const tableName = ds.duckTable.replace(/[^a-z0-9_]/gi, '_');
    try {
      return await Structra.duckdb.query(`SELECT * FROM "${tableName}" USING SAMPLE ${n} ROWS`);
    } catch (err) {
      Structra.log.warn('Engine', `sampleData failed`, err.message);
      return [];
    }
  }

  /**
   * Pivot data via DuckDB PIVOT.
   * @param {string} onCol — column to pivot on
   * @param {string} valueCol — column with values
   * @param {string} aggFn — aggregate function (count, sum, avg, etc.)
   * @returns {Promise<Array>}
   */
  async function pivotData(onCol, valueCol, aggFn = 'count') {
    const ds = getActive();
    if (!ds || !_canUseDuck(ds)) return [];
    const tableName = ds.duckTable.replace(/[^a-z0-9_]/gi, '_');
    try {
      return await Structra.duckdb.query(
        `PIVOT "${tableName}" ON "${onCol}" USING ${aggFn}("${valueCol}")`
      );
    } catch (err) {
      Structra.log.warn('Engine', `pivotData failed`, err.message);
      return [];
    }
  }

  /* --- Public API --- */
  return {
    ingest,
    remove,
    setActive,
    getActive,
    getDataset,
    slice,
    sort,
    search,
    filter,
    aggregate,
    getSchema,
    getStats,
    sql,
    pathQuery,
    diff,
    // Query pipeline (DuckDB-first)
    findInDb,
    replaceInData,
    filterDb,
    runSql,
    clearQuery,
    getQuery,
    getQueryRows,
    getQueryData,
    // DuckDB JSON operations (nested/complex data)
    describeTable,
    jsonExtract,
    unnest,
    summarizeTable,
    topKValues,
    onDuckDBReady,
    scheduleSessionSave,
    // Analysis (consolidated)
    walk,
    analyze,
    analyzeDb,
    findFirstObjectArray,
    findAllArrays,
    collectKeys,
    analyzeKeys,
    analyzeNestedKeys,
    collectArrayItems,
    profileFields,
    computeQuality,
    countGaps,
    formatSize,
    // Phase H: DuckDB schema
    getSchemaDb,
    // Phase D: Distribution analysis
    analyzeDistribution,
    correlation,
    // Phase E: Enhanced search
    fuzzySearch,
    regexSearch,
    // Phase F: Data transforms
    exportData,
    sampleData,
    pivotData,
    get datasets() { return _datasets; },
    get activeId() { return _activeId; },
    get duckReady() { return _duckReady; },
    get duckFailed() { return _duckFailed; },
    /** Can DuckDB run SQL on the active dataset? */
    get canUseDuck() { return _canUseDuck(getActive()); },
    /** Is DuckDB engine alive? (doesn't check dataset registration) */
    get isDuckAvailable() { return _duckAvailable(); },
  };
})();
