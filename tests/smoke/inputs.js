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
  } catch (err) {
    failures.push('crashed: ' + err.message.slice(0, 220));
  }
  if (errors.length) failures.push('page errors: ' + [...new Set(errors)].join(' | '));

  await browser.close();
  server.close();
  if (failures.length) { console.log('FAIL\n  ' + failures.join('\n  ')); process.exit(1); }
  console.log('inputs smoke test: ok');
})();
