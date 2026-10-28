/* Filter, Pivot and the Null finder work on the rows of the main list (the "value" list of a SharePoint response),
   with columns such as Status.Value, and say clearly when nothing matches.

   Run:  node tests/smoke/datatools.js          (PW_CHANNEL=msedge uses the installed Edge)
*/
const { runAppTest } = require('../app-test');
const { uploadAndWait } = require('../page-helpers');
const path = require('path');

runAppTest('datatools', async ({ page, fail, ROOT, context }) => {
  await uploadAndWait(page, path.join(ROOT, 'tests', 'fixtures', 'sp_getitems.json'));

  // ---- Filter ----
  await page.evaluate(() => Structra.setState('activeView', 'table'));
  await page.evaluate(() => Structra.setState('filterBarOpen', true));
  await page.waitForTimeout(400);
  const cols = await page.evaluate(() => [...document.querySelectorAll('#filterConditions .fc-row:first-child .fc-field option')].map((o) => o.value));
  for (const c of ['Title', 'Status.Value', 'Requester.Email', 'Approved']) if (!cols.includes(c)) fail(`the Filter does not offer the column ${c}: ${cols.join(', ')}`);
  if (cols.includes('value') || cols.includes('@odata.context')) fail('the Filter lists the document keys (value, @odata.context) instead of the columns: ' + cols.join(', '));
  const scope = await page.evaluate(() => document.querySelector('#filterScope').textContent);
  if (!/3 rows of value/.test(scope)) fail('the Filter should say what it filters: "' + scope + '"');

  const setCondition = async (field, op, value) => {
    const row = page.locator('#filterConditions .fc-row').first();
    await row.locator('.fc-field').selectOption(field);
    await row.locator('.fc-op').selectOption(op);
    await row.locator('.fc-value').fill(value);
    await page.locator('structra-filter [data-action="apply"]').click();
    await page.waitForTimeout(500);
  };
  await setCondition('Status.Value', 'eq', 'Open');
  let f = await page.evaluate(() => ({ count: document.querySelector('#filterCount').textContent, summary: document.querySelector('#filterSummary').textContent, rows: document.querySelectorAll('structra-table tbody tr').length }));
  if (f.count !== '2 rows match') fail('Status.Value = Open should match 2 rows: "' + f.count + '"');
  if (f.rows !== 2) fail('the Table should show the 2 matching rows, it shows ' + f.rows);
  if (!/Status\.Value = Open/.test(f.summary)) fail('the Filter does not say which condition it applied: "' + f.summary + '"');

  await setCondition('Title', 'contains', 'zzz');
  f = await page.evaluate(() => ({ count: document.querySelector('#filterCount').textContent, text: (document.querySelector('structra-table .table-empty') || {}).textContent || '', rows: document.querySelectorAll('structra-table tbody tr:not(.table-empty)').length }));
  if (f.count !== 'No rows match') fail('a filter with no match should say "No rows match": "' + f.count + '"');
  if (!/No rows match/.test(f.text) || f.rows) fail('the Table should show an empty message, not the whole document: ' + JSON.stringify(f));

  await page.locator('structra-filter [data-action="clear"]').click();
  await page.waitForTimeout(400);
  f = await page.evaluate(() => ({ conditions: document.querySelectorAll('#filterConditions .fc-row').length, rows: document.querySelectorAll('structra-table tbody tr').length }));
  if (f.conditions !== 1) fail('after Clear there should be one empty condition to type into, there are ' + f.conditions);
  if (f.rows !== 3) fail('after Clear the Table should show all 3 rows again, it shows ' + f.rows);
  await page.evaluate(() => Structra.setState('filterBarOpen', false));

  // ---- Pivot ----
  await page.evaluate(() => Structra.events.emit('pivot:open'));
  await page.waitForTimeout(500);
  const chips = await page.evaluate(() => [...document.querySelectorAll('#pivotFields .pivot-chip')].map((c) => c.textContent));
  for (const c of ['Status.Value', 'Cost', 'Requester.DisplayName']) if (!chips.includes(c)) fail(`the Pivot does not offer ${c}: ${chips.join(', ')}`);
  if (chips.includes('value') || chips.includes('@odata.context')) fail('the Pivot lists the document keys instead of the columns');
  await page.locator('#pivotFields .pivot-chip', { hasText: /^Status\.Value$/ }).click();
  const zone = await page.evaluate(() => document.querySelector('#pivotRows').textContent.trim());
  if (!/Status\.Value/.test(zone)) fail('clicking a field should put it in Group by: "' + zone + '"');
  // keyboard only: Tab to a field, then to its Columns button, press Enter; the field moves there and the remove button has a name
  await page.locator('#pivotFields .pivot-chip', { hasText: /^Requester\.DisplayName$/ }).focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  const focusedName = await page.evaluate(() => document.activeElement.getAttribute('aria-label'));
  if (!/Requester\.DisplayName in Then by \(columns\)/.test(focusedName || '')) fail('after two Tabs the Columns button of the field should have the focus: ' + focusedName);
  await page.keyboard.press('Enter');
  const placed = await page.evaluate(() => { const remove = document.querySelector('#pivotCols .pivot-zone-rm'); return { cols: document.querySelector('#pivotCols').textContent.trim(), remove: remove ? remove.tagName : '', removeName: remove ? remove.getAttribute('aria-label') : '' }; });
  if (!/Requester\.DisplayName/.test(placed.cols)) fail('Enter on the Columns button should put the field in Then by: ' + JSON.stringify(placed));
  if (placed.remove !== 'BUTTON' || !/^Remove /.test(placed.removeName || '')) fail('the remove mark should be a named button: ' + JSON.stringify(placed));
  await page.locator('#pivotCols .pivot-zone-rm').focus();
  await page.keyboard.press('Enter');
  const emptied = await page.evaluate(() => document.querySelector('#pivotCols').textContent.trim());
  if (/Requester\.DisplayName/.test(emptied)) fail('Enter on the remove button should take the field out');
  const piv = await page.evaluate(() => {
    const pv = document.querySelector('structra-pivot');
    pv._values = ['Cost']; pv._aggFn = 'sum'; pv._renderZones(); pv._runPivot();
    return [...document.querySelectorAll('#pivotResult tbody tr')].map((tr) => [...tr.children].map((c) => c.textContent.trim()));
  });
  const open = piv.find((r) => r[0] === 'Open');
  if (!open || Number(open[1]) !== 1344.75) fail('the total Cost of Open should be 1344.75 (1299.5 + 45.25): ' + JSON.stringify(piv));
  // A number is totalled, not used to group rows; and the whole result can be copied or opened as a tab
  const num = await page.evaluate(() => {
    const pv = document.querySelector('structra-pivot');
    pv._rows = []; pv._cols = []; pv._values = []; pv._aggFn = 'count';
    pv._addFieldToZone('Cost');
    return { values: pv._values.slice(), rows: pv._rows.slice(), agg: pv._aggFn };
  });
  if (num.values[0] !== 'Cost' || num.rows.length || num.agg !== 'sum') fail('clicking a numeric field should total it, not group by it: ' + JSON.stringify(num));
  const acts = await page.evaluate(() => { document.querySelector('structra-pivot')._rows = ['Status.Value']; document.querySelector('structra-pivot')._runPivot(); return [...document.querySelectorAll('#pivotResult [data-pivot-act]')].map((b) => b.dataset.pivotAct); });
  if (acts.join() !== 'copy,tab') fail('the Pivot result should offer Copy all rows and Open in a new tab: ' + acts.join());
  await page.keyboard.press('Escape');

  // ---- Null finder ----
  await page.evaluate(() => Structra.events.emit('nullfinder:open'));
  await page.waitForTimeout(400);
  await page.locator('structra-nullfinder [data-action="scan"]').click();
  await page.waitForTimeout(400);
  const nf = await page.evaluate(() => [...document.querySelectorAll('#nfResults .nf-item')].map((i) => i.textContent.replace(/\s+/g, ' ').trim()));
  if (!nf.some((t) => /value\[\*\]\.Notes/.test(t) && /null/.test(t) && /empty/.test(t))) fail('the Null finder should list value[*].Notes with a null and an empty value: ' + nf.join(' | '));
  if (nf.some((t) => /missing/.test(t))) fail('nothing is missing from a record in this list, but the Null finder reports: ' + nf.filter((t) => /missing/.test(t)).join(' | '));
  if (nf.some((t) => /@odata/.test(t))) fail('the Null finder reports system keys: ' + nf.join(' | '));
  await page.locator('#nfResults .nf-item', { hasText: 'Notes' }).first().click();
  await page.waitForTimeout(500);
  const where = await page.evaluate(() => ({ view: Structra.state.activeView, path: Structra.state.currentPath }));
  if (where.path !== '$.value[0].Notes') fail('clicking a result should select the first one, $.value[0].Notes: ' + JSON.stringify(where));
}, { viewport: { width: 1360, height: 800 } });
