/* Graph, Heatmap, Minimap and Diff: a small graph opens centred in the view, clicking a node selects it (path bar and highlight).

   Run:  node tests/smoke/graph.js          (PW_CHANNEL=msedge uses the installed Edge)
*/
const { runAppTest } = require('../app-test');
const { uploadAndWait } = require('../page-helpers');
const path = require('path');

runAppTest('graph', async ({ page, fail, ROOT }) => {
  await uploadAndWait(page, path.join(ROOT, 'tests', 'fixtures', 'sp_getitems.json'));
  await page.evaluate(() => Structra.setState('activeView', 'graph'));
  await page.waitForTimeout(600);

  // ---- opens centred: the drawing sits in the middle of the view, not in the top left corner ----
  const box = await page.evaluate(() => {
    const c = document.querySelector('#graphContainer').getBoundingClientRect();
    const g = document.querySelector('.graph-group').getBoundingClientRect();
    return { left: g.left - c.left, right: c.right - g.right, top: g.top - c.top, bottom: c.bottom - g.bottom };
  });
  // A graph that fits is centred; one too big to be read when fitted opens at a readable zoom from the top left and scrolls
  const zoom = await page.evaluate(() => parseFloat(((document.querySelector('.graph-group').getAttribute('transform') || '').match(/scale\(([\d.]+)\)/) || [0, 1])[1]));
  const overflows = box.bottom < 0 || box.right < 0;
  if (overflows) {
    if (zoom < 0.54) fail('a big graph should open at a readable zoom (55 percent or more), it opened at ' + Math.round(zoom * 100) + ' percent');
    if (box.left < 0 || box.top < 0) fail('a big graph should start at the top left: ' + JSON.stringify(box));
  } else if (Math.abs(box.left - box.right) > 40 || Math.abs(box.top - box.bottom) > 40) fail('the graph should open centred in the view: ' + JSON.stringify(box));

  // ---- a click selects the node ----
  await page.locator('.graph-svg g[data-path="$.value[0].Title"]').first().click();
  await page.waitForTimeout(300);
  const sel = await page.evaluate(() => ({ path: Structra.state.currentPath, marked: [...document.querySelectorAll('.graph-node-selected')].map((r) => r.parentNode.dataset.path) }));
  if (sel.path !== '$.value[0].Title') fail('clicking a node should select its path: ' + JSON.stringify(sel));
  if (sel.marked.join() !== '$.value[0].Title') fail('the selected node should be highlighted: ' + JSON.stringify(sel));

  // ---- Heatmap colours the Tree lines, Minimap has a title and a close button, Diff labels its counts ----
  await page.evaluate(() => Structra.setState('activeView', 'tree'));
  await page.waitForTimeout(500);
  await page.evaluate(() => Structra.events.emit('heatmap:toggle'));
  await page.waitForTimeout(500);
  const heat = await page.evaluate(() => ({ coloured: document.querySelectorAll('.j-line[data-path]:not(.j-close)[style*="box-shadow"]').length, legend: (document.querySelector('.heatmap-indicator') || {}).textContent || '' }));
  if (heat.coloured < 5) fail('the Heatmap should colour the Tree lines, it coloured ' + heat.coloured);
  await page.locator('.heatmap-off').click();
  const heatOff = await page.evaluate(() => document.querySelectorAll('.j-line[style*="box-shadow"]').length);
  if (heatOff) fail('turning the Heatmap off should clear the colours, ' + heatOff + ' lines still have one');
  await page.evaluate(() => Structra.events.emit('minimap:toggle'));
  await page.waitForTimeout(300);
  const mm = await page.evaluate(() => { const m = document.querySelector('#minimapContainer'); return { shown: m.style.display !== 'none', title: (m.querySelector('.minimap-head') || {}).textContent || '', close: !!m.querySelector('.minimap-close') }; });
  if (!mm.shown || !/Minimap/.test(mm.title) || !mm.close) fail('the Minimap should show a title and a close button: ' + JSON.stringify(mm));
  await page.locator('.minimap-close').click();
  if (await page.evaluate(() => document.querySelector('#minimapContainer').style.display !== 'none')) fail('the Minimap close button does not close it');
  await page.evaluate(() => Structra.events.emit('diff:open', { left: { a: 1, b: 2, c: 3 }, right: { a: 1, b: 5, d: 4 } }));
  // wait for the result itself (a busy computer takes longer), not a fixed time
  await page.waitForFunction(() => /changed/.test((document.querySelector('#diffStats') || {}).textContent || ''), null, { timeout: 30000 }).catch(() => {});
  const stats = await page.evaluate(() => document.querySelector('#diffStats').textContent);
  if (!/added/.test(stats) || !/removed/.test(stats) || !/changed/.test(stats)) fail('the Diff counts should be labelled: "' + stats + '"');

  // ---- A long label wraps over lines in a taller node and keeps its full text as the name ----
  const wrapped = await page.evaluate(async () => {
    const long = 'a long title that does not fit on one line of a node';
    Structra.setState('activeView', 'graph');
    Structra.setState('jsonData', { short: 1, text: long, other: 2 });
    await new Promise((resolve) => setTimeout(resolve, 600));
    const node = [...document.querySelectorAll('structra-graph g[role=button]')].find((group) => (group.getAttribute('aria-label') || '').includes('a long title'));
    if (!node) return null;
    const rect = node.querySelector('rect');
    const small = [...document.querySelectorAll('structra-graph g[role=button]')].find((group) => group.getAttribute('aria-label') === 'short: 1');
    return { name: node.getAttribute('aria-label'), lines: node.querySelectorAll('tspan').length, height: Number(rect.getAttribute('height')), smallHeight: small ? Number(small.querySelector('rect').getAttribute('height')) : 0 };
  });
  if (!wrapped) fail('the node with the long label was not found');
  else {
    if (wrapped.lines < 2 || wrapped.lines > 3) fail('a long label should wrap over 2 or 3 lines: ' + JSON.stringify(wrapped));
    if (wrapped.height <= wrapped.smallHeight) fail('a wrapped node should be taller than a one-line node: ' + JSON.stringify(wrapped));
    if (!/^text: a long title/.test(wrapped.name)) fail('the node should keep its full label as its name: ' + wrapped.name);
  }
}, { viewport: { width: 1360, height: 800 } });
