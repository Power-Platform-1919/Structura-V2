/* The Table view: headers keep the case of the keys (they are case-sensitive in expressions),
   and nested SharePoint fields (Choice, Person, lists of choices) show their useful value.

   Run:  node tests/smoke/table.js          (PW_CHANNEL=msedge uses the installed Edge)
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

  try {
    await page.goto(base);
    await page.waitForSelector('#canvasEmpty input[type=file]', { state: 'attached', timeout: 10000 });
    await page.keyboard.press('Escape');
    await page.locator('#canvasEmpty input[type=file]').first().setInputFiles(path.join(ROOT, 'tests', 'fixtures', 'sp_getitems.json'));
    await page.waitForTimeout(1500);
    await page.evaluate(() => Structra.setState('activeView', 'table'));
    await page.waitForTimeout(800);

    const t = await page.evaluate(() => {
      const heads = [...document.querySelectorAll('structra-table th')].map((h) => ({ text: h.textContent.replace(/\s+/g, ' ').trim(), transform: getComputedStyle(h).textTransform }));
      const rows = [...document.querySelectorAll('structra-table tbody tr')].map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent.replace(/\s+/g, ' ').trim()));
      return { heads, rows };
    });
    if (!t.heads.length) failures.push('the Table drew no headers');
    if (t.heads.some((h) => h.transform === 'uppercase')) failures.push('headers are forced to UPPERCASE; keys are case-sensitive, so they must show as written');
    if (!t.heads.some((h) => h.text.startsWith('ItemInternalId'))) failures.push('the header for ItemInternalId is not shown as written: ' + t.heads.map((h) => h.text).join(' | '));
    const flat = t.rows.map((r) => r.join(' | ')).join('\n');
    if (/\{…\}/.test(flat)) failures.push('a nested field still shows as {…}:\n' + flat.slice(0, 300));
    if (!flat.includes('Ann Lee')) failures.push('the Person field does not show its display name (Ann Lee)');
    if (!flat.includes('Open')) failures.push('the Choice field does not show its value (Open)');
    if (!flat.includes('IT, Hardware')) failures.push('the list of choices does not show "IT, Hardware"');

    // ---- the column menu: real icons, a summary, every different value ----
    await page.locator('structra-table th[data-col="Cost"]').click({ button: 'right' });
    const menu = await page.evaluate(() => { const m = document.querySelector('.col-ctx-menu'); return m ? { icons: m.querySelectorAll('.col-ctx-icon svg').length, text: m.textContent } : null; });
    if (!menu) failures.push('right-clicking a column header did not open the menu');
    else {
      if (menu.icons < 8) failures.push('the column menu should have an icon on every action, it has ' + menu.icons);
      if (/[\u{1F300}-\u{1FAFF}\u25B2\u25BC\u25C0\u23F7\u2295\u229E\u229F\u2298]/u.test(menu.text)) failures.push('the column menu still uses emoji or symbol characters: ' + menu.text.slice(0, 80));
    }
    await page.locator('.col-ctx-item', { hasText: 'Column summary' }).click();
    await page.waitForTimeout(300);
    const rep = await page.evaluate(() => (document.querySelector('.col-report') || {}).textContent || '');
    if (!/Total\s*1364\.75/.test(rep) || !/Smallest\s*20/.test(rep) || !/Largest\s*1299\.5/.test(rep)) failures.push('the column summary for Cost is wrong: ' + rep.replace(/\s+/g, ' ').slice(0, 200));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    await page.locator('structra-table th[data-col="Approved"]').click({ button: 'right' });
    await page.locator('.col-ctx-item', { hasText: 'Every different value' }).click();
    await page.waitForTimeout(300);
    const vals = await page.evaluate(() => [...document.querySelectorAll('.col-report .rep-row')].map((r) => r.textContent.replace(/\s+/g, ' ').trim()));
    if (vals.length !== 2 || !vals.some((v) => /^true\s*2$/.test(v)) || !vals.some((v) => /^false\s*1$/.test(v))) failures.push('the different values of Approved should be true (2) and false (1): ' + vals.join(' | '));
    await page.keyboard.press('Escape');

    // ---- column widths stay the same when the sort changes ----
    const widths = () => page.evaluate(() => [...document.querySelectorAll('structra-table th')].map((t) => Math.round(t.getBoundingClientRect().width)).join(','));
    const w1 = await widths();
    await page.locator('structra-table th[data-col="Title"]').click();
    await page.waitForTimeout(400);
    const w2 = await widths();
    if (w1 !== w2) failures.push('column widths changed when the sort changed: ' + w1 + ' then ' + w2);

    // ---- Charts: nothing printed over the bars, the line chart has axis labels, the list has a friendly name ----
    await page.evaluate(() => Structra.events.emit('charts:open', { column: 'Cost' }));
    await page.waitForTimeout(500);
    const ch = await page.evaluate(() => {
      const d = document.querySelector('structra-charts');
      return { field: (d.querySelector('.ch-field') || {}).textContent || '', opts: [...d.querySelectorAll('#chSource option')].map((o) => o.textContent), svgText: [...d.querySelectorAll('svg text')].map((t) => t.textContent), note: [...d.querySelectorAll('.ch-note')].map((n) => n.textContent).join(' ') };
    });
    if (/Array/.test(ch.field + ch.opts.join())) failures.push('Charts still says Array: ' + ch.field + ' ' + ch.opts.join());
    if (ch.svgText.some((t) => /tallest bar/.test(t))) failures.push('the tallest bar caption is printed inside the chart again');
    if (!/tallest bar holds/.test(ch.note)) failures.push('Charts should explain the bars under the chart: ' + ch.note);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  } catch (err) {
    failures.push('crashed: ' + err.message.slice(0, 200));
  }
  if (errors.length) failures.push('page errors: ' + [...new Set(errors)].join(' | '));

  await browser.close();
  server.close();
  if (failures.length) { console.log('FAIL\n  ' + failures.join('\n  ')); process.exit(1); }
  console.log('table smoke test: ok');
})();
