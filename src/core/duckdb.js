/* ============================================================
   STRUCTRA V2 - DuckDB WASM Adapter
   Async-loaded DuckDB WASM, served from this app's own folder (src/libs/duckdb).

   - Non-blocking: loads in background, engine works via JS Core until ready
   - OPFS: database file persists across page reloads (instant resume)
   - Fallback: in-memory mode if OPFS unavailable
   - Registers ALL JSON shapes (flat-array, nested-array, object)
     via read_json_auto - DuckDB handles nested STRUCTs/LISTs natively.
   - JSON functions: json_extract, json_keys, unnest, json_type
     available for querying into nested structures.

   API:
     Structra.duckdb.init()                    → start loading (called by app.js)
     Structra.duckdb.ready                     → Promise<boolean>
     Structra.duckdb.query(sql)                → Promise<Array<Object>>
     Structra.duckdb.registerDataset(dataset)  → CREATE TABLE from dataset
     Structra.duckdb.getTableColumns(table)    → column names + types
     Structra.duckdb.dropTable(name)           → DROP TABLE
     Structra.duckdb.close()                   → shutdown

   Console:
     Structra.duckdb.query('SELECT 1 as test').then(console.log)

   Wiring (generated from the code below; update it when you add or remove an event):
     Emits: engine:duckdb-failed
   ============================================================ */

window.Structra = window.Structra || {};

