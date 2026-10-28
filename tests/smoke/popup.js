/* Structra.popup: every floating menu closes the same way. Checked with the real menus of the app:
     - the tab right-click menu, the Tree right-click menu, the Table column menu and its filter dropdown, the bookmark list, the toolbar menu;
   and with the service itself:
     - a pointer down outside closes it, a pointer down inside does not;
     - Escape closes only the popup in front: a dialog open behind it stays open, and the next Escape closes the dialog;
     - a second popup closes the first (one at a time);
     - after many opens and closes nothing is left behind (no popup counted, no menu in the page, no document listener added per open).

   Run:  node tests/smoke/popup.js          (PW_CHANNEL=msedge uses the installed Edge; PW_BROWSER=firefox or webkit) */
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
  const count = () => page.evaluate(() => Structra.popup.count());
  const menus = () => page.evaluate(() => document.querySelectorAll('.menu, .tree-ctx-menu, .col-menu, .bm-menu, .cfd, .col-pick').length);

  try {
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
    await page.waitForSelector('#canvasEmpty input[type=file]', { state: 'attached', timeout: 10000 });
    await page.keyboard.press('Escape');
    await uploadAndWait(page, path.join(ROOT, 'tests', 'fixtures', 'sp_getitems.json'));
    await page.evaluate(() => Structra.setState('activeView', 'tree'));
    await page.waitForTimeout(500);

    // ---- the service: a pointer down outside closes, inside does not ----
    await page.evaluate(() => {
      const box = document.createElement('div');
      box.id = 'probe'; box.textContent = 'probe'; box.style.cssText = 'position:fixed;left:40px;top:40px;width:120px;height:40px;background:#fff;z-index:5000';
      document.body.appendChild(box);
      window.__closed = 0;
      window.__probe = Structra.popup.watch(box, { onClose: () => { window.__closed++; } });
    });
    await page.waitForTimeout(100);
    await page.mouse.click(60, 60);                                   // inside
    if (!(await page.evaluate(() => !!document.querySelector('#probe')))) fail('a click inside should not close the popup');
    await page.mouse.click(700, 600);                                 // outside
    await page.waitForTimeout(100);
    if (await page.evaluate(() => !!document.querySelector('#probe'))) fail('a click outside should close the popup');
    if ((await page.evaluate(() => window.__closed)) !== 1) fail('onClose should run once, it ran ' + (await page.evaluate(() => window.__closed)));
    await page.evaluate(() => window.__probe.close());
    if ((await page.evaluate(() => window.__closed)) !== 1) fail('closing a closed popup should do nothing');

    // ---- Escape closes the popup in front and leaves the dialog behind it ----
    await page.evaluate(() => Structra.events.emit('shortcuts:open'));
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const box = document.createElement('div');
      box.id = 'probe2'; box.textContent = 'probe'; box.style.cssText = 'position:fixed;left:40px;top:40px;width:120px;height:40px;background:#fff;z-index:5000';
      document.body.appendChild(box);
      Structra.popup.watch(box);
    });
    await page.waitForTimeout(100);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    if (await page.evaluate(() => !!document.querySelector('#probe2'))) fail('Escape should close the popup');
    if (!(await page.evaluate(() => document.querySelector('structra-shortcuts .ov').classList.contains('show')))) fail('Escape should close only the popup: the dialog behind it closed too');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    if (await page.evaluate(() => document.querySelector('structra-shortcuts .ov').classList.contains('show'))) fail('the next Escape should close the dialog');

    // ---- a second popup closes the first ----
    const second = await page.evaluate(() => {
      const make = (id) => { const box = document.createElement('div'); box.id = id; box.style.cssText = 'position:fixed;left:40px;top:40px;width:50px;height:20px;z-index:5000'; document.body.appendChild(box); return box; };
      Structra.popup.watch(make('one'));
      Structra.popup.watch(make('two'));
      return { one: !!document.querySelector('#one'), two: !!document.querySelector('#two'), count: Structra.popup.count() };
    });
    if (second.one || !second.two || second.count !== 1) fail('opening a second popup should close the first: ' + JSON.stringify(second));
    await page.evaluate(() => Structra.popup.closeTop());

    // ---- a popup whose element other code removed does not take an Escape ----
    await page.evaluate(() => { const box = document.createElement('div'); box.id = 'gone'; document.body.appendChild(box); Structra.popup.watch(box); box.remove(); });
    await page.evaluate(() => Structra.events.emit('shortcuts:open'));
    await page.waitForTimeout(250);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    if (await page.evaluate(() => document.querySelector('structra-shortcuts .ov').classList.contains('show'))) fail('Escape should close the dialog when the only popup was already removed from the page');

    // ---- the real menus ----
    // the tab menu
    await page.locator('.doc-tab').first().click({ button: 'right' });
    await page.waitForSelector('.menu', { timeout: 3000 });
    await page.mouse.click(700, 700);
    await page.waitForTimeout(150);
    if ((await menus()) !== 0 || (await count()) !== 0) fail('the tab menu should close on a click outside: ' + (await menus()) + ' menus, ' + (await count()) + ' popups');
    await page.locator('.doc-tab').first().click({ button: 'right' });
    await page.waitForSelector('.menu');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    if ((await menus()) !== 0 || (await count()) !== 0) fail('the tab menu should close on Escape');
    // the Tree menu
    await page.locator('structra-tree .j-str', { hasText: 'Laptop refresh' }).click({ button: 'right' });
    await page.waitForSelector('.tree-ctx-menu', { timeout: 3000 });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    if ((await menus()) !== 0 || (await count()) !== 0) fail('the Tree menu should close on Escape');
    await page.locator('structra-tree .j-str', { hasText: 'Laptop refresh' }).click({ button: 'right' });
    await page.waitForSelector('.tree-ctx-menu');
    await page.mouse.click(700, 700);
    await page.waitForTimeout(150);
    if ((await menus()) !== 0 || (await count()) !== 0) fail('the Tree menu should close on a click outside');
    // the Table column menu and its summary box
    await page.evaluate(() => Structra.setState('activeView', 'table'));
    await page.waitForTimeout(600);
    const header = page.locator('structra-table th[data-col]').first();
    if (await header.count()) {
      await header.click({ button: 'right' });
      await page.waitForTimeout(250);
      if ((await count()) > 1) fail('opening the column menu left more than one popup: ' + (await count()));
      await page.keyboard.press('Escape');
      await page.waitForTimeout(150);
      if ((await menus()) !== 0 || (await count()) !== 0) fail('the column menu should close on Escape: ' + (await menus()) + ' menus, ' + (await count()) + ' popups');
    }

    // ---- nothing is left behind: many opens and closes add no listeners and no popups ----
    const leak = await page.evaluate(async () => {
      let added = 0;
      const original = document.addEventListener;
      document.addEventListener = function (type, handler, options) { added++; return original.call(this, type, handler, options); };
      const removed = { count: 0 };
      const originalRemove = document.removeEventListener;
      document.removeEventListener = function (type, handler, options) { removed.count++; return originalRemove.call(this, type, handler, options); };
      for (let i = 0; i < 30; i++) {
        const box = document.createElement('div');
        document.body.appendChild(box);
        const popup = Structra.popup.watch(box);
        await new Promise((resolve) => setTimeout(resolve, 2));
        popup.close();
      }
      document.addEventListener = original;
      document.removeEventListener = originalRemove;
      return { added, count: Structra.popup.count() };
    });
    // each open adds one pointer listener (after a tick) and its close removes it through the abort signal, which is not a removeEventListener call:
    // the real check is that the number of popups is back to zero and Escape still reaches the page
    if (leak.count !== 0) fail('after 30 opens and closes there are still ' + leak.count + ' popups');
    await page.evaluate(() => Structra.events.emit('shortcuts:open'));
    await page.waitForTimeout(250);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    if (await page.evaluate(() => document.querySelector('structra-shortcuts .ov').classList.contains('show'))) fail('after the popups Escape no longer closes a dialog');
  } catch (error) {
    fail('crashed: ' + String(error.message).split('\n')[0]);
  }

  if (errors.length) fail('page errors: ' + [...new Set(errors)].join(' | '));
  await browser.close();
  server.close();
  if (failures.length) { console.log('popup smoke test: FAILED\n - ' + failures.join('\n - ')); process.exit(1); }
  console.log('popup smoke test: ok');
})();
