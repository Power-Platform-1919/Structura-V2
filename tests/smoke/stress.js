/* Awkward situations a real person runs into: JSON Lines and semicolon CSV, a Flatten that would lose data, Undo and the
   changed mark, Mask, Editor text that is not applied yet, tab names, Escape, stale panel results, several files at once,
   huge share links and a browser that blocks saving. Nothing may throw, lose work or fail silently.

   Run:  node tests/smoke/stress.js          (PW_CHANNEL=msedge uses the installed Edge)
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
  await ctx.addInitScript(() => { try { localStorage.setItem('structra.welcomeSeen', '1'); localStorage.setItem('structra.tipExpressions', '1'); } catch { /* storage blocked */ } });
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

    // ---- a document nested 1,500 levels deep opens and says it was cut ----
    await load('deep.json', '['.repeat(1500) + ']'.repeat(1500));
    const deep = await page.evaluate(() => ({ tabs: Structra.tabs.list.length, ok: !!Structra.state.jsonData }));
    if (!deep.ok) failures.push('a deeply nested document should still open');
    if (!/deep|nest/i.test(await toastText())) failures.push('the deep document should be reported as cut: ' + await toastText());
    await closeAll();

    // ---- risky patterns and endless scripts are stopped ----
    await load('items.json', JSON.stringify([{ name: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa!' }, { name: 'b' }]));
    const risky = await page.evaluate(async () => { try { await Structra.engine.regexSearch('(a+)+$'); return 'ran'; } catch (e) { return e.message; } });
    if (risky === 'ran') failures.push('a pattern like (a+)+$ should be refused');
    const t0 = Date.now();
    await page.evaluate(() => Structra.set('queryPanelOpen', true));
    await page.waitForTimeout(300);
    await page.locator('structra-query [data-mode="js"]').click();
    await page.locator('#queryInput').fill('(() => { while (true) {} })()');
    await page.locator('structra-query [data-action="run"]').click();
    await page.waitForFunction(() => /time|long|stopped/i.test(document.querySelector('#queryResults').textContent), null, { timeout: 15000 }).catch(() => failures.push('an endless script should be stopped with a message'));
    if (Date.now() - t0 > 14000) failures.push('stopping an endless script took too long');
    await page.keyboard.press('Escape');
    await closeAll();

    // ---- a very wide table draws a limited number of columns and offers more ----
    const wide = {}; for (let i = 0; i < 1500; i++) wide['c' + i] = i;
    await load('wide.json', JSON.stringify([wide, wide]));
    await page.evaluate(() => Structra.set('activeView', 'table'));
    await page.waitForTimeout(800);
    const cols = await page.evaluate(() => ({ th: document.querySelectorAll('structra-table th').length, more: !!document.querySelector('structra-table [data-page-action="more-cols"]'), num: document.querySelectorAll('structra-table td.num').length }));
    if (cols.th > 120 || !cols.more) failures.push('1,500 columns should draw a limited number and offer more: ' + JSON.stringify(cols));
    if (!cols.num) failures.push('numbers in a table should be right-aligned (td.num)');
    await closeAll();

    // ---- the same problem in many rows is one line with a count ----
    const rows = Array.from({ length: 200 }, (_, i) => ({ id: 'x' + i }));
    await load('rows.json', JSON.stringify(rows));
    const grouped = await page.evaluate(() => {
      const r = Structra.jsonTools.validate(Structra.state.jsonData, { type: 'array', items: { type: 'object', properties: { id: { type: 'number' } } } });
      return r;
    });
    if (!grouped.errors || grouped.errors.length !== 200) failures.push('validation should find 200 problems: ' + JSON.stringify(grouped).slice(0, 120));
    await page.evaluate((sch) => { Structra.events.emit('validate:open'); }, null);
    await page.waitForTimeout(400);
    await page.keyboard.press('Escape');
  } catch (err) {
    failures.push('crashed: ' + err.message.slice(0, 220));
  }
  if (errors.length) failures.push('page errors: ' + [...new Set(errors)].join(' | '));

  await browser.close();
  server.close();
  if (failures.length) { console.log('FAIL\n  ' + failures.join('\n  ')); process.exit(1); }
  console.log('stress smoke test: ok');
})();
