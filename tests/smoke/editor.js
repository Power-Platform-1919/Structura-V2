/* The Editor view: line numbers, an error that says what and where, Apply that can be undone and marks the tab,
   and a warning before leaving with changes.

   Run:  node tests/smoke/editor.js          (PW_CHANNEL=msedge uses the installed Edge)
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
  const toasts = () => page.evaluate(() => (window.__toasts || []).slice(-1)[0] || '');

  try {
    await page.goto(base);
    await page.waitForSelector('#canvasEmpty input[type=file]', { state: 'attached', timeout: 10000 });
    await page.keyboard.press('Escape');
    await page.locator('#canvasEmpty input[type=file]').first().setInputFiles(path.join(ROOT, 'tests', 'fixtures', 'jsonobject.json'));
    await page.waitForTimeout(1500);
    await page.evaluate(() => { window.__toasts = []; const t = Structra.toast; Structra.toast = (m, ...r) => { window.__toasts.push(String(m)); return t.call(Structra, m, ...r); }; });
    const original = await page.evaluate(() => JSON.stringify(Structra.state.jsonData));
    await page.evaluate(() => Structra.set('activeView', 'editor'));
    await page.waitForTimeout(500);

    // ---- Line numbers ----
    const g = await page.evaluate(() => {
      const ta = document.querySelector('#editorArea');
      return { lines: ta.value.split('\n').length, numbers: document.querySelector('#edGutter').textContent.trim().split('\n').length, last: document.querySelector('#edGutter').textContent.trim().split('\n').pop() };
    });
    if (g.numbers !== g.lines || Number(g.last) !== g.lines) failures.push(`the gutter shows ${g.numbers} numbers (last ${g.last}) for ${g.lines} lines`);

    // ---- An error says what and where, and a click goes there ----
    await page.locator('#editorArea').evaluate((ta) => { ta.value = '{\n  "a": 1,\n  "b": [1, 2,\n  "c": 3\n}'; ta.dispatchEvent(new Event('input')); });
    await page.waitForTimeout(500);
    const st = await page.evaluate(() => ({ text: document.querySelector('#edStatus').textContent.trim(), disabled: document.querySelector('#edStatus').disabled }));
    if (!/Line \d+, column \d+/.test(st.text)) failures.push('the error should say which line and column: "' + st.text + '"');
    if (/^Invalid$/.test(st.text)) failures.push('the error only says Invalid');
    await page.locator('#edStatus').click();
    const sel = await page.evaluate(() => ({ start: document.querySelector('#editorArea').selectionStart, line: document.querySelector('#editorArea').value.slice(0, document.querySelector('#editorArea').selectionStart).split('\n').length }));
    if (!(sel.line >= 3 && sel.line <= 5)) failures.push('clicking the error should select near the problem (line 3 to 5), it selected line ' + sel.line);

    // ---- Apply refuses invalid text and says why ----
    await page.locator('#editorArea').evaluate(() => 0);
    await page.locator('structra-editor [data-action="apply"]').click();
    await page.waitForTimeout(300);
    if (!/cannot be applied/.test(await toasts())) failures.push('Apply on invalid JSON should say the changes cannot be applied: ' + (await toasts()));

    // ---- Apply a good change: the tab is marked, and undo brings the original back ----
    await page.locator('#editorArea').evaluate((ta) => { ta.value = '{"edited": true, "n": [1, 2, 3]}'; ta.dispatchEvent(new Event('input')); });
    await page.waitForTimeout(300);
    await page.locator('structra-editor [data-action="apply"]').click();
    await page.waitForTimeout(800);
    const applied = await page.evaluate(() => ({ data: JSON.stringify(Structra.state.jsonData), modified: document.querySelector('.doc-tab.active').classList.contains('modified') }));
    if (applied.data !== '{"edited":true,"n":[1,2,3]}') failures.push('Apply did not change the document: ' + applied.data);
    if (!applied.modified) failures.push('the tab is not marked as changed after Apply');
    await page.evaluate(() => document.querySelector('structra-command')._exec('undo'));
    await page.waitForTimeout(800);
    const undone = await page.evaluate(() => JSON.stringify(Structra.state.jsonData));
    if (undone !== original) failures.push('Undo after Apply did not restore the document');

    // ---- A warning before leaving with changes ----
    const guard = await page.evaluate(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; });
    if (!guard) failures.push('leaving the page with a changed tab should ask first');
  } catch (err) {
    failures.push('crashed: ' + err.message.slice(0, 220));
  }
  if (errors.length) failures.push('page errors: ' + [...new Set(errors)].join(' | '));

  await browser.close();
  server.close();
  if (failures.length) { console.log('FAIL\n  ' + failures.join('\n  ')); process.exit(1); }
  console.log('editor smoke test: ok');
})();
