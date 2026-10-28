/* The size of what the app loads before the first screen has a budget, so a new library or a big file that slips into the start is noticed.
   Measured on 2026-10-28 (tests/perf/startup-cost.js): 111 files, 1,971 KB, 701 KB gzipped. The limits below leave room for normal growth
   (about 15%); when one is hit, either the new code should load later (Structra.libraryLoader) or the budget is raised on purpose, here and in
   the map (section 8.11).

   Checked:
     - the first screen: number of files, total size, total gzipped size, biggest single file;
     - nothing heavy is fetched at start: DuckDB (the 35 MB engine), the large vendored libraries that load when used (Ajv, jsonrepair, papaparse,
       jsondiffpatch, modern-screenshot, the editor languages);
     - everything is served from this site (no other address is asked).

   Run:  node tests/smoke/startup-budget.js          (PW_CHANNEL=msedge uses the installed Edge; PW_BROWSER=firefox or webkit) */
const http = require('http');
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

let chromium;
try { ({ chromium } = require('playwright')); } catch {
  console.error('Playwright is not installed. Run: npm install --save-dev playwright && npx playwright install chromium');
  process.exit(2);
}

const { launchBrowser } = require('../launch-browser');
const ROOT = path.join(__dirname, '..', '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.woff2': 'font/woff2' };

// the budget (raw bytes unless said); measured 2026-10-28: 111 files, 2,018,000 bytes, 717,000 gzipped, biggest 303,000
const BUDGET = { files: 130, bytes: 2300 * 1024, gzipBytes: 830 * 1024, biggestFile: 340 * 1024 };
// libraries that must not be fetched before they are used
// (the 20 to 100 KB libraries papaparse, toml, yaml and json-p3 are loaded at start today; see map 8.11)
const LAZY = [/\/libs\/duckdb\//, /ajv\.min/, /jsonrepair/, /jsondiffpatch/, /modern-screenshot/, /\/codemirror6\/lang-/];

function serve() {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const file = path.join(ROOT, url === '/' ? 'index.html' : url);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

(async () => {
  const server = await serve();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await launchBrowser(chromium);
  const context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  await context.addInitScript(() => { try { localStorage.setItem('structra.welcomeSeen', '1'); } catch { /* storage blocked */ } });
  const page = await context.newPage();
  const failures = [];
  const fail = (message) => failures.push(message);
  const loaded = [];
  const elsewhere = [];
  page.on('requestfinished', (request) => {
    const url = request.url();
    if (!url.startsWith(origin)) { if (!/^(data|blob):/.test(url)) elsewhere.push(url); return; }
    const relative = url.replace(origin, '').split('?')[0];
    const file = path.join(ROOT, relative);
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      const bytes = fs.readFileSync(file);
      loaded.push({ url: relative, size: bytes.length, gzip: zlib.gzipSync(bytes, { level: 6 }).length });
    }
  });

  try {
    await page.goto(origin + '/index.html');
    await page.waitForSelector('#canvasEmpty input[type=file]', { state: 'attached', timeout: 20000 });
    await page.waitForTimeout(2500);        // the things that load when the page is idle (the editor) are part of the start
    const total = loaded.reduce((sum, item) => ({ size: sum.size + item.size, gzip: sum.gzip + item.gzip }), { size: 0, gzip: 0 });
    const biggest = loaded.reduce((big, item) => (item.size > big.size ? item : big), { size: 0, url: '' });
    const summary = `${loaded.length} files, ${Math.round(total.size / 1024)} KB, ${Math.round(total.gzip / 1024)} KB gzipped, biggest ${biggest.url} ${Math.round(biggest.size / 1024)} KB`;
    console.log('  start: ' + summary);
    if (loaded.length > BUDGET.files) fail(`more files at start than the budget (${BUDGET.files}): ${summary}`);
    if (total.size > BUDGET.bytes) fail(`more bytes at start than the budget (${Math.round(BUDGET.bytes / 1024)} KB): ${summary}`);
    if (total.gzip > BUDGET.gzipBytes) fail(`more gzipped bytes at start than the budget (${Math.round(BUDGET.gzipBytes / 1024)} KB): ${summary}`);
    if (biggest.size > BUDGET.biggestFile) fail(`one file at start is bigger than the budget (${Math.round(BUDGET.biggestFile / 1024)} KB): ${biggest.url} ${Math.round(biggest.size / 1024)} KB`);
    const early = loaded.filter((item) => LAZY.some((pattern) => pattern.test(item.url))).map((item) => item.url);
    if (early.length) fail('libraries that should load when used were fetched at start: ' + early.join(', '));
    if (elsewhere.length) fail('the app asked another address at start: ' + [...new Set(elsewhere)].slice(0, 3).join(', '));
  } catch (error) {
    fail('crashed: ' + String(error.message).split('\n')[0]);
  }

  await browser.close();
  server.close();
  if (failures.length) { console.log('startup-budget smoke test: FAILED\n - ' + failures.join('\n - ')); process.exit(1); }
  console.log('startup-budget smoke test: ok');
})();
