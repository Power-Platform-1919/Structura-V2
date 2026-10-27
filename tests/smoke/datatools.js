/* Filter, Pivot and the Null finder work on the rows of the main list (the "value" list of a SharePoint response),
   with columns such as Status.Value, and say clearly when nothing matches.

   Run:  node tests/smoke/datatools.js          (PW_CHANNEL=msedge uses the installed Edge)
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

    // ---- Filter ----
    await page.evaluate(() => Structra.setState('activeView', 'table'));
    await page.evaluate(() => Structra.setState('filterBarOpen', true));
    await page.waitForTimeout(400);
    const cols = await page.evaluate(() => [...document.querySelectorAll('#filterConditions .fc-row:first-child .fc-field option')].map((o) => o.value));
    for (const c of ['Title', 'Status.Value', 'Requester.Email', 'Approved']) if (!cols.includes(c)) failures.push(`the Filter does not offer the column ${c}: ${cols.join(', ')}`);
    if (cols.includes('value') || cols.includes('@odata.context')) failures.push('the Filter lists the document keys (value, @odata.context) instead of the columns: ' + cols.join(', '));
    const scope = await page.evaluate(() => document.querySelector('#filterScope').textContent);
    if (!/3 rows of value/.test(scope)) failures.push('the Filter should say what it filters: "' + scope + '"');

    const setCondition = async (field, op, value) => {
      const row = page.locator('#filterConditions .fc-row').first();
      await row.locator('.fc-field').selectOption(field);
      await row.locator('.fc-op').selectOption(op);
      await row.locator('.fc-value').fill(value);
      await page.locator('structra-filter [data-action="apply"]').click();
      await page.waitForTimeout(500);
    };
    await setCondition('Status.Value', 'eq', 'Open');
    let f = await page.evaluate(() => ({ count: document.querySelector('#filterCount').textContent, summary: document.querySelector('#filterSummary').textContent, rows: document.querySelectorAll('structra-table tbody tr').length }));
    if (f.count !== '2 rows match') failures.push('Status.Value = Open should match 2 rows: "' + f.count + '"');
    if (f.rows !== 2) failures.push('the Table should show the 2 matching rows, it shows ' + f.rows);
    if (!/Status\.Value = Open/.test(f.summary)) failures.push('the Filter does not say which condition it applied: "' + f.summary + '"');

    await setCondition('Title', 'contains', 'zzz');
    f = await page.evaluate(() => ({ count: document.querySelector('#filterCount').textContent, text: (document.querySelector('structra-table .table-empty') || {}).textContent || '', rows: document.querySelectorAll('structra-table tbody tr:not(.table-empty)').length }));
    if (f.count !== 'No rows match') failures.push('a filter with no match should say "No rows match": "' + f.count + '"');
    if (!/No rows match/.test(f.text) || f.rows) failures.push('the Table should show an empty message, not the whole document: ' + JSON.stringify(f));

    await page.locator('structra-filter [data-action="clear"]').click();
    await page.waitForTimeout(400);
    f = await page.evaluate(() => ({ conditions: document.querySelectorAll('#filterConditions .fc-row').length, rows: document.querySelectorAll('structra-table tbody tr').length }));
    if (f.conditions !== 1) failures.push('after Clear there should be one empty condition to type into, there are ' + f.conditions);
    if (f.rows !== 3) failures.push('after Clear the Table should show all 3 rows again, it shows ' + f.rows);
    await page.evaluate(() => Structra.setState('filterBarOpen', false));

    // ---- Pivot ----
    await page.evaluate(() => Structra.events.emit('pivot:open'));
    await page.waitForTimeout(500);
    const chips = await page.evaluate(() => [...document.querySelectorAll('#pivotFields .pivot-chip')].map((c) => c.textContent));
    for (const c of ['Status.Value', 'Cost', 'Requester.DisplayName']) if (!chips.includes(c)) failures.push(`the Pivot does not offer ${c}: ${chips.join(', ')}`);
    if (chips.includes('value') || chips.includes('@odata.context')) failures.push('the Pivot lists the document keys instead of the columns');
    await page.locator('#pivotFields .pivot-chip', { hasText: /^Status\.Value$/ }).click();
    const zone = await page.evaluate(() => document.querySelector('#pivotRows').textContent.trim());
    if (!/Status\.Value/.test(zone)) failures.push('clicking a field should put it in Group by: "' + zone + '"');
    const piv = await page.evaluate(() => {
      const pv = document.querySelector('structra-pivot');
      pv._values = ['Cost']; pv._aggFn = 'sum'; pv._renderZones(); pv._runPivot();
      return [...document.querySelectorAll('#pivotResult tbody tr')].map((tr) => [...tr.children].map((c) => c.textContent.trim()));
    });
    const open = piv.find((r) => r[0] === 'Open');
    if (!open || Number(open[1]) !== 1344.75) failures.push('the total Cost of Open should be 1344.75 (1299.5 + 45.25): ' + JSON.stringify(piv));
    // A number is totalled, not used to group rows; and the whole result can be copied or opened as a tab
    const num = await page.evaluate(() => {
      const pv = document.querySelector('structra-pivot');
      pv._rows = []; pv._cols = []; pv._values = []; pv._aggFn = 'count';
      pv._addFieldToZone('Cost');
      return { values: pv._values.slice(), rows: pv._rows.slice(), agg: pv._aggFn };
    });
    if (num.values[0] !== 'Cost' || num.rows.length || num.agg !== 'sum') failures.push('clicking a numeric field should total it, not group by it: ' + JSON.stringify(num));
    const acts = await page.evaluate(() => { document.querySelector('structra-pivot')._rows = ['Status.Value']; document.querySelector('structra-pivot')._runPivot(); return [...document.querySelectorAll('#pivotResult [data-pivot-act]')].map((b) => b.dataset.pivotAct); });
    if (acts.join() !== 'copy,tab') failures.push('the Pivot result should offer Copy all rows and Open in a new tab: ' + acts.join());
    await page.keyboard.press('Escape');

    // ---- Null finder ----
    await page.evaluate(() => Structra.events.emit('nullfinder:open'));
    await page.waitForTimeout(400);
    await page.locator('structra-nullfinder [data-action="scan"]').click();
    await page.waitForTimeout(400);
    const nf = await page.evaluate(() => [...document.querySelectorAll('#nfResults .nf-item')].map((i) => i.textContent.replace(/\s+/g, ' ').trim()));
    if (!nf.some((t) => /value\[\*\]\.Notes/.test(t) && /null/.test(t) && /empty/.test(t))) failures.push('the Null finder should list value[*].Notes with a null and an empty value: ' + nf.join(' | '));
    if (nf.some((t) => /missing/.test(t))) failures.push('nothing is missing from a record in this list, but the Null finder reports: ' + nf.filter((t) => /missing/.test(t)).join(' | '));
    if (nf.some((t) => /@odata/.test(t))) failures.push('the Null finder reports system keys: ' + nf.join(' | '));
    await page.locator('#nfResults .nf-item', { hasText: 'Notes' }).first().click();
    await page.waitForTimeout(500);
    const where = await page.evaluate(() => ({ view: Structra.state.activeView, path: Structra.state.currentPath }));
    if (where.path !== '$.value[0].Notes') failures.push('clicking a result should select the first one, $.value[0].Notes: ' + JSON.stringify(where));
  } catch (err) {
    failures.push('crashed: ' + err.message.slice(0, 220));
  }
  if (errors.length) failures.push('page errors: ' + [...new Set(errors)].join(' | '));

  await browser.close();
  server.close();
  if (failures.length) { console.log('FAIL\n  ' + failures.join('\n  ')); process.exit(1); }
  console.log('data tools smoke test: ok');
})();
