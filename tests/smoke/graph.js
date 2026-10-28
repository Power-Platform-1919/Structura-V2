/* Graph, Heatmap, Minimap and Diff: a small graph opens centred in the view, clicking a node selects it (path bar and highlight).

   Run:  node tests/smoke/graph.js          (PW_CHANNEL=msedge uses the installed Edge)
*/
const http = require('http');
const fs = require('fs');
const path = require('path');

let chromium;
try { ({ chromium } = require('playwright')); } catch {
  console.error('Playwright is not installed. Run: npm install --save-dev playwright && npx playwright install chromium');
  process.exit(2);
}

const { launchBrowser } = require('../launch-browser');
const { uploadAndWait } = require('../page-helpers');
const ROOT = path.join(__dirname, '..', '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' };

// The first-run welcome dialog opens a moment after load and would cover the page: tests start as a returning visitor
async function newCtx(browser, options) {
  const ctx = await browser.newContext(options);
  await ctx.addInitScript(() => { try { localStorage.setItem('structra.welcomeSeen', '1'); } catch { /* storage blocked */ } });
  return ctx;
}

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
  const base = `http://127.0.0.1:${server.address().port}/index.html`;
  const browser = await launchBrowser(chromium);
  const page = await (await newCtx(browser, { viewport: { width: 1360, height: 800 } })).newPage();
  const failures = [];
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));

  try {
    await page.goto(base);
    await page.waitForSelector('#canvasEmpty input[type=file]', { state: 'attached', timeout: 10000 });
    await page.keyboard.press('Escape');
    await uploadAndWait(page, path.join(ROOT, 'tests', 'fixtures', 'sp_getitems.json'));
    await page.evaluate(() => Structra.setState('activeView', 'graph'));
    await page.waitForTimeout(600);

    // ---- opens centred: the drawing sits in the middle of the view, not in the top left corner ----
    const box = await page.evaluate(() => {
      const c = document.querySelector('#graphContainer').getBoundingClientRect();
      const g = document.querySelector('.graph-group').getBoundingClientRect();
      return { left: g.left - c.left, right: c.right - g.right, top: g.top - c.top, bottom: c.bottom - g.bottom };
    });
    // A graph that fits is centred; one too big to be read when fitted opens at a readable zoom from the top left and scrolls
    const zoom = await page.evaluate(() => parseFloat(((document.querySelector('.graph-group').getAttribute('transform') || '').match(/scale\(([\d.]+)\)/) || [0, 1])[1]));
    const overflows = box.bottom < 0 || box.right < 0;
    if (overflows) {
      if (zoom < 0.54) failures.push('a big graph should open at a readable zoom (55 percent or more), it opened at ' + Math.round(zoom * 100) + ' percent');
      if (box.left < 0 || box.top < 0) failures.push('a big graph should start at the top left: ' + JSON.stringify(box));
    } else if (Math.abs(box.left - box.right) > 40 || Math.abs(box.top - box.bottom) > 40) failures.push('the graph should open centred in the view: ' + JSON.stringify(box));

    // ---- a click selects the node ----
    await page.locator('.graph-svg g[data-path="$.value[0].Title"]').first().click();
    await page.waitForTimeout(300);
    const sel = await page.evaluate(() => ({ path: Structra.state.currentPath, marked: [...document.querySelectorAll('.graph-node-selected')].map((r) => r.parentNode.dataset.path) }));
    if (sel.path !== '$.value[0].Title') failures.push('clicking a node should select its path: ' + JSON.stringify(sel));
    if (sel.marked.join() !== '$.value[0].Title') failures.push('the selected node should be highlighted: ' + JSON.stringify(sel));

    // ---- Heatmap colours the Tree lines, Minimap has a title and a close button, Diff labels its counts ----
    await page.evaluate(() => Structra.setState('activeView', 'tree'));
    await page.waitForTimeout(500);
    await page.evaluate(() => Structra.events.emit('heatmap:toggle'));
    await page.waitForTimeout(500);
    const heat = await page.evaluate(() => ({ coloured: document.querySelectorAll('.j-line[data-path]:not(.j-close)[style*="box-shadow"]').length, legend: (document.querySelector('.heatmap-indicator') || {}).textContent || '' }));
    if (heat.coloured < 5) failures.push('the Heatmap should colour the Tree lines, it coloured ' + heat.coloured);
    await page.locator('.heatmap-off').click();
    const heatOff = await page.evaluate(() => document.querySelectorAll('.j-line[style*="box-shadow"]').length);
    if (heatOff) failures.push('turning the Heatmap off should clear the colours, ' + heatOff + ' lines still have one');
    await page.evaluate(() => Structra.events.emit('minimap:toggle'));
    await page.waitForTimeout(300);
    const mm = await page.evaluate(() => { const m = document.querySelector('#minimapContainer'); return { shown: m.style.display !== 'none', title: (m.querySelector('.minimap-head') || {}).textContent || '', close: !!m.querySelector('.minimap-close') }; });
    if (!mm.shown || !/Minimap/.test(mm.title) || !mm.close) failures.push('the Minimap should show a title and a close button: ' + JSON.stringify(mm));
    await page.locator('.minimap-close').click();
    if (await page.evaluate(() => document.querySelector('#minimapContainer').style.display !== 'none')) failures.push('the Minimap close button does not close it');
    await page.evaluate(() => Structra.events.emit('diff:open', { left: { a: 1, b: 2, c: 3 }, right: { a: 1, b: 5, d: 4 } }));
    // wait for the result itself (a busy computer takes longer), not a fixed time
    await page.waitForFunction(() => /changed/.test((document.querySelector('#diffStats') || {}).textContent || ''), null, { timeout: 30000 }).catch(() => {});
    const stats = await page.evaluate(() => document.querySelector('#diffStats').textContent);
    if (!/added/.test(stats) || !/removed/.test(stats) || !/changed/.test(stats)) failures.push('the Diff counts should be labelled: "' + stats + '"');

    // ---- A long label wraps over lines in a taller node and keeps its full text as the name ----
    const wrapped = await page.evaluate(async () => {
      const long = 'a long title that does not fit on one line of a node';
      Structra.setState('activeView', 'graph');
      Structra.setState('jsonData', { short: 1, text: long, other: 2 });
      await new Promise((resolve) => setTimeout(resolve, 600));
      const node = [...document.querySelectorAll('structra-graph g[role=button]')].find((group) => (group.getAttribute('aria-label') || '').includes('a long title'));
      if (!node) return null;
      const rect = node.querySelector('rect');
      const small = [...document.querySelectorAll('structra-graph g[role=button]')].find((group) => group.getAttribute('aria-label') === 'short: 1');
      return { name: node.getAttribute('aria-label'), lines: node.querySelectorAll('tspan').length, height: Number(rect.getAttribute('height')), smallHeight: small ? Number(small.querySelector('rect').getAttribute('height')) : 0 };
    });
    if (!wrapped) failures.push('the node with the long label was not found');
    else {
      if (wrapped.lines < 2 || wrapped.lines > 3) failures.push('a long label should wrap over 2 or 3 lines: ' + JSON.stringify(wrapped));
      if (wrapped.height <= wrapped.smallHeight) failures.push('a wrapped node should be taller than a one-line node: ' + JSON.stringify(wrapped));
      if (!/^text: a long title/.test(wrapped.name)) failures.push('the node should keep its full label as its name: ' + wrapped.name);
    }
  } catch (err) {
    failures.push('crashed: ' + err.message.slice(0, 220));
  }
  if (errors.length) failures.push('page errors: ' + [...new Set(errors)].join(' | '));

  await browser.close();
  server.close();
  if (failures.length) { console.log('FAIL\n  ' + failures.join('\n  ')); process.exit(1); }
  console.log('graph smoke test: ok');
})();
