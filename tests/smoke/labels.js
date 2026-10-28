/* Awkward situations a real person runs into: JSON Lines and semicolon CSV, a Flatten that would lose data, Undo and the
   changed mark, Mask, Editor text that is not applied yet, tab names, Escape, stale panel results, several files at once,
   huge share links and a browser that blocks saving. Nothing may throw, lose work or fail silently.

   Run:  node tests/smoke/labels.js          (PW_CHANNEL=msedge uses the installed Edge)
*/
const { runAppTest } = require('../app-test');
const { loadText, closeExtraTabs } = require('../page-helpers');

runAppTest('labels', async ({ page, fail }) => {
  const load = (name, text) => loadText(page, name, text);
  const closeAll = () => closeExtraTabs(page);
  const toastText = () => page.evaluate(() => document.querySelector('structra-toast #toastMsg').textContent);


  await load('list.json', JSON.stringify([{ id: 1, name: 'Ann', region: 'N' }, { id: 2, name: 'Bo', region: 'S' }]));
  const text = (sel) => page.evaluate((q) => [...document.querySelectorAll(q)].map((e) => e.textContent.replace(/\s+/g, ' ').trim()), sel);

  // plain names for the rail, the Query modes and the Filter tabs
  const rail = await text('structra-rail .rail-btn');
  if (rail[rail.length - 1] !== 'Settings' || !rail.includes('Themes')) fail('the rail should end with Themes then Settings: ' + rail.join(', '));
  await page.evaluate(() => Structra.setState('queryPanelOpen', true));
  await page.waitForTimeout(300);
  const modes = (await text('structra-query [data-mode]')).join(',');
  if (modes !== 'Path,JSONPath,Pattern,JavaScript,SQL') fail('Query modes should read Path, JSONPath, Pattern, JavaScript, SQL: ' + modes);
  const title = (await text('structra-query .panel-title'))[0];
  if (title !== 'Query and Transform') fail('the Query panel title should be Query and Transform: ' + title);
  await page.evaluate(() => Structra.setState('queryPanelOpen', false));
  await page.evaluate(() => Structra.setState('filterBarOpen', true));
  await page.waitForTimeout(300);
  const tabs = (await text('structra-filter .filter-mode-tab')).join(',');
  if (tabs !== 'Simple,JSONPath,Pattern,Formula') fail('Filter tabs should read Simple, JSONPath, Pattern, Formula: ' + tabs);
  const firstField = await page.evaluate(() => (document.querySelector('structra-filter .filter-field, structra-filter select') || {}).value);
  if (firstField !== 'name') fail('the filter should start on the first text column (name), it starts on ' + firstField);
  await page.evaluate(() => Structra.setState('filterBarOpen', false));

  // the Load URL box refuses text that is not a web address, before sending anything
  const sent = [];
  page.on('request', (r) => { if (/\/bob$/.test(r.url())) sent.push(r.url()); });
  await page.evaluate(() => Structra.events.emit('tabs:add'));
  await page.waitForTimeout(300);
  await page.locator('structra-input-panel [data-tab="url"]').click();
  await page.locator('[data-role="api-url"]').fill('bob');
  await page.locator('[data-role="api-send"]').click();
  await page.waitForTimeout(400);
  const urlErr = await text('[data-role="url-error"]');
  if (!urlErr.some((t) => /http/.test(t))) fail('text that is not a web address should be explained: ' + urlErr.join('|'));
  if (sent.length) fail('a request was sent for "bob"');

  // shortcuts: zoom has three clear rows
  await page.evaluate(() => Structra.events.emit('shortcuts:open'));
  await page.waitForTimeout(400);
  const sc = (await text('structra-shortcuts')).join(' ');
  if (!/Zoom in/.test(sc) || !/Zoom out/.test(sc) || !/Reset zoom/.test(sc) || /Ctrl\+- zooms/.test(sc)) fail('shortcuts should list Zoom in, Zoom out and Reset zoom as rows');
  await page.keyboard.press('Escape');

  // Overview: an empty value is calm (info), and a Status column is not "only 0% unique"
  await closeAll();
  const recs = Array.from({ length: 40 }, (_, i) => ({ id: 'r' + i, status: ['Open', 'Closed', 'Hold'][i % 3], notes: i % 3 === 0 ? 'x' : null }));
  await load('recs.json', JSON.stringify(recs));
  await page.evaluate(() => Structra.setState('activeView', 'overview'));
  await page.waitForTimeout(800);
  const finds = await page.evaluate(() => [...document.querySelectorAll('.ovw-find')].map((b) => ({ cls: b.className, text: b.textContent.replace(/\s+/g, ' ').trim() })));
  if (finds.some((f) => /unique/.test(f.text) && /status/i.test(f.text))) fail('a Status column should not be flagged as not unique: ' + JSON.stringify(finds));
  const notes = finds.find((f) => /notes/.test(f.text));
  if (notes && /sev-(high|med)/.test(notes.cls)) fail('empty values should be a calm note, not a warning: ' + notes.cls);

  // Null finder scans when opened and has no zero or false options
  await page.evaluate(() => Structra.events.emit('nullfinder:open'));
  await page.waitForTimeout(600);
  const nf = await page.evaluate(() => ({ items: document.querySelectorAll('#nfResults .nf-item').length, zero: !!document.querySelector('#nfZero') }));
  if (!nf.items) fail('the Null finder should list results as soon as it opens');
  if (nf.zero) fail('the Null finder should not offer zero or false');
  await page.keyboard.press('Escape');

  // Transform: a Pivot entry, and the code box is under Advanced
  await page.evaluate(() => Structra.setState('queryPanelOpen', true));
  await page.locator('[data-qtab="transform"]').click();
  const tr = await page.evaluate(() => ({ pivot: !!document.querySelector('[data-action="openPivot"]'), boxVisible: document.querySelector('#qpAdvanced').open }));
  if (!tr.pivot) fail('the Transform panel should offer Pivot');
  if (tr.boxVisible) fail('the code box should be folded under Advanced');
  await page.evaluate(() => Structra.setState('queryPanelOpen', false));

  // Every built-in theme keeps muted text, null and true readable (4.5:1) and the dark panels apart from the page
  const weak = await page.evaluate(() => {
    const out = [];
    for (const t of Structra.themeEngine.list().filter((x) => x.builtIn)) {
      const c = t.colors;
      for (const k of ['textMuted', 'synNull', 'synBoolean', 'accent']) {
        const worst = Math.min(...['bg', 'surface', 'surfaceAlt'].map((b) => Structra.themeEngine.contrast(c[k], c[b])));
        if (worst < 4.5) out.push(`${t.name} ${k} ${worst.toFixed(2)}`);
      }
      if (t.mode === 'dark' && Structra.themeEngine.contrast(c.border, c.bg) < 1.4) out.push(`${t.name} border is lost against the page`);
    }
    return out;
  });
  if (weak.length) fail('theme contrast: ' + weak.join('; '));

  // CSV: thousands separators are read and money keeps its decimals in the Table
  await closeAll();
  await load('prices.csv', 'Item,Price\nA,10.00\nB,"1,200.00"\nC,2.50\n');
  const prices = await page.evaluate(() => Structra.state.jsonData.map((r) => r.Price));
  if (prices.join() !== '10,1200,2.5') fail('CSV prices should be numbers, "1,200.00" included: ' + prices.join());
  await page.evaluate(() => Structra.setState('activeView', 'table'));
  await page.waitForTimeout(600);
  const cells = await page.evaluate(() => [...document.querySelectorAll('structra-table tbody tr td:nth-child(2)')].map((t) => t.textContent.trim()));
  if (cells.join() !== '10.00,1200.00,2.50') fail('the Table should keep two decimals for Price: ' + cells.join());

  // Editor: an error in plain words
  await page.evaluate(() => Structra.setState('activeView', 'editor'));
  await page.waitForTimeout(400);
  await page.evaluate(() => { document.querySelector('structra-editor .cv').codeView.replaceAll("{ 'a': 1 }"); });
  await page.waitForTimeout(500);
  const est = await page.evaluate(() => document.querySelector('#edStatus').textContent.trim());
  if (!/double quotes/.test(est) || /Unexpected token/.test(est)) fail('the Editor error should say in plain words that text needs double quotes: ' + est);
}, { viewport: { width: 1360, height: 800 } });
