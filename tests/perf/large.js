/* Measures how the app copes with a big file: how long until the first view is usable,
   and the longest stretch in which the page could not respond (long tasks).

   Usage:  PW_CHANNEL=msedge node tests/perf/large.js <path to a .json file> [view]
   Example: PW_CHANNEL=msedge node tests/perf/large.js "C:/data/perf_150k_complex.json" overview
*/
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..', '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' };

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
  const file = process.argv[2];
  if (!file || !fs.existsSync(file)) { console.error('Give the path of a JSON file'); process.exit(2); }
  const view = process.argv[3] || 'overview';
  const server = await serve();
  const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
  const page = await (await browser.newContext()).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await page.waitForSelector('#canvasEmpty input[type=file]', { state: 'attached' });
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    window.__long = [];
    new PerformanceObserver((list) => { for (const e of list.getEntries()) window.__long.push(e.duration); }).observe({ entryTypes: ['longtask'] });
  });

  const t0 = Date.now();
  await page.locator('#canvasEmpty input[type=file]').setInputFiles(file);
  // Big files open on the tree; the Overview is timed from the moment it is asked for
  await page.waitForSelector('.j-line, .ovw-headline', { timeout: 300000 });
  const toFirstView = Date.now() - t0;
  let toOverview = null;
  if (view === 'overview') {
    const t1 = Date.now();
    await page.evaluate(() => Structra.set('activeView', 'overview'));
    await page.waitForSelector('.ovw-headline', { timeout: 300000 });
    toOverview = Date.now() - t1;
  }
  await page.waitForTimeout(1500);

  const info = await page.evaluate(() => {
    const long = window.__long;
    return {
      view: Structra.state.activeView,
      longTasks: long.length,
      longestFreezeMs: Math.round(Math.max(0, ...long)),
      totalFrozenMs: Math.round(long.reduce((a, b) => a + b, 0)),
      heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
    };
  });
  console.log(JSON.stringify({ file: path.basename(file), sizeMB: +(fs.statSync(file).size / 1048576).toFixed(1), msToFirstView: toFirstView, msToOverview: toOverview, ...info, errors }, null, 2));
  await browser.close();
  server.close();
})();
