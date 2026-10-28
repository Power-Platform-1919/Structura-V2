/* The same measurements as tests/perf/tree-spike.js, for our own Tree in the real app, on the same synthetic document:
   open, open one record, close it, collapse everything, expand everything (when the app allows it), scroll to the end.
   Used to compare the two designs in docs/codemirror-tree-research.md.

   Usage:  PW_CHANNEL=msedge node tests/perf/tree-ours.js <path to a .json file>        (PW_BROWSER=firefox or webkit) */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium, firefox, webkit } = require('playwright');
const { uploadAndWait } = require('../page-helpers');

const ROOT = path.join(__dirname, '..', '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' };
const file = process.argv[2];
if (!file) { console.log('Give the path of a JSON file'); process.exit(2); }
const engine = { chromium, firefox, webkit }[process.env.PW_BROWSER || 'chromium'];

function serve() {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const target = path.join(ROOT, url === '/' ? 'index.html' : url);
    if (!target.startsWith(ROOT) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(target).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

(async () => {
  const server = await serve();
  const browser = await engine.launch({ channel: process.env.PW_CHANNEL || undefined, args: process.env.PW_BROWSER ? [] : ['--enable-precise-memory-info'] });
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('structra.welcomeSeen', '1'); } catch { /* storage blocked */ } });
  const page = await ctx.newPage();
  page.on('pageerror', (error) => console.log('page error:', error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await page.waitForSelector('#canvasEmpty input[type=file]', { state: 'attached', timeout: 15000 });
  await page.keyboard.press('Escape');
  const opened = Date.now();
  await uploadAndWait(page, file, { timeout: 300000 });
  const openMs = Date.now() - opened;
  await page.evaluate(() => Structra.setState('activeView', 'tree'));
  await page.waitForSelector('structra-tree .j-line', { timeout: 120000 });

  const result = await page.evaluate(async () => {
    const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const time = async (fn) => { const start = performance.now(); await fn(); const changed = performance.now() - start; await frame(); return { changedMs: Math.round(changed * 10) / 10, paintedMs: Math.round((performance.now() - start) * 10) / 10 }; };
    const heap = () => (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null);
    const out = { heapMB: heap() };
    const view = document.querySelector('structra-tree .json-view') || document.querySelector('structra-tree');
    const toggle = () => document.querySelector('structra-tree .j-toggle[data-block]');
    // one block open and closed
    out.collapseOne = await time(async () => { const element = toggle(); if (element) element.click(); });
    out.expandOne = await time(async () => { const element = toggle(); if (element) element.click(); });
    // everything closed, then one level open
    out.collapseAll = await time(async () => { Structra.events.emit('command:run', 'collapse-all'); await new Promise((resolve) => setTimeout(resolve, 0)); });
    out.depthThree = await time(async () => { Structra.events.emit('command:run', 'depth-3'); await new Promise((resolve) => setTimeout(resolve, 0)); });
    out.expandAll = await time(async () => { Structra.events.emit('command:run', 'expand-all'); await new Promise((resolve) => setTimeout(resolve, 0)); });
    const scroller = document.querySelector('structra-tree .json-view') || document.querySelector('structra-tree [class*=scroll]') || view;
    out.scrollToEnd = await time(async () => { scroller.scrollTop = scroller.scrollHeight; });
    out.scrollToMiddle = await time(async () => { scroller.scrollTop = scroller.scrollHeight / 2; });
    out.domLines = document.querySelectorAll('structra-tree .j-line').length;
    out.heapEndMB = heap();
    return out;
  });
  console.log(JSON.stringify({ file: path.basename(file), engine: process.env.PW_BROWSER || (process.env.PW_CHANNEL || 'chromium'), openAppMs: openMs, ...result }, null, 2));
  await browser.close();
  server.close();
})();
