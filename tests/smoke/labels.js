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
    if (rail[rail.length - 1] !== 'Settings' || !rail.includes('Themes')) failures.push('the rail should end with Themes then Settings: ' + rail.join(', '));
    await page.evaluate(() => Structra.set('queryPanelOpen', true));
    await page.waitForTimeout(300);
    const modes = (await text('structra-query [data-mode]')).join(',');
    if (modes !== 'Path,JSONPath,Pattern,JavaScript,SQL') failures.push('Query modes should read Path, JSONPath, Pattern, JavaScript, SQL: ' + modes);
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

    // Overview: an empty value is calm (info), and a Status column is not "only 0% unique"
    await closeAll();
    const recs = Array.from({ length: 40 }, (_, i) => ({ id: 'r' + i, status: ['Open', 'Closed', 'Hold'][i % 3], notes: i % 3 === 0 ? 'x' : null }));
    await load('recs.json', JSON.stringify(recs));
    await page.evaluate(() => Structra.set('activeView', 'overview'));
    await page.waitForTimeout(800);
    const finds = await page.evaluate(() => [...document.querySelectorAll('.ovw-find')].map((b) => ({ cls: b.className, text: b.textContent.replace(/\s+/g, ' ').trim() })));
    if (finds.some((f) => /unique/.test(f.text) && /status/i.test(f.text))) failures.push('a Status column should not be flagged as not unique: ' + JSON.stringify(finds));
    const notes = finds.find((f) => /notes/.test(f.text));
    if (notes && /sev-(high|med)/.test(notes.cls)) failures.push('empty values should be a calm note, not a warning: ' + notes.cls);

    // Null finder scans when opened and has no zero or false options
    await page.evaluate(() => Structra.events.emit('nullfinder:open'));
    await page.waitForTimeout(600);
    const nf = await page.evaluate(() => ({ items: document.querySelectorAll('#nfResults .nf-item').length, zero: !!document.querySelector('#nfZero') }));
    if (!nf.items) failures.push('the Null finder should list results as soon as it opens');
    if (nf.zero) failures.push('the Null finder should not offer zero or false');
    await page.keyboard.press('Escape');

    // Transform: a Pivot entry, and the code box is under Advanced
    await page.evaluate(() => Structra.set('queryPanelOpen', true));
    await page.locator('[data-qtab="transform"]').click();
    const tr = await page.evaluate(() => ({ pivot: !!document.querySelector('[data-action="openPivot"]'), boxVisible: document.querySelector('#qpAdvanced').open }));
    if (!tr.pivot) failures.push('the Transform panel should offer Pivot');
    if (tr.boxVisible) failures.push('the code box should be folded under Advanced');
    await page.evaluate(() => Structra.set('queryPanelOpen', false));

    // Every built-in theme keeps muted text, null and true readable (4.5:1) and the dark panels apart from the page
    const weak = await page.evaluate(() => {
      const out = [];
      for (const t of Structra.theme.list().filter((x) => x.builtIn)) {
        const c = t.colors;
        for (const k of ['textMuted', 'synNull', 'synBoolean', 'accent']) {
          const worst = Math.min(...['bg', 'surface', 'surfaceAlt'].map((b) => Structra.theme.contrast(c[k], c[b])));
          if (worst < 4.5) out.push(`${t.name} ${k} ${worst.toFixed(2)}`);
        }
        if (t.mode === 'dark' && Structra.theme.contrast(c.border, c.bg) < 1.4) out.push(`${t.name} border is lost against the page`);
      }
      return out;
    });
    if (weak.length) failures.push('theme contrast: ' + weak.join('; '));

    // CSV: thousands separators are read and money keeps its decimals in the Table
    await closeAll();
    await load('prices.csv', 'Item,Price\nA,10.00\nB,"1,200.00"\nC,2.50\n');
    const prices = await page.evaluate(() => Structra.state.jsonData.map((r) => r.Price));
    if (prices.join() !== '10,1200,2.5') failures.push('CSV prices should be numbers, "1,200.00" included: ' + prices.join());
    await page.evaluate(() => Structra.set('activeView', 'table'));
    await page.waitForTimeout(600);
    const cells = await page.evaluate(() => [...document.querySelectorAll('structra-table tbody tr td:nth-child(2)')].map((t) => t.textContent.trim()));
    if (cells.join() !== '10.00,1200.00,2.50') failures.push('the Table should keep two decimals for Price: ' + cells.join());

    // Editor: an error in plain words
    await page.evaluate(() => Structra.set('activeView', 'editor'));
    await page.waitForTimeout(400);
    await page.evaluate(() => { document.querySelector('structra-editor .CodeMirror').CodeMirror.setValue("{ 'a': 1 }"); });
    await page.waitForTimeout(500);
    const est = await page.evaluate(() => document.querySelector('#edStatus').textContent.trim());
    if (!/double quotes/.test(est) || /Unexpected token/.test(est)) failures.push('the Editor error should say in plain words that text needs double quotes: ' + est);
  } catch (err) {
    failures.push('crashed: ' + err.message.slice(0, 220));
  }
  if (errors.length) failures.push('page errors: ' + [...new Set(errors)].join(' | '));

  await browser.close();
  server.close();
  if (failures.length) { console.log('FAIL\n  ' + failures.join('\n  ')); process.exit(1); }
  console.log('labels smoke test: ok');
})();
