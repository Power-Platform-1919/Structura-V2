/* The Transform tab: every one-click preset must run on the open file and give a result,
   and a result can be opened in a new tab without changing the file.

   Run:  node tests/smoke/transform.js          (PW_CHANNEL=msedge uses the installed Edge)
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
const DOCS = ['sp_getitems.json', 'test8_toplevel_array.json', 'jsonobject.json'];

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
  const failures = [];

  for (const file of DOCS) {
    const page = await (await newCtx(browser, { viewport: { width: 1360, height: 800 } })).newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
    try {
      await page.goto(base);
      await page.waitForSelector('#canvasEmpty input[type=file]', { state: 'attached', timeout: 10000 });
      await page.keyboard.press('Escape');
      await uploadAndWait(page, path.join(FIXTURES, file));
      const original = await page.evaluate(() => JSON.stringify(Structra.state.jsonData));

      await page.evaluate(() => Structra.setState('queryPanelOpen', true));
      await page.waitForTimeout(300);
      await page.locator('[data-qtab="transform"]').click();

      const presets = await page.evaluate(() => [...document.querySelectorAll('#transformPresets [data-preset]')].map((b) => ({ label: b.textContent, expr: b.dataset.preset })));
      if (presets.length < 2) failures.push(`${file}: only ${presets.length} preset(s) were offered`);

      for (const p of presets) {
        await page.evaluate((expr) => { document.querySelector('#qpAdvanced').open = true; document.querySelector('#transformInput').value = expr; }, p.expr);
        await page.locator('[data-action="runTransform"]').click();
        await page.waitForTimeout(150);
        const out = await page.evaluate(() => (document.querySelector('#queryResults .qp-summary') || {}).textContent || '');
        const isError = await page.evaluate(() => !!document.querySelector('#queryResults .is-error'));
        if (isError) failures.push(`${file}: preset "${p.label}" (${p.expr}) failed: ${out}`);
        else if (/found nothing/.test(out)) failures.push(`${file}: preset "${p.label}" (${p.expr}) found nothing`);
      }

      // Open the last result in a new tab; the file itself must not change
      const tabsBefore = await page.evaluate(() => Structra.tabs.list.length);
      const openBtn = page.locator('[data-action="openTransform"]');
      if (await openBtn.count()) {
        await openBtn.first().click();
        await page.waitForTimeout(800);
        const after = await page.evaluate(() => ({ tabs: Structra.tabs.list.length }));
        if (after.tabs !== tabsBefore + 1) failures.push(`${file}: "Open result in a new tab" did not open a tab`);
        await page.evaluate((id) => document.querySelector(`.doc-tab[data-id="${id}"]`).click(), 1);
        await page.waitForTimeout(600);
        const back = await page.evaluate(() => JSON.stringify(Structra.state.jsonData));
        if (back !== original) failures.push(`${file}: the file changed after opening a transform result`);
      } else failures.push(`${file}: no "Open result in a new tab" button after a transform`);
    } catch (err) {
      failures.push(`${file}: crashed: ${err.message.slice(0, 200)}`);
    }
    if (errors.length) failures.push(`${file}: page errors: ${[...new Set(errors)].join(' | ')}`);
    await page.close();
  }

  await browser.close();
  server.close();
  if (failures.length) { console.log('FAIL\n  ' + failures.join('\n  ')); process.exit(1); }
  console.log('transform smoke test: ok');
})();
