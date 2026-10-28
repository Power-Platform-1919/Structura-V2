// window.runBench({ module, wasm, worker, rows }) loads the build named by those three addresses and returns the timings
window.benchReady = true;
window.runBench = async (options) => {
  const lib = await import(options.module);
  const out = {};
  const time = async (name, work) => { const start = performance.now(); const value = await work(); out[name] = Math.round(performance.now() - start); return value; };
  const memory = () => (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null);
  const worker = await time('workerStartMs', async () => new Worker(URL.createObjectURL(new Blob([`importScripts("${options.worker}");`], { type: 'text/javascript' }))));
  const db = new lib.AsyncDuckDB(new lib.ConsoleLogger(lib.LogLevel ? lib.LogLevel.WARNING : 0), worker);
  await time('instantiateMs', () => db.instantiate(options.wasm, null));
  await time('openMs', () => db.open({}));
  const connection = await db.connect();
  out.version = (await connection.query('SELECT version() AS v')).toArray()[0].v;
  const rows = options.rows;
  await time('createTableMs', () => connection.query(`CREATE TABLE data AS SELECT i AS id, 'item ' || i AS name, i % 10 AS grp, (i * 37 % 1000) / 10.0 AS price, CASE WHEN i % 7 = 0 THEN NULL ELSE 'v' || (i % 50) END AS tag FROM range(${rows}) t(i)`));
  const queries = {
    countMs: 'SELECT COUNT(*) FROM data',
    groupByMs: 'SELECT grp, COUNT(*), SUM(price), AVG(price) FROM data GROUP BY grp ORDER BY grp',
    filterLikeMs: "SELECT COUNT(*) FROM data WHERE name LIKE '%99%'",
    orderLimitMs: 'SELECT * FROM data ORDER BY price DESC, id LIMIT 100',
    distinctMs: 'SELECT COUNT(DISTINCT tag) FROM data',
    pivotLikeMs: 'SELECT grp, tag, COUNT(*) FROM data GROUP BY grp, tag',
    summarizeMs: 'SUMMARIZE data',
  };
  for (const [name, sql] of Object.entries(queries)) {
    await connection.query(sql);                       // first run (plan and cache warm up)
    const runs = [];
    for (let i = 0; i < 3; i++) { const start = performance.now(); await connection.query(sql); runs.push(performance.now() - start); }
    out[name] = Math.round(Math.min(...runs));
  }
  out.heapMb = memory();
  await connection.close();
  await db.terminate();
  return out;
};