Structra.duckdb = (() => {
  let _db = null;
  let _conn = null;
  let _initPromise = null;
  let _ready = false;

  /* --- Initialize --- */
  function init() {
    if (_initPromise) return _initPromise;
    _initPromise = _doInit();
    return _initPromise;
  }

  async function _doInit() {
    const t0 = performance.now();
    try {
      Structra.log.info('DuckDB', 'Loading DuckDB WASM via Structra.libs...');
      const duckdb = await Structra.libs.require('duckdb');

      // The engine files are in this app's own folder (nothing is downloaded from another site)
      const abs = (u) => new URL(u, document.baseURI).href;
      const bundle = { mainModule: abs('src/libs/duckdb/duckdb-eh.wasm'), mainWorker: abs('src/libs/duckdb/duckdb-browser-eh.worker.js'), pthreadWorker: null };

      // Create worker via blob URL with importScripts
      const workerUrl = URL.createObjectURL(
        new Blob([`importScripts("${bundle.mainWorker}");`], { type: 'text/javascript' })
      );
      const worker = new Worker(workerUrl);
      const logger = new duckdb.ConsoleLogger(duckdb.LogLevel?.WARNING);

      // Instantiate
      _db = new duckdb.AsyncDuckDB(logger, worker);
      await _db.instantiate(bundle.mainModule, bundle.pthreadWorker);
      URL.revokeObjectURL(workerUrl);

      // Open in-memory database
      // Note: OPFS persistence requires Cross-Origin-Isolation headers (COOP/COEP)
      // which are not available on simple HTTP servers or file:// protocol.
      // In-memory is fine - Structra re-ingests data from localStorage/IndexedDB on load.
      await _db.open({});
      // The JSON add-on is also served from this folder
      await _db.connect().then(async (c) => { try { await c.query(`SET custom_extension_repository='${new URL('src/libs/duckdb/ext', document.baseURI).href}'`); } finally { await c.close(); } });
      Structra.log.info('DuckDB', 'Opened in-memory');

      // Create connection
      _conn = await _db.connect();
      _ready = true;

      const duration = performance.now() - t0;
      Structra.log.info('DuckDB', `Ready in ${duration.toFixed(0)}ms`);

      // Notify engine
      Structra.engine.onDuckDBReady();
      return true;
    } catch (err) {
      Structra.log.error('DuckDB', 'Init failed - SQL queries unavailable', err);
      _ready = false;
      Structra.events.emit('engine:duckdb-failed');
      return false;
    }
  }

  /* --- Query --- */
  async function query(sql) {
    if (!_ready || !_conn) {
      throw new Error('DuckDB not initialized');
    }
    const result = await _conn.query(sql);
    // Convert Arrow table to array of objects
    return arrowToObjects(result);
  }

  /* --- Arrow to JS Objects --- */
  function arrowToObjects(table) {
    const rows = [];
    const schema = table.schema.fields.map(f => f.name);
    for (let i = 0; i < table.numRows; i++) {
      const row = {};
      for (const col of schema) {
        const colData = table.getChild(col);
        row[col] = colData ? colData.get(i) : null;
      }
      rows.push(row);
    }
    return rows;
  }

  /* --- Register Dataset as DuckDB Table --- */
  async function registerDataset(dataset) {
    if (!_ready || !_conn) return;
    const { raw, duckTable, meta } = dataset;

    // Skip empty / primitive data - nothing meaningful to query via SQL
    if (raw === null || raw === undefined) return;
    if (meta.shape === 'empty' || meta.shape === 'empty-array' || meta.shape === 'primitive') return;

    const tableName = duckTable.replace(/[^a-z0-9_]/gi, '_');

    // Drop existing table if any
    await _conn.query(`DROP TABLE IF EXISTS "${tableName}"`);

    try {
      // Prepare data for read_json_auto:
      // - flat-array / nested-array: already an array of objects → works directly
      // - object: wrap in array so DuckDB creates a single-row table with top-level keys as columns
      const dataToRegister = Array.isArray(raw) ? raw : [raw];
      const jsonText = JSON.stringify(dataToRegister);

      await _db.registerFileText(`${tableName}.json`, jsonText);
      await _conn.query(
        `CREATE TABLE "${tableName}" AS SELECT * FROM read_json_auto('${tableName}.json', maximum_depth=-1)`
      );

      // Discover actual columns DuckDB created (includes nested STRUCTs, LISTs)
      const colInfo = await getTableColumns(tableName);
      dataset._duckColumns = colInfo;

      const rowCount = dataToRegister.length;
      Structra.log.info('DuckDB', `Registered "${tableName}" - shape:${meta.shape}, ${rowCount} rows, ${colInfo.length} columns (${colInfo.filter(c => c.nested).length} nested)`);
    } catch (err) {
      Structra.log.warn('DuckDB', `Registration failed for "${tableName}": ${err.message}`);
      // Table may not exist - that's OK, engine falls back to in-memory
    }
  }

  /**
   * Get column names and types for a registered table.
   * Returns [{name, type, nested}] where nested=true for STRUCT/LIST/MAP columns.
   */
  async function getTableColumns(tableName) {
    if (!_ready || !_conn) return [];
    const safeName = tableName.replace(/[^a-z0-9_]/gi, '_');
    try {
      const result = await _conn.query(
        `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '${safeName}' ORDER BY ordinal_position`
      );
      const cols = arrowToObjects(result);
      return cols.map(c => ({
        name: c.column_name,
        type: c.data_type,
        nested: /STRUCT|LIST|MAP|JSON/i.test(c.data_type),
      }));
    } catch {
      return [];
    }
  }

  /* --- Drop Table --- */
  async function dropTable(name) {
    if (!_ready || !_conn) return;
    const tableName = name.replace(/[^a-z0-9_]/gi, '_');
    await _conn.query(`DROP TABLE IF EXISTS "${tableName}"`);
    Structra.log.info('DuckDB', `Dropped table "${tableName}"`);
  }

  /* --- Close --- */
  async function close() {
    if (_conn) { await _conn.close(); _conn = null; }
    if (_db) { await _db.terminate(); _db = null; }
    _ready = false;
    Structra.log.info('DuckDB', 'Closed');
  }

  /* --- Public API --- */
  return {
    init,
    get ready() { return _ready; },
    query,
    registerDataset,
    getTableColumns,
    dropTable,
    close,
  };
})();
