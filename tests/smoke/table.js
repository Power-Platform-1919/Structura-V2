/* The Table view: headers keep the case of the keys (they are case-sensitive in expressions),
   and nested SharePoint fields (Choice, Person, lists of choices) show their useful value.

   Run:  node tests/smoke/table.js          (PW_CHANNEL=msedge uses the installed Edge)
*/
const { runAppTest } = require('../app-test');
const { uploadAndWait } = require('../page-helpers');
const path = require('path');

runAppTest('table', async ({ page, fail, ROOT }) => {
  await uploadAndWait(page, path.join(ROOT, 'tests', 'fixtures', 'sp_getitems.json'));
  await page.evaluate(() => Structra.setState('activeView', 'table'));
  await page.waitForTimeout(800);

  const t = await page.evaluate(() => {
    const heads = [...document.querySelectorAll('structra-table th')].map((h) => ({ text: h.textContent.replace(/\s+/g, ' ').trim(), transform: getComputedStyle(h).textTransform }));
    const rows = [...document.querySelectorAll('structra-table tbody tr')].map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent.replace(/\s+/g, ' ').trim()));
    return { heads, rows };
  });
  if (!t.heads.length) fail('the Table drew no headers');
  if (t.heads.some((h) => h.transform === 'uppercase')) fail('headers are forced to UPPERCASE; keys are case-sensitive, so they must show as written');
  if (!t.heads.some((h) => h.text.startsWith('ItemInternalId'))) fail('the header for ItemInternalId is not shown as written: ' + t.heads.map((h) => h.text).join(' | '));
  const flat = t.rows.map((r) => r.join(' | ')).join('\n');
  if (/\{…\}/.test(flat)) fail('a nested field still shows as {…}:\n' + flat.slice(0, 300));
  if (!flat.includes('Ann Lee')) fail('the Person field does not show its display name (Ann Lee)');
  if (!flat.includes('Open')) fail('the Choice field does not show its value (Open)');
  if (!flat.includes('IT, Hardware')) fail('the list of choices does not show "IT, Hardware"');

  // ---- the column menu: real icons, a summary, every different value ----
  await page.locator('structra-table th[data-col="Cost"]').click({ button: 'right' });
  const menu = await page.evaluate(() => { const m = document.querySelector('.col-ctx-menu'); return m ? { icons: m.querySelectorAll('.col-ctx-icon svg').length, text: m.textContent } : null; });
  if (!menu) fail('right-clicking a column header did not open the menu');
  else {
    if (menu.icons < 8) fail('the column menu should have an icon on every action, it has ' + menu.icons);
    if (/[\u{1F300}-\u{1FAFF}\u25B2\u25BC\u25C0\u23F7\u2295\u229E\u229F\u2298]/u.test(menu.text)) fail('the column menu still uses emoji or symbol characters: ' + menu.text.slice(0, 80));
  }
  await page.locator('.col-ctx-item', { hasText: 'Column summary' }).click();
  await page.waitForTimeout(300);
  const rep = await page.evaluate(() => (document.querySelector('.col-report') || {}).textContent || '');
  if (!/Total\s*1364\.75/.test(rep) || !/Smallest\s*20/.test(rep) || !/Largest\s*1299\.5/.test(rep)) fail('the column summary for Cost is wrong: ' + rep.replace(/\s+/g, ' ').slice(0, 200));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  await page.locator('structra-table th[data-col="Approved"]').click({ button: 'right' });
  await page.locator('.col-ctx-item', { hasText: 'Every different value' }).click();
  await page.waitForTimeout(300);
  const vals = await page.evaluate(() => [...document.querySelectorAll('.col-report .rep-row')].map((r) => r.textContent.replace(/\s+/g, ' ').trim()));
  if (vals.length !== 2 || !vals.some((v) => /^true\s*2$/.test(v)) || !vals.some((v) => /^false\s*1$/.test(v))) fail('the different values of Approved should be true (2) and false (1): ' + vals.join(' | '));
  await page.keyboard.press('Escape');

  // ---- column widths stay the same when the sort changes ----
  const widths = () => page.evaluate(() => [...document.querySelectorAll('structra-table th')].map((t) => Math.round(t.getBoundingClientRect().width)).join(','));
  const w1 = await widths();
  await page.locator('structra-table th[data-col="Title"]').click();
  await page.waitForTimeout(400);
  const w2 = await widths();
  if (w1 !== w2) fail('column widths changed when the sort changed: ' + w1 + ' then ' + w2);

  // ---- Charts: nothing printed over the bars, the line chart has axis labels, the list has a friendly name ----
  await page.evaluate(() => Structra.events.emit('charts:open', { column: 'Cost' }));
  await page.waitForTimeout(500);
  const ch = await page.evaluate(() => {
    const d = document.querySelector('structra-charts');
    return { field: (d.querySelector('.ch-field') || {}).textContent || '', opts: [...d.querySelectorAll('#chSource option')].map((o) => o.textContent), svgText: [...d.querySelectorAll('svg text')].map((t) => t.textContent), note: [...d.querySelectorAll('.ch-note')].map((n) => n.textContent).join(' ') };
  });
  if (/Array/.test(ch.field + ch.opts.join())) fail('Charts still says Array: ' + ch.field + ' ' + ch.opts.join());
  if (ch.svgText.some((t) => /tallest bar/.test(t))) fail('the tallest bar caption is printed inside the chart again');
  if (!/tallest bar holds/.test(ch.note)) fail('Charts should explain the bars under the chart: ' + ch.note);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
}, { viewport: { width: 1360, height: 800 } });
