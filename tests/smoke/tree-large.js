/* The Tree on very large documents (budget test). CodeMirror draws only the lines in view, so a document of millions of lines must still be
   about a hundred lines in the page, open quickly, and open and close a block quickly. Checked with generous limits (a busy build computer is
   slower than a laptop): the point is that nothing scales with the size of the document.

     1. 100,000 records (2.5 million file lines): the page holds few lines, the last line is numbered like the file, a record opens and
        closes, collapse all and open all work, a row at the end is reached by its path;
     2. a list of 600,000 numbers (more than a window of 500,000): the window ends with a "more" row, which shows the next ones.

   Run:  node tests/smoke/tree-large.js          (PW_CHANNEL=msedge uses the installed Edge; PW_BROWSER=firefox or webkit) */
const { runAppTest } = require('../app-test');
const { uploadAndWait } = require('../page-helpers');

runAppTest('tree-large', async ({ page, fail }) => {
  // a small file first, so the Tree and its library are loaded before the large one is timed
  await uploadAndWait(page, { name: 'small.json', mimeType: 'application/json', buffer: Buffer.from('{"a":1}') });
  await page.evaluate(() => Structra.setState('activeView', 'tree'));
  await page.waitForSelector('structra-tree .j-line', { timeout: 20000 });

  /* ---------- 1. 100,000 records ---------- */
  const records = await page.evaluate(async () => {
    const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const data = Array.from({ length: 100000 }, (v, i) => ({ id: i, name: 'item ' + i, tags: ['a', 'b'], owner: { mail: 'p' + i + '@x.com', roles: [] }, note: null }));
    const out = {};
    const started = performance.now();
    Structra.setState('jsonData', data);
    const view = document.querySelector('.json-view');
    while (!view.querySelector('.j-line[data-path="[99999]"], .j-line[data-path="[5]"]') && performance.now() - started < 30000) await new Promise((resolve) => setTimeout(resolve, 20));
    await frame();
    out.openMs = Math.round(performance.now() - started);
    out.linesInPage = view.querySelectorAll('.j-line').length;
    const scroller = view.querySelector('.cm-scroller');
    // the end: the last line is numbered like the last line of the file (the records are closed, so the file has far more lines than rows)
    scroller.scrollTop = scroller.scrollHeight;
    await frame(); await frame();
    const last = [...view.querySelectorAll('.j-line')].pop();
    out.lastText = last.textContent.trim();
    out.lastLineNumber = Number(last.dataset.ln);
    out.fileLines = Structra.treeModel.linesOf(data);
    // open one record and close it
    scroller.scrollTop = 0;
    await frame();
    const toggle = view.querySelector('.j-line[data-path="[3]"] .j-toggle');
    let t = performance.now();
    toggle.click();
    await frame();
    out.openOneMs = Math.round(performance.now() - t);
    out.opened = !!view.querySelector('.j-line[data-path="[3].name"]');
    view.querySelector('.j-line[data-path="[3]"] .j-toggle').click();
    await frame();
    out.closed = !view.querySelector('.j-line[data-path="[3].name"]');
    // a row at the end, by its path (what Find and the path bar do)
    t = performance.now();
    Structra.setState('currentPath', '$[99990].owner.mail');
    while (!view.querySelector('.j-line.highlighted[data-path="[99990].owner.mail"]') && performance.now() - t < 15000) await new Promise((resolve) => setTimeout(resolve, 20));
    await frame();
    out.reachMs = Math.round(performance.now() - t);
    out.reached = !!view.querySelector('.j-line.highlighted[data-path="[99990].owner.mail"]');
    // collapse all, then the first level again
    t = performance.now();
    await Structra.jsonTreeRenderer.collapseAll(view);
    await frame();
    out.collapseAllMs = Math.round(performance.now() - t);
    // the selected row stays reachable, so its blocks reopen; the rest of the 100,000 records stay closed
    scroller.scrollTop = 0; await frame();
    out.collapsedText = view.querySelector('.j-line').textContent.trim();
    out.recordsClosed = !view.querySelector('.j-line[data-path="[3]"] .j-toggle') || view.querySelector('.j-line[data-path="[3]"] .j-toggle').textContent === '▶';
    return out;
  });
  console.log('  100,000 records:', JSON.stringify(records));
  if (records.linesInPage > 400) fail(`the Tree should draw only the lines in view, not ${records.linesInPage}`);
  if (records.openMs > 20000) fail('100,000 records took too long to show: ' + records.openMs + ' ms');
  if (records.lastText !== ']' || records.lastLineNumber !== records.fileLines) fail(`the last line should be "]" numbered ${records.fileLines}, it is "${records.lastText}" numbered ${records.lastLineNumber}`);
  if (!records.opened || !records.closed) fail('a record should open and close: ' + JSON.stringify({ opened: records.opened, closed: records.closed }));
  if (records.openOneMs > 1500) fail('opening one record should be quick, it took ' + records.openOneMs + ' ms');
  if (!records.reached) fail('a row at the end should be reached by its path');
  if (!/^▼\[/.test(records.collapsedText) || !records.recordsClosed) fail('collapse all should leave the records closed (the selected row stays reachable): "' + records.collapsedText + '"');

  /* ---------- 2. 600,000 numbers: a window and a "more" row ---------- */
  const windowed = await page.evaluate(async () => {
    const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const data = Array.from({ length: 600000 }, (v, i) => i);
    const out = {};
    const view = document.querySelector('.json-view');
    const started = performance.now();
    Structra.setState('jsonData', data);
    while (!view.querySelector('.j-line[data-path="[5]"]') && performance.now() - started < 30000) await new Promise((resolve) => setTimeout(resolve, 20));
    await frame();
    out.openMs = Math.round(performance.now() - started);
    const scroller = view.querySelector('.cm-scroller');
    scroller.scrollTop = scroller.scrollHeight;
    await frame(); await frame();
    const texts = [...view.querySelectorAll('.j-line')].map((line) => line.textContent.trim());
    out.moreLine = texts.find((text) => /more items/.test(text)) || null;
    const more = [...view.querySelectorAll('.j-line')].find((line) => /more items/.test(line.textContent));
    if (more) { more.click(); await frame(); await frame(); }
    scroller.scrollTop = scroller.scrollHeight;
    await frame(); await frame();
    const after = [...view.querySelectorAll('.j-line')];
    out.lastBefore = after[after.length - 1].textContent.trim();
    out.lastNumber = Number(after[after.length - 1].dataset.ln);
    out.hasMoreAfter = after.some((line) => /more items/.test(line.textContent));
    return out;
  });
  console.log('  600,000 numbers:', JSON.stringify(windowed));
  if (!windowed.moreLine || !/100,000 more items/.test(windowed.moreLine)) fail('the window should end with a "more" row saying 100,000 more items: ' + windowed.moreLine);
  if (windowed.hasMoreAfter) fail('after using the "more" row all the items should show');
  if (windowed.lastBefore !== ']' || windowed.lastNumber !== 600002) fail(`the last line should be "]" numbered 600002, it is "${windowed.lastBefore}" numbered ${windowed.lastNumber}`);
}, { viewport: { width: 1360, height: 900 } });
