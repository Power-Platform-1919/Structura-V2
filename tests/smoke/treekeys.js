/* Awkward situations a real person runs into: JSON Lines and semicolon CSV, a Flatten that would lose data, Undo and the
   changed mark, Mask, Editor text that is not applied yet, tab names, Escape, stale panel results, several files at once,
   huge share links and a browser that blocks saving. Nothing may throw, lose work or fail silently.

   Run:  node tests/smoke/treekeys.js          (PW_CHANNEL=msedge uses the installed Edge)
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
    await load('one.json', JSON.stringify({ user: { name: 'Ann', tags: ['a', 'b'] }, count: 3 }));
    await page.evaluate(() => Structra.setState('activeView', 'tree'));
    await page.waitForTimeout(500);

    // Arrow keys move the selection, Left folds, Right unfolds, Enter selects
    await page.locator('#jsonView .cm-content').focus();
    const sel = () => page.evaluate(() => Structra.state.currentPath);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    const p1 = await sel();
    if (!p1 || p1 === '$') failures.push('Down should select a line, the path is ' + p1);
    await page.keyboard.press('ArrowUp');
    const p2 = await sel();
    if (p2 === p1) failures.push('Up should move to the line before');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowLeft');            // on the user block: fold it
    const folded = await page.evaluate(() => [...document.querySelectorAll('#jsonView .j-line')].filter((l) => l.offsetParent !== null).length);
    await page.keyboard.press('ArrowRight');
    const unfolded = await page.evaluate(() => [...document.querySelectorAll('#jsonView .j-line')].filter((l) => l.offsetParent !== null).length);
    if (!(unfolded > folded)) failures.push(`Left then Right should fold then unfold a block: ${folded} then ${unfolded} lines`);
    const lv = await page.evaluate(() => /Levels/.test(document.querySelector('structra-canvas-header').textContent));
    if (!lv) failures.push('the 1 2 3 buttons should be labelled Levels');

    // a single object becomes a Field and Value table
    await page.evaluate(() => Structra.setState('activeView', 'table'));
    await page.waitForTimeout(600);
    const heads = await page.evaluate(() => [...document.querySelectorAll('structra-table thead th')].map((t) => t.textContent.trim()));
    if (heads.join() !== 'Field,Value') failures.push('a single object should show Field and Value columns: ' + heads.join());

    // Compare offers the other open tab
    await load('two.json', JSON.stringify({ user: { name: 'Bo' }, count: 4 }));
    await page.evaluate(() => Structra.events.emit('diff:open', {}));
    await page.waitForSelector('#diffRightSrc option[value^="tab:"]', { state: 'attached', timeout: 20000 }).catch(() => {});   // the other tab is offered
    const opts = await page.evaluate(() => [...document.querySelectorAll('#diffRightSrc option')].map((o) => o.value));
    if (!opts.some((v) => v.startsWith('tab:'))) failures.push('Compare should offer another open tab: ' + opts.join());
    await page.selectOption('#diffRightSrc', opts.find((v) => v.startsWith('tab:')));
    // wait for the result itself (a busy computer takes longer), not a fixed time
    await page.waitForFunction(() => /changed/.test((document.querySelector('#diffStats') || {}).textContent || ''), null, { timeout: 30000 }).catch(() => {});
    const stats = await page.evaluate(() => document.querySelector('#diffStats').textContent);
    if (!/changed/.test(stats) || /^0 added 0 removed 0 changed/.test(stats.trim())) failures.push('comparing two tabs should show differences: ' + stats);
    await page.keyboard.press('Escape');
  } catch (err) {
    failures.push('crashed: ' + err.message.slice(0, 220));
  }
  if (errors.length) failures.push('page errors: ' + [...new Set(errors)].join(' | '));

  await browser.close();
  server.close();
  if (failures.length) { console.log('FAIL\n  ' + failures.join('\n  ')); process.exit(1); }
  console.log('treekeys smoke test: ok');
})();
