/* ============================================================
   STRUCTRA V2 - Data Engine
   Unified query API managing named datasets (one per tab).

   API:
     Structra.dataEngine.ingest(tabId, data, meta)  → index + store dataset
     Structra.dataEngine.remove(tabId)              → cleanup dataset
     Structra.dataEngine.setActive(tabId)           → switch context
     Structra.dataEngine.getActive()                → current Dataset
     Structra.dataEngine.slice(offset, limit)       → paginated rows
     Structra.dataEngine.sort(key, dir)             → sort active dataset
     Structra.dataEngine.search(pattern, opts)      → search values/keys/paths
     Structra.dataEngine.filter(predicate)          → filter active array
     Structra.dataEngine.aggregate(key, fn)         → aggregation result
     Structra.dataEngine.getSchema()                → inferred schema
     Structra.dataEngine.getStats()                 → stats summary
     Structra.dataEngine.pathQuery(expr)            → JSONPath query
     Structra.dataEngine.sql(query)                 → DuckDB SQL (when ready)

   Events:
     'engine:ingested'    → {tabId, meta}
     'engine:active'      → {tabId, dataset}
     'engine:removed'     → {tabId}
     'engine:query-result' → {mode, result, duration}
     'engine:duckdb-ready' → {}
     'engine:error'        → {message, context}

   Console:
     Structra.dataEngine.getActive()
     Structra.dataEngine.runSql('SELECT COUNT(*) FROM data')

   Wiring (generated from the code below; update it when you add or remove an event):
     Listens to: engine:duckdb-failed, engine:data-modified
     Emits: engine:persisted, engine:ingested, engine:duckdb-registered, engine:removed,
          engine:active, engine:duckdb-ready, engine:data-modified, engine:filter-changed,
          engine:duckdb-starting, loading:show, loading:hide
   ============================================================ */

window.Structra = window.Structra || {};

