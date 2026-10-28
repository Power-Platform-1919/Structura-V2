/* How many copies of a big document the page keeps. A document of 100,000 records (about 11 MB of text) is opened, then the Tree, the Overview
   and the Table are shown. Measured on 2026-10-28 in Edge: opening adds about 24 MB beyond the document itself with a forced collection (2.2 times its
   text: the undo copy and the analysis) and about 48 MB without one (the test does not force it), and showing the views adds nothing. The limits leave room: a second or third whole copy of the document that
   slips in (a library that keeps its own, a cache that is never emptied) shows as a jump.

   Only Chromium tells the page's memory (performance.memory), so Firefox and WebKit skip this test and say so. The memory of the whole browser
   in every engine is measured by tests/perf/large-engines.js (map 8.8).

   Run:  PW_CHANNEL=msedge node tests/smoke/memory-budget.js */
const http = require('http');
const fs = require('fs');
const path = require('path');

let chromium;
try { ({ chromium } = require('playwright')); } catch {
  console.error('Playwright is not installed. Run: npm install --save-dev playwright && npx playwright install chromium');
  process.exit(2);
}

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

(async () => {
  const server = await serve();
  const browser = await launchBrowser(chromium);
  const context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  await context.addInitScript(() => { try { localStorage.setItem('structra.welcomeSeen', '1'); } catch { /* storage blocked */ } });
  const page = await context.newPage();
  const failures = [];
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
  const fail = (message) => failures.push(message);

  try {
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
    await page.waitForSelector('#canvasEmpty input[type=file]', { state: 'attached', timeout: 10000 });
    await page.keyboard.press('Escape');
    const hasMemory = await page.evaluate(() => !!(performance && performance.memory));
    if (!hasMemory) {
      console.log('memory-budget smoke test: skipped (this engine does not tell the page memory)');
    } else {
      const out = await page.evaluate(async () => {
        const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const heap = async () => { await wait(400); return Math.round(performance.memory.usedJSHeapSize / 1048576); };
        const base = await heap();
        const data = Array.from({ length: 100000 }, (_, i) => ({ id: i, name: 'item ' + i, tags: ['a', 'b'], owner: { mail: 'p' + i + '@x.com', roles: [] }, note: null, price: i / 4 }));
        const jsonMb = Math.round(JSON.stringify(data).length / 1048576);
        const own = (await heap()) - base;
        Structra.setState('jsonData', data);
        await wait(2500);
        const opened = (await heap()) - base;
        const shown = {};
        for (const view of ['tree', 'overview', 'table']) { Structra.setState('activeView', view); await wait(1500); shown[view] = (await heap()) - base; }
        return { jsonMb, own, opened, shown };
      });
      console.log('  ' + JSON.stringify(out));
      const extra = out.opened - out.own;                      // beyond the document the test itself holds
      if (extra > out.jsonMb * 5 + 40) fail(`opening a ${out.jsonMb} MB document added ${extra} MB beyond the document (the limit is ${out.jsonMb * 5 + 40} MB): another copy of it is being kept`);
      for (const [view, size] of Object.entries(out.shown)) {
        if (size - out.opened > out.jsonMb + 20) fail(`showing the ${view} added ${size - out.opened} MB (the limit is ${out.jsonMb + 20} MB)`);
      }
    }
  } catch (error) {
    fail('crashed: ' + String(error.message).split('\n')[0]);
  }

  if (errors.length) fail('page errors: ' + [...new Set(errors)].join(' | '));
  await browser.close();
  server.close();
  if (failures.length) { console.log('memory-budget smoke test: FAILED\n - ' + failures.join('\n - ')); process.exit(1); }
  console.log('memory-budget smoke test: ok');
})();
