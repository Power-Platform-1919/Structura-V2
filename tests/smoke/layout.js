/* Layout checks that need a real browser: every view that can hold more than the screen must scroll.

   Run:  node tests/smoke/layout.js          (PW_CHANNEL=msedge uses the installed Edge)
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
  const page = await (await newCtx(browser, { viewport: { width: 1280, height: 720 } })).newPage();
  const failures = [];
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));

  try {
    await page.goto(base);
    await page.waitForSelector('#canvasEmpty input[type=file]', { state: 'attached', timeout: 10000 });
    await page.keyboard.press('Escape');
    await uploadAndWait(page, path.join(FIXTURES, 'sp_getitems.json'));

    // ---- Overview scrolls with the mouse wheel, and its scroll area ends inside the view ----
    await page.evaluate(() => Structra.setState('activeView', 'overview'));
    await page.waitForTimeout(800);
    const ov = await page.evaluate(() => {
      const el = document.querySelector('structra-overview .stats-view');
      const panel = document.querySelector('structra-overview').getBoundingClientRect();
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, bottom: Math.round(r.bottom), panelBottom: Math.round(panel.bottom), viewport: innerHeight };
    });
    if (!ov) failures.push('Overview: no scroll area was drawn');
    else {
      if (ov.scrollHeight <= ov.clientHeight) failures.push(`Overview: the content (${ov.scrollHeight}px) fits its area (${ov.clientHeight}px), so this fixture cannot prove scrolling`);
      if (ov.bottom > ov.viewport) failures.push(`Overview: the scroll area ends at ${ov.bottom}px, below the window (${ov.viewport}px), so the end of the page cannot be reached`);
      await page.mouse.move(640, 300);
      await page.mouse.wheel(0, 2000);
      await page.waitForTimeout(400);
      const moved = await page.evaluate(() => document.querySelector('structra-overview .stats-view').scrollTop);
      if (moved <= 0) failures.push('Overview: the mouse wheel does not scroll it');
    }

    // ---- The Overview and the Analyze tab show the same figures: the drawer stays folded on the Overview ----
    const ovDrawer = await page.evaluate(() => document.querySelector('structra-drawer').getBoundingClientRect().height);
    if (ovDrawer > 60) failures.push(`Overview: the bottom drawer is open (${Math.round(ovDrawer)}px) and repeats the Overview's figures`);
    await page.evaluate(() => Structra.setState('activeView', 'tree'));
    await page.waitForTimeout(500);
    const treeDrawer = await page.evaluate(() => document.querySelector('structra-drawer').getBoundingClientRect().height);
    if (treeDrawer < 150) failures.push(`the drawer did not open when leaving the Overview (${Math.round(treeDrawer)}px)`);

    // ---- Toolbar: every button stays inside the toolbar at normal and narrow widths, with the side panels open ----
    await page.evaluate(() => { Structra.setState('activeView', 'tree'); Structra.setState('queryPanelOpen', true); Structra.setState('contextPanelOpen', true); });
    await page.evaluate(() => Structra.events.emit('tree:node-selected', '$.value[0].Title'));
    for (const width of [1440, 1100, 900, 820]) {
      await page.setViewportSize({ width, height: 760 });
      await page.waitForTimeout(400);
      const bar = await page.evaluate(() => {
        const header = document.querySelector('structra-canvas-header');
        const hr = header.getBoundingClientRect();
        // The row of view tabs may scroll when the window is narrow; every other button must stay inside the toolbar
        const outside = [...header.querySelectorAll('.toolbar-btn, .view-tabs')]
          .filter((b) => b.offsetParent !== null)
          .filter((b) => b.getBoundingClientRect().right > hr.right + 1)
          .map((b) => (b.dataset.action || 'view tabs'));
        const active = header.querySelector('.view-tab.active');
        const strip = header.querySelector('.view-tabs');
        if (active && strip) {
          const a = active.getBoundingClientRect(), s = strip.getBoundingClientRect();
          if (a.right > s.right + 1 || a.left < s.left - 1) outside.push('the open view tab');
        }
        const find = header.querySelector('[data-action="find"]');
        return { outside, findVisible: !!find && find.offsetParent !== null && find.getBoundingClientRect().right <= hr.right + 1 };
      });
      if (bar.outside.length) failures.push(`Toolbar at ${width}px: ${bar.outside.join(', ')} are cut off by the edge`);
      if (!bar.findVisible) failures.push(`Toolbar at ${width}px: the Find button is not reachable`);
    }
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForTimeout(300);

    // Buttons that only act on the Tree are not shown in the other views
    for (const view of ['table', 'graph', 'schema', 'editor', 'overview']) {
      await page.evaluate((v) => Structra.setState('activeView', v), view);
      await page.waitForTimeout(150);
      const shown = await page.evaluate(() => [...document.querySelectorAll('structra-canvas-header .tree-only')].filter((e) => e.offsetParent !== null).length);
      if (shown) failures.push(`Toolbar: ${shown} tree-only button(s) are shown in the ${view} view`);
    }
    await page.evaluate(() => Structra.setState('activeView', 'tree'));

    // ---- Find and Filter never sit on top of each other, and Find's X closes it ----
    await page.evaluate(() => Structra.setState('findBarOpen', true));
    await page.waitForTimeout(150);
    await page.evaluate(() => Structra.setState('filterBarOpen', true));
    await page.waitForTimeout(150);
    const both = await page.evaluate(() => ({ find: document.querySelector('.find-bar').classList.contains('show'), filter: document.querySelector('.filter-panel').classList.contains('show') }));
    if (both.find && both.filter) failures.push('Find and Filter are open at the same time');
    await page.evaluate(() => Structra.setState('filterBarOpen', false));
    await page.evaluate(() => Structra.setState('findBarOpen', true));
    await page.waitForTimeout(150);
    await page.locator('structra-find [data-action="close-find"]').click();
    await page.waitForTimeout(150);
    if (await page.evaluate(() => document.querySelector('.find-bar').classList.contains('show'))) failures.push('the X on the Find bar did not close it');

    // ---- Drawer: nothing without a document, one click folds it, and it can never take over the window ----
    const drawer = await page.evaluate(async () => {
      const d = document.querySelector('structra-drawer');
      // The drawer animates: wait until its height has stopped changing (a fixed wait is too short on a busy computer)
      const settled = async () => {
        let last = -1, steady = 0;
        for (let i = 0; i < 200 && steady < 5; i++) {
          await new Promise((r) => requestAnimationFrame(r));
          const now = d.getBoundingClientRect().height;
          steady = now === last ? steady + 1 : 0;
          last = now;
        }
        return last;
      };
      const h0 = d.getBoundingClientRect().height;
      d.querySelector('[data-action="cycle"]').click();
      const folded = await settled();
      d.querySelector('[data-action="cycle"]').click();
      const reopened = await settled();
      return { open: h0, folded, reopened, window: innerHeight, hiddenBefore: false };
    });
    if (!(drawer.folded < 60)) failures.push(`Drawer: one click on the arrow should fold it away, it is ${drawer.folded}px`);
    if (Math.abs(drawer.reopened - drawer.open) > 4) failures.push(`Drawer: a second click should bring it back to ${drawer.open}px, it is ${drawer.reopened}px`);
    if (drawer.open > drawer.window * 0.6) failures.push(`Drawer: ${drawer.open}px is more than 60% of the window (${drawer.window}px)`);
    await page.evaluate(() => { const bar = document.querySelector('#drawerResizeBar'); const r = bar.getBoundingClientRect(); window.__bar = { x: r.left + r.width / 2, y: r.top + 2 }; });
    const pt = await page.evaluate(() => window.__bar);
    await page.mouse.move(pt.x, pt.y);
    await page.mouse.down();
    await page.mouse.move(pt.x, 5, { steps: 6 });
    await page.mouse.up();
    const dragged = await page.evaluate(() => ({ h: document.querySelector('structra-drawer').getBoundingClientRect().height, w: innerHeight }));
    if (dragged.h > dragged.w * 0.61) failures.push(`Drawer: dragging it to the top gave ${dragged.h}px, more than 60% of ${dragged.w}px`);

    // ---- With no document open there is no drawer to get in the way ----
    await page.evaluate(() => Structra.setState('jsonData', null));
    await page.waitForTimeout(300);
    const noDoc = await page.evaluate(() => document.querySelector('structra-drawer').offsetParent !== null);
    if (noDoc) failures.push('the drawer is still shown when no document is open');
  } catch (err) {
    failures.push('crashed: ' + err.message.slice(0, 200));
  }
  if (errors.length) failures.push('page errors: ' + [...new Set(errors)].join(' | '));

  await browser.close();
  server.close();
  if (failures.length) { console.log('FAIL\n  ' + failures.join('\n  ')); process.exit(1); }
  console.log('layout smoke test: ok');
})();
