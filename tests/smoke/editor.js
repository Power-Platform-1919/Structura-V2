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
  const toasts = () => page.evaluate(() => (window.__toasts || []).slice(-1)[0] || '');

  try {
    await page.goto(base);
    await page.waitForSelector('#canvasEmpty input[type=file]', { state: 'attached', timeout: 10000 });
    await page.keyboard.press('Escape');
    await uploadAndWait(page, path.join(ROOT, 'tests', 'fixtures', 'jsonobject.json'));
    await page.evaluate(() => { window.__toasts = []; const t = Structra.toast; Structra.toast = (m, ...r) => { window.__toasts.push(String(m)); return t.call(Structra, m, ...r); }; });
    const original = await page.evaluate(() => JSON.stringify(Structra.state.jsonData));
    await page.evaluate(() => Structra.setState('activeView', 'editor'));
    await page.waitForTimeout(500);

    // ---- Line numbers ----
    // Only the numbers in view are drawn: the first is 1 at the top, and scrolling to the end reaches the last line
    const g = await page.evaluate(async () => {
      const box = document.querySelector('structra-editor .cv').codeView;
      const numbers = () => [...document.querySelectorAll('structra-editor .cm-lineNumbers .cm-gutterElement')].filter((e) => e.style.visibility !== 'hidden').map((e) => e.textContent.trim()).filter((t) => /^\d+$/.test(t));
      const first = numbers()[0];
      const drawn = numbers().length;
      box.scrollTo(0, 1e9);
      await new Promise((r) => setTimeout(r, 300));
      return { lines: box.lineCount(), first, drawn, last: numbers().pop() };
    });
    if (g.first !== '1' || Number(g.last) !== g.lines || g.drawn >= g.lines && g.lines > 200) failures.push(`the gutter should draw only the numbers in view, starting at 1 and reaching ${g.lines} at the end: ${JSON.stringify(g)}`);
    const setEditorText = (text) => page.evaluate((t) => { document.querySelector('structra-editor .cv').codeView.replaceAll(t); }, text);

    // ---- An error says what and where, and a click goes there ----
    await setEditorText('{\n  "a": 1,\n  "b": [1, 2,\n  "c": 3\n}');
    await page.waitForTimeout(700);
    const st = await page.evaluate(() => ({ text: document.querySelector('#edStatus').textContent.trim(), disabled: document.querySelector('#edStatus').disabled }));
    if (!/Line \d+, column \d+/.test(st.text)) failures.push('the error should say which line and column: "' + st.text + '"');
    if (/^Invalid$/.test(st.text)) failures.push('the error only says Invalid');
    if (!(await page.evaluate(() => !!document.querySelector('structra-editor .cv-error')))) failures.push('the place where the JSON breaks should be marked in the text');
    await page.locator('#edStatus').click();
    const sel = await page.evaluate(() => { const box = document.querySelector('structra-editor .cv').codeView; const at = box.view.state.selection.main; return { line: box.offsetToPosition(at.from).line + 1, text: box.getSelection() }; });
    if (!(sel.line >= 3 && sel.line <= 5) || sel.text.length !== 1) failures.push('clicking the error should select the character at the problem (line 3 to 5), it selected ' + JSON.stringify(sel));

    // ---- Apply refuses invalid text and says why ----
    await page.locator('structra-editor [data-action="apply"]').click();
    await page.waitForTimeout(300);
    if (!/cannot be applied/.test(await toasts())) failures.push('Apply on invalid JSON should say the changes cannot be applied: ' + (await toasts()));

    // ---- Apply a good change: the tab is marked, and undo brings the original back ----
    await setEditorText('{"edited": true, "n": [1, 2, 3]}');
    await page.waitForTimeout(500);
    await page.locator('structra-editor [data-action="apply"]').click();
    await page.waitForTimeout(800);
    const applied = await page.evaluate(() => ({ data: JSON.stringify(Structra.state.jsonData), modified: document.querySelector('.doc-tab.active').classList.contains('modified') }));
    if (applied.data !== '{"edited":true,"n":[1,2,3]}') failures.push('Apply did not change the document: ' + applied.data);
    if (!applied.modified) failures.push('the tab is not marked as changed after Apply');
    // A warning before leaving with changes
    const askLeave = () => page.evaluate(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; });
    if (!(await askLeave())) failures.push('leaving the page with a changed tab should ask first');
    await page.evaluate(() => document.querySelector('structra-command')._runCommand('undo'));
    await page.waitForTimeout(800);
    const undone = await page.evaluate(() => JSON.stringify(Structra.state.jsonData));
    if (undone !== original) failures.push('Undo after Apply did not restore the document');
    // Back at the original there is nothing to lose, so leaving does not ask
    if (await askLeave()) failures.push('after Undo back to the original, leaving the page should not ask');
  } catch (err) {
    failures.push('crashed: ' + err.message.slice(0, 220));
  }
  if (errors.length) failures.push('page errors: ' + [...new Set(errors)].join(' | '));

  await browser.close();
  server.close();
  if (failures.length) { console.log('FAIL\n  ' + failures.join('\n  ')); process.exit(1); }
  console.log('editor smoke test: ok');
})();
