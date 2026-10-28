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
const { runAppTest } = require('../app-test');
const { uploadAndWait } = require('../page-helpers');

async function openJson(page, name, value) {
  await page.evaluate(() => Structra.setState('activeView', 'overview'));
  await uploadAndWait(page, { name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) });
  await page.evaluate(() => Structra.setState('activeView', 'tree'));
  await page.waitForSelector('.json-view .j-line', { timeout: 20000 });
}

runAppTest('tree-state', async ({ page, fail }) => {
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
  if (handlers !== 1) fail('after 4 renders one click should select once, it selected ' + handlers + ' times');
  await page.locator('.json-view .j-str').first().dblclick();
  await page.waitForSelector('.j-inline-edit', { timeout: 3000 });
  if (await page.locator('.j-inline-edit').count() !== 1) fail('a double click should open one edit box');
  await page.keyboard.press('Escape');

  const special = await page.evaluate(() => [...document.querySelectorAll('.json-view .j-special')].map((el) => el.title));
  if (special.join() !== 'U+202E,U+200B') fail('the hidden characters of a text value should show as marks, got ' + JSON.stringify(special));

  /* ---- 2. a long list: what is marked survives scrolling away and back, far rows can be reached ---- */
  const rows = [];
  for (let i = 0; i < 3000; i++) rows.push({ id: i, name: 'row' + i, meta: { a: i, b: [1, 2, 3], c: { d: 'x' } }, tags: ['p', 'q'] });
  await openJson(page, 'rows.json', rows);

  const kept = await page.evaluate(async () => {
    const view = document.querySelector('.json-view');
    const scroller = view.querySelector('.cm-scroller');
    const renderer = Structra.jsonTreeRenderer;
    const until = async (test, what) => {
      const began = performance.now();
      while (!test()) {
        if (performance.now() - began > 15000) throw new Error('timed out waiting for ' + what);
        await new Promise((resolve) => setTimeout(resolve, 30));
      }
    };
    const marks = () => ({
      highlighted: (view.querySelector('.j-line.highlighted') || {}).dataset ? view.querySelector('.j-line.highlighted').dataset.path : null,
      find: !!view.querySelector('.j-line.find-match'),
      bookmark: !!view.querySelector('.j-line.bookmarked'),
      key: view.querySelectorAll('.j-key-hl').length > 0,
      toggle: (view.querySelector('.j-line[data-path="[2].meta"] .j-toggle') || {}).textContent,
    });
    scroller.scrollTop = 0;
    await until(() => view.querySelector('.j-line[data-path="[2].meta"]'), 'the first rows');
    // the first view opens the records and leaves their blocks closed: open one, then mark lines
    view.querySelector('.j-line[data-path="[2].meta"] .j-toggle').click();
    renderer.highlightPath(view, '[3].name');
    renderer.highlightPaths(view, ['$[4].name']);
    renderer.updateBookmarkHighlights(view, ['[5].name']);
    renderer.highlightKeyByName(view, 'name');
    await until(() => view.querySelector('.j-line[data-path="[2].meta"]'), 'the marked rows');
    const before = marks();
    const restoreTop = scroller.scrollTop;
    // Far away: the first rows leave the page. Then back: they are drawn again, as they were.
    await until(() => { scroller.scrollTop = scroller.scrollHeight; return !view.querySelector('.j-line[data-path="[2].meta"]'); }, 'the first rows to leave the page');
    // back to the marked lines: from the top, down until they are in the page (browsers keep a pixel position a little differently)
    scroller.scrollTop = 0;
    for (let step = 0; step < 60 && !view.querySelector('.j-line[data-path="[5].name"]'); step++) { scroller.scrollTop += 120; await new Promise((resolve) => setTimeout(resolve, 40)); }
    await until(() => view.querySelector('.j-line[data-path="[2].meta"]'), 'the first rows to be drawn again');
    // the marks are drawn with the lines: wait (with a limit) until they are back, then compare
    await until(() => JSON.stringify(marks()) === JSON.stringify(before), 'the marks to be drawn again').catch(() => {});
    return { before, after: marks() };
  });
  if (kept.before.toggle !== '▼') fail('setup: the block should be open after a click, got ' + kept.before.toggle);
  for (const name of Object.keys(kept.before)) {
    if (JSON.stringify(kept.before[name]) !== JSON.stringify(kept.after[name])) fail(`"${name}" changed when its lines left the page and were drawn again: ${JSON.stringify(kept.before[name])} became ${JSON.stringify(kept.after[name])}`);
  }
  // the page holds only the lines in view, not the document
  const drawn = await page.evaluate(() => document.querySelectorAll('.json-view .j-line').length);
  if (drawn > 400) fail('the Tree should draw only the lines in view, not ' + drawn);

  // A row far down, never scrolled to: the path bar selects it and the Tree draws it, in view
  const far = await page.evaluate(async () => {
    Structra.setState('currentPath', '$[2500].name');
    const view = document.querySelector('.json-view');
    const scroller = view.querySelector('.cm-scroller');
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
    const viewBox = scroller.getBoundingClientRect();
    return { found: true, inView: lineBox.top >= viewBox.top - 1 && lineBox.bottom <= viewBox.bottom + 1, number: line.dataset.ln };
  });
  if (!far.found) fail('selecting a row far down ($[2500].name) should draw it and highlight it');
  else if (!far.inView) fail('the row far down should be scrolled into view');

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
  if (!afterCollapse.found || !afterCollapse.visible) fail('after collapse all, selecting $[2700].meta.a should open the blocks above it: ' + JSON.stringify(afterCollapse));

  // A page key moves by a page of lines
  await page.evaluate(async () => { await Structra.jsonTreeRenderer.expandAll(document.querySelector('.json-view')); Structra.setState('currentPath', '$[10].name'); });
  await page.waitForSelector('.j-line.highlighted[data-path="[10].name"]', { timeout: 5000 });
  const lineNumber = () => page.evaluate(() => Number((document.querySelector('.j-line.highlighted') || { dataset: { ln: 0 } }).dataset.ln));
  const start = await lineNumber();
  await page.locator('.json-view .cm-content').focus();
  await page.keyboard.press('PageDown');
  await page.waitForFunction((from) => Number((document.querySelector('.j-line.highlighted') || { dataset: { ln: 0 } }).dataset.ln) > from + 10, start, { timeout: 5000 }).catch(() => {});
  const afterDown = await lineNumber();
  if (afterDown < start + 10) fail('PageDown should move by a page of lines, it moved from line ' + start + ' to ' + afterDown);
  await page.keyboard.press('PageUp');
  await page.waitForFunction((from) => Number((document.querySelector('.j-line.highlighted') || { dataset: { ln: 0 } }).dataset.ln) < from, afterDown, { timeout: 5000 }).catch(() => {});
  if (await lineNumber() >= afterDown) fail('PageUp should move back up');

  /* ---- 3. Find: Enter goes to the next match, in document order ---- */
  await page.evaluate(() => { Structra.setState('activeView', 'tree'); Structra.setState('findBarOpen', true); });
  await page.locator('#findInput').fill('row1');
  await page.waitForFunction(() => /found/.test(document.querySelector('#findCount').textContent), null, { timeout: 10000 });
  const matchAt = () => page.evaluate(() => { const line = document.querySelector('.json-view .j-line.highlighted'); return (line ? line.dataset.path : null) + ' ' + document.querySelector('#findCount').textContent; });
  const step = async (key, expected) => {
    await page.locator('#findInput').press(key);
    await page.waitForFunction((want) => { const line = document.querySelector('.json-view .j-line.highlighted'); return line && (line.dataset.path + ' ' + document.querySelector('#findCount').textContent).startsWith(want); }, expected, { timeout: 8000 }).catch(() => {});
    const got = await matchAt();
    if (!got.startsWith(expected)) fail('Find: after ' + key + ' expected ' + expected + ', got ' + got);
  };
  await step('Enter', '[1].name 1/');
  await step('Enter', '[10].name 2/');
  await step('Shift+Enter', '[1].name 1/');
  await page.evaluate(() => Structra.setState('findBarOpen', false));

  // The Table's rows, selection and keyboard are tested in table-grid.js
}, { viewport: { width: 1360, height: 900 } });
