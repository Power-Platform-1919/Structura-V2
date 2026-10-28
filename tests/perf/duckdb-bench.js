/* Measures a DuckDB-Wasm build on 100,000 rows: worker start, instantiate, open, create, and the best of 3 runs of seven queries.
   Several builds are compared by listing them: name=folder,module,wasm,worker (files in that folder).

   Usage:  PW_CHANNEL=msedge node tests/perf/duckdb-bench.js [rows] current=src/libs/duckdb,duckdb-wasm.mjs,duckdb-eh.wasm,duckdb-browser-eh.worker.js \
             other=<folder>,duckdb-browser.mjs,duckdb-eh.wasm,duckdb-browser-eh.worker.js
   Builds from the newer npm packages import apache-arrow by name: add  arrow=<folder holding arrow.bundle.mjs>  (an esbuild bundle of apache-arrow).
   (each build is measured in its own page, so they do not disturb each other) */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..', '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json' };
const args = process.argv.slice(2);
const rows = /^\d+$/.test(args[0] || '') ? Number(args.shift()) : 100000;
const builds = args.map((text) => { const [name, rest] = text.split('='); const [folder, module, wasm, worker] = rest.split(','); return { name, folder: path.resolve(folder), module, wasm, worker }; });

function serve() {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    let file = path.join(ROOT, url);
    const match = /^\/build\/([^/]+)\/(.+)$/.exec(url);
    if (match) file = path.join(builds.find((build) => build.name === match[1]).folder, match[2]);
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

(async () => {
  const server = await serve();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined, args: ['--enable-precise-memory-info'] });
  const results = {};
  for (const build of builds.filter((item) => item.module)) {
    const page = await browser.newPage();
    page.on('pageerror', (error) => console.log(build.name, 'page error:', error.message));
    await page.goto(`${origin}/tests/perf/duckdb-bench/index.html`);
    await page.waitForFunction(() => window.benchReady === true);
    const base = `${origin}/build/${build.name}/`;
    try {
      const size = fs.statSync(path.join(build.folder, build.wasm)).size;
      const result = await page.evaluate((options) => window.runBench(options), { module: base + build.module, wasm: base + build.wasm, worker: base + build.worker, rows });
      results[build.name] = { wasmMb: Math.round(size / 104857.6) / 10, ...result };
    } catch (error) { results[build.name] = { error: String(error.message).split('\n')[0] }; }
    await page.close();
  }
  console.log(JSON.stringify({ rows, results }, null, 1));
  await browser.close();
  server.close();
})();
