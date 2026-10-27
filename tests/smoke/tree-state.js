/* The Tree keeps its state when its chunks are recycled, and reaches rows that are not drawn yet.

   What this guards (each was a real bug, found by comparing the Tree with CodeMirror, which keeps fold and selection state
   in its state and draws the page from it):
   - every render used to add another set of click handlers: one click ran them all, and a double click threw errors
   - a block that was closed opened again when its chunk was recycled and drawn again; so did the selected line, the search
     results, the bookmark marker and the highlighted key
   - Find, the path bar and the bookmarks could not reach a row in a chunk that was not drawn yet
   - hidden and direction changing characters in a text value were invisible
   - PageUp and PageDown did nothing

   Run:  node tests/smoke/tree-state.js          (PW_CHANNEL=msedge uses the installed Edge)
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

async function openJson(page, name, value) {
  await page.evaluate(() => Structra.setState('activeView', 'overview'));
  await uploadAndWait(page, { name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) });
  await page.evaluate(() => Structra.setState('activeView', 'tree'));
  await page.waitForSelector('.json-view .j-line', { timeout: 20000 });
}

(async () => {
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}/index.html`;
  const browser = await launchBrowser(chromium);
  const page = await (await newCtx(browser, { viewport: { width: 1360, height: 900 } })).newPage();
  const failures = [];
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));

  try {
    await page.goto(base);
    await page.waitForSelector('#canvasEmpty input[type=file]', { state: 'attached', timeout: 10000 });
    await page.keyboard.press('Escape');

    /* ---- 1. a render does not stack handlers; special characters show; PageDown moves by a page ---- */
    await openJson(page, 'small.json', { a: 'hello', b: 2, hidden: 'adm‮in​' });
    const handlers = await page.evaluate(async () => {
      const tree = document.querySelector('structra-tree');
      for (let i = 0; i < 3; i++) tree.renderTree();
      let selected = 0;
      Structra.events.on('tree:node-selected', () => selected++);
      document.querySelector('.json-view .j-key').click();
      await new Promise((resolve) => setTimeout(resolve, 700));
      return selected;
    });
    if (handlers !== 1) failures.push('after 4 renders one click should select once, it selected ' + handlers + ' times');
    await page.locator('.json-view .j-str').first().dblclick();
    await page.waitForSelector('.j-inline-edit', { timeout: 3000 });
    if (await page.locator('.j-inline-edit').count() !== 1) failures.push('a double click should open one edit box');
    await page.keyboard.press('Escape');

    const special = await page.evaluate(() => [...document.querySelectorAll('.json-view .j-special')].map((el) => el.title));
    if (special.join() !== 'U+202E,U+200B') failures.push('the hidden characters of a text value should show as marks, got ' + JSON.stringify(special));

    /* ---- 2. a long list: state survives recycling, far rows can be reached ---- */
    const rows = [];
    for (let i = 0; i < 3000; i++) rows.push({ id: i, name: 'row' + i, meta: { a: i, b: [1, 2, 3], c: { d: 'x' } }, tags: ['p', 'q'] });
    await openJson(page, 'rows.json', rows);

    const kept = await page.evaluate(async () => {
      const view = document.querySelector('.json-view');
      const renderer = Structra.jsonTreeRenderer;
      const until = async (test, what) => {
        const began = performance.now();
        while (!test()) {
          if (performance.now() - began > 15000) throw new Error('timed out waiting for ' + what);
          await new Promise((resolve) => setTimeout(resolve, 30));
        }
      };
      const firstChunk = () => view.querySelector('.j-chunk[data-chunkpath=""][data-chunkstart="0"]');
      const marks = () => ({
        highlighted: (view.querySelector('.j-line.highlighted') || {}).dataset ? view.querySelector('.j-line.highlighted').dataset.path : null,
        find: !!view.querySelector('.j-line.find-match'),
        bookmark: !!view.querySelector('.j-line.bookmarked'),
        key: view.querySelectorAll('.j-key-hl').length > 0,
        toggle: (view.querySelector('.j-line[data-path="[2].meta"] .j-toggle') || {}).textContent,
      });
      view.scrollTop = 0;
      await until(() => firstChunk() && !firstChunk().dataset.recycled, 'the first chunk');
      view.querySelector('.j-line[data-path="[2].meta"] .j-toggle').click();
      renderer.highlightPath(view, '[3].name');
      renderer.highlightPaths(view, ['$[4].name']);
      renderer.updateBookmarkHighlights(view, ['[5].name']);
      renderer.highlightKeyByName(view, 'name');
      const before = marks();
      // Far away: the first chunk is recycled (emptied). Then back: it is drawn again.
      await until(() => { view.scrollTop = view.scrollHeight; return firstChunk().dataset.recycled; }, 'the first chunk to be recycled');
      view.scrollTop = 0;
      await until(() => !firstChunk().dataset.recycled && view.querySelector('.j-line[data-path="[2].meta"]'), 'the first chunk to be drawn again');
      return { before, after: marks() };
    });
    if (kept.before.toggle !== '▶') failures.push('setup: the block should be closed before recycling, got ' + kept.before.toggle);
    for (const name of Object.keys(kept.before)) {
      if (JSON.stringify(kept.before[name]) !== JSON.stringify(kept.after[name])) failures.push(`"${name}" changed when its chunk was recycled and drawn again: ${JSON.stringify(kept.before[name])} became ${JSON.stringify(kept.after[name])}`);
    }

    // A row far down, never scrolled to: the path bar selects it and the Tree draws it, in view
    const far = await page.evaluate(async () => {
      Structra.setState('currentPath', '$[2500].name');
      const view = document.querySelector('.json-view');
      const began = performance.now();
      let line = null;
      while (performance.now() - began < 10000) {
        line = view.querySelector('.j-line.highlighted[data-path="[2500].name"]');
        if (line) break;
        await new Promise((resolve) => setTimeout(resolve, 30));
      }
      if (!line) return { found: false };
      await new Promise((resolve) => setTimeout(resolve, 600));
      const lineBox = line.getBoundingClientRect();
      const viewBox = view.getBoundingClientRect();
      return { found: true, inView: lineBox.top >= viewBox.top - 1 && lineBox.bottom <= viewBox.bottom + 1, number: line.dataset.ln };
    });
    if (!far.found) failures.push('selecting a row far down ($[2500].name) should draw it and highlight it');
    else if (!far.inView) failures.push('the row far down should be scrolled into view');

    // After "collapse all", reaching a row opens the blocks above it and keeps them open
    const afterCollapse = await page.evaluate(async () => {
      const view = document.querySelector('.json-view');
      await Structra.jsonTreeRenderer.collapseAll(view);
      Structra.setState('currentPath', '$[2700].meta.a');
      const began = performance.now();
      let line = null;
      while (performance.now() - began < 10000) {
        line = view.querySelector('.j-line.highlighted[data-path="[2700].meta.a"]');
        if (line && line.offsetParent !== null) break;
        await new Promise((resolve) => setTimeout(resolve, 30));
      }
      return { found: !!line, visible: !!line && line.offsetParent !== null };
    });
    if (!afterCollapse.found || !afterCollapse.visible) failures.push('after collapse all, selecting $[2700].meta.a should open the blocks above it: ' + JSON.stringify(afterCollapse));

    // A page key moves by a page of lines
    await page.evaluate(() => { Structra.jsonTreeRenderer.expandAll(document.querySelector('.json-view')); Structra.setState('currentPath', '$[10].name'); });
    await page.waitForSelector('.j-line.highlighted[data-path="[10].name"]', { timeout: 5000 });
    const lineNumber = () => page.evaluate(() => Number((document.querySelector('.j-line.highlighted') || { dataset: { ln: 0 } }).dataset.ln));
    const start = await lineNumber();
    await page.locator('.json-view').focus();
    await page.keyboard.press('PageDown');
    await page.waitForFunction((from) => Number((document.querySelector('.j-line.highlighted') || { dataset: { ln: 0 } }).dataset.ln) > from + 10, start, { timeout: 5000 }).catch(() => {});
    const afterDown = await lineNumber();
    if (afterDown < start + 10) failures.push('PageDown should move by a page of lines, it moved from line ' + start + ' to ' + afterDown);
    await page.keyboard.press('PageUp');
    await page.waitForFunction((from) => Number((document.querySelector('.j-line.highlighted') || { dataset: { ln: 0 } }).dataset.ln) < from, afterDown, { timeout: 5000 }).catch(() => {});
    if (await lineNumber() >= afterDown) failures.push('PageUp should move back up');
  } catch (err) {
    failures.push('crashed: ' + err.message.split(/\r?\n/).slice(0, 4).join(' / '));
  }

  if (errors.length) failures.push('page errors: ' + [...new Set(errors)].join(' | '));
  await browser.close();
  server.close();
  if (failures.length) { console.log('tree-state smoke test: FAILED\n - ' + failures.join('\n - ')); process.exit(1); }
  console.log('tree-state smoke test: ok');
})();
