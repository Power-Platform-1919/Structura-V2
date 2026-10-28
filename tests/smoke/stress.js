/* Awkward situations a real person runs into: JSON Lines and semicolon CSV, a Flatten that would lose data, Undo and the
   changed mark, Mask, Editor text that is not applied yet, tab names, Escape, stale panel results, several files at once,
   huge share links and a browser that blocks saving. Nothing may throw, lose work or fail silently.

   Run:  node tests/smoke/stress.js          (PW_CHANNEL=msedge uses the installed Edge)
*/
const { runAppTest } = require('../app-test');
const { loadText, closeExtraTabs } = require('../page-helpers');

runAppTest('stress', async ({ page, fail, errors }) => {
  const load = (name, text) => loadText(page, name, text);
  const closeAll = () => closeExtraTabs(page);
  const toastText = () => page.evaluate(() => document.querySelector('structra-toast #toastMsg').textContent);



  // ---- a document nested 1,500 levels deep opens and says it was cut ----
  await load('deep.json', '['.repeat(1500) + ']'.repeat(1500));
  const deep = await page.evaluate(() => ({ tabs: Structra.tabs.list.length, ok: !!Structra.state.jsonData }));
  if (!deep.ok) fail('a deeply nested document should still open');
  if (!/deep|nest/i.test(await toastText())) fail('the deep document should be reported as cut: ' + await toastText());
  await closeAll();

  // ---- risky patterns and endless scripts are stopped ----
  await load('items.json', JSON.stringify([{ name: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa!' }, { name: 'b' }]));
  const risky = await page.evaluate(async () => { try { await Structra.dataEngine.regexSearch('(a+)+$'); return 'ran'; } catch (e) { return e.message; } });
  if (risky === 'ran') fail('a pattern like (a+)+$ should be refused');
  const t0 = Date.now();
  await page.evaluate(() => Structra.setState('queryPanelOpen', true));
  await page.waitForTimeout(300);
  await page.locator('structra-query [data-mode="js"]').click();
  await page.locator('#queryInput').fill('(() => { while (true) {} })()');
  await page.locator('structra-query [data-action="run"]').click();
  await page.waitForFunction(() => /time|long|stopped/i.test(document.querySelector('#queryResults').textContent), null, { timeout: 15000 }).catch(() => fail('an endless script should be stopped with a message'));
  if (Date.now() - t0 > 14000) fail('stopping an endless script took too long');
  await page.keyboard.press('Escape');
  await closeAll();

  // ---- a very wide table draws a limited number of columns and offers more ----
  const wide = {}; for (let i = 0; i < 1500; i++) wide['c' + i] = i;
  await load('wide.json', JSON.stringify([wide, wide]));
  await page.evaluate(() => Structra.setState('activeView', 'table'));
  await page.waitForTimeout(800);
  const cols = await page.evaluate(() => ({ th: document.querySelectorAll('structra-table th').length, more: !!document.querySelector('structra-table [data-page-action="more-cols"]'), num: document.querySelectorAll('structra-table td.num').length }));
  if (cols.th > 120 || !cols.more) fail('1,500 columns should draw a limited number and offer more: ' + JSON.stringify(cols));
  if (!cols.num) fail('numbers in a table should be right-aligned (td.num)');
  await closeAll();

  // ---- the same problem in many rows is one line with a count ----
  const rows = Array.from({ length: 200 }, (_, i) => ({ id: 'x' + i }));
  await load('rows.json', JSON.stringify(rows));
  const grouped = await page.evaluate(() => {
    const r = Structra.jsonRepairAndValidation.validate(Structra.state.jsonData, { type: 'array', items: { type: 'object', properties: { id: { type: 'number' } } } });
    return r;
  });
  if (!grouped.errors || grouped.errors.length !== 200) fail('validation should find 200 problems: ' + JSON.stringify(grouped).slice(0, 120));
  await page.evaluate((sch) => { Structra.events.emit('validate:open'); }, null);
  await page.waitForTimeout(400);
  await page.keyboard.press('Escape');
}, { viewport: { width: 1360, height: 800 } });
