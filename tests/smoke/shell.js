/* The app around the data: first screen, rail, status bar, error messages, command palette and keyboard shortcuts.

   Run:  node tests/smoke/shell.js          (PW_CHANNEL=msedge uses the installed Edge)
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
  const browser = await launchBrowser(chromium);
  const context = await browser.newContext({ viewport: { width: 1360, height: 820 } });
  const page = await context.newPage();
  const failures = [];
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
  const palette = async (text) => {
    await page.evaluate(() => Structra.events.emit('command-palette:toggle'));
    await page.locator('#cmdInput').fill(text);
    await page.waitForTimeout(150);
    const items = await page.evaluate(() => [...document.querySelectorAll('#cmdList .cmd-item')].map((i) => i.querySelector('.cmd-text').textContent));
    const empty = await page.evaluate(() => (document.querySelector('#cmdList .cmd-empty') || {}).textContent || '');
    await page.keyboard.press('Escape');
    return { items, empty };
  };

  try {
    await page.goto(base);
    await page.waitForSelector('#canvasEmpty input[type=file]', { state: 'attached', timeout: 10000 });
    await page.waitForSelector('structra-welcome .ov.show', { timeout: 8000 });   // a first visit starts with the welcome dialog
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // ---- First screen ----
    const first = await page.evaluate(() => ({
      panels: document.querySelectorAll('structra-input-panel').length,
      sampleLinks: document.querySelectorAll('[data-role="sample-link"]').length,
      help: (document.querySelector('.io-help summary') || {}).textContent || '',
      sub: (document.querySelector('.io-sub') || {}).textContent || '',
      drawerShown: document.querySelector('structra-drawer').offsetParent !== null,
    }));
    if (first.panels !== 1) failures.push(`there are ${first.panels} input panels in the page, there should be 1`);
    if (first.sampleLinks !== 1) failures.push(`there are ${first.sampleLinks} sample links, there should be 1`);
    if (!/Where do I get JSON/.test(first.help)) failures.push('the first screen has no "Where do I get JSON?" help');
    if (!/Power Automate/.test(first.sub)) failures.push('the first screen does not say what the app is for');
    if (first.drawerShown) failures.push('the bottom drawer is shown before a file is open');

    // ---- Rail ----
    const rail = await page.evaluate(() => [...document.querySelectorAll('structra-rail .rail-btn')].map((b) => ({ label: (b.querySelector('.rail-label') || {}).textContent || '', visible: !!b.querySelector('.rail-label') && b.querySelector('.rail-label').offsetParent !== null })));
    if (rail.some((r) => !r.visible || !r.label)) failures.push('every rail button needs a visible word under its icon: ' + JSON.stringify(rail));
    const tabsBefore = await page.evaluate(() => Structra.tabs.list.length);
    await page.locator('structra-rail [data-rail="explorer"]').click();
    await page.locator('structra-rail [data-rail="explorer"]').click();
    await page.waitForTimeout(200);
    const tabsAfter = await page.evaluate(() => Structra.tabs.list.length);
    if (tabsAfter !== tabsBefore) failures.push(`the Open button on the rail added ${tabsAfter - tabsBefore} empty tab(s)`);

    // ---- Status bar ----
    const status = await page.evaluate(() => ({ log: !!document.querySelector('#logToggle'), sql: (document.querySelector('#duckLabel') || {}).textContent, sqlTag: (document.querySelector('#statusDuck') || {}).tagName, title: (document.querySelector('#statusDuck') || {}).title || '' }));
    if (status.log) failures.push('the developer log switch (NORMAL/DEV) is shown to everyone');
    if (status.sql !== 'SQL off' || !/SQL engine/.test(status.title)) failures.push('the SQL chip should say "SQL off" and explain itself: ' + JSON.stringify(status));
    if (status.sqlTag !== 'BUTTON') failures.push('the SQL chip should be a real button, it is a ' + status.sqlTag);

    // ---- Command palette with nothing open ----
    let p = await palette('sort');
    if (p.items.length) failures.push('the palette offers "' + p.items[0] + '" while no file is open');
    if (!/No command matches/.test(p.empty)) failures.push('an empty palette result should say so, it said: "' + p.empty + '"');

    // ---- Invalid JSON: a clear message, a fix, and it goes away when the tab changes ----
    await page.locator('.io-tab[data-tab="text"]').first().click();
    await page.locator('[data-role="paste-input"]').fill("{'name': 'Ann', 'tags': [1,2,],}");
    await page.locator('[data-role="paste-input"]').press('Control+Enter');   // Ctrl+Enter loads
    await page.waitForTimeout(500);
    const err = await page.evaluate(() => ({ title: (document.querySelector('.io-error-title') || {}).textContent || '', detail: (document.querySelector('.io-error-detail') || {}).textContent || '', fix: !!document.querySelector('.io-error [data-action="repair"]') }));
    if (!/not valid JSON/.test(err.title)) failures.push('the error should say "This is not valid JSON", it said: ' + JSON.stringify(err));
    if (/parse error.*parse error/i.test(err.detail)) failures.push('the error text repeats itself: ' + err.detail);
    if (!err.fix) failures.push('the error has no "Fix it for me" button');
    await page.locator('.io-tab[data-tab="url"]').first().click();
    if (await page.evaluate(() => document.querySelector('[data-role="error"]').classList.contains('show'))) failures.push('the error stays visible after switching to another tab');
    await page.locator('.io-tab[data-tab="text"]').first().click();
    await page.locator('[data-role="paste-input"]').press('Control+Enter');
    await page.waitForTimeout(300);
    await page.locator('.io-error [data-action="repair"]').click();
    await page.waitForTimeout(1200);
    const fixed = await page.evaluate(() => JSON.stringify(Structra.state.jsonData));
    if (fixed !== JSON.stringify({ name: 'Ann', tags: [1, 2] })) failures.push('"Fix it for me" did not open the repaired data: ' + fixed);

    // ---- With a file open ----
    await page.waitForTimeout(500);
    p = await palette('sort');
    if (!p.items.some((i) => /Sort keys/i.test(i))) failures.push('the palette does not offer Sort once a file is open: ' + p.items.join(', '));
    p = await palette('parse json');
    if (!p.items.some((i) => /Parse JSON schema/.test(i))) failures.push('searching "parse json" does not find the Power Platform schema command: ' + p.items.join(', '));
    p = await palette('power fx');
    if (!p.items.length) failures.push('searching "power fx" finds nothing');
    // close matches: a typo and words in another order still find the command, after the exact ones
    p = await palette('exprt');
    if (!p.items.some((i) => /^Export as CSV/.test(i))) failures.push('a typo ("exprt") should still find Export as CSV: ' + p.items.slice(0, 6).join(', '));
    p = await palette('csv export');
    if (!p.items.some((i) => /^Export as CSV/.test(i))) failures.push('words in another order ("csv export") should find Export as CSV: ' + p.items.slice(0, 6).join(', '));
    p = await palette('export');
    if (!/^Export/.test(p.items[0] || '')) failures.push('a label that starts with the text should come first: ' + p.items.slice(0, 3).join(', '));
    p = await palette('undo');
    if (p.items.length) failures.push('Undo is offered before anything was changed');

    // ---- Keyboard ----
    await page.locator('body').click({ position: { x: 700, y: 400 } });
    await page.keyboard.press('?');
    await page.waitForTimeout(300);
    if (!(await page.evaluate(() => document.querySelector('structra-shortcuts .ov')?.classList.contains('show')))) failures.push('the ? key does not open the shortcuts');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+d');
    await page.waitForTimeout(300);
    if (!(await page.evaluate(() => document.querySelector('structra-diff .ov')?.classList.contains('show')))) failures.push('Ctrl+D does not open Compare');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    await page.evaluate(() => Structra.setState('activeView', 'editor'));
    await page.waitForTimeout(300);
    // The editor handles its own keys (undo is its own, and ? is a character). The app must not take them over:
    // the app announces a shortcut it acts on, so none must be announced for these two keys.
    const kept = await page.evaluate(() => {
      const box = document.querySelector('structra-editor .cm-content');
      box.focus();
      const announced = [];
      const listener = (action) => announced.push(action);
      Structra.events.on('shortcut', listener);
      box.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
      const question = new KeyboardEvent('keydown', { key: '?', bubbles: true, cancelable: true });
      box.dispatchEvent(question);
      Structra.events.off('shortcut', listener);
      return { announced, shortcutListOpened: !!document.querySelector('structra-shortcuts .ov.show') };
    });
    if (kept.announced.length) failures.push('Ctrl+Z inside the Editor is taken over by the app (' + kept.announced.join(',') + '), so the editor cannot undo its own typing');
    if (kept.shortcutListOpened) failures.push('typing ? in the editor opens the shortcut list instead of typing');
    await page.evaluate(() => Structra.setState('activeView', 'tree'));

    // ---- Rail follows what is open ----
    await page.locator('structra-rail [data-rail="transform"]').click();
    await page.waitForTimeout(300);
    const lit = await page.evaluate(() => [...document.querySelectorAll('structra-rail .rail-btn.active')].map((b) => b.dataset.rail).sort().join(','));
    if (lit !== 'transform') failures.push('with the Transform panel open the lit rail buttons should be "transform", they are "' + lit + '"');
    const title = await page.evaluate(() => document.querySelector('structra-query .panel-title').textContent);
    if (title !== 'Transform') failures.push('the panel title should say Transform, it says ' + title);
  } catch (err) {
    failures.push('crashed: ' + err.message.slice(0, 200));
  }
  if (errors.length) failures.push('page errors: ' + [...new Set(errors)].join(' | '));

  await browser.close();
  server.close();
  if (failures.length) { console.log('FAIL\n  ' + failures.join('\n  ')); process.exit(1); }
  console.log('shell smoke test: ok');
})();
