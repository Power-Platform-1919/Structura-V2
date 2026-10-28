/* What the app loads before the first screen and what it loads when a file is opened, with sizes (as served, and gzipped as a host such as
   GitHub Pages sends them). Used to set the size budget that tests/smoke/startup-budget.js keeps.

   Usage:  PW_CHANNEL=msedge node tests/perf/startup-cost.js [json file to open afterwards] */
const http = require('http');
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');
const { chromium } = require('playwright');
const { launchBrowser } = require('../launch-browser');

const ROOT = path.join(__dirname, '..', '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.woff2': 'font/woff2' };

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

const kb = (bytes) => (bytes / 1024).toFixed(0).padStart(7) + ' KB';

(async () => {
  const server = await serve();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await launchBrowser(chromium);
  const context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  await context.addInitScript(() => { try { localStorage.setItem('structra.welcomeSeen', '1'); } catch { /* storage blocked */ } });
  const page = await context.newPage();
  const loaded = [];
  page.on('requestfinished', (request) => {
    const url = request.url().replace(origin, '');
    const file = path.join(ROOT, url.split('?')[0]);
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      const bytes = fs.readFileSync(file);
      loaded.push({ url: url.split('?')[0], size: bytes.length, gzip: zlib.gzipSync(bytes, { level: 6 }).length });
    } else loaded.push({ url, size: 0, gzip: 0 });
  });
  const started = Date.now();
  await page.goto(origin + '/index.html');
  await page.waitForSelector('#canvasEmpty input[type=file]', { state: 'attached', timeout: 20000 });
  const readyMs = Date.now() - started;
  await page.waitForTimeout(1500);
  const atStart = loaded.splice(0);
  const kind = (url) => (/\.js$|\.mjs$/.test(url) ? 'script' : /\.css$/.test(url) ? 'style' : /\.woff2?$/.test(url) ? 'font' : /\.html$|^\/$/.test(url) ? 'page' : /\.wasm$/.test(url) ? 'wasm' : 'other');
  const totals = {};
  for (const item of atStart) { const k = kind(item.url); totals[k] = totals[k] || { files: 0, size: 0, gzip: 0 }; totals[k].files++; totals[k].size += item.size; totals[k].gzip += item.gzip; }
  console.log(`First screen after ${readyMs} ms: ${atStart.length} files`);
  for (const [k, v] of Object.entries(totals)) console.log(`  ${k.padEnd(7)} ${String(v.files).padStart(3)} files ${kb(v.size)}   gzipped ${kb(v.gzip)}`);
  const all = atStart.reduce((sum, item) => ({ size: sum.size + item.size, gzip: sum.gzip + item.gzip }), { size: 0, gzip: 0 });
  console.log(`  total        ${kb(all.size)}   gzipped ${kb(all.gzip)}`);
  console.log('Biggest at start:');
  for (const item of atStart.sort((first, second) => second.size - first.size).slice(0, 12)) console.log(`  ${kb(item.size)}  gzip ${kb(item.gzip)}  ${item.url}`);
  const file = process.argv[2];
  if (file) {
    await page.locator('#canvasEmpty input[type=file]').setInputFiles(file);
    await page.waitForFunction(() => !!Structra.state.jsonData, null, { timeout: 120000 });
    await page.waitForTimeout(2500);
    const afterOpen = loaded.splice(0);
    const sum = afterOpen.reduce((total, item) => ({ size: total.size + item.size, gzip: total.gzip + item.gzip }), { size: 0, gzip: 0 });
    console.log(`When the file is opened (default view): ${afterOpen.length} more files ${kb(sum.size)}, gzipped ${kb(sum.gzip)}`);
    for (const item of afterOpen.sort((first, second) => second.size - first.size).slice(0, 8)) console.log(`  ${kb(item.size)}  gzip ${kb(item.gzip)}  ${item.url}`);
  }
  await browser.close();
  server.close();
})();
