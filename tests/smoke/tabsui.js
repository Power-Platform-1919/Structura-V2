/* Document tabs: drag to reorder, a right-click menu, closing can be undone with Reopen, keyboard arrows.

   Run:  node tests/smoke/tabsui.js          (PW_CHANNEL=msedge uses the installed Edge)
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
const FIXTURES = path.join(ROOT, 'tests', 'fixtures');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' };
const DOCS = ['jsonobject.json', 'test8_toplevel_array.json', 'edge_odata.json'];

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
  const order = () => page.evaluate(() => Structra.tabs.list.map((t) => t.label));
  const active = () => page.evaluate(() => Structra.tabs.list.find((t) => t.id === Structra.tabs.activeId)?.label);

  try {
    await page.goto(base);
    await page.waitForSelector('#canvasEmpty input[type=file]', { state: 'attached', timeout: 10000 });
    await page.keyboard.press('Escape');
    for (let i = 0; i < DOCS.length; i++) {
      if (i) await page.evaluate(() => Structra.events.emit('tabs:add'));
      await uploadAndWait(page, path.join(FIXTURES, DOCS[i]));
    }
    let names = await order();
    if (names.join() !== DOCS.join()) failures.push('tabs are not in the order they were opened: ' + names.join());

    // ---- drag the last tab to the front ----
    await page.locator('.doc-tab', { hasText: 'edge_odata' }).dragTo(page.locator('.doc-tab', { hasText: 'jsonobject' }), { targetPosition: { x: 4, y: 10 } });
    await page.waitForTimeout(300);
    names = await order();
    if (names[0] !== 'edge_odata.json') failures.push('dragging a tab to the front did not move it: ' + names.join());

    // ---- keyboard arrows ----
    await page.locator('.doc-tab.active').focus();
    const first = await active();
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(500);
    if ((await active()) === first) failures.push('the right arrow key did not move to the next tab');

    // ---- right-click menu: Duplicate ----
    const countBefore = (await order()).length;
    await page.locator('.doc-tab', { hasText: 'jsonobject' }).click({ button: 'right' });
    await page.locator('.menu .menu-item', { hasText: 'Duplicate' }).click();
    await page.waitForTimeout(900);
    names = await order();
    if (names.length !== countBefore + 1 || !names.some((n) => /jsonobject.*\(copy\)/.test(n))) failures.push('Duplicate did not make a copy of the tab: ' + names.join());
    const same = await page.evaluate(() => { const t = Structra.tabs.list.find((x) => /\(copy\)/.test(x.label)); const o = Structra.tabs.list.find((x) => x.label === 'jsonobject.json'); return !!t && !!o && JSON.stringify(t.data) === JSON.stringify(o.data) && JSON.stringify(Structra.state.jsonData) === JSON.stringify(o.data); });
    if (!same) failures.push('the duplicate does not hold the same data');

    // ---- closing is not final ----
    await page.locator('.doc-tab', { hasText: '(copy)' }).locator('.tab-close').click();
    await page.waitForTimeout(400);
    const toast = await page.evaluate(() => ({ text: document.querySelector('#toastMsg').textContent, action: document.querySelector('#toastAction').hidden ? '' : document.querySelector('#toastAction').textContent }));
    if (!/Closed/.test(toast.text) || toast.action !== 'Reopen') failures.push('closing a tab should offer Reopen: ' + JSON.stringify(toast));
    if ((await order()).some((n) => /\(copy\)/.test(n))) failures.push('the tab was not closed');
    await page.locator('#toastAction').click();
    await page.waitForTimeout(900);
    names = await order();
    if (!names.some((n) => /\(copy\)/.test(n))) failures.push('Reopen did not bring the tab back: ' + names.join());
    const back = await page.evaluate(() => JSON.stringify(Structra.state.jsonData) === JSON.stringify(Structra.tabs.list.find((t) => t.id === Structra.tabs.activeId).data) && !!Structra.dataEngine.getActive() && Structra.dataEngine.getActive().id === Structra.tabs.activeId);
    if (!back) failures.push('the reopened tab is not showing its data');

    // ---- Close other tabs ----
    await page.locator('.doc-tab', { hasText: 'test8' }).click({ button: 'right' });
    await page.locator('.menu .menu-item', { hasText: 'Close other tabs' }).click();
    await page.waitForTimeout(600);
    names = await order();
    if (names.length !== 1 || names[0] !== 'test8_toplevel_array.json') failures.push('Close other tabs left: ' + names.join());
  } catch (err) {
    failures.push('crashed: ' + err.message.slice(0, 220));
  }
  if (errors.length) failures.push('page errors: ' + [...new Set(errors)].join(' | '));

  await browser.close();
  server.close();
  if (failures.length) { console.log('FAIL\n  ' + failures.join('\n  ')); process.exit(1); }
  console.log('tabs ui smoke test: ok');
})();
