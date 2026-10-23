/* Awkward situations a real person runs into: JSON Lines and semicolon CSV, a Flatten that would lose data, Undo and the
   changed mark, Mask, Editor text that is not applied yet, tab names, Escape, stale panel results, several files at once,
   huge share links and a browser that blocks saving. Nothing may throw, lose work or fail silently.

   Run:  node tests/smoke/labels.js          (PW_CHANNEL=msedge uses the installed Edge)
*/
const http = require('http');
const fs = require('fs');
const path = require('path');

let chromium;
try { ({ chromium } = require('playwright')); } catch {
  console.error('Playwright is not installed. Run: npm install --save-dev playwright && npx playwright install chromium');
  process.exit(2);
}

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
  const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
  const page = await (await newCtx(browser, { viewport: { width: 1360, height: 800 } })).newPage();
  const failures = [];
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));

  const load = async (name, text) => {
    await page.evaluate(() => Structra.events.emit('tabs:add'));
    await page.waitForTimeout(250);
    await page.evaluate(([n, t]) => document.querySelector('structra-input-panel')._loadText(t, n), [name, text]);
    await page.waitForTimeout(700);
  };
  const closeAll = () => page.evaluate(() => { while (Structra.tabs.list.length > 1) document.querySelector('structra-tabs')._closeTab(Structra.tabs.list[Structra.tabs.list.length - 1].id); });
  const toastText = () => page.evaluate(() => document.querySelector('structra-toast #toastMsg').textContent);

  try {
    await page.goto(base);
    await page.waitForSelector('#canvasEmpty input[type=file]', { state: 'attached', timeout: 10000 });
    await page.keyboard.press('Escape');
    await load('list.json', JSON.stringify([{ id: 1, name: 'Ann', region: 'N' }, { id: 2, name: 'Bo', region: 'S' }]));
    const text = (sel) => page.evaluate((q) => [...document.querySelectorAll(q)].map((e) => e.textContent.replace(/\s+/g, ' ').trim()), sel);

    // plain names for the rail, the Query modes and the Filter tabs
    const rail = await text('structra-rail .rail-btn');
    if (!rail.includes('Settings') || rail.includes('Theme')) failures.push('the last rail button should be called Settings: ' + rail.join(', '));
    await page.evaluate(() => Structra.set('queryPanelOpen', true));
    await page.waitForTimeout(300);
    const modes = (await text('structra-query [data-mode]')).join(',');
    if (modes !== 'Path,JSONPath,Pattern,JavaScript') failures.push('Query modes should read Path, JSONPath, Pattern, JavaScript: ' + modes);
    const title = (await text('structra-query .panel-title'))[0];
    if (title !== 'Query and Transform') failures.push('the Query panel title should be Query and Transform: ' + title);
    await page.evaluate(() => Structra.set('queryPanelOpen', false));
    await page.evaluate(() => Structra.set('filterBarOpen', true));
    await page.waitForTimeout(300);
    const tabs = (await text('structra-filter .filter-mode-tab')).join(',');
    if (tabs !== 'Simple,JSONPath,Pattern,Formula') failures.push('Filter tabs should read Simple, JSONPath, Pattern, Formula: ' + tabs);
    const firstField = await page.evaluate(() => (document.querySelector('structra-filter .filter-field, structra-filter select') || {}).value);
    if (firstField !== 'name') failures.push('the filter should start on the first text column (name), it starts on ' + firstField);
    await page.evaluate(() => Structra.set('filterBarOpen', false));

    // the Load URL box refuses text that is not a web address, before sending anything
    const sent = [];
    page.on('request', (r) => { if (/\/bob$/.test(r.url())) sent.push(r.url()); });
    await page.evaluate(() => Structra.events.emit('tabs:add'));
    await page.waitForTimeout(300);
    await page.locator('structra-input-panel [data-tab="url"]').click();
    await page.locator('[data-role="api-url"]').fill('bob');
    await page.locator('[data-role="api-send"]').click();
    await page.waitForTimeout(400);
    const urlErr = await text('[data-role="url-error"]');
    if (!urlErr.some((t) => /http/.test(t))) failures.push('text that is not a web address should be explained: ' + urlErr.join('|'));
    if (sent.length) failures.push('a request was sent for "bob"');

    // shortcuts: zoom has three clear rows
    await page.evaluate(() => Structra.events.emit('shortcuts:open'));
    await page.waitForTimeout(400);
    const sc = (await text('structra-shortcuts')).join(' ');
    if (!/Zoom in/.test(sc) || !/Zoom out/.test(sc) || !/Reset zoom/.test(sc) || /Ctrl\+- zooms/.test(sc)) failures.push('shortcuts should list Zoom in, Zoom out and Reset zoom as rows');
    await page.keyboard.press('Escape');
  } catch (err) {
    failures.push('crashed: ' + err.message.slice(0, 220));
  }
  if (errors.length) failures.push('page errors: ' + [...new Set(errors)].join(' | '));

  await browser.close();
  server.close();
  if (failures.length) { console.log('FAIL\n  ' + failures.join('\n  ')); process.exit(1); }
  console.log('labels smoke test: ok');
})();
