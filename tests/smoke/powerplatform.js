/* The Power Platform parts: expressions in the Node panel (one click to copy), "Find this value",
   copy of the whole value, copy buttons on every expression row, and the column picker that decides
   which columns go into typed tables and Select actions.

   Run:  node tests/smoke/powerplatform.js          (PW_CHANNEL=msedge uses the installed Edge)
*/
const path = require('path');
const { runAppTest } = require('../app-test');
const { uploadAndWait, readClipboard } = require('../page-helpers');

runAppTest('powerplatform', async ({ page, fail, ROOT, context }) => {
  const clip = () => readClipboard(page);
  const select = async (p) => {
    await page.evaluate((x) => { Structra.setState('currentPath', x); Structra.events.emit('tree:node-selected', x); }, p);
    await page.waitForTimeout(300);
  };


  await uploadAndWait(page, path.join(ROOT, 'tests', 'fixtures', 'sp_getitems.json'));
  await page.evaluate(() => Structra.setState('activeView', 'tree'));

  // ---- Node panel: expressions for the selected value ----
  await select('$.value[1].Requester.Email');
  const rows = await page.evaluate(() => [...document.querySelectorAll('#ctxPp .ctx-pp-row')].map((r) => ({ app: r.querySelector('.ctx-pp-app').textContent, label: r.querySelector('.ctx-pp-label').textContent, code: r.querySelector('.ctx-pp-code').textContent })));
  if (rows.length < 4) fail('the Node panel should give at least 4 expressions for a value inside a list, it gave ' + rows.length);
  if (!rows.some((r) => r.code === "items('Apply_to_each')?['Requester']?['Email']")) fail('no Apply to each expression in the Node panel: ' + rows.map((r) => r.code).join(' | '));
  if (!rows.some((r) => r.code === 'Text(ThisRecord.Requester.Email)')) fail('no Power Fx ThisRecord expression in the Node panel');
  await page.locator('#ctxPp .ctx-pp-copy').first().click();
  await page.waitForTimeout(200);
  if ((await clip()) !== rows[0].code) fail('the copy button did not copy the first expression: ' + (await clip()));

  // ---- Copy value gives the whole value, not the shortened text on screen ----
  await select('$.value[0]');
  await page.locator('#ctxPanel [data-action="copy-value"], structra-context [data-action="copy-value"]').first().click();
  await page.waitForTimeout(200);
  let copied;
  try { copied = JSON.parse(await clip()); } catch { copied = null; }
  const real = await page.evaluate(() => Structra.state.jsonData.value[0]);
  if (JSON.stringify(copied) !== JSON.stringify(real)) fail('Copy value did not copy the whole record (it is cut at 200 characters)');

  // ---- Find this value ----
  await select('$.value[0].Title');
  await page.locator('structra-context [data-action="find-value"]').click();
  await page.waitForTimeout(900);
  const found = await page.evaluate(() => ({ open: document.querySelector('.find-bar').classList.contains('show'), text: document.querySelector('#findInput').value, count: document.querySelector('#findCount').textContent }));
  if (!found.open || found.text !== 'Laptop refresh' || /^0/.test(found.count)) fail('"Find this value" did not search for the value: ' + JSON.stringify(found));
  await page.evaluate(() => Structra.setState('findBarOpen', false));

  // ---- Expressions drawer: copy buttons and the column picker ----
  await select('$.value');
  await page.evaluate(() => Structra.events.emit('drawer:show', 'expressions'));
  await page.waitForTimeout(300);
  await page.locator('.expr-subtab[data-sub="canvas"]').click();
  await page.waitForTimeout(300);
  const picker = await page.evaluate(() => ({ chips: [...document.querySelectorAll('.expr-cols .expr-col')].map((c) => c.textContent.trim()), copyButtons: document.querySelectorAll('.expr-pane.active .expr-copy').length }));
  if (!picker.chips.includes('Title') || !picker.chips.includes('Status_Value') || !picker.chips.includes('Requester_Email')) fail('the column picker is missing columns: ' + picker.chips.join(', '));
  if (picker.chips.includes('@odata.etag')) { /* system fields are listed but off by default */ }
  if (picker.copyButtons < 5) fail('expression rows need a visible copy button, found ' + picker.copyButtons);

  const typed = () => page.evaluate(() => [...document.querySelectorAll('.expr-pane.active .expr-row')].find((r) => /Typed table/.test(r.querySelector('.elabel').textContent))?.querySelector('.ecode').textContent || '');
  if (!/[{, ]Title: Text\(ThisRecord\.Title\)/.test(await typed())) fail('the typed table should contain Title by default: ' + (await typed()).slice(0, 120));
  await page.locator('.expr-col', { hasText: /^Title$/ }).click();
  await page.waitForTimeout(300);
  if (/[{, ]Title:/.test(await typed())) fail('un-ticking Title should remove it from the typed table');
  await page.locator('.expr-col', { hasText: /^Title$/ }).click();                      // put it back

  await page.locator('.expr-subtab[data-sub="flow"]').click();
  await page.waitForTimeout(300);
  const select1 = await page.evaluate(() => {
    const pre = [...document.querySelectorAll('.expr-pane.active .expr-block')].find((b) => /Select/.test(b.querySelector('strong').textContent));
    try { return Object.keys(JSON.parse(pre.querySelector('pre').textContent).Select.inputs.select); } catch { return null; }
  });
  if (!select1 || !select1.includes('Title') || !select1.includes('Status_Value')) fail('the Select action should use the chosen columns: ' + JSON.stringify(select1));
}, { viewport: { width: 1440, height: 900 }, clipboard: true });
