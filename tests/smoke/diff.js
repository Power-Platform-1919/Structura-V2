/* The Compare dialog: it says what really changed (an item added at the start of a list is one change), shades the changed
   lines in two code boxes that scroll together, keeps working on big documents, and copies a JSON Patch.

   Run:  node tests/smoke/diff.js          (PW_CHANNEL=msedge uses the installed Edge)
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
  const page = await (await newCtx(browser, { viewport: { width: 1360, height: 900 } })).newPage();
  const failures = [];
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));

  // Open the dialog with two documents and wait until the compare has finished
  const compare = async (left, right) => {
    await page.evaluate(([l, r]) => Structra.events.emit('diff:open', { left: l, right: r }), [left, right]);
    await page.waitForFunction(() => {
      const note = document.querySelector('#diffNote');
      return !(note && /^Comparing/.test(note.textContent)) && document.querySelector('#diffStats').textContent.trim() !== '';
    }, null, { timeout: 60000 });
    await page.waitForTimeout(300);
  };
  const stats = () => page.evaluate(() => document.querySelector('#diffStats').textContent.replace(/\s+/g, ' ').trim());
  const shaded = (side, cls) => page.evaluate(([s, c]) => {
    const host = document.querySelector(s === 'left' ? '#diffLeftHost' : '#diffRightHost');
    const cm = host.querySelector('.CodeMirror').CodeMirror;
    const lines = [];
    for (let i = 0; i < cm.lineCount(); i++) {
      const info = cm.lineInfo(i);
      if ((info.bgClass || '').split(' ').includes(c)) lines.push(cm.getLine(i).trim());
    }
    return lines;
  }, [side, cls]);

  try {
    await page.goto(base);
    await page.waitForSelector('#canvasEmpty input[type=file]', { state: 'attached', timeout: 10000 });
    await page.keyboard.press('Escape');
    await page.locator('#canvasEmpty input[type=file]').first().setInputFiles({ name: 'a.json', mimeType: 'application/json', buffer: Buffer.from('{"a":1}') });
    await page.waitForTimeout(1000);
    await page.evaluate(() => { window.__toasts = []; const t = Structra.toast; Structra.toast = (m, ...r) => { window.__toasts.push(String(m)); return t.call(Structra, m, ...r); }; });

    // ---- An item added at the start of a list is one change ----
    await compare([1, 2, 3, 4], [0, 1, 2, 3, 4]);
    if ((await stats()) !== '1 added 0 removed 0 changed') failures.push('one item added at the start should read 1 added 0 removed 0 changed: ' + (await stats()));
    const added = await shaded('right', 'diff-add');
    if (added.join('|') !== '0,') failures.push('only the added line should be shaded on the right: ' + JSON.stringify(added));
    if ((await shaded('left', 'diff-rm')).length || (await shaded('left', 'diff-chg')).length) failures.push('nothing on the left should be shaded');

    // ---- A record that changed after another was added: shaded on each side where it really is ----
    await compare(
      [{ id: 1, n: 'a' }, { id: 2, n: 'b' }, { id: 3, n: 'c' }],
      [{ id: 0, n: 'z' }, { id: 1, n: 'a' }, { id: 2, n: 'B' }, { id: 3, n: 'c' }],
    );
    if ((await stats()) !== '1 added 0 removed 1 changed') failures.push('an added and a changed record: ' + (await stats()));
    const left = await shaded('left', 'diff-chg');
    const right = await shaded('right', 'diff-chg');
    if (left.join('|') !== '"n": "b"' || right.join('|') !== '"n": "B"') failures.push('the changed value should be shaded on each side: ' + JSON.stringify({ left, right }));

    // ---- Swap turns added into removed ----
    await compare([1, 2, 3, 4], [0, 1, 2, 3, 4]);
    await page.locator('[data-action="swap"]').click();
    await page.waitForTimeout(500);
    if ((await stats()) !== '0 added 1 removed 0 changed') failures.push('after Swap the added item should read as removed: ' + (await stats()));

    // ---- Inline and Structural lists ----
    await page.locator('[data-diff-mode="inline"]').click();
    await page.waitForTimeout(300);
    const inline = await page.evaluate(() => [...document.querySelectorAll('#diffList .diff-line')].map((l) => l.textContent.replace(/\s+/g, ' ').trim()));
    if (inline.join('|') !== '-$[0]: 0') failures.push('Inline should list the one change: ' + JSON.stringify(inline));
    await page.locator('[data-diff-mode="structural"]').click();
    await page.waitForTimeout(300);
    if (!(await page.evaluate(() => /removed/.test(document.querySelector('#diffList').textContent)))) failures.push('Structural should list the change');
    await page.locator('[data-diff-mode="side"]').click();
    await page.waitForTimeout(500);
    if (!(await page.evaluate(() => document.querySelector('#diffLeftHost .CodeMirror').offsetHeight > 100))) failures.push('Side by Side should show the two code boxes again');

    // ---- JSON Patch ----
    await compare([1, 2, 3], [1, 2, 3, 4]);
    await page.locator('[data-action="copy-patch"]').click();
    await page.waitForTimeout(500);
    const toast = await page.evaluate(() => window.__toasts.slice(-1)[0]);
    if (!/Copied 1 patch operation/.test(toast || '')) failures.push('Copy JSON Patch should say it copied 1 operation: ' + toast);

    // ---- The two boxes scroll together ----
    const long = Array.from({ length: 3000 }, (_, i) => ({ id: i, name: 'item ' + i }));
    await compare(long, long.map((x) => (x.id === 1500 ? { ...x, name: 'changed' } : x)));
    if ((await stats()) !== '0 added 0 removed 1 changed') failures.push('one changed record in a long list: ' + (await stats()));
    const sync = await page.evaluate(async () => {
      const l = document.querySelector('#diffLeftHost .CodeMirror').CodeMirror;
      const r = document.querySelector('#diffRightHost .CodeMirror').CodeMirror;
      l.scrollTo(0, 5000);
      await new Promise((res) => setTimeout(res, 200));
      return { left: Math.round(l.getScrollInfo().top), right: Math.round(r.getScrollInfo().top) };
    });
    if (sync.left < 4000 || Math.abs(sync.left - sync.right) > 5) failures.push('scrolling one box should scroll the other: ' + JSON.stringify(sync));

    // ---- Long lists: no crash, a note, and only the visible lines are in the page ----
    const t0 = Date.now();
    await compare({ list: Array.from({ length: 300000 }, (_, i) => i) }, { list: Array.from({ length: 300000 }, (_, i) => i + 1) });
    const big = await page.evaluate(() => ({ note: document.querySelector('#diffNote').textContent, hidden: document.querySelector('#diffNote').hidden, drawn: document.querySelectorAll('#diffLeftHost .CodeMirror-code pre').length }));
    if (big.hidden || !/compared by position/.test(big.note)) failures.push('long lists should say they are compared by position: ' + JSON.stringify(big));
    if (big.drawn > 300) failures.push('only the lines in view should be drawn, ' + big.drawn + ' were');
    if (!/300,000 changed/.test(await stats())) failures.push('300,000 changed values expected: ' + (await stats()));
    if (Date.now() - t0 > 60000) failures.push('a big compare took ' + Math.round((Date.now() - t0) / 1000) + ' s');
    // The lists of changes stop at a number that keeps the page quick, and say so
    await page.locator('[data-diff-mode="inline"]').click();
    await page.waitForTimeout(500);
    const more = await page.evaluate(() => ({ rows: document.querySelectorAll('#diffList .diff-line').length, note: (document.querySelector('.diff-more') || {}).textContent || '' }));
    if (more.rows > 4100 || !/Showing the first/.test(more.note)) failures.push('the Inline list should stop at a limit and say so: ' + JSON.stringify({ rows: more.rows, note: more.note.slice(0, 60) }));

    // ---- Text of the difference can be copied ----
    await page.locator('[data-diff-mode="side"]').click();
    await compare({ a: 1 }, { a: 2 });
    if ((await stats()) !== '0 added 0 removed 1 changed') failures.push('a changed value: ' + (await stats()));
  } catch (e) {
    failures.push('crashed: ' + e.message.split(/\r?\n/).slice(0, 4).join(' / '));
  }

  if (errors.length) failures.push('page errors: ' + [...new Set(errors)].join(' | '));
  await browser.close();
  server.close();
  if (failures.length) { console.log('diff smoke test: FAILED\n - ' + failures.join('\n - ')); process.exit(1); }
  console.log('diff smoke test: ok');
})();
