/* Opening and keeping documents: a pasted document is named by its format, the paste box starts empty for the next one,
   Recent entries can be removed, snippets say what is wrong, Appearance describes the chosen mode, Ctrl+K works after a chip click.

   Run:  node tests/smoke/inputs.js          (PW_CHANNEL=msedge uses the installed Edge)
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

    // ---- paste: named by format, box emptied afterwards ----
    await page.evaluate(() => Structra.events.emit('input:show-tab', 'text'));
    await page.locator('[data-role="paste-input"]').first().fill('{"a": 1, "list": [{"x": 1}, {"x": 2}]}');
    await page.locator('[data-action="parse-text"]').first().click();
    await page.waitForTimeout(1200);
    const label = await page.evaluate(() => Structra.tabs.list.find((t) => t.id === Structra.tabs.activeId).label);
    if (label !== 'Pasted JSON') failures.push('a pasted document should be named "Pasted JSON": "' + label + '"');
    const left = await page.evaluate(() => [...document.querySelectorAll('[data-role="paste-input"]')].map((t) => t.value).join(''));
    if (left) failures.push('the paste box keeps the previous text: ' + left.slice(0, 40));

    // ---- Ctrl+K right after clicking the SQL chip ----
    await page.locator('#statusDuck').click();
    await page.keyboard.press('Control+k');
    await page.waitForTimeout(300);
    const palette = await page.evaluate(() => !!document.querySelector('#cmdOverlay.show'));
    if (!palette) failures.push('Ctrl+K does not open the command palette after clicking the SQL chip');
    await page.keyboard.press('Escape');

    // ---- Appearance hint follows the chosen mode ----
    await page.evaluate(() => Structra.events.emit('theme:open'));
    await page.waitForTimeout(300);
    await page.locator('#thMode [data-mode="light"]').click();
    const hint = await page.locator('#thModeHint').textContent();
    if (!/Always light/.test(hint)) failures.push('the Appearance hint should describe Light: "' + hint + '"');
    await page.locator('#thMode [data-mode="system"]').click();
    await page.keyboard.press('Escape');

    // ---- Snippets: an empty name is explained next to the field ----
    await page.evaluate(() => Structra.events.emit('snippets:open'));
    await page.waitForTimeout(300);
    await page.locator('[data-action="save-current"]').click();
    await page.locator('#snipName').fill('');
    await page.locator('[data-action="confirm-save"]').click();
    const snip = await page.evaluate(() => ({ err: (document.querySelector('#snipError') || {}).textContent || '', invalid: document.querySelector('#snipName').getAttribute('aria-invalid') }));
    if (!/name/.test(snip.err) || snip.invalid !== 'true') failures.push('saving a snippet without a name should say so next to the field: ' + JSON.stringify(snip));
    await page.keyboard.press('Escape');

    // ---- Recent: each entry can be removed and reached with the keyboard ----
    await page.evaluate(() => Structra.events.emit('tabs:add'));
    await page.waitForTimeout(400);
    await page.evaluate(() => Structra.events.emit('input:show-tab', 'recent'));
    await page.waitForTimeout(500);
    const prev = await page.evaluate(() => (document.querySelector('.io-recent-preview') || {}).textContent || '');
    if (!/^Fields: /.test(prev) || /: 1/.test(prev)) failures.push('a Recent entry should preview field names, not values: "' + prev + '"');
    const before = await page.evaluate(() => document.querySelectorAll('.io-recent-item').length);
    if (before < 1) failures.push('Recent should list the pasted document');
    else {
      const focusable = await page.evaluate(() => document.querySelector('.io-recent-item').getAttribute('tabindex'));
      if (focusable !== '0') failures.push('Recent entries cannot be reached with the keyboard');
      await page.locator('.io-recent-remove').first().click();
      await page.waitForTimeout(400);
      const after = await page.evaluate(() => document.querySelectorAll('.io-recent-item').length);
      if (after !== before - 1) failures.push('removing a Recent entry should leave ' + (before - 1) + ', there are ' + after);
    }

    // ---- Find counts every matching value, and shows it inside the record that holds it ----
    await page.evaluate(() => Structra.events.emit('tabs:add'));
    await uploadAndWait(page, path.join(ROOT, 'tests', 'fixtures', 'sp_getitems.json'));
    await page.evaluate(() => Structra.setState('activeView', 'tree'));
    const expected = await page.evaluate(() => { let n = 0; const walk = (v) => { if (v && typeof v === 'object') Object.values(v).forEach(walk); else if (typeof v === 'string' && /contoso/i.test(v)) n++; }; walk(Structra.state.jsonData); return n; });
    await page.evaluate(() => Structra.setState('findBarOpen', true));
    await page.locator('#findInput').fill('contoso');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(900);
    const found = await page.evaluate(() => ({ count: document.querySelector('#findCount').textContent, lit: document.querySelectorAll('.j-line.find-match').length, visible: [...document.querySelectorAll('.j-line:not(.filter-hidden):not(.j-close)')].length }));
    if (found.count !== expected + ' found') failures.push('Find should count every matching value (' + expected + '): "' + found.count + '"');
    if (found.lit < 1) failures.push('the matching lines should be highlighted in the Tree');
    if (found.visible <= found.lit) failures.push('the lines around a match (its record) should stay visible: ' + JSON.stringify(found));
    await page.evaluate(() => Structra.setState('findBarOpen', false));

    // ---- Workspace: all open tabs are saved, and importing opens them as new tabs ----
    const snap = await page.evaluate(() => document.querySelector('structra-workspace')._tabsSnapshot().map((t) => t.label));
    const tabCount = await page.evaluate(() => Structra.tabs.list.length);
    if (snap.length !== 2) failures.push('the workspace should hold both tabs that have data: ' + snap.join(', '));
    const ws = JSON.stringify({ type: 'structra-workspace', version: 3, tabs: [{ label: 'One', data: { a: 1 } }, { label: 'Two', data: [{ b: 2 }] }], snippets: [] });
    await page.evaluate(() => Structra.events.emit('workspace:open'));
    await page.waitForTimeout(300);
    await page.locator('#wsImportFile').setInputFiles({ name: 'w.structra', mimeType: 'application/json', buffer: Buffer.from(ws) });
    await page.locator('structra-workspace [data-action="import"]').click();
    await page.waitForTimeout(2500);
    const after = await page.evaluate(() => Structra.tabs.list.map((t) => t.label));
    if (after.length !== tabCount + 2 || !after.includes('One') || !after.includes('Two')) failures.push('importing should add the two saved tabs and keep the open ones: ' + after.join(', '));

    // ---- Share link: keeps the file name, stays in the address bar after opening ----
    const link = await page.evaluate(async () => (await Structra.shareLink.createUrl({ k: [1, 2, 3] }, 'orders.json')).url);
    await page.goto('about:blank');
    await page.goto(link);
    await page.waitForTimeout(2000);
    const shared = await page.evaluate(() => ({ name: Structra.state.fileName, hash: location.hash.slice(0, 7) }));
    if (shared.name !== 'orders.json') failures.push('a shared document should keep its file name: ' + shared.name);
    if (shared.hash !== '#share=') failures.push('the share link should stay in the address bar so a refresh works: "' + shared.hash + '"');

    // ---- Bookmarks: a list you can open, with a count ----
    await page.goto(base);
    await page.waitForSelector('#canvasEmpty input[type=file]', { state: 'attached', timeout: 10000 });
    await page.keyboard.press('Escape');
    await uploadAndWait(page, path.join(ROOT, 'tests', 'fixtures', 'sp_getitems.json'));
    await page.evaluate(() => { Structra.setState('currentPath', '$.value[0].Title'); });
    await page.locator('structra-header [data-action="bookmark"]').click();
    await page.waitForTimeout(200);
    if ((await page.locator('#bmCount').textContent()) !== '1') failures.push('the bookmark button should show a count of 1');
    await page.locator('structra-header [data-action="bookmarks"]').click();
    const bm = await page.evaluate(() => [...document.querySelectorAll('.bm-item .bm-path')].map((e) => e.textContent));
    if (bm.join() !== '$.value[0].Title') failures.push('the bookmark list should show the bookmarked path: ' + bm.join());
    await page.locator('.bm-item').first().click();
    await page.waitForTimeout(400);
    if (await page.evaluate(() => Structra.state.currentPath) !== '$.value[0].Title') failures.push('clicking a bookmark should go to it');

    // ---- Drawer: the height you dragged it to is kept ----
    const bar = await page.locator('#drawerResizeBar').boundingBox();
    await page.mouse.move(bar.x + 40, bar.y + 2);
    await page.mouse.down();
    await page.mouse.move(bar.x + 40, bar.y - 90, { steps: 5 });
    await page.mouse.up();
    const dragged = await page.evaluate(() => Math.round(document.querySelector('structra-drawer').offsetHeight));
    await page.evaluate(() => { Structra.setState('drawerState', 'collapsed'); });
    await page.waitForTimeout(200);
    await page.evaluate(() => { Structra.setState('drawerState', 'medium'); });
    await page.waitForTimeout(300);
    const again = await page.evaluate(() => Math.round(document.querySelector('structra-drawer').offsetHeight));
    if (Math.abs(again - dragged) > 4) failures.push('the drawer should reopen at the height it was dragged to (' + dragged + '): ' + again);

    // ---- A second document starts on Analyze and its Tree has no repeated lines after switching back and forth ----
    await page.evaluate(() => Structra.events.emit('drawer:show', 'expressions'));
    await page.evaluate(() => Structra.events.emit('tabs:add'));
    await uploadAndWait(page, path.join(ROOT, 'tests', 'fixtures', 'edge_odata.json'));
    const tabNow = await page.evaluate(() => (document.querySelector('.drawer-tabs .tab.active') || {}).dataset.tab);
    if (tabNow !== 'analyze') failures.push('a newly opened document should start on the Analyze tab, the drawer is on: ' + tabNow);
    await page.evaluate(() => Structra.setState('activeView', 'tree'));
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => { const other = Structra.tabs.list.find((x) => x.id !== Structra.tabs.activeId); document.querySelector('structra-tabs')._switchTab(other.id); });
      await page.waitForTimeout(600);
    }
    const dup = await page.evaluate(() => { const ln = [...document.querySelectorAll('.json-view .j-line')].map((e) => e.dataset.ln); return ln.length - new Set(ln).size; });
    if (dup) failures.push('the Tree repeats ' + dup + ' lines after switching documents');

    // ---- Settings: the gear opens Settings with saved-data controls ----
    await page.locator('[data-rail="settings"]').click();
    await page.waitForTimeout(300);
    const set = await page.evaluate(() => { const d = document.querySelector('structra-settings .ov'); return { open: !!d && d.classList.contains('show'), text: d ? d.textContent : '' }; });
    if (!set.open || !/Appearance/.test(set.text) || !/Saved in this browser/.test(set.text) || !/SQL engine/.test(set.text)) failures.push('the gear should open Settings: ' + JSON.stringify(set).slice(0, 120));
    await page.evaluate(() => localStorage.setItem('structra_snippets', JSON.stringify([{ name: 'x', content: '{}', size: 2 }])));
    await page.evaluate(() => Structra.events.emit('settings:open'));
    await page.evaluate(() => document.querySelector('structra-settings')._renderSaved());
    await page.locator('[data-clear="structra_snippets"]').click();
    await page.locator('[data-clear="structra_snippets"]').click();
    if (await page.evaluate(() => localStorage.getItem('structra_snippets'))) failures.push('Clear (twice) should remove the saved snippets');
    await page.keyboard.press('Escape');

    // ---- Wrap says what it did, the theme editor has one set of buttons, the URL tab explains itself ----
    await page.evaluate(() => Structra.setState('activeView', 'tree'));
    await page.locator('structra-canvas-header [data-action="wrap"]').click();
    await page.waitForTimeout(300);
    const wrap = await page.evaluate(() => ({ pressed: document.querySelector('structra-canvas-header [data-action="wrap"]').getAttribute('aria-pressed'), cls: document.querySelector('#jsonView').classList.contains('wrap-mode'), toast: document.querySelector('structra-toast').textContent }));
    if (wrap.pressed !== 'true' || !wrap.cls || !/wrap onto several lines/.test(wrap.toast)) failures.push('Wrap should show it is on and say what it does: ' + JSON.stringify(wrap).slice(0, 160));
    await page.locator('structra-canvas-header [data-action="wrap"]').click();
    await page.evaluate(() => Structra.events.emit('theme:open'));
    await page.locator('[data-act="new"]').click();
    await page.waitForTimeout(300);
    const foot = await page.evaluate(() => document.querySelector('structra-theme .ov-foot').hidden);
    if (!foot) failures.push('while a theme is being edited there should be no second Done button');
    await page.keyboard.press('Escape');
    const hc = await page.evaluate(() => Structra.themeEngine.contrast(Structra.themeEngine.get('high-contrast').colors.border, Structra.themeEngine.get('high-contrast').colors.bg));
    if (hc < 7) failures.push('the High Contrast border should contrast strongly with the background (7:1), it is ' + hc.toFixed(1));
    await page.evaluate(() => Structra.events.emit('input:show-tab', 'url'));
    const help = await page.evaluate(() => (document.querySelector('.io-url-help') || {}).textContent || '');
    if (!/CORS/.test(help)) failures.push('the Load URL tab should explain CORS');

    // ---- Accessibility: closed dialogs cannot be reached, tabs say which is selected, graph nodes are buttons ----
    const a11y = await page.evaluate(() => ({
      reachable: [...new Set([...document.querySelectorAll('.ov:not(.show) *, .io-overlay:not(.show) *')].filter((e) => e.getClientRects().length > 0).map((e) => (e.closest('.ov, .io-overlay').parentElement.tagName + '.' + e.closest('.ov, .io-overlay').className)))].join(),
      selected: document.querySelectorAll('.drawer-tabs [role="tab"][aria-selected="true"]').length,
      bare: [...document.querySelectorAll('.drawer-tabs [role="tab"]')].filter((t) => !t.hasAttribute('aria-selected')).length,
    }));
    if (a11y.reachable) failures.push('closed dialogs should not be reachable: ' + a11y.reachable);
    if (a11y.selected !== 1 || a11y.bare) failures.push('exactly one drawer tab should be selected and all should say so: ' + JSON.stringify(a11y));
    await page.evaluate(() => Structra.setState('activeView', 'graph'));
    await page.waitForTimeout(500);
    const node = await page.evaluate(() => { const g = document.querySelector('.graph-svg g[data-path]'); return g ? { role: g.getAttribute('role'), label: g.getAttribute('aria-label') } : null; });
    if (!node || node.role !== 'button' || !node.label) failures.push('graph nodes should be buttons with a name: ' + JSON.stringify(node));

    // ---- Fuzzy and Pattern find work in the browser: no SQL engine, and the matches are marked ----
    await page.goto(base);
    await page.waitForSelector('#canvasEmpty input[type=file]', { state: 'attached', timeout: 10000 });
    await page.keyboard.press('Escape');
    await uploadAndWait(page, path.join(ROOT, 'tests', 'fixtures', 'sp_getitems.json'));
    await page.evaluate(() => Structra.setState('activeView', 'tree'));
    const ask = async (mode, text) => {
      await page.evaluate(() => Structra.setState('findBarOpen', true));
      await page.locator(`.fb-mode[data-mode="${mode}"]`).click();
      await page.locator('#findInput').fill(text);
      await page.locator('#findInput').press('Enter');
      await page.waitForTimeout(700);
      return page.evaluate(() => ({ count: document.querySelector('#findCount').textContent, lit: document.querySelectorAll('.j-line.find-match').length, sql: Structra.dataEngine.duckReady }));
    };
    let fz = await ask('fuzzy', 'Laptp refresh');
    if (fz.count !== '1 found' || fz.lit < 1) failures.push('Fuzzy "Laptp refresh" should find the Laptop refresh title and mark it: ' + JSON.stringify(fz));
    fz = await ask('regex', '^ann@');
    if (!/^[1-9]\d* found$/.test(fz.count)) failures.push('Pattern ^ann@ should find the email: ' + JSON.stringify(fz));
    fz = await ask('regex', '(');
    if (fz.count !== 'Not a valid pattern') failures.push('a broken pattern should say so: ' + fz.count);
    fz = await ask('text', '(');
    if (fz.count === 'Error') failures.push('searching for the text "(" should not fail');
    if (fz.sql) failures.push('Find should not start the SQL engine');
    await page.evaluate(() => Structra.setState('findBarOpen', false));

    // ---- Recent: contents can be switched off, and an address is remembered with its headers (never credentials) ----
    await page.evaluate(() => { Structra.appSettings.set('keepRecentContent', false); localStorage.removeItem('structra_recent'); });
    await page.evaluate(() => Structra.events.emit('tabs:add'));
    await page.waitForTimeout(300);
    await page.evaluate(() => { const p = document.querySelector('structra-input-panel'); p._pendingRequest = { url: 'https://example.com/data.json', method: 'GET', headers: { Accept: 'application/json' } }; return p._saveRecent('data.json', '{"k": 1}', 8); });
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('structra_recent'))[0]);
    if (stored.data !== null) failures.push('with "keep contents" off, Recent should not store the file text');
    if (!stored.request || stored.request.url !== 'https://example.com/data.json' || stored.request.headers.Accept !== 'application/json') failures.push('Recent should remember the address and headers: ' + JSON.stringify(stored.request));
    await page.evaluate(() => Structra.events.emit('input:show-tab', 'recent'));
    await page.waitForTimeout(400);
    await page.locator('.io-recent-item').first().click();
    await page.waitForTimeout(300);
    const filled = await page.evaluate(() => ({ url: document.querySelector('[data-role="api-url"]').value, hdr: [...document.querySelectorAll('.io-kv-key')].map((i) => i.value).join() }));
    if (filled.url !== 'https://example.com/data.json' || !/Accept/.test(filled.hdr)) failures.push('clicking a remembered address should fill in the Load URL tab: ' + JSON.stringify(filled));
    await page.evaluate(() => Structra.appSettings.set('keepRecentContent', true));

    // ---- Starting SQL says what the wait is ----
    await page.evaluate(() => { window.__msgs = []; Structra.events.on('loading:show', (m) => window.__msgs.push(String(m))); });
    await page.evaluate(() => Structra.dataEngine.enableSql());
    const msgs = await page.evaluate(() => window.__msgs.join(' | '));
    if (!/Preparing the SQL engine \(first use only\)/.test(msgs)) failures.push('starting SQL should say it is preparing the engine: ' + msgs);
  } catch (err) {
    failures.push('crashed: ' + err.message.slice(0, 220));
  }
  if (errors.length) failures.push('page errors: ' + [...new Set(errors)].join(' | '));

  await browser.close();
  server.close();
  if (failures.length) { console.log('FAIL\n  ' + failures.join('\n  ')); process.exit(1); }
  console.log('inputs smoke test: ok');
})();