Structra.dataEngine = (() => {
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
        sorted: null,    // {key, dir, refs} - current sort
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
    // A Map, so a column named constructor, toString or __proto__ is an ordinary column
    const columns = new Map();

    for (const row of sample) {
      if (!row || typeof row !== 'object') continue;
      for (const [key, val] of Object.entries(row)) {
        let col = columns.get(key);
        if (!col) { col = { name: key, types: new Set(), count: 0, nulls: 0 }; columns.set(key, col); }
        col.count++;
        if (val === null || val === undefined) {
          col.nulls++;
        } else {
          col.types.add(Array.isArray(val) ? 'array' : typeof val);
        }
      }
    }

    // Convert sets to arrays for serialization
    return [...columns.values()].map(col => ({
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

    // Keep a handle on the original (a File costs nothing; small text is fine) for checks that need it
    if (meta.rawSource && (typeof meta.rawSource !== 'string' || meta.rawSource.length <= 5242880)) dataset._rawSource = meta.rawSource;

    _datasets.set(tabId, dataset);

    // If this is the only dataset or active, set as active
    if (_activeId === null || _activeId === tabId) {
      _activeId = tabId;
    }

    const duration = performance.now() - t0;
    Structra.log.info('Engine', `Ingested tab ${tabId}: ${dataset.meta.shape}, ${dataset.meta.rowCount || '?'} rows (${duration.toFixed(1)}ms)`);

    // Keep the original text for Recents. Not urgent, so wait until the page is idle.
    if (meta.rawSource) {
      new Promise((resolve) => Structra.sharedHelpers.runWhenIdle(resolve, 3000))
        .then(() => Structra.browserDatabase.raw.put(meta.rawSource, { format: meta.format, name: meta.name }))
        .then(hash => {
          dataset.meta.hash = hash;
          Structra.events.emit('engine:persisted', { tabId });
          Structra.browserDatabase.recents.add({
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

    // SQL is optional and starts on demand (see enableSql). If it is already running, load this
    // dataset into it in the background so SQL stays in step with the open document.
    if (_duckAvailable()) {
      dataset._duckPromise = Structra.duckdbAdapter.registerDataset(dataset)
        .then(() => Structra.events.emit('engine:duckdb-registered', { tabId }))
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
      Structra.duckdbAdapter.dropTable(dataset.duckTable).catch(() => {});
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
      const cmp = Structra.sharedHelpers.compareValues(av, bv);
      return dir === 'asc' ? cmp : -cmp;
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
    const maxDepth = Structra.appSettings.get('maxDepth');

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

  /* --- JSONPath Query (placeholder - needs jsonpath-plus) --- */
  function pathQuery(expr) {
    const ds = getActive();
    if (!ds) return { results: [], matchedPaths: [] };
    // Will integrate with jsonpath-plus via lib-loader
    Structra.log.warn('Engine', 'JSONPath not yet integrated');
    return { results: [], matchedPaths: [], expr };
  }

  /* --- Diff (structural comparison between two datasets) --- */
  /* --- DuckDB Ready Hook --- */
  function onDuckDBReady() {
    _duckReady = true;
    Structra.log.info('Engine', 'DuckDB WASM ready - SQL queries enabled');
    Structra.events.emit('engine:duckdb-ready');
    // The active dataset is registered by enableSql(); other tabs register when they become active
  }

  function onDuckDBFailed() {
    _duckFailed = true;
    Structra.log.warn('Engine', 'DuckDB WASM failed - using JS fallback for all analysis');
  }

  // Listen for DuckDB failure
  if (Structra.events) {
    Structra.events.on('engine:duckdb-failed', onDuckDBFailed);
    Structra.events.on('engine:data-modified', () => { const ds = getActive(); if (ds) ds._analysis = null; });
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
      Structra.browserDatabase.session.save(state).catch(() => {});
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
   * @param {string} text - search text
   * @returns {Promise<Object>} query result
   */
  async function findInDb(text) {
    const ds = getActive();
    if (!ds) return null;

    // key:name finds a field by its name, $.a.b finds by path; anything else searches the values
    const byKey = /^\s*key:\s*(.+?)\s*$/i.exec(text);
    if (byKey) {
      const found = search(new RegExp(byKey[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), { mode: 'keys' });
      return _setFindResult(ds, text, found.matchedPaths);
    }
    if (/^\s*\$[.\[]/.test(text)) {
      let hits;
      try { hits = Structra.jsonpathQuery.query(ds.raw, text.trim()); } catch (err) { throw new Error('This path could not be read: ' + err.message); }
      return _setFindResult(ds, text, hits.map((h) => h.path));
    }
    // Search the values themselves: every match carries its path, so the count is the number of matching
    // values and Next / Previous visit each one. (A row-based SQL search counted rows, and missed nested values.)
    return _findInMemory(ds, text);
  }

  /** In-memory find (no DuckDB) */
  function _findInMemory(ds, text, regex) {
    const literal = new RegExp(String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const searchResult = search(regex || literal, { mode: 'values' });
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
   * @param {string} findText - text to find
   * @param {string} replaceText - replacement text
   * @param {boolean} all - replace all occurrences or just first
   * @returns {Object} { replaced: number }
   */
  /**
   * Replace text in the open document. It matches the way Find does (capital letters make no difference) and
   * changes text values only: a match inside a number or true/false is counted in `skipped`, not changed.
   */
  function replaceInData(findText, replaceText, all = false) {
    const ds = getActive();
    if (!ds) return { replaced: 0, skipped: 0 };
    const re = new RegExp(String(findText).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const probe = new RegExp(re.source, 'i');
    let count = 0;
    let skipped = 0;

    function visit(holder, key) {
      const v = holder[key];
      if (typeof v === 'string') {
        if (probe.test(v)) { holder[key] = v.replace(re, () => replaceText); count++; return !all; }
      } else if (typeof v === 'number' || typeof v === 'boolean') {
        if (probe.test(String(v))) skipped++;
      } else if (v && typeof v === 'object') {
        for (const k of Object.keys(v)) if (visit(v, k)) return true;
      }
      return false;
    }

    visit({ root: ds.raw }, 'root');

    if (count > 0) {
      // Clear caches, re-register with DuckDB
      cacheClear(ds);
      if (_duckAvailable()) {
        Structra.duckdbAdapter.registerDataset(ds).catch(() => {});
      }
      Structra.log.info('Engine', `Replaced ${count} occurrence(s) of "${findText}" → "${replaceText}"`);
      Structra.events.emit('engine:data-modified', { tabId: ds.id, action: 'replace', count });
    }
    return { replaced: count, skipped };
  }

  /**
   * "The data" for tools that work on rows (Filter, Pivot, Null finder): the document itself when it is a list of
   * records, otherwise its first list of records (value in a SharePoint response, body.value in an HTTP output).
   * @returns {{ path: string, rows: Array } | null}
   */
  function mainList(ds) {
    ds = ds || getActive();
    if (!ds) return null;
    if (ds._main === undefined) {
      const isRecord = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
      if (Array.isArray(ds.raw)) ds._main = ds.raw.length && isRecord(ds.raw[0]) ? { path: '$', rows: ds.raw } : null;
      else ds._main = _firstObjectArray(ds.raw, '$');
    }
    return ds._main;
  }

  /** Read a field of a row; Status.Value reads the Value inside Status */
  function fieldValue(row, field) {
    if (row === null || row === undefined) return undefined;
    if (Object.prototype.hasOwnProperty.call(row, field)) return row[field];
    let v = row;
    for (const k of String(field).split('.')) {
      if (v === null || v === undefined || typeof v !== 'object') return undefined;
      v = v[k];
    }
    return v;
  }

  /**
   * The columns of the main list, as a person thinks of them: plain fields, and the plain parts of Choice,
   * Person and Lookup fields as Parent.Child (Status.Value, Requester.Email). Lists and system keys are left out.
   * @returns {string[]}
   */
  function mainColumns(ds) {
    ds = ds || getActive();
    const main = mainList(ds);
    if (!main) return [];
    if (!ds._mainCols) {
      const sample = main.rows.slice(0, 100).filter((r) => r && typeof r === 'object' && !Array.isArray(r));
      const keys = [];
      sample.forEach((r) => Object.keys(r).forEach((k) => { if (!keys.includes(k)) keys.push(k); }));
      const cols = [];
      for (const k of keys) {
        if (k.startsWith('@')) continue;
        const vals = sample.map((r) => r[k]).filter((v) => v !== null && v !== undefined);
        const objs = vals.filter((v) => typeof v === 'object' && !Array.isArray(v));
        if (vals.length && objs.length === vals.length) {
          const kids = [];
          objs.forEach((o) => Object.keys(o).forEach((c) => { if (!kids.includes(c) && !c.startsWith('@') && (o[c] === null || typeof o[c] !== 'object')) kids.push(c); }));
          kids.slice(0, 8).forEach((c) => cols.push(`${k}.${c}`));
        } else if (!vals.length || vals.some((v) => typeof v !== 'object')) {
          cols.push(k);
        }
      }
      ds._mainCols = cols;
    }
    return ds._mainCols;
  }

  /**
   * Apply structured filter conditions via DuckDB.
   * @param {Array<Object>} conditions - [{field, op, value, logic}]
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

    // The SQL route is for a plain list at the root with plain column names. Anything else (a list inside an object,
    // Status.Value style columns) is filtered in memory, on the rows of the main list.
    const plain = Array.isArray(ds.raw) && conditions.every((c) => !String(c.field).includes('.'));
    if (plain && _canUseDuck(ds)) {
      const tableName = _tableOf(ds);
      const cols = _getDuckColumnNames(ds);
      const sqlWhere = _conditionsToSql(conditions, cols);
      if (!sqlWhere) return _filterInMemory(ds, conditions);

      const sqlQuery = `SELECT * FROM "${tableName}" WHERE ${sqlWhere}`;
      try {
        const rows = await Structra.duckdbAdapter.query(sqlQuery);
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
        _forgetMissingTable(ds, err);
      }
    }

    return _filterInMemory(ds, conditions);
  }

  /** Words a read-only query may start with (comments and spaces before them are skipped) */
  const SQL_READ_ONLY = /^(?:\s|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)*(select|with|from|values|describe|show|summarize|explain|pivot|unpivot)\b/i;
  /** Words a query that can sit inside another query starts with */
  const SQL_SELECT_LIKE = /^(?:\s|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)*(select|with|from|values)\b/i;

  /** The query without its text in quotes or comments, so a ; or a word inside a string is not mistaken for SQL */
  function _sqlSkeleton(sqlText) {
    return sqlText
      .replace(/'(?:[^']|'')*'/g, "''")
      .replace(/"(?:[^"]|"")*"/g, '""')
      .replace(/--[^\n]*/g, ' ')
      .replace(/\/\*[\s\S]*?\*\//g, ' ');
  }

  /**
   * Execute SQL against the open document, which is the table "data" (SELECT * FROM data).
   * @param {string} sqlText
   * @param {Object} [opts]
   * @param {boolean} [opts.quiet]    do not change what the Tree and Table show (the Query panel uses this)
   * @param {boolean} [opts.readOnly] refuse anything that is not a query that reads data
   * @param {number}  [opts.maxRows]  stop reading after this many rows; the result then has truncated: true
   */
  async function runSql(sqlText, opts = {}) {
    if (opts.readOnly) {
      if (!SQL_READ_ONLY.test(sqlText)) {
        return { error: 'Only queries that read data can run here. Start with SELECT, WITH, VALUES, DESCRIBE, SHOW, SUMMARIZE, PIVOT or UNPIVOT.' };
      }
      if (/;\s*\S/.test(_sqlSkeleton(sqlText))) {
        return { error: 'Run one statement at a time. Select the statement you want, or remove the extra ones.' };
      }
    }
    if (!(await enableSql())) {
      return { error: 'The SQL engine could not start' };
    }
    const t0 = performance.now();
    const ds = getActive();
    try {
      // In SQL the open document is the table "data" (SELECT * FROM data), whichever tab it is in
      if (ds && _isDuckRegistered(ds)) {
        await Structra.duckdbAdapter.query(`CREATE OR REPLACE TEMP VIEW data AS SELECT * FROM "${_tableOf(ds)}"`);
      } else if (/\bdata\b/i.test(sqlText)) {
        return { error: 'This document is not a list or object, so there is no table named data to query' };
      }
      let text = sqlText.trim().replace(/;+\s*$/, '');
      let capped = false;
      // Cap the rows read, so a query that returns a million rows cannot freeze the page.
      // DESCRIBE, SHOW and SUMMARIZE cannot sit inside another query and are small anyway.
      if (opts.maxRows && SQL_SELECT_LIKE.test(text)) {
        text = `SELECT * FROM (\n${text}\n) AS q LIMIT ${opts.maxRows + 1}`;
        capped = true;
      }
      let rows = await Structra.duckdbAdapter.query(text);
      const columnTypes = rows.columnTypes || [];
      let truncated = false;
      if (capped && rows.length > opts.maxRows) { rows = rows.slice(0, opts.maxRows); truncated = true; }
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
        columnTypes,
        truncated,
        duration,
      };
      if (!opts.quiet) _setActiveQuery(result);
      Structra.log.info('Engine', `SQL executed: ${rows.length} rows (${duration.toFixed(0)}ms)`);
      return result;
    } catch (err) {
      Structra.log.error('Engine', 'SQL execution failed', err.message);
      _forgetMissingTable(ds, err);
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
    const main = mainList(ds);
    if (!main) return null;

    const rows = main.rows.filter(row => {
      if (!row || typeof row !== 'object') return false;
      let pass = true;

      for (let i = 0; i < conditions.length; i++) {
        const c = conditions[i];
        const val = fieldValue(row, c.field);
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

    const cols = collectKeys(main.rows);
    const OPS = { eq: '=', neq: '≠', gt: '>', lt: '<', gte: '≥', lte: '≤', contains: 'contains', notcontains: 'does not contain', startswith: 'starts with', endswith: 'ends with', isnull: 'is empty', notnull: 'has a value' };
    const result = {
      source: 'filter',
      query: conditions.map((c, i) => `${i ? (c.logic || 'AND').toLowerCase() + ' ' : ''}${c.field} ${OPS[c.op] || c.op}${c.op === 'isnull' || c.op === 'notnull' ? '' : ' ' + (c.value || '')}`).join(' '),
      conditions,
      rows,
      matchedPaths: null,
      total: rows.length,
      columns: cols,
    };
    _setActiveQuery(result);
    return result;
  }

  /** Filter by a JSONPath: every value the path finds, as rows (records as they are, other values as { value }) */
  async function filterByPath(expr) {
    const ds = getActive();
    if (!ds) return null;
    let found;
    try { found = Structra.jsonpathQuery.query(ds.raw, expr); }
    catch (err) { throw new Error('This path could not be read: ' + err.message); }
    const isRecord = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
    const rows = found.map((m) => (isRecord(m.value) ? m.value : { path: m.path, value: m.value }));
    const result = {
      source: 'filter',
      query: expr,
      conditions: null,
      rows,
      matchedPaths: found.map((m) => m.path),
      total: rows.length,
      columns: rows.length ? Object.keys(rows[0]) : [],
    };
    _setActiveQuery(result);
    return result;
  }

  /** Filter the rows of the main list with a JavaScript test on `row`, for example row.Cost > 100 && row.Approved */
  async function filterByExpression(expr) {
    const ds = getActive();
    if (!ds) return null;
    const main = mainList(ds);
    if (!main) return null;
    let test;
    try { test = new Function('row', 'return (' + expr + ');'); }
    catch (err) { throw new Error('This expression could not be read: ' + err.message + '. Example: row.Cost > 100 && row.Approved === true'); }
    const started = Date.now();
    const rows = [];
    for (let i = 0; i < main.rows.length; i++) {
      if (i % 500 === 0 && Date.now() - started > 5000) throw new Error('The expression is taking too long (over 5 seconds) and was stopped.');
      try { if (test(main.rows[i])) rows.push(main.rows[i]); } catch { /* a row the test cannot read does not match */ }
    }
    const result = {
      source: 'filter',
      query: expr,
      conditions: null,
      rows,
      matchedPaths: null,
      total: rows.length,
      columns: collectKeys(main.rows),
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

  /** Clear active query - views revert to full dataset */
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
     Central routing logic - all functions use these to decide
     SQL (DuckDB) vs JS (in-memory) execution path.
     ============================ */

  /** Check if a dataset has been registered with DuckDB */
  function _isDuckRegistered(ds) {
    return ds && ds._duckColumns && ds._duckColumns.length > 0;
  }

  /* ================================================================
     ENGINE ROUTING - Centralized DuckDB vs JS decision
     ================================================================
     _canUseDuck(ds)  → true if DuckDB is ready AND dataset is registered
     _duckOrNull(ds)  → returns dataset if DuckDB usable, else null (for early-return patterns)
     _duckAvailable() → true if DuckDB engine is alive (doesn't check dataset)
     ================================================================ */

  /** Can we run SQL on this dataset? (DuckDB ready + not failed + dataset registered) */
  /** The DuckDB table a dataset was registered under, safe to put inside a quoted SQL name */
  function _tableOf(ds) {
    return ds.duckTable.replace(/[^a-z0-9_]/gi, '_');
  }

  function _canUseDuck(ds) {
    return _duckReady && !_duckFailed && !!Structra.duckdbAdapter && _isDuckRegistered(ds);
  }

  /** Is DuckDB engine available at all? (ignores dataset registration) */
  function _duckAvailable() {
    return _duckReady && !_duckFailed && !!Structra.duckdbAdapter;
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
    const tableName = _tableOf(ds);
    const cols = await Structra.duckdbAdapter.getTableColumns(tableName);
    ds._duckColumns = cols;
    return cols;
  }

  /**
   * Extract values at a JSON path from the DuckDB table.
   * Uses json_extract_string for nested access.
   * @param {string} path - dot-separated path (e.g. 'address.city' or 'items[0].name')
   * @returns {Promise<Array<Object>>}
   */
  async function jsonExtract(path) {
    const ds = getActive();
    if (!ds || !_canUseDuck(ds)) return [];
    const tableName = _tableOf(ds);

    // Convert dot path to DuckDB json_extract path: address.city → $.address.city
    const jsonPath = path.startsWith('$') ? path : '$.' + path;

    try {
      // First try struct access (DuckDB auto-creates STRUCT columns from nested JSON)
      // If the path is a direct column or nested struct, struct access is faster
      const cols = _getDuckColumnNames(ds);
      const topKey = path.split('.')[0].split('[')[0];

      if (cols.includes(topKey)) {
        // Column exists - use struct access for nested or direct select
        const sqlPath = path.replace(/\[(\d+)\]/g, '[$1+1]'); // DuckDB uses 1-based list indexing
        const sql = `SELECT "${sqlPath}" AS value FROM "${tableName}" WHERE "${sqlPath}" IS NOT NULL`;
        try {
          return await Structra.duckdbAdapter.query(sql);
        } catch {
          // Struct access failed - fall through to json_extract
        }
      }

      // Fallback: json_extract on each column
      const sql = `SELECT json_extract_string(CAST(ROW(*) AS JSON), '${jsonPath}') AS value FROM "${tableName}"`;
      return await Structra.duckdbAdapter.query(sql);
    } catch (err) {
      Structra.log.warn('Engine', `jsonExtract("${path}") failed: ${err.message}`);
      return [];
    }
  }

  /**
   * Unnest/flatten an array column or nested array via DuckDB.
   * @param {string} column - column name containing LIST/array values
   * @returns {Promise<Array<Object>>}
   */
  async function unnest(column) {
    const ds = getActive();
    if (!ds || !_canUseDuck(ds)) return [];
    const tableName = _tableOf(ds);
    try {
      return await Structra.duckdbAdapter.query(`SELECT UNNEST("${column}") AS item FROM "${tableName}"`);
    } catch (err) {
      Structra.log.warn('Engine', `unnest("${column}") failed: ${err.message}`);
      return [];
    }
  }

  /* ============================
     ANALYSIS - Unified traversal & analytics
     Consolidates all analysis functions so components never
     duplicate walks, coverage, profiling, or quality scoring.
     ============================ */

  /**
   * Iterative depth-first walk (stack-based, no recursion overflow).
   * @param {*} obj - root value
   * @param {function} visitor - (value, path, depth) → return false to skip children
   * @param {object} opts - { maxDepth: 20 }
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
   * Full stats analysis - counts all node types, depth, arrays detail.
   * Used by stats view, insight strip, drawer stats.
   * @param {*} data - raw JSON data (or pass null to use active dataset)
   * @returns {{ keys, depth, arrays, objects, strings, numbers, booleans, nulls, totalNodes, arraysDetail }}
   */
  function analyze(data) {
    return _analyze(data);
  }

  /** Yield to the browser so the UI stays responsive during long loops */
  const _tick = () => Structra.sharedHelpers.yieldToBrowser();
  const _SLICE_MS = 12;

  /**
   * Whole-document statistics in one iterative pass (any depth). Path strings are only built
   * for arrays. Yields to the browser about every 12 ms so the page never freezes.
   */
  async function _analyze(data) {
    if (data === undefined || data === null) {
      const ds = getActive();
      data = ds ? ds.raw : null;
    }
    if (!data) return null;

    const s = { keys: 0, depth: 0, arrays: 0, objects: 0, strings: 0, numbers: 0, booleans: 0, nulls: 0, totalNodes: 0, longestArray: 0, arraysDetail: [] };

    const pathOf = (frame) => {
      const parts = [];
      for (let f = frame; f && f.parent; f = f.parent) parts.push(f.key);
      let out = '';
      for (let i = parts.length - 1; i >= 0; i--) {
        const k = parts[i];
        out += typeof k === 'number' ? `[${k}]` : (out ? '.' + k : k);
      }
      return out || '(root)';
    };

    const stack = [{ val: data, parent: null, key: null, depth: 0 }];
    let lastYield = performance.now();
    let frames = 0;

    while (stack.length) {
      const f = stack.pop();
      const val = f.val;
      const d = f.depth;
      s.totalNodes++;
      if (d > s.depth) s.depth = d;

      // A document that is just one value (true, 42, "text", null) is that value, not an object
      if (val === null || typeof val !== 'object') {
        const t = typeof val;
        if (t === 'string') s.strings++; else if (t === 'number') s.numbers++; else if (t === 'boolean') s.booleans++; else if (val === null) s.nulls++;
        continue;
      }

      if (Array.isArray(val)) {
        s.arrays++;
        const n = val.length;
        if (n > s.longestArray) s.longestArray = n;
        s.arraysDetail.push({
          path: pathOf(f),
          count: n,
          sample: n > 0 ? (typeof val[0] === 'object' && val[0] !== null ? 'object' : typeof val[0]) : 'empty',
        });
        for (let i = n - 1; i >= 0; i--) {
          const c = val[i];
          if (c !== null && typeof c === 'object') {
            stack.push({ val: c, parent: f, key: i, depth: d + 1 });
          } else {
            s.totalNodes++;
            if (d + 1 > s.depth) s.depth = d + 1;
            const t = typeof c;
            if (t === 'string') s.strings++; else if (t === 'number') s.numbers++; else if (t === 'boolean') s.booleans++; else if (c === null) s.nulls++;
          }
        }
      } else {
        s.objects++;
        const keys = Object.keys(val);
        s.keys += keys.length;
        for (let i = keys.length - 1; i >= 0; i--) {
          const c = val[keys[i]];
          if (c !== null && typeof c === 'object') {
            stack.push({ val: c, parent: f, key: keys[i], depth: d + 1 });
          } else {
            s.totalNodes++;
            if (d + 1 > s.depth) s.depth = d + 1;
            const t = typeof c;
            if (t === 'string') s.strings++; else if (t === 'number') s.numbers++; else if (t === 'boolean') s.booleans++; else if (c === null) s.nulls++;
          }
        }
      }

      if ((++frames & 2047) === 0 && performance.now() - lastYield > _SLICE_MS) {
        await _tick();
        lastYield = performance.now();
      }
    }
    return s;
  }

  /**
   * Find the first array of plain objects in a data structure.
   * Used by stats, table, drawer-stats, insight strip.
   * @param {*} data - root JSON value (or null → active dataset)
   * @param {string} path - base path
   * @returns {{ rows: Array, path: string } | null}
   */
  function findFirstObjectArray(data, path) {
    if (data === undefined || data === null) {
      const ds = getActive();
      data = ds ? ds.raw : null;
    }
    return _firstObjectArray(data, path || '$');
  }

  // Recursive part. A null child is just a null value, never "the whole document".
  function _firstObjectArray(data, path) {
    if (!data || typeof data !== 'object') return null;
    if (Array.isArray(data)) {
      const first = data[0];
      return data.length > 0 && first !== null && typeof first === 'object' && !Array.isArray(first)
        ? { rows: data, path }
        : null;
    }
    for (const k of Object.keys(data)) {
      const result = _firstObjectArray(data[k], `${path}.${k}`);
      if (result) return result;
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
    return _allArrays(obj, path || '$', _seen || new Set());
  }

  // Recursive part. A null child is just a null value, never "the whole document".
  function _allArrays(obj, path, seen) {
    if (!obj || typeof obj !== 'object') return [];
    if (obj && typeof obj === 'object') {
      if (seen.has(obj)) return [];
      seen.add(obj);
    }
    const result = [];
    if (Array.isArray(obj)) {
      result.push({ path, count: obj.length, data: obj });
      for (let i = 0; i < obj.length; i++) {
        const item = obj[i];
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          for (const [k, v] of Object.entries(item)) {
            if (v && typeof v === 'object') {
              const cp = `${path}[*].${k}`;
              if (!result.some(r => r.path === cp)) {
                const sub = _allArrays(v, cp, seen);
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
        const sub = _allArrays(v, path === '$' ? k : `${path}.${k}`, seen);
        for (const s of sub) result.push(s);
      }
    }
    return result;
  }

  /**
   * Collect unique column names from an array of objects.
   * Used by table view and filter bar.
   * @param {Array} rows - array of objects (or null → active dataset rows)
   * @param {number} sampleLimit - max rows to scan (default 1000)
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
   * @param {Array} arr - array of objects
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
   * @param {Array} arr - parent array of objects
   * @param {string} parentKey - key whose value is an object
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
   * @param {Array} data - parent array
   * @param {string} key - key name
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
   * Profile every field of an array of objects in ONE pass over the rows.
   * Returns per-field coverage, null %, types, min/max/avg, unique count, top values and a
   * value distribution, plus key coverage (for the coverage table) and the number of gaps
   * (missing keys). Yields to the browser about every 12 ms.
   *
   * Distinct values are tracked up to PROFILE_CAP per column to keep memory bounded.
   * @param {Array} arr - array of objects (or null → active dataset)
   * @returns {Promise<{ fields, rowCount, fieldCount, quality, coverage, gaps } | null>}
   */
  const PROFILE_CAP = 20000;
  const OBJECT_UNIQUE_SAMPLE = 2000;
  const DIST_BINS = 8;

  function profileFields(arr) {
    if (!arr) {
      const ds = getActive();
      arr = ds ? (Array.isArray(ds.raw) ? ds.raw : null) : null;
      if (!arr) {
        const fa = findFirstObjectArray();
        arr = fa ? fa.rows : null;
      }
    }
    if (!Array.isArray(arr) || arr.length === 0 || typeof arr[0] !== 'object') return Promise.resolve(null);
    return _profileRows(arr);
  }

  function _histogram(nums) {
    let min = nums[0], max = nums[0];
    for (let i = 1; i < nums.length; i++) { const n = nums[i]; if (n < min) min = n; if (n > max) max = n; }
    const bins = Math.min(DIST_BINS, Math.max(3, Math.ceil(Math.sqrt(nums.length))));
    const width = (max - min) / bins || 1;
    const counts = new Array(bins).fill(0);
    for (let i = 0; i < nums.length; i++) counts[Math.min(bins - 1, Math.floor((nums[i] - min) / width))]++;
    return counts.map((count, i) => ({ label: (min + i * width).toFixed(1), count }));
  }

  async function _profileRows(rows) {
    const total = rows.length;
    const cols = new Map();
    let lastYield = performance.now();

    // Rows of one array nearly always list their keys in the same order, so remember which
    // accumulator belongs to each key position and skip the Map lookup in the common case.
    const posKeys = [];
    const posAcc = [];

    for (let i = 0; i < total; i++) {
      const row = rows[i];
      if (!row || typeof row !== 'object') continue;

      let pos = 0;
      for (const key in row) {
        let c;
        if (posKeys[pos] === key) {
          c = posAcc[pos];
        } else {
          c = cols.get(key);
          if (!c) {
            c = { key, present: 0, empty: 0, nonNull: 0, nStr: 0, nNum: 0, nBool: 0, nNull: 0, nObj: 0, nArr: 0,
                  min: 0, max: 0, sum: 0, freq: new Map(), uniq: new Set(), objSeen: 0, capped: false, numericLike: true, nums: [] };
            cols.set(key, c);
          }
          posKeys[pos] = key;
          posAcc[pos] = c;
        }
        pos++;

        const v = row[key];
        c.present++;
        if (v === null) { c.nNull++; c.empty++; continue; }

        const t = typeof v;
        if (t === 'string') {
          c.nStr++;
          if (v === '') { c.empty++; c.numericLike = false; c.nums = null; continue; }
          c.nonNull++;
          if (!c.capped) {
            const n = c.freq.get(v);
            if (n !== undefined) c.freq.set(v, n + 1);
            else if (c.freq.size < PROFILE_CAP) c.freq.set(v, 1);
            else c.capped = true;      // too many distinct values: stop counting them, the figures become "at least"
          }
          if (c.numericLike) {
            const num = +v;
            if (num !== num || v.trim() === '') { c.numericLike = false; c.nums = null; } else c.nums.push(num);
          }
        } else if (t === 'number') {
          if (c.nNum === 0) { c.min = v; c.max = v; } else { if (v < c.min) c.min = v; if (v > c.max) c.max = v; }
          c.nNum++;
          c.nonNull++;
          c.sum += v;
          if (!c.capped) {
            if (c.uniq.size < PROFILE_CAP) c.uniq.add(v); else if (!c.uniq.has(v)) c.capped = true;
          }
          if (c.numericLike) c.nums.push(v);
        } else if (t === 'boolean') {
          c.nBool++;
          c.nonNull++;
          const k = v ? 'true' : 'false';
          c.freq.set(k, (c.freq.get(k) || 0) + 1);
          c.numericLike = false; c.nums = null;
        } else {
          if (Array.isArray(v)) c.nArr++; else c.nObj++;
          c.nonNull++;
          c.numericLike = false; c.nums = null;
          if (c.objSeen < OBJECT_UNIQUE_SAMPLE) { c.uniq.add(JSON.stringify(v)); c.objSeen++; }
        }
      }

      if ((i & 1023) === 1023 && performance.now() - lastYield > _SLICE_MS) {
        await _tick();
        lastYield = performance.now();
      }
    }

    const fields = [];
    const coverage = [];
    let gaps = 0;
    for (const c of cols.values()) {
      const types = {};
      if (c.nStr) types.string = c.nStr;
      if (c.nNum) types.number = c.nNum;
      if (c.nBool) types.boolean = c.nBool;
      if (c.nNull) types.null = c.nNull;
      if (c.nObj) types.object = c.nObj;
      if (c.nArr) types.array = c.nArr;
      const primaryType = Object.entries(types).sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';
      const unique = c.freq.size + c.uniq.size;
      const field = {
        key: c.key,
        count: c.present,
        total,
        coverage: ((c.present / total) * 100).toFixed(0),
        nullPct: (((c.present - c.nonNull) / total) * 100).toFixed(0),
        types,
        primaryType,
        unique,
        uniqueCapped: c.capped,
        uniquePct: ((unique / Math.max(c.nonNull, 1)) * 100).toFixed(0),
      };
      if (c.nNum > 0) { field.min = c.min; field.max = c.max; field.avg = (c.sum / c.nNum).toFixed(2); }
      if ((primaryType === 'string' || primaryType === 'boolean') && c.freq.size) {
        field.topValues = [...c.freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([val, cnt]) => ({ val, cnt }));
      }
      // Value distribution for the stats view
      if (c.numericLike && c.nums && c.nums.length) {
        field.histogram = _histogram(c.nums);
      } else if (c.freq.size && c.nonNull) {
        field.distTop = [...c.freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([value, count]) => ({ value, count }));
        field.distUnique = c.freq.size;
      }
      fields.push(field);

      coverage.push({
        key: c.key,
        present: c.present,
        missing: total - c.present,
        empty: c.empty,
        pct: Math.round((c.present / total) * 100),
        types: new Set(Object.keys(types).filter((t) => t !== 'null')),
      });
      gaps += total - c.present;
    }

    return { fields, rowCount: total, fieldCount: cols.size, quality: computeQuality(fields), coverage, gaps };
  }

  /**
   * Compute data quality score from profiled fields.
   * Weights: completeness 40% + consistency 35% + uniqueness 25%.
   * @param {Array} fields - from profileFields().fields
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

    // Only a column that is meant to differ in every record (an id, a key, an email) is judged on being unique: a Status has three values by design
    const idLike = (k) => /(^|[^a-z])(id|guid|uuid|key|code|ref|reference|number|email|sku)$|id$/i.test(String(k).split('.').pop());
    const uniqFields = fields.filter(f => (f.primaryType === 'string' || f.primaryType === 'number') && idLike(f.key));
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
      if (idLike(f.key) && (f.primaryType === 'string' || f.primaryType === 'number') && parseFloat(f.uniquePct) < 90 && parseFloat(f.coverage) > 50) {
        issues.push({ field: f.key, msg: `repeats: only ${f.uniquePct}% of its values are different, but it looks like an identifier`, severity: 'med' });
      }
    }
    issues.sort((a, b) => (a.severity === 'high' ? 0 : 1) - (b.severity === 'high' ? 0 : 1));

    return { overall, completeness: Math.round(completeness), consistency: Math.round(consistency), uniqueness: Math.round(uniqueness), issues: issues.slice(0, 5) };
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
    const tableName = _tableOf(ds);
    try {
      return await Structra.duckdbAdapter.query(
        `SELECT UNNEST(approx_top_k("${column}", ${k})) AS val FROM "${tableName}"`
      );
    } catch {
      // Fallback: regular GROUP BY
      try {
        return await Structra.duckdbAdapter.query(
          `SELECT "${column}" AS val, COUNT(*) AS cnt FROM "${tableName}" WHERE "${column}" IS NOT NULL GROUP BY "${column}" ORDER BY cnt DESC LIMIT ${k}`
        );
      } catch { return []; }
    }
  }

  /**
   * Everything the stats views need, computed once per dataset and shared.
   * Cached on the dataset (a new ingest or an edit drops it).
   * @returns {Promise<{ stats, firstArr, profile, gaps } | null>}
   */
  function getAnalysis() {
    const ds = getActive();
    if (!ds) return Promise.resolve(null);
    if (!ds._analysis) {
      ds._analysis = (async () => {
        const t0 = performance.now();
        await _tick();                          // let the page paint first
        const stats = await _analyze(ds.raw);
        const firstArr = findFirstObjectArray(ds.raw);
        const profile = firstArr ? await _profileRows(firstArr.rows) : null;
        Structra.log.perf('Engine', 'analysis', performance.now() - t0);
        return { stats, firstArr, profile, gaps: profile ? profile.gaps : 0 };
      })();
    }
    return ds._analysis;
  }

  /* ============================ */
  /*   SQL ENGINE (on demand)     */
  /* ============================ */

  let _duckStarting = null;

  /**
   * Start DuckDB the first time SQL is needed and load the open document into it.
   * DuckDB is large, so it never starts at boot. Everything that can be done without SQL
   * (find, filter, stats, pivot) works without it.
   * @returns {Promise<boolean>} true when SQL can be used on the active dataset
   */
  async function enableSql() {
    if (_duckFailed || !Structra.duckdbAdapter) return false;
    if (!_duckReady) {
      Structra.events.emit('engine:duckdb-starting');
      if (!_duckStarting) _duckStarting = Structra.duckdbAdapter.init();
      // Say what the wait is: the SQL engine is downloaded and started once, then stays ready
      Structra.events.emit('loading:show', 'Preparing the SQL engine (first use only)…');
      try { await _duckStarting; } finally { Structra.events.emit('loading:hide'); }
      if (!_duckReady) return false;
    }
    const ds = getActive();
    if (!ds) return false;
    if (!_isDuckRegistered(ds)) {
      Structra.events.emit('loading:show', 'Loading data into the SQL engine…');
      try {
        await _ensureRegistered(ds);
        if (_isDuckRegistered(ds)) Structra.events.emit('engine:duckdb-registered', { tabId: ds.id });
      } finally {
        Structra.events.emit('loading:hide');
      }
    }
    return _canUseDuck(ds);
  }

  /**
   * Make sure the dataset has its table in DuckDB. A registration that did not produce a table
   * (it failed, or the table was dropped) is tried again instead of being remembered as done.
   */
  async function _ensureRegistered(ds) {
    if (_isDuckRegistered(ds)) return true;
    if (!ds._duckPromise) ds._duckPromise = Structra.duckdbAdapter.registerDataset(ds);
    await ds._duckPromise;
    ds._duckPromise = null;
    return _isDuckRegistered(ds);
  }

  /** The table a query used is gone: forget that this dataset was registered so the next SQL call loads it again */
  function _forgetMissingTable(ds, err) {
    if (ds && err && /does not exist/i.test(err.message || '')) {
      ds._duckColumns = null;
      ds._duckPromise = null;
    }
  }

  /* ============================ */
  /*   PHASE D: DISTRIBUTION      */
  /*   (SQL-only - no JS fallback) */
  /* ============================ */

  /**
   * Analyze statistical distribution of a single column via DuckDB.
   * Returns median, mode, stddev, skewness, kurtosis, entropy, histogram, percentiles.
   * @param {string} column
   * @returns {Promise<Object|null>}
   */
  async function analyzeDistribution(column) {
    const ds = getActive();
    if (!ds || !(await enableSql())) return null;
    const tableName = _tableOf(ds);
    try {
      const result = await Structra.duckdbAdapter.query(`
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
    if (!ds || !(await enableSql())) return null;
    const tableName = _tableOf(ds);
    try {
      const result = await Structra.duckdbAdapter.query(`SELECT corr("${col1}", "${col2}") AS r FROM "${tableName}"`);
      return result[0]?.r ?? null;
    } catch { return null; }
  }

  /* ============================ */
  /*   PHASE E: ENHANCED SEARCH   */
  /*   (SQL-only - no JS fallback) */
  /* ============================ */

  /**
   * Fuzzy search across all VARCHAR columns using jaro_winkler_similarity.
   * @param {string} text - search text
   * @param {number} threshold - minimum similarity (0-1), default 0.8
   * @returns {Promise<Array>}
   */
  async function fuzzySearch(text, threshold = 0.8) {
    const ds = getActive();
    if (!ds) return { total: 0, matchedPaths: [] };
    const want = String(text).toLowerCase();
    const near = new Set();
    // Every text value is compared; one that contains the search text, or is spelled close to it, matches
    const seen = new Map();
    const matches = (v) => {
      const str = String(v).toLowerCase();
      if (seen.has(str)) return seen.get(str);
      let hit = str.includes(want);
      if (!hit && str.length <= 200 && Math.abs(str.length - want.length) <= Math.max(3, want.length)) hit = _jaroWinkler(str, want) >= threshold;
      if (!hit && str.length > want.length && str.length <= 200) {
        // a short search against a longer value: compare with each word
        hit = str.split(/[\s,;:@./_-]+/).some((w) => w.length > 1 && Math.abs(w.length - want.length) <= 3 && _jaroWinkler(w, want) >= threshold);
      }
      seen.set(str, hit);
      return hit;
    };
    const stack = [{ val: ds.raw, path: '$' }];
    const matched = [];
    while (stack.length) {
      const { val, path } = stack.pop();
      if (!val || typeof val !== 'object') continue;
      const entries = Array.isArray(val) ? val.map((v, i) => [i, v]) : Object.entries(val);
      for (const [k, v] of entries) {
        const child = Array.isArray(val) ? `${path}[${k}]` : `${path}.${k}`;
        if (v !== null && typeof v === 'object') stack.push({ val: v, path: child });
        else if (v !== null && v !== undefined && typeof v !== 'boolean' && matches(v)) matched.push(child);
      }
    }
    near.clear();
    return _setFindResult(ds, text, matched);
  }

  /** Jaro-Winkler similarity, 0 to 1: how alike two spellings are */
  function _jaroWinkler(a, b) {
    if (a === b) return 1;
    const la = a.length, lb = b.length;
    if (!la || !lb) return 0;
    const range = Math.max(0, Math.floor(Math.max(la, lb) / 2) - 1);
    const ma = new Array(la).fill(false), mb = new Array(lb).fill(false);
    let m = 0;
    for (let i = 0; i < la; i++) {
      for (let j = Math.max(0, i - range); j < Math.min(lb, i + range + 1); j++) {
        if (!mb[j] && a[i] === b[j]) { ma[i] = mb[j] = true; m++; break; }
      }
    }
    if (!m) return 0;
    let t = 0, k = 0;
    for (let i = 0; i < la; i++) if (ma[i]) { while (!mb[k]) k++; if (a[i] !== b[k]) t++; k++; }
    const jaro = (m / la + m / lb + (m - t / 2) / m) / 3;
    let prefix = 0;
    while (prefix < Math.min(4, la, lb) && a[prefix] === b[prefix]) prefix++;
    return jaro + prefix * 0.1 * (1 - jaro);
  }

  /**
   * Pattern (regular expression) search over the values of the open document.
   * @param {string} pattern - regex pattern, case-insensitive
   */
  async function regexSearch(pattern) {
    const ds = getActive();
    if (!ds) return { total: 0, matchedPaths: [] };
    if (Structra.sharedHelpers.isRiskyRegex(pattern)) throw new Error(Structra.sharedHelpers.RISKY_REGEX_MESSAGE);
    const re = new RegExp(pattern, 'i');       // an invalid pattern throws; the Find bar says so
    return _findInMemory(ds, pattern, re);
  }

  /** Store matched paths as the active find result */
  function _setFindResult(ds, text, matchedPaths) {
    const rows = _matchedPathsToRows(ds, matchedPaths);
    const result = { source: 'find', query: text, conditions: null, rows, matchedPaths, total: matchedPaths.length, columns: rows.length > 0 ? Object.keys(rows[0]) : [] };
    _setActiveQuery(result);
    return result;
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
    if (!ds) return null;
    if (format !== 'csv') return JSON.stringify(ds.raw, null, 2);

    // CSV is the main list as rows (the filtered rows when a filter is on), whatever shape the document has.
    // Choice, Person and other one-level objects become Parent.Child columns; lists stay as JSON text.
    const q = getQuery();
    const main = mainList(ds);
    let rows = q && q.source === 'filter' && Array.isArray(q.rows) ? q.rows : main ? main.rows : null;
    if (!rows) rows = Array.isArray(ds.raw) ? ds.raw : [ds.raw];
    const isPlain = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
    const flat = rows.map((row) => {
      if (!isPlain(row)) return { value: row };
      const out = {};
      for (const [k, v] of Object.entries(row)) {
        if (isPlain(v)) { for (const [c, cv] of Object.entries(v)) out[k + '.' + c] = cv; }
        else out[k] = v;
      }
      return out;
    });
    const cols = [];
    const seen = new Set();
    for (const r of flat) for (const k of Object.keys(r)) if (!seen.has(k)) { seen.add(k); cols.push(k); }
    if (!cols.length) return '';
    return Structra.formatConversion.generateCsv(flat, cols);
  }

  /**
   * Random sample of N rows via DuckDB SAMPLE.
   * @param {number} n - number of rows
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
    const tableName = _tableOf(ds);
    try {
      return await Structra.duckdbAdapter.query(`SELECT * FROM "${tableName}" USING SAMPLE ${n} ROWS`);
    } catch (err) {
      Structra.log.warn('Engine', `sampleData failed`, err.message);
      return [];
    }
  }

  /**
   * Pivot data via DuckDB PIVOT.
   * @param {string} onCol - column to pivot on
   * @param {string} valueCol - column with values
   * @param {string} aggFn - aggregate function (count, sum, avg, etc.)
   * @returns {Promise<Array>}
   */
  async function pivotData(onCol, valueCol, aggFn = 'count') {
    const ds = getActive();
    if (!ds || !(await enableSql())) return [];
    const tableName = _tableOf(ds);
    try {
      return await Structra.duckdbAdapter.query(
        `PIVOT "${tableName}" ON "${onCol}" USING ${aggFn}("${valueCol}")`
      );
    } catch (err) {
      Structra.log.warn('Engine', `pivotData failed`, err.message);
      return [];
    }
  }

  /**
   * Run raw SQL against DuckDB and return the rows.
   * Unlike runSql, this does not touch the active query used by the views.
   * @param {string} query
   * @returns {Promise<Array<Object>>} rows, or [] when DuckDB is not ready
   */
  async function sql(query) {
    if (!_duckAvailable()) return [];
    return Structra.duckdbAdapter.query(query);
  }

  /**
   * DuckDB SUMMARIZE for the active dataset (min, max, approx unique, nulls per column).
   * @returns {Promise<Array<Object>>}
   */
  async function summarizeTable() {
    const ds = getActive();
    if (!ds || !_canUseDuck(ds)) return [];
    const tableName = _tableOf(ds);
    try {
      return await Structra.duckdbAdapter.query(`SUMMARIZE "${tableName}"`);
    } catch (err) {
      Structra.log.warn('Engine', 'summarizeTable failed', err.message);
      return [];
    }
  }

  /**
   * Column schema of the active dataset as seen by DuckDB.
   * @returns {Promise<Array<{name, type, nested}>>}
   */
  async function getSchemaDb() {
    return describeTable();
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
    // Query pipeline (DuckDB-first)
    findInDb,
    replaceInData,
    filterDb,
    filterByPath,
    filterByExpression,
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
    getAnalysis,
    enableSql,
    findFirstObjectArray,
    mainList,
    mainColumns,
    fieldValue,
    findAllArrays,
    collectKeys,
    analyzeKeys,
    analyzeNestedKeys,
    collectArrayItems,
    profileFields,
    computeQuality,
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
