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
      for (const [key, value] of Object.entries(row)) {
        let column = columns.get(key);
        if (!column) { column = { name: key, types: new Set(), count: 0, nulls: 0 }; columns.set(key, column); }
        column.count++;
        if (value === null || value === undefined) {
          column.nulls++;
        } else {
          column.types.add(Array.isArray(value) ? 'array' : typeof value);
        }
      }
    }

    // Convert sets to arrays for serialization
    return [...columns.values()].map(value => ({
      name: value.name,
      types: [...value.types],
      coverage: value.count / sample.length,
      nullRate: value.nulls / value.count,
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
    const startTime = performance.now();
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

    const duration = performance.now() - startTime;
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
        .catch(error => Structra.log.error('Engine', 'Persistence failed', error));
    }

    // Emit immediately so views render without waiting for DuckDB
    Structra.events.emit('engine:ingested', { tabId, meta: dataset.meta, duration });

    // SQL is optional and starts on demand (see enableSql). If it is already running, load this
    // dataset into it in the background so SQL stays in step with the open document.
    if (_duckAvailable()) {
      dataset._duckPromise = Structra.duckdbAdapter.registerDataset(dataset)
        .then(() => Structra.events.emit('engine:duckdb-registered', { tabId }))
        .catch(error => Structra.log.error('Engine', 'DuckDB register failed', error));
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
    const dataset = getActive();
    if (!dataset) return { rows: [], total: 0 };
    const array = dataset.indexes.sorted ? dataset.indexes.sorted.refs : dataset.raw;
    if (!Array.isArray(array)) return { rows: [], total: 0 };
    return { rows: array.slice(offset, offset + limit), total: array.length };
  }

  /* --- Sort --- */
  function sort(key, direction = 'asc') {
    const dataset = getActive();
    if (!dataset || !Array.isArray(dataset.raw)) return;

    const cacheKey = `sort:${key}:${direction}`;
    const cached = cacheGet(dataset, cacheKey);
    if (cached) { dataset.indexes.sorted = cached; return; }

    const refs = [...dataset.raw].sort((first, second) => {
      const firstValue = first && first[key];
      const secondValue = second && second[key];
      if (firstValue == null && secondValue == null) return 0;
      if (firstValue == null) return 1;
      if (secondValue == null) return -1;
      const compare = Structra.sharedHelpers.compareValues(firstValue, secondValue);
      return direction === 'asc' ? compare : -compare;
    });

    const sortObject = { key, dir: direction, refs };
    dataset.indexes.sorted = sortObject;
    cacheSet(dataset, cacheKey, sortObject);
  }

  /* --- Search --- */
  function search(pattern, options = {}) {
    const dataset = getActive();
    if (!dataset) return { matchedPaths: [], total: 0 };
    const { mode = 'values' } = options; // 'values' | 'keys' | 'paths'
    const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern, 'i');
    const matched = [];

    // Stack-based traversal
    const stack = [{ val: dataset.raw, path: '$', depth: 0 }];
    const maxDepth = Structra.appSettings.get('maxDepth');

    while (stack.length > 0) {
      const { val: value, path, depth } = stack.pop();
      if (depth > maxDepth) continue;

      if (value && typeof value === 'object') {
        const entries = Array.isArray(value)
          ? value.map((item, i) => [i, item])
          : Object.entries(value);
        for (const [key, item] of entries) {
          const childPath = Structra.dataPaths.child(path, Array.isArray(value) ? Number(key) : key);
          // Check match based on mode
          if (mode === 'keys' && regex.test(String(key))) {
            matched.push(childPath);
          } else if (mode === 'values' && item !== null && typeof item !== 'object' && regex.test(String(item))) {
            matched.push(childPath);
          } else if (mode === 'paths' && regex.test(childPath)) {
            matched.push(childPath);
          }
          if (item && typeof item === 'object') {
            stack.push({ val: item, path: childPath, depth: depth + 1 });
          }
        }
      }
    }

    return { matchedPaths: matched, total: matched.length };
  }

  /* --- Filter --- */
  function filter(predicate) {
    const dataset = getActive();
    if (!dataset || !Array.isArray(dataset.raw)) return [];
    return dataset.raw.filter(predicate);
  }

  /* --- Aggregate --- */
  function aggregate(key, callback) {
    const dataset = getActive();
    if (!dataset || !Array.isArray(dataset.raw)) return null;

    const values = dataset.raw
      .map(row => row && row[key])
      .filter(item => item !== null && item !== undefined);

    switch (callback) {
      case 'count': return values.length;
      case 'sum': return values.reduce((total, item) => total + (Number(item) || 0), 0);
      case 'avg': {
        const numbers = values.filter(value => typeof value === 'number');
        return numbers.length ? numbers.reduce((total, item) => total + item, 0) / numbers.length : null;
      }
      case 'min': {
        const numbers = values.filter(value => typeof value === 'number');
        if (!numbers.length) return null;
        let minimum = numbers[0]; for (let i = 1; i < numbers.length; i++) { if (numbers[i] < minimum) minimum = numbers[i]; }
        return minimum;
      }
      case 'max': {
        const numbers = values.filter(value => typeof value === 'number');
        if (!numbers.length) return null;
        let maximum = numbers[0]; for (let i = 1; i < numbers.length; i++) { if (numbers[i] > maximum) maximum = numbers[i]; }
        return maximum;
      }
      case 'distinct': return [...new Set(values)];
      case 'countDistinct': return new Set(values).size;
      default: return null;
    }
  }

  /* --- Schema Inference --- */
  function getSchema() {
    const dataset = getActive();
    if (!dataset) return null;

    const cacheKey = 'schema';
    const cached = cacheGet(dataset, cacheKey);
    if (cached) return cached;

    const schema = inferSchema(dataset.raw, '$', 0);
    cacheSet(dataset, cacheKey, schema);
    return schema;
  }

  function inferSchema(value, path, depth) {
    if (depth > 5) return { type: 'unknown', path };
    if (value === null) return { type: 'null', path };
    if (Array.isArray(value)) {
      const items = value.length > 0 ? inferSchema(value[0], path + '[0]', depth + 1) : { type: 'unknown' };
      return { type: 'array', path, length: value.length, items };
    }
    if (typeof value === 'object') {
      const properties = {};
      for (const [key, item] of Object.entries(value)) {
        properties[key] = inferSchema(item, Structra.dataPaths.child(path, key), depth + 1);
      }
      return { type: 'object', path, properties };
    }
    return { type: typeof value, path };
  }

  /* --- Stats --- */
  function getStats() {
    const dataset = getActive();
    if (!dataset) return null;

    const cacheKey = 'stats';
    const cached = cacheGet(dataset, cacheKey);
    if (cached) return cached;

    const stats = {
      shape: dataset.meta.shape,
      rowCount: dataset.meta.rowCount,
      format: dataset.meta.format,
      size: dataset.meta.size,
      columns: dataset.indexes.columns,
      timestamp: dataset.meta.timestamp,
    };

    // Count nodes for objects
    if (dataset.meta.shape === 'object') {
      stats.keyCount = Object.keys(dataset.raw).length;
    }

    cacheSet(dataset, cacheKey, stats);
    return stats;
  }

  /* --- JSONPath Query (placeholder - needs jsonpath-plus) --- */
  function pathQuery(expression) {
    const dataset = getActive();
    if (!dataset) return { results: [], matchedPaths: [] };
    // Will integrate with jsonpath-plus via lib-loader
    Structra.log.warn('Engine', 'JSONPath not yet integrated');
    return { results: [], matchedPaths: [], expr: expression };
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
    Structra.events.on('engine:data-modified', () => { const dataset = getActive(); if (dataset) dataset._analysis = null; });
  }

  /* --- Session Persistence (debounced) --- */
  let _saveTimer = null;
  function scheduleSessionSave() {
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(() => {
      const state = {
        activeId: _activeId,
        tabs: [..._datasets.entries()].map(([id, value]) => ({
          id,
          meta: value.meta,
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
    const dataset = getActive();
    if (!dataset) return null;

    // key:name finds a field by its name, $.a.b finds by path; anything else searches the values
    const byKey = /^\s*key:\s*(.+?)\s*$/i.exec(text);
    if (byKey) {
      const found = search(new RegExp(byKey[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), { mode: 'keys' });
      return _setFindResult(dataset, text, found.matchedPaths);
    }
    if (/^\s*\$[.\[]/.test(text)) {
      let matches;
      try { matches = await Structra.jsonpathQuery.query(dataset.raw, text.trim()); } catch (error) { throw new Error('This path could not be read: ' + error.message); }
      return _setFindResult(dataset, text, matches.map((match) => match.path));
    }
    // Search the values themselves: every match carries its path, so the count is the number of matching
    // values and Next / Previous visit each one. (A row-based SQL search counted rows, and missed nested values.)
    return _findInMemory(dataset, text);
  }

  /** In-memory find (no DuckDB) */
  function _findInMemory(dataset, text, regex) {
    const literal = new RegExp(String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const searchResult = search(regex || literal, { mode: 'values' });
    const rows = _matchedPathsToRows(dataset, searchResult.matchedPaths);
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
    const dataset = getActive();
    if (!dataset) return { replaced: 0, skipped: 0 };
    const pattern = new RegExp(String(findText).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const probe = new RegExp(pattern.source, 'i');
    let count = 0;
    let skipped = 0;

    function visit(holder, key) {
      const found = holder[key];
      if (typeof found === 'string') {
        if (probe.test(found)) { holder[key] = found.replace(pattern, () => replaceText); count++; return !all; }
      } else if (typeof found === 'number' || typeof found === 'boolean') {
        if (probe.test(String(found))) skipped++;
      } else if (found && typeof found === 'object') {
        for (const key of Object.keys(found)) if (visit(found, key)) return true;
      }
      return false;
    }

    visit({ root: dataset.raw }, 'root');

    if (count > 0) {
      // Clear caches, re-register with DuckDB
      cacheClear(dataset);
      if (_duckAvailable()) {
        Structra.duckdbAdapter.registerDataset(dataset).catch(() => {});
      }
      Structra.log.info('Engine', `Replaced ${count} occurrence(s) of "${findText}" → "${replaceText}"`);
      Structra.events.emit('engine:data-modified', { tabId: dataset.id, action: 'replace', count });
    }
    return { replaced: count, skipped };
  }

  /**
   * "The data" for tools that work on rows (Filter, Pivot, Null finder): the document itself when it is a list of
   * records, otherwise its first list of records (value in a SharePoint response, body.value in an HTTP output).
   * @returns {{ path: string, rows: Array } | null}
   */
  function mainList(dataset) {
    dataset = dataset || getActive();
    if (!dataset) return null;
    if (dataset._main === undefined) {
      const isRecord = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
      if (Array.isArray(dataset.raw)) dataset._main = dataset.raw.length && isRecord(dataset.raw[0]) ? { path: '$', rows: dataset.raw } : null;
      else dataset._main = _firstObjectArray(dataset.raw, '$');
    }
    return dataset._main;
  }

  /** Read a field of a row; Status.Value reads the Value inside Status */
  function fieldValue(row, field) {
    if (row === null || row === undefined) return undefined;
    if (Object.prototype.hasOwnProperty.call(row, field)) return row[field];
    let current = row;
    for (const key of String(field).split('.')) {
      if (current === null || current === undefined || typeof current !== 'object') return undefined;
      current = current[key];
    }
    return current;
  }

  /**
   * The columns of the main list, as a person thinks of them: plain fields, and the plain parts of Choice,
   * Person and Lookup fields as Parent.Child (Status.Value, Requester.Email). Lists and system keys are left out.
   * @returns {string[]}
   */
  function mainColumns(dataset) {
    dataset = dataset || getActive();
    const main = mainList(dataset);
    if (!main) return [];
    if (!dataset._mainCols) {
      const sample = main.rows.slice(0, 100).filter((row) => row && typeof row === 'object' && !Array.isArray(row));
      const keys = [];
      sample.forEach((row) => Object.keys(row).forEach((key) => { if (!keys.includes(key)) keys.push(key); }));
      const columns = [];
      for (const key of keys) {
        if (key.startsWith('@')) continue;
        const values = sample.map((row) => row[key]).filter((value) => value !== null && value !== undefined);
        const objects = values.filter((value) => typeof value === 'object' && !Array.isArray(value));
        if (values.length && objects.length === values.length) {
          const children = [];
          objects.forEach((object) => Object.keys(object).forEach((childKey) => { if (!children.includes(childKey) && !childKey.startsWith('@') && (object[childKey] === null || typeof object[childKey] !== 'object')) children.push(childKey); }));
          children.slice(0, 8).forEach((childKey) => columns.push(`${key}.${childKey}`));
        } else if (!values.length || values.some((value) => typeof value !== 'object')) {
          columns.push(key);
        }
      }
      dataset._mainCols = columns;
    }
    return dataset._mainCols;
  }

  /**
   * Apply structured filter conditions via DuckDB.
   * @param {Array<Object>} conditions - [{field, op, value, logic}]
   *   op: 'eq'|'neq'|'gt'|'lt'|'gte'|'lte'|'contains'|'notcontains'|'startswith'|'endswith'|'isnull'|'notnull'
   *   logic: 'AND'|'OR' (how this condition joins with previous)
   * @returns {Promise<Object>} query result
   */
  async function filterDb(conditions) {
    const dataset = getActive();
    if (!dataset) return null;
    if (!conditions || conditions.length === 0) {
      clearQuery();
      return null;
    }

    // The SQL route is for a plain list at the root with plain column names. Anything else (a list inside an object,
    // Status.Value style columns) is filtered in memory, on the rows of the main list.
    const plain = Array.isArray(dataset.raw) && conditions.every((condition) => !String(condition.field).includes('.'));
    if (plain && _canUseDuck(dataset)) {
      const tableName = _tableOf(dataset);
      const columns = _getDuckColumnNames(dataset);
      const sqlWhere = _conditionsToSql(conditions, columns);
      if (!sqlWhere) return _filterInMemory(dataset, conditions);

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
          columns: columns,
        };
        _setActiveQuery(result);
        return result;
      } catch (error) {
        Structra.log.warn('Engine', 'DuckDB filter failed, falling back to in-memory', error.message);
        _forgetMissingTable(dataset, error);
      }
    }

    return _filterInMemory(dataset, conditions);
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
  async function runSql(sqlText, options = {}) {
    if (options.readOnly) {
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
    const startTime = performance.now();
    const dataset = getActive();
    try {
      // In SQL the open document is the table "data" (SELECT * FROM data), whichever tab it is in
      if (dataset && _isDuckRegistered(dataset)) {
        await Structra.duckdbAdapter.query(`CREATE OR REPLACE TEMP VIEW data AS SELECT * FROM "${_tableOf(dataset)}"`);
      } else if (/\bdata\b/i.test(sqlText)) {
        return { error: 'This document is not a list or object, so there is no table named data to query' };
      }
      let text = sqlText.trim().replace(/;+\s*$/, '');
      let capped = false;
      // Cap the rows read, so a query that returns a million rows cannot freeze the page.
      // DESCRIBE, SHOW and SUMMARIZE cannot sit inside another query and are small anyway.
      if (options.maxRows && SQL_SELECT_LIKE.test(text)) {
        text = `SELECT * FROM (\n${text}\n) AS q LIMIT ${options.maxRows + 1}`;
        capped = true;
      }
      let rows = await Structra.duckdbAdapter.query(text);
      const columnTypes = rows.columnTypes || [];
      let truncated = false;
      if (capped && rows.length > options.maxRows) { rows = rows.slice(0, options.maxRows); truncated = true; }
      const duration = performance.now() - startTime;
      const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
      const result = {
        source: 'sql',
        query: sqlText,
        conditions: null,
        rows,
        matchedPaths: null,
        total: rows.length,
        columns: columns,
        columnTypes,
        truncated,
        duration,
      };
      if (!options.quiet) _setActiveQuery(result);
      Structra.log.info('Engine', `SQL executed: ${rows.length} rows (${duration.toFixed(0)}ms)`);
      return result;
    } catch (error) {
      Structra.log.error('Engine', 'SQL execution failed', error.message);
      _forgetMissingTable(dataset, error);
      return { error: error.message };
    }
  }

  /** Build SQL WHERE clause from structured conditions */
  function _conditionsToSql(conditions, validColumns) {
    const colSet = new Set(validColumns);
    const parts = [];

    for (let i = 0; i < conditions.length; i++) {
      const condition = conditions[i];
      if (!colSet.has(condition.field)) continue;

      const field = `"${condition.field}"`;
      const value = String(condition.value || '').replace(/'/g, "''");
      let clause = '';

      switch (condition.op) {
        case 'eq':           clause = `${field} = '${value}'`; break;
        case 'neq':          clause = `${field} != '${value}'`; break;
        case 'gt':           clause = `${field} > '${value}'`; break;
        case 'lt':           clause = `${field} < '${value}'`; break;
        case 'gte':          clause = `${field} >= '${value}'`; break;
        case 'lte':          clause = `${field} <= '${value}'`; break;
        case 'contains':     clause = `CAST(${field} AS VARCHAR) ILIKE '%${value}%'`; break;
        case 'notcontains':  clause = `CAST(${field} AS VARCHAR) NOT ILIKE '%${value}%'`; break;
        case 'startswith':   clause = `CAST(${field} AS VARCHAR) ILIKE '${value}%'`; break;
        case 'endswith':     clause = `CAST(${field} AS VARCHAR) ILIKE '%${value}'`; break;
        case 'isnull':       clause = `${field} IS NULL`; break;
        case 'notnull':      clause = `${field} IS NOT NULL`; break;
        default:             clause = `CAST(${field} AS VARCHAR) ILIKE '%${value}%'`; break;
      }

      if (parts.length > 0) {
        parts.push((condition.logic || 'AND').toUpperCase());
      }
      parts.push(clause);
    }

    return parts.length > 0 ? parts.join(' ') : null;
  }

  /** In-memory structured filter (no DuckDB) */
  function _filterInMemory(dataset, conditions) {
    const main = mainList(dataset);
    if (!main) return null;

    const rows = main.rows.filter(row => {
      if (!row || typeof row !== 'object') return false;
      let pass = true;

      for (let i = 0; i < conditions.length; i++) {
        const condition = conditions[i];
        const value = fieldValue(row, condition.field);
        const target = condition.value;
        let match = false;

        switch (condition.op) {
          case 'eq':          match = String(value) === String(target); break;
          case 'neq':         match = String(value) !== String(target); break;
          case 'gt':          match = Number(value) > Number(target); break;
          case 'lt':          match = Number(value) < Number(target); break;
          case 'gte':         match = Number(value) >= Number(target); break;
          case 'lte':         match = Number(value) <= Number(target); break;
          case 'contains':    match = String(value || '').toLowerCase().includes(String(target).toLowerCase()); break;
          case 'notcontains': match = !String(value || '').toLowerCase().includes(String(target).toLowerCase()); break;
          case 'startswith':  match = String(value || '').toLowerCase().startsWith(String(target).toLowerCase()); break;
          case 'endswith':    match = String(value || '').toLowerCase().endsWith(String(target).toLowerCase()); break;
          case 'isnull':      match = value === null || value === undefined; break;
          case 'notnull':     match = value !== null && value !== undefined; break;
          default:            match = String(value || '').toLowerCase().includes(String(target).toLowerCase()); break;
        }

        if (i === 0) {
          pass = match;
        } else {
          pass = (condition.logic || 'AND') === 'OR' ? (pass || match) : (pass && match);
        }
      }
      return pass;
    });

    const columns = collectKeys(main.rows);
    const OPERATOR_SYMBOLS = { eq: '=', neq: '≠', gt: '>', lt: '<', gte: '≥', lte: '≤', contains: 'contains', notcontains: 'does not contain', startswith: 'starts with', endswith: 'ends with', isnull: 'is empty', notnull: 'has a value' };
    const result = {
      source: 'filter',
      query: conditions.map((condition, i) => `${i ? (condition.logic || 'AND').toLowerCase() + ' ' : ''}${condition.field} ${OPERATOR_SYMBOLS[condition.op] || condition.op}${condition.op === 'isnull' || condition.op === 'notnull' ? '' : ' ' + (condition.value || '')}`).join(' '),
      conditions,
      rows,
      matchedPaths: null,
      total: rows.length,
      columns: columns,
    };
    _setActiveQuery(result);
    return result;
  }

  /** Filter by a JSONPath: every value the path finds, as rows (records as they are, other values as { value }) */
  async function filterByPath(expression) {
    const dataset = getActive();
    if (!dataset) return null;
    let found;
    try { found = await Structra.jsonpathQuery.query(dataset.raw, expression); }
    catch (error) { throw new Error('This path could not be read: ' + error.message); }
    const isRecord = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
    const rows = found.map((match) => (isRecord(match.value) ? match.value : { path: match.path, value: match.value }));
    const result = {
      source: 'filter',
      query: expression,
      conditions: null,
      rows,
      matchedPaths: found.map((match) => match.path),
      total: rows.length,
      columns: rows.length ? Object.keys(rows[0]) : [],
    };
    _setActiveQuery(result);
    return result;
  }

  /** Filter the rows of the main list with a JavaScript test on `row`, for example row.Cost > 100 && row.Approved */
  async function filterByExpression(expression) {
    const dataset = getActive();
    if (!dataset) return null;
    const main = mainList(dataset);
    if (!main) return null;
    let test;
    try { test = new Function('row', 'return (' + expression + ');'); }
    catch (error) { throw new Error('This expression could not be read: ' + error.message + '. Example: row.Cost > 100 && row.Approved === true'); }
    const started = Date.now();
    const rows = [];
    for (let i = 0; i < main.rows.length; i++) {
      if (i % 500 === 0 && Date.now() - started > 5000) throw new Error('The expression is taking too long (over 5 seconds) and was stopped.');
      try { if (test(main.rows[i])) rows.push(main.rows[i]); } catch { /* a row the test cannot read does not match */ }
    }
    const result = {
      source: 'filter',
      query: expression,
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
  function _rowsToMatchedPaths(dataset, resultRows, findText) {
    if (!Array.isArray(dataset.raw)) return [];
    const regex = new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const paths = [];
    for (let i = 0; i < dataset.raw.length; i++) {
      const row = dataset.raw[i];
      if (!row || typeof row !== 'object') continue;
      for (const [key, value] of Object.entries(row)) {
        if (value !== null && typeof value !== 'object' && regex.test(String(value))) {
          paths.push(Structra.dataPaths.child(Structra.dataPaths.child('$', i), key));
        }
      }
    }
    return paths;
  }

  /** Convert matchedPaths to row objects for tabular views */
  function _matchedPathsToRows(dataset, matchedPaths) {
    if (!Array.isArray(dataset.raw) || !matchedPaths) return [];
    const rowIdxs = new Set();
    for (const matchedPath of matchedPaths) {
      const indexMatch = matchedPath.match(/^\$\[(\d+)\]/);
      if (indexMatch) rowIdxs.add(parseInt(indexMatch[1], 10));
    }
    return [...rowIdxs].sort((first, second) => first - second).map(i => dataset.raw[i]).filter(Boolean);
  }

  /** Store query result and notify views */
  function _setActiveQuery(result) {
    // Every find (text, key, path, pattern, fuzzy) ends here, so Next and Previous always walk the matches in document order
    if (Array.isArray(result.matchedPaths)) { const dataset = getActive(); result.matchedPaths = _inDocumentOrder(result.matchedPaths, dataset ? dataset.raw : undefined); }
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
    const dataset = getActive();
    if (!dataset) return null;
    return Array.isArray(dataset.raw) ? dataset.raw : null;
  }

  /**
   * Get the data object views should render.
   * For query results, returns rows array.
   * Otherwise returns full raw data.
   */
  function getQueryData() {
    if (_activeFilter && _activeFilter.rows) return _activeFilter.rows;
    const dataset = getActive();
    return dataset ? dataset.raw : null;
  }

  /* ============================
     DUCKDB ROUTING HELPERS
     Central routing logic - all functions use these to decide
     SQL (DuckDB) vs JS (in-memory) execution path.
     ============================ */

  /** Check if a dataset has been registered with DuckDB */
  function _isDuckRegistered(dataset) {
    return dataset && dataset._duckColumns && dataset._duckColumns.length > 0;
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
  function _tableOf(dataset) {
    return dataset.duckTable.replace(/[^a-z0-9_]/gi, '_');
  }

  function _canUseDuck(dataset) {
    return _duckReady && !_duckFailed && !!Structra.duckdbAdapter && _isDuckRegistered(dataset);
  }

  /** Is DuckDB engine available at all? (ignores dataset registration) */
  function _duckAvailable() {
    return _duckReady && !_duckFailed && !!Structra.duckdbAdapter;
  }

  /** Get column names from DuckDB-registered dataset */
  function _getDuckColumnNames(dataset) {
    if (dataset._duckColumns) return dataset._duckColumns.map(column => column.name);
    if (dataset.indexes.columns) return dataset.indexes.columns.map(column => column.name);
    return [];
  }

  /**
   * Describe the DuckDB table for the active dataset.
   * Returns column names, types, and whether they are nested (STRUCT/LIST).
   * @returns {Promise<Array<{name, type, nested}>>}
   */
  async function describeTable() {
    const dataset = getActive();
    if (!dataset || !_duckAvailable()) return [];
    if (dataset._duckColumns) return dataset._duckColumns;
    const tableName = _tableOf(dataset);
    const columns = await Structra.duckdbAdapter.getTableColumns(tableName);
    dataset._duckColumns = columns;
    return columns;
  }

  /**
   * Extract values at a JSON path from the DuckDB table.
   * Uses json_extract_string for nested access.
   * @param {string} path - dot-separated path (e.g. 'address.city' or 'items[0].name')
   * @returns {Promise<Array<Object>>}
   */
  async function jsonExtract(path) {
    const dataset = getActive();
    if (!dataset || !_canUseDuck(dataset)) return [];
    const tableName = _tableOf(dataset);

    // The path is read by Structra.dataPaths and written again as a DuckDB JSON path with quoted keys ($."a.b"[0]), so a key with a
    // dot, a bracket or a quote works, and a quote cannot end the SQL string.
    const tokens = Structra.dataPaths.tokenize(path);
    const jsonPath = '$' + tokens.map((token) => (token.type === 'key' ? '."' + token.value.replace(/"/g, '\\"') + '"' : '[' + (token.type === 'wildcard' ? '*' : token.value) + ']')).join('');
    const sqlText = (text) => "'" + text.replace(/'/g, "''") + "'";

    try {
      // A plain top-level column: DuckDB made it a column of its own, so it is read directly (faster)
      const columns = _getDuckColumnNames(dataset);
      if (tokens.length === 1 && tokens[0].type === 'key' && columns.includes(tokens[0].value)) {
        const column = '"' + tokens[0].value.replace(/"/g, '""') + '"';
        try {
          return await Structra.duckdbAdapter.query(`SELECT ${column} AS value FROM "${tableName}" WHERE ${column} IS NOT NULL`);
        } catch {
          // Direct access failed - fall through to json_extract
        }
      }

      // Everything else: json_extract on each row
      const sql = `SELECT json_extract_string(CAST(ROW(*) AS JSON), ${sqlText(jsonPath)}) AS value FROM "${tableName}"`;
      return await Structra.duckdbAdapter.query(sql);
    } catch (error) {
      Structra.log.warn('Engine', `jsonExtract("${path}") failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Unnest/flatten an array column or nested array via DuckDB.
   * @param {string} column - column name containing LIST/array values
   * @returns {Promise<Array<Object>>}
   */
  async function unnest(column) {
    const dataset = getActive();
    if (!dataset || !_canUseDuck(dataset)) return [];
    const tableName = _tableOf(dataset);
    try {
      return await Structra.duckdbAdapter.query(`SELECT UNNEST("${column}") AS item FROM "${tableName}"`);
    } catch (error) {
      Structra.log.warn('Engine', `unnest("${column}") failed: ${error.message}`);
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
  function walk(object, visitor, options = {}) {
    const { maxDepth = 20 } = options;
    const stack = [{ val: object, path: '$', depth: 0 }];
    while (stack.length > 0) {
      const { val: value, path, depth } = stack.pop();
      if (depth > maxDepth) continue;
      const action = visitor(value, path, depth);
      if (action === false) continue;
      if (value && typeof value === 'object') {
        if (Array.isArray(value)) {
          for (let i = value.length - 1; i >= 0; i--) {
            stack.push({ val: value[i], path: `${path}[${i}]`, depth: depth + 1 });
          }
        } else {
          const entries = Object.entries(value);
          for (let i = entries.length - 1; i >= 0; i--) {
            const [key, value] = entries[i];
            stack.push({ val: value, path: Structra.dataPaths.child(path, key), depth: depth + 1 });
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
      const dataset = getActive();
      data = dataset ? dataset.raw : null;
    }
    if (!data) return null;

    const statistics = { keys: 0, depth: 0, arrays: 0, objects: 0, strings: 0, numbers: 0, booleans: 0, nulls: 0, totalNodes: 0, longestArray: 0, arraysDetail: [] };

    const pathOf = (frame) => {
      const parts = [];
      for (let ancestor = frame; ancestor && ancestor.parent; ancestor = ancestor.parent) parts.push(ancestor.key);
      let out = '';
      for (let i = parts.length - 1; i >= 0; i--) {
        const part = parts[i];
        out += typeof part === 'number' ? `[${part}]` : (out ? '.' + part : part);
      }
      return out || '(root)';
    };

    const stack = [{ val: data, parent: null, key: null, depth: 0 }];
    let lastYield = performance.now();
    let frames = 0;

    while (stack.length) {
      const frame = stack.pop();
      const value = frame.val;
      const depth = frame.depth;
      statistics.totalNodes++;
      if (depth > statistics.depth) statistics.depth = depth;

      // A document that is just one value (true, 42, "text", null) is that value, not an object
      if (value === null || typeof value !== 'object') {
        const valueType = typeof value;
        if (valueType === 'string') statistics.strings++; else if (valueType === 'number') statistics.numbers++; else if (valueType === 'boolean') statistics.booleans++; else if (value === null) statistics.nulls++;
        continue;
      }

      if (Array.isArray(value)) {
        statistics.arrays++;
        const length = value.length;
        if (length > statistics.longestArray) statistics.longestArray = length;
        statistics.arraysDetail.push({
          path: pathOf(frame),
          count: length,
          sample: length > 0 ? (typeof value[0] === 'object' && value[0] !== null ? 'object' : typeof value[0]) : 'empty',
        });
        for (let i = length - 1; i >= 0; i--) {
          const child = value[i];
          if (child !== null && typeof child === 'object') {
            stack.push({ val: child, parent: frame, key: i, depth: depth + 1 });
          } else {
            statistics.totalNodes++;
            if (depth + 1 > statistics.depth) statistics.depth = depth + 1;
            const childType = typeof child;
            if (childType === 'string') statistics.strings++; else if (childType === 'number') statistics.numbers++; else if (childType === 'boolean') statistics.booleans++; else if (child === null) statistics.nulls++;
          }
        }
      } else {
        statistics.objects++;
        const keys = Object.keys(value);
        statistics.keys += keys.length;
        for (let i = keys.length - 1; i >= 0; i--) {
          const child = value[keys[i]];
          if (child !== null && typeof child === 'object') {
            stack.push({ val: child, parent: frame, key: keys[i], depth: depth + 1 });
          } else {
            statistics.totalNodes++;
            if (depth + 1 > statistics.depth) statistics.depth = depth + 1;
            const childType = typeof child;
            if (childType === 'string') statistics.strings++; else if (childType === 'number') statistics.numbers++; else if (childType === 'boolean') statistics.booleans++; else if (child === null) statistics.nulls++;
          }
        }
      }

      if ((++frames & 2047) === 0 && performance.now() - lastYield > _SLICE_MS) {
        await _tick();
        lastYield = performance.now();
      }
    }
    return statistics;
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
      const dataset = getActive();
      data = dataset ? dataset.raw : null;
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
    for (const key of Object.keys(data)) {
      const result = _firstObjectArray(data[key], Structra.dataPaths.child(path, key));
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
  function findAllArrays(object, path, _seen) {
    if (object === undefined || object === null) {
      const dataset = getActive();
      object = dataset ? dataset.raw : null;
    }
    return _allArrays(object, path || '$', _seen || new Set());
  }

  // Recursive part. A null child is just a null value, never "the whole document".
  function _allArrays(object, path, seen) {
    if (!object || typeof object !== 'object') return [];
    if (object && typeof object === 'object') {
      if (seen.has(object)) return [];
      seen.add(object);
    }
    const result = [];
    if (Array.isArray(object)) {
      result.push({ path, count: object.length, data: object });
      for (let i = 0; i < object.length; i++) {
        const item = object[i];
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          for (const [key, value] of Object.entries(item)) {
            if (value && typeof value === 'object') {
              const childPath = Structra.dataPaths.child(`${path}[*]`, key);
              if (!result.some(known => known.path === childPath)) {
                const subPaths = _allArrays(value, childPath, seen);
                for (const subPath of subPaths) {
                  if (!result.some(known => known.path === subPath.path)) result.push(subPath);
                }
              }
            }
          }
        }
      }
    } else if (object && typeof object === 'object') {
      for (const [key, value] of Object.entries(object)) {
        const subPaths = _allArrays(value, path === '$' ? Structra.dataPaths.child('', key) : Structra.dataPaths.child(path, key), seen);
        for (const subPath of subPaths) result.push(subPath);
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
      const dataset = getActive();
      rows = dataset && Array.isArray(dataset.raw) ? dataset.raw : [];
    }
    const limit = Math.min(rows.length, sampleLimit || 1000);
    const keys = [];
    const keySet = new Set();
    for (let i = 0; i < limit; i++) {
      const row = rows[i];
      if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
      for (const key of Object.keys(row)) {
        if (!keySet.has(key)) { keySet.add(key); keys.push(key); }
      }
    }
    return keys;
  }

  /**
   * Analyze key presence/missing/empty across an array of objects.
   * @param {Array} arr - array of objects
   * @returns {Array<{key, present, missing, empty, pct, types: Set}>}
   */
  function analyzeKeys(array) {
    if (!array || array.length === 0) return [];
    const keyMap = Object.create(null);
    const total = array.length;
    for (let i = 0; i < total; i++) {
      const row = array[i];
      if (!row || typeof row !== 'object') continue;
      for (const key of Object.keys(row)) {
        if (!keyMap[key]) keyMap[key] = { key, present: 0, missing: 0, empty: 0, pct: 0, types: new Set() };
        const entry = keyMap[key];
        entry.present++;
        const value = row[key];
        if (value === null || value === undefined || value === '') entry.empty++;
        if (value !== null && value !== undefined) {
          entry.types.add(Array.isArray(value) ? 'array' : typeof value);
        }
      }
    }
    const entries = Object.values(keyMap);
    for (const entry of entries) {
      entry.missing = total - entry.present;
      entry.pct = Math.round((entry.present / total) * 100);
    }
    return entries;
  }

  /**
   * Analyze nested keys for a parent key's object-typed values.
   * @param {Array} arr - parent array of objects
   * @param {string} parentKey - key whose value is an object
   * @returns {Array<{key, present, missing, empty, pct}>}
   */
  function analyzeNestedKeys(array, parentKey) {
    if (!array || array.length === 0) return [];
    const keyMap = Object.create(null);
    let count = 0;
    for (let i = 0; i < array.length; i++) {
      const row = array[i];
      if (!row || typeof row !== 'object') continue;
      const nested = row[parentKey];
      if (!nested || typeof nested !== 'object' || Array.isArray(nested)) continue;
      count++;
      for (const key of Object.keys(nested)) {
        if (!keyMap[key]) keyMap[key] = { key, present: 0, missing: 0, empty: 0, pct: 0 };
        keyMap[key].present++;
        const nestedValue = nested[key];
        if (nestedValue === null || nestedValue === undefined || nestedValue === '') keyMap[key].empty++;
      }
    }
    if (count === 0) return [];
    const entries = Object.values(keyMap);
    for (const entry of entries) {
      entry.missing = count - entry.present;
      entry.pct = count > 0 ? Math.round((entry.present / count) * 100) : 0;
    }
    return entries.sort((first, second) => second.missing - first.missing);
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
      const value = data[i] && data[i][key];
      if (Array.isArray(value)) {
        for (let j = 0; j < value.length; j++) merged.push(value[j]);
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

  function profileFields(array) {
    if (!array) {
      const dataset = getActive();
      array = dataset ? (Array.isArray(dataset.raw) ? dataset.raw : null) : null;
      if (!array) {
        const firstObjectArray = findFirstObjectArray();
        array = firstObjectArray ? firstObjectArray.rows : null;
      }
    }
    if (!Array.isArray(array) || array.length === 0 || typeof array[0] !== 'object') return Promise.resolve(null);
    return _profileRows(array);
  }

  function _histogram(numbers) {
    let min = numbers[0], max = numbers[0];
    for (let i = 1; i < numbers.length; i++) { const number = numbers[i]; if (number < min) min = number; if (number > max) max = number; }
    const bins = Math.min(DIST_BINS, Math.max(3, Math.ceil(Math.sqrt(numbers.length))));
    const width = (max - min) / bins || 1;
    const counts = new Array(bins).fill(0);
    for (let i = 0; i < numbers.length; i++) counts[Math.min(bins - 1, Math.floor((numbers[i] - min) / width))]++;
    return counts.map((count, i) => ({ label: (min + i * width).toFixed(1), count }));
  }

  async function _profileRows(rows) {
    const total = rows.length;
    const columns = new Map();
    let lastYield = performance.now();

    // Rows of one array nearly always list their keys in the same order, so remember which
    // accumulator belongs to each key position and skip the Map lookup in the common case.
    const posKeys = [];
    const posAcc = [];

    for (let i = 0; i < total; i++) {
      const row = rows[i];
      if (!row || typeof row !== 'object') continue;

      let position = 0;
      for (const key in row) {
        let columnStats;
        if (posKeys[position] === key) {
          columnStats = posAcc[position];
        } else {
          columnStats = columns.get(key);
          if (!columnStats) {
            columnStats = { key, present: 0, empty: 0, nonNull: 0, nStr: 0, nNum: 0, nBool: 0, nNull: 0, nObj: 0, nArr: 0,
                  min: 0, max: 0, sum: 0, freq: new Map(), uniq: new Set(), objSeen: 0, capped: false, numericLike: true, nums: [] };
            columns.set(key, columnStats);
          }
          posKeys[position] = key;
          posAcc[position] = columnStats;
        }
        position++;

        const value = row[key];
        columnStats.present++;
        if (value === null) { columnStats.nNull++; columnStats.empty++; continue; }

        const valueType = typeof value;
        if (valueType === 'string') {
          columnStats.nStr++;
          if (value === '') { columnStats.empty++; columnStats.numericLike = false; columnStats.nums = null; continue; }
          columnStats.nonNull++;
          if (!columnStats.capped) {
            const count = columnStats.freq.get(value);
            if (count !== undefined) columnStats.freq.set(value, count + 1);
            else if (columnStats.freq.size < PROFILE_CAP) columnStats.freq.set(value, 1);
            else columnStats.capped = true;      // too many distinct values: stop counting them, the figures become "at least"
          }
          if (columnStats.numericLike) {
            const number = +value;
            if (number !== number || value.trim() === '') { columnStats.numericLike = false; columnStats.nums = null; } else columnStats.nums.push(number);
          }
        } else if (valueType === 'number') {
          if (columnStats.nNum === 0) { columnStats.min = value; columnStats.max = value; } else { if (value < columnStats.min) columnStats.min = value; if (value > columnStats.max) columnStats.max = value; }
          columnStats.nNum++;
          columnStats.nonNull++;
          columnStats.sum += value;
          if (!columnStats.capped) {
            if (columnStats.uniq.size < PROFILE_CAP) columnStats.uniq.add(value); else if (!columnStats.uniq.has(value)) columnStats.capped = true;
          }
          if (columnStats.numericLike) columnStats.nums.push(value);
        } else if (valueType === 'boolean') {
          columnStats.nBool++;
          columnStats.nonNull++;
          const bucket = value ? 'true' : 'false';
          columnStats.freq.set(bucket, (columnStats.freq.get(bucket) || 0) + 1);
          columnStats.numericLike = false; columnStats.nums = null;
        } else {
          if (Array.isArray(value)) columnStats.nArr++; else columnStats.nObj++;
          columnStats.nonNull++;
          columnStats.numericLike = false; columnStats.nums = null;
          if (columnStats.objSeen < OBJECT_UNIQUE_SAMPLE) { columnStats.uniq.add(JSON.stringify(value)); columnStats.objSeen++; }
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
    for (const column of columns.values()) {
      const types = {};
      if (column.nStr) types.string = column.nStr;
      if (column.nNum) types.number = column.nNum;
      if (column.nBool) types.boolean = column.nBool;
      if (column.nNull) types.null = column.nNull;
      if (column.nObj) types.object = column.nObj;
      if (column.nArr) types.array = column.nArr;
      const primaryType = Object.entries(types).sort((first, second) => second[1] - first[1])[0]?.[0] || 'unknown';
      const unique = column.freq.size + column.uniq.size;
      const field = {
        key: column.key,
        count: column.present,
        total,
        coverage: ((column.present / total) * 100).toFixed(0),
        nullPct: (((column.present - column.nonNull) / total) * 100).toFixed(0),
        types,
        primaryType,
        unique,
        uniqueCapped: column.capped,
        uniquePct: ((unique / Math.max(column.nonNull, 1)) * 100).toFixed(0),
      };
      if (column.nNum > 0) { field.min = column.min; field.max = column.max; field.avg = (column.sum / column.nNum).toFixed(2); }
      if ((primaryType === 'string' || primaryType === 'boolean') && column.freq.size) {
        field.topValues = [...column.freq.entries()].sort((first, second) => second[1] - first[1]).slice(0, 5).map(([key, value]) => ({ val: key, cnt: value }));
      }
      // Value distribution for the stats view
      if (column.numericLike && column.nums && column.nums.length) {
        field.histogram = _histogram(column.nums);
      } else if (column.freq.size && column.nonNull) {
        field.distTop = [...column.freq.entries()].sort((first, second) => second[1] - first[1]).slice(0, 8).map(([value, count]) => ({ value, count }));
        field.distUnique = column.freq.size;
      }
      fields.push(field);

      coverage.push({
        key: column.key,
        present: column.present,
        missing: total - column.present,
        empty: column.empty,
        pct: Math.round((column.present / total) * 100),
        types: new Set(Object.keys(types).filter((typeName) => typeName !== 'null')),
      });
      gaps += total - column.present;
    }

    return { fields, rowCount: total, fieldCount: columns.size, quality: computeQuality(fields), coverage, gaps };
  }

  /**
   * Compute data quality score from profiled fields.
   * Weights: completeness 40% + consistency 35% + uniqueness 25%.
   * @param {Array} fields - from profileFields().fields
   * @returns {{ overall, completeness, consistency, uniqueness, issues }}
   */
  function computeQuality(fields) {
    if (!fields || fields.length === 0) return { overall: 100, completeness: 100, consistency: 100, uniqueness: 100, issues: [] };

    const avgNull = fields.reduce((total, field) => total + parseFloat(field.nullPct), 0) / fields.length;
    const completeness = Math.max(0, 100 - avgNull);

    const consistentCount = fields.filter(field => {
      const typeKeys = Object.keys(field.types).filter(typeName => typeName !== 'null');
      return typeKeys.length <= 1;
    }).length;
    const consistency = (consistentCount / fields.length) * 100;

    // Only a column that is meant to differ in every record (an id, a key, an email) is judged on being unique: a Status has three values by design
    const idLike = (fieldName) => /(^|[^a-z])(id|guid|uuid|key|code|ref|reference|number|email|sku)$|id$/i.test(String(fieldName).split('.').pop());
    const uniqFields = fields.filter(field => (field.primaryType === 'string' || field.primaryType === 'number') && idLike(field.key));
    const uniqueness = uniqFields.length > 0
      ? uniqFields.reduce((total, field) => total + parseFloat(field.uniquePct), 0) / uniqFields.length
      : 100;

    const overall = Math.round(completeness * 0.4 + consistency * 0.35 + uniqueness * 0.25);

    const issues = [];
    for (const field of fields) {
      const nullPercent = parseFloat(field.nullPct);
      if (nullPercent >= 30) issues.push({ field: field.key, msg: `${nullPercent}% null`, severity: nullPercent >= 60 ? 'high' : 'med' });
      const typeKeys = Object.keys(field.types).filter(typeName => typeName !== 'null');
      if (typeKeys.length > 1) issues.push({ field: field.key, msg: `mixed types (${typeKeys.join(', ')})`, severity: 'high' });
      if (idLike(field.key) && (field.primaryType === 'string' || field.primaryType === 'number') && parseFloat(field.uniquePct) < 90 && parseFloat(field.coverage) > 50) {
        issues.push({ field: field.key, msg: `repeats: only ${field.uniquePct}% of its values are different, but it looks like an identifier`, severity: 'med' });
      }
    }
    issues.sort((first, second) => (first.severity === 'high' ? 0 : 1) - (second.severity === 'high' ? 0 : 1));

    return { overall, completeness: Math.round(completeness), consistency: Math.round(consistency), uniqueness: Math.round(uniqueness), issues: issues.slice(0, 5) };
  }

  /**
   * Get top-k most frequent values per column via DuckDB GROUP BY.
   * @param {string} column
   * @param {number} k
   * @returns {Promise<Array>}
   */
  async function topKValues(column, limit = 10) {
    const dataset = getActive();
    if (!dataset || !_canUseDuck(dataset)) return [];
    const tableName = _tableOf(dataset);
    try {
      return await Structra.duckdbAdapter.query(
        `SELECT UNNEST(approx_top_k("${column}", ${limit})) AS val FROM "${tableName}"`
      );
    } catch {
      // Fallback: regular GROUP BY
      try {
        return await Structra.duckdbAdapter.query(
          `SELECT "${column}" AS val, COUNT(*) AS cnt FROM "${tableName}" WHERE "${column}" IS NOT NULL GROUP BY "${column}" ORDER BY cnt DESC LIMIT ${limit}`
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
    const dataset = getActive();
    if (!dataset) return Promise.resolve(null);
    if (!dataset._analysis) {
      dataset._analysis = (async () => {
        const startTime = performance.now();
        await _tick();                          // let the page paint first
        const stats = await _analyze(dataset.raw);
        const firstArray = findFirstObjectArray(dataset.raw);
        const profile = firstArray ? await _profileRows(firstArray.rows) : null;
        Structra.log.perf('Engine', 'analysis', performance.now() - startTime);
        return { stats, firstArr: firstArray, profile, gaps: profile ? profile.gaps : 0 };
      })();
    }
    return dataset._analysis;
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
    const dataset = getActive();
    if (!dataset) return false;
    if (!_isDuckRegistered(dataset)) {
      Structra.events.emit('loading:show', 'Loading data into the SQL engine…');
      try {
        await _ensureRegistered(dataset);
        if (_isDuckRegistered(dataset)) Structra.events.emit('engine:duckdb-registered', { tabId: dataset.id });
      } finally {
        Structra.events.emit('loading:hide');
      }
    }
    return _canUseDuck(dataset);
  }

  /**
   * Make sure the dataset has its table in DuckDB. A registration that did not produce a table
   * (it failed, or the table was dropped) is tried again instead of being remembered as done.
   */
  async function _ensureRegistered(dataset) {
    if (_isDuckRegistered(dataset)) return true;
    if (!dataset._duckPromise) dataset._duckPromise = Structra.duckdbAdapter.registerDataset(dataset);
    await dataset._duckPromise;
    dataset._duckPromise = null;
    return _isDuckRegistered(dataset);
  }

  /** The table a query used is gone: forget that this dataset was registered so the next SQL call loads it again */
  function _forgetMissingTable(dataset, error) {
    if (dataset && error && /does not exist/i.test(error.message || '')) {
      dataset._duckColumns = null;
      dataset._duckPromise = null;
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
    const dataset = getActive();
    if (!dataset || !(await enableSql())) return null;
    const tableName = _tableOf(dataset);
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
      const firstRow = result[0] || {};
      return {
        column,
        median: firstRow.median,
        mode: firstRow.mode,
        stddev: firstRow.stddev,
        variance: firstRow.variance,
        skewness: firstRow.skewness,
        kurtosis: firstRow.kurtosis,
        entropy: firstRow.entropy,
        percentiles: firstRow.percentiles,
        min: firstRow.min_val,
        max: firstRow.max_val,
        avg: firstRow.avg_val,
        nonNullCount: Number(firstRow.non_null_count || 0),
        totalCount: Number(firstRow.total_count || 0),
        source: 'duckdb',
      };
    } catch (error) {
      Structra.log.warn('Engine', `analyzeDistribution("${column}") failed`, error.message);
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
    const dataset = getActive();
    if (!dataset || !(await enableSql())) return null;
    const tableName = _tableOf(dataset);
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
    const dataset = getActive();
    if (!dataset) return { total: 0, matchedPaths: [] };
    const want = String(text).toLowerCase();
    const near = new Set();
    // Every text value is compared; one that contains the search text, or is spelled close to it, matches
    const seen = new Map();
    const matches = (candidate) => {
      const text = String(candidate).toLowerCase();
      if (seen.has(text)) return seen.get(text);
      let match = text.includes(want);
      if (!match && text.length <= 200 && Math.abs(text.length - want.length) <= Math.max(3, want.length)) match = _jaroWinkler(text, want) >= threshold;
      if (!match && text.length > want.length && text.length <= 200) {
        // a short search against a longer value: compare with each word
        match = text.split(/[\s,;:@./_-]+/).some((part) => part.length > 1 && Math.abs(part.length - want.length) <= 3 && _jaroWinkler(part, want) >= threshold);
      }
      seen.set(text, match);
      return match;
    };
    const stack = [{ val: dataset.raw, path: '$' }];
    const matched = [];
    while (stack.length) {
      const { val: value, path } = stack.pop();
      if (!value || typeof value !== 'object') continue;
      const entries = Array.isArray(value) ? value.map((item, i) => [i, item]) : Object.entries(value);
      for (const [key, item] of entries) {
        const child = Structra.dataPaths.child(path, Array.isArray(value) ? Number(key) : key);
        if (item !== null && typeof item === 'object') stack.push({ val: item, path: child });
        else if (item !== null && item !== undefined && typeof item !== 'boolean' && matches(item)) matched.push(child);
      }
    }
    near.clear();
    return _setFindResult(dataset, text, matched);
  }

  /** Jaro-Winkler similarity, 0 to 1: how alike two spellings are */
  function _jaroWinkler(first, second) {
    if (first === second) return 1;
    const firstLength = first.length, secondLength = second.length;
    if (!firstLength || !secondLength) return 0;
    const range = Math.max(0, Math.floor(Math.max(firstLength, secondLength) / 2) - 1);
    const firstMatched = new Array(firstLength).fill(false), secondMatched = new Array(secondLength).fill(false);
    let matches = 0;
    for (let i = 0; i < firstLength; i++) {
      for (let j = Math.max(0, i - range); j < Math.min(secondLength, i + range + 1); j++) {
        if (!secondMatched[j] && first[i] === second[j]) { firstMatched[i] = secondMatched[j] = true; matches++; break; }
      }
    }
    if (!matches) return 0;
    let transpositions = 0, pointer = 0;
    for (let i = 0; i < firstLength; i++) if (firstMatched[i]) { while (!secondMatched[pointer]) pointer++; if (first[i] !== second[pointer]) transpositions++; pointer++; }
    const jaro = (matches / firstLength + matches / secondLength + (matches - transpositions / 2) / matches) / 3;
    let prefix = 0;
    while (prefix < Math.min(4, firstLength, secondLength) && first[prefix] === second[prefix]) prefix++;
    return jaro + prefix * 0.1 * (1 - jaro);
  }

  /**
   * Pattern (regular expression) search over the values of the open document.
   * @param {string} pattern - regex pattern, case-insensitive
   */
  async function regexSearch(pattern) {
    const dataset = getActive();
    if (!dataset) return { total: 0, matchedPaths: [] };
    if (Structra.sharedHelpers.isRiskyRegex(pattern)) throw new Error(Structra.sharedHelpers.RISKY_REGEX_MESSAGE);
    const expression = new RegExp(pattern, 'i');       // an invalid pattern throws; the Find bar says so
    return _findInMemory(dataset, pattern, expression);
  }

  /**
   * Matches in the order they appear in the document: [2] before [10], and a key before the keys after it in the same object.
   * Next and Previous walk this list, so the order it comes in (from the database, or from a search that ran in pieces) must
   * not decide where Next goes first. Each path becomes a list of positions (list position, or the place of the key inside
   * its object) and the lists are compared; the first position that differs decides.
   */
  function _inDocumentOrder(paths, root) {
    const places = new WeakMap();    // object -> Map(key -> its place), built once per object that a path goes through
    const placeOf = (object, key) => {
      let map = places.get(object);
      if (!map) { map = new Map(); Object.keys(object).forEach((name, index) => map.set(name, index)); places.set(object, map); }
      return map.has(key) ? map.get(key) : Infinity;
    };
    const vectorOf = (path) => {
      const vector = [];
      let node = root;
      for (const token of Structra.dataPaths.tokenize(path)) {
        if (token.type === 'index') { vector.push(token.value); node = node === null || node === undefined ? undefined : node[token.value]; continue; }
        if (token.type !== 'key') { vector.push(0); continue; }
        if (node === null || typeof node !== 'object') { vector.push(Infinity); node = undefined; continue; }
        vector.push(placeOf(node, token.value));
        node = node[token.value];
      }
      return vector;
    };
    const keyed = paths.map((path) => ({ path, vector: vectorOf(path) }));
    keyed.sort((first, second) => {
      const length = Math.min(first.vector.length, second.vector.length);
      for (let i = 0; i < length; i++) if (first.vector[i] !== second.vector[i]) return first.vector[i] < second.vector[i] ? -1 : 1;
      return first.vector.length - second.vector.length;
    });
    return keyed.map((item) => item.path);
  }

  /** Store matched paths as the active find result */
  function _setFindResult(dataset, text, matchedPaths) {
    const rows = _matchedPathsToRows(dataset, matchedPaths);
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
    const dataset = getActive();
    if (!dataset) return null;
    if (format !== 'csv') return JSON.stringify(dataset.raw, null, 2);

    // CSV is the main list as rows (the filtered rows when a filter is on), whatever shape the document has.
    // Choice, Person and other one-level objects become Parent.Child columns; lists stay as JSON text.
    const query = getQuery();
    const main = mainList(dataset);
    let rows = query && query.source === 'filter' && Array.isArray(query.rows) ? query.rows : main ? main.rows : null;
    if (!rows) rows = Array.isArray(dataset.raw) ? dataset.raw : [dataset.raw];
    const isPlain = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
    const flat = rows.map((row) => {
      if (!isPlain(row)) return { value: row };
      const out = {};
      for (const [key, value] of Object.entries(row)) {
        if (isPlain(value)) { for (const [nestedKey, nestedValue] of Object.entries(value)) out[key + '.' + nestedKey] = nestedValue; }
        else out[key] = value;
      }
      return out;
    });
    const columns = [];
    const seen = new Set();
    for (const row of flat) for (const key of Object.keys(row)) if (!seen.has(key)) { seen.add(key); columns.push(key); }
    if (!columns.length) return '';
    return Structra.formatConversion.generateCsv(flat, columns);
  }

  /**
   * Random sample of N rows via DuckDB SAMPLE.
   * @param {number} n - number of rows
   * @returns {Promise<Array>}
   */
  async function sampleData(count = 100) {
    const dataset = getActive();
    if (!dataset || !_canUseDuck(dataset)) {
      // JS fallback: random pick from raw array
      if (dataset && Array.isArray(dataset.raw)) {
        const copy = dataset.raw.slice();
        for (let i = copy.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return copy.slice(0, count);
      }
      return [];
    }
    const tableName = _tableOf(dataset);
    try {
      return await Structra.duckdbAdapter.query(`SELECT * FROM "${tableName}" USING SAMPLE ${count} ROWS`);
    } catch (error) {
      Structra.log.warn('Engine', `sampleData failed`, error.message);
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
  async function pivotData(onCol, valueCol, aggFunction = 'count') {
    const dataset = getActive();
    if (!dataset || !(await enableSql())) return [];
    const tableName = _tableOf(dataset);
    try {
      return await Structra.duckdbAdapter.query(
        `PIVOT "${tableName}" ON "${onCol}" USING ${aggFunction}("${valueCol}")`
      );
    } catch (error) {
      Structra.log.warn('Engine', `pivotData failed`, error.message);
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
    const dataset = getActive();
    if (!dataset || !_canUseDuck(dataset)) return [];
    const tableName = _tableOf(dataset);
    try {
      return await Structra.duckdbAdapter.query(`SUMMARIZE "${tableName}"`);
    } catch (error) {
      Structra.log.warn('Engine', 'summarizeTable failed', error.message);
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
