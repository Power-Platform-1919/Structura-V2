/* The Power Platform parts: expressions in the Node panel (one click to copy), "Find this value",
   copy of the whole value, copy buttons on every expression row, and the column picker that decides
   which columns go into typed tables and Select actions.

   Run:  node tests/smoke/powerplatform.js          (PW_CHANNEL=msedge uses the installed Edge)
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
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const page = await context.newPage();
  const failures = [];
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
  const clip = () => page.evaluate(() => navigator.clipboard.readText());
  const select = async (p) => {
    await page.evaluate((x) => { Structra.set('currentPath', x); Structra.events.emit('tree:node-selected', x); }, p);
    await page.waitForTimeout(300);
  };

  try {
    await page.goto(base);
    await page.waitForSelector('#canvasEmpty input[type=file]', { state: 'attached', timeout: 10000 });
    await page.keyboard.press('Escape');
    await page.locator('#canvasEmpty input[type=file]').first().setInputFiles(path.join(ROOT, 'tests', 'fixtures', 'sp_getitems.json'));
    await page.waitForTimeout(1500);
    await page.evaluate(() => Structra.set('activeView', 'tree'));

    // ---- Node panel: expressions for the selected value ----
    await select('$.value[1].Requester.Email');
    const rows = await page.evaluate(() => [...document.querySelectorAll('#ctxPp .ctx-pp-row')].map((r) => ({ app: r.querySelector('.ctx-pp-app').textContent, label: r.querySelector('.ctx-pp-label').textContent, code: r.querySelector('.ctx-pp-code').textContent })));
    if (rows.length < 4) failures.push('the Node panel should give at least 4 expressions for a value inside a list, it gave ' + rows.length);
    if (!rows.some((r) => r.code === "items('Apply_to_each')?['Requester']?['Email']")) failures.push('no Apply to each expression in the Node panel: ' + rows.map((r) => r.code).join(' | '));
    if (!rows.some((r) => r.code === 'Text(ThisRecord.Requester.Email)')) failures.push('no Power Fx ThisRecord expression in the Node panel');
    await page.locator('#ctxPp .ctx-pp-copy').first().click();
    await page.waitForTimeout(200);
    if ((await clip()) !== rows[0].code) failures.push('the copy button did not copy the first expression: ' + (await clip()));

    // ---- Copy value gives the whole value, not the shortened text on screen ----
    await select('$.value[0]');
    await page.locator('#ctxPanel [data-action="copy-value"], structra-context [data-action="copy-value"]').first().click();
    await page.waitForTimeout(200);
    let copied;
    try { copied = JSON.parse(await clip()); } catch { copied = null; }
    const real = await page.evaluate(() => Structra.state.jsonData.value[0]);
    if (JSON.stringify(copied) !== JSON.stringify(real)) failures.push('Copy value did not copy the whole record (it is cut at 200 characters)');

    // ---- Find this value ----
    await select('$.value[0].Title');
    await page.locator('structra-context [data-action="find-value"]').click();
    await page.waitForTimeout(900);
    const found = await page.evaluate(() => ({ open: document.querySelector('.find-bar').classList.contains('show'), text: document.querySelector('#findInput').value, count: document.querySelector('#findCount').textContent }));
    if (!found.open || found.text !== 'Laptop refresh' || /^0/.test(found.count)) failures.push('"Find this value" did not search for the value: ' + JSON.stringify(found));
    await page.evaluate(() => Structra.set('findBarOpen', false));

    // ---- Expressions drawer: copy buttons and the column picker ----
    await select('$.value');
    await page.evaluate(() => Structra.events.emit('drawer:show', 'expressions'));
    await page.waitForTimeout(300);
    await page.locator('.expr-subtab[data-sub="canvas"]').click();
    await page.waitForTimeout(300);
    const picker = await page.evaluate(() => ({ chips: [...document.querySelectorAll('.expr-cols .expr-col')].map((c) => c.textContent.trim()), copyButtons: document.querySelectorAll('.expr-pane.active .expr-copy').length }));
    if (!picker.chips.includes('Title') || !picker.chips.includes('Status_Value') || !picker.chips.includes('Requester_Email')) failures.push('the column picker is missing columns: ' + picker.chips.join(', '));
    if (picker.chips.includes('@odata.etag')) { /* system fields are listed but off by default */ }
    if (picker.copyButtons < 5) failures.push('expression rows need a visible copy button, found ' + picker.copyButtons);

    const typed = () => page.evaluate(() => [...document.querySelectorAll('.expr-pane.active .expr-row')].find((r) => /Typed table/.test(r.querySelector('.elabel').textContent))?.querySelector('.ecode').textContent || '');
    if (!/[{, ]Title: Text\(ThisRecord\.Title\)/.test(await typed())) failures.push('the typed table should contain Title by default: ' + (await typed()).slice(0, 120));
    await page.locator('.expr-col', { hasText: /^Title$/ }).click();
    await page.waitForTimeout(300);
    if (/[{, ]Title:/.test(await typed())) failures.push('un-ticking Title should remove it from the typed table');
    await page.locator('.expr-col', { hasText: /^Title$/ }).click();                      // put it back

    await page.locator('.expr-subtab[data-sub="flow"]').click();
    await page.waitForTimeout(300);
    const select1 = await page.evaluate(() => {
      const pre = [...document.querySelectorAll('.expr-pane.active .expr-block')].find((b) => /Select/.test(b.querySelector('strong').textContent));
      try { return Object.keys(JSON.parse(pre.querySelector('pre').textContent).Select.inputs.select); } catch { return null; }
    });
    if (!select1 || !select1.includes('Title') || !select1.includes('Status_Value')) failures.push('the Select action should use the chosen columns: ' + JSON.stringify(select1));
  } catch (err) {
    failures.push('crashed: ' + err.message.slice(0, 200));
  }
  if (errors.length) failures.push('page errors: ' + [...new Set(errors)].join(' | '));

  await browser.close();
  server.close();
  if (failures.length) { console.log('FAIL\n  ' + failures.join('\n  ')); process.exit(1); }
  console.log('power platform smoke test: ok');
})();
