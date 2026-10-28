/* The app works with the internet cut off: any request to another site is blocked and counted. Icons, fonts, SQL,
   Repair, Validate and Export as image must all work from the app folder.

   Run:  node tests/smoke/offline.js          (PW_CHANNEL=msedge uses the installed Edge)
*/
const { runAppTest } = require('../app-test');
const { uploadAndWait } = require('../page-helpers');
const path = require('path');

runAppTest('offline', async ({ page, fail, ROOT }) => {
  await uploadAndWait(page, path.join(ROOT, 'tests', 'fixtures', 'sp_getitems.json'));

  const icons = await page.evaluate(() => document.querySelectorAll('svg').length);
  if (icons < 10) fail('the icons did not load without the internet: ' + icons + ' svg elements');
  const font = await page.evaluate(async () => { await document.fonts.ready; return [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/['"]/g, '')).join(','); });
  if (!/IBM Plex Sans/.test(font)) fail('the app font did not load from the app folder: "' + font + '"');

  // SQL starts from the app folder and answers
  await page.evaluate(() => { Structra.dataEngine.enableSql(); });
  await page.waitForFunction(() => Structra.dataEngine.duckReady || Structra.dataEngine.duckFailed, null, { timeout: 90000 });
  if (!(await page.evaluate(() => Structra.dataEngine.duckReady))) fail('the SQL engine did not start without the internet');
  else {
    const r = await page.evaluate(() => Structra.dataEngine.runSql('SELECT COUNT(*) AS n FROM data'));
    if (!r || r.error) fail('a SQL query failed offline: ' + JSON.stringify(r).slice(0, 120));
  }

  // Repair, Validate and Export as image use their own libraries
  const fixed = await page.evaluate(() => Structra.jsonRepairAndValidation.repair("{'a': 1, b: [1,2,],}"));
  if (!/"a"/.test(fixed)) fail('Repair did not work offline: ' + fixed);
  await page.evaluate(() => Structra.events.emit('validate:open'));
  await page.waitForTimeout(400);
  const v = await page.evaluate(async () => { try { return await Structra.jsonRepairAndValidation.validate(Structra.state.jsonData, { type: 'object' }); } catch (e) { return { error: e.message }; } });
  if (v && v.error) fail('Validate against a schema did not work offline: ' + v.error);
  await page.evaluate(() => Structra.events.emit('overlay:close'));
  const png = await page.evaluate(async () => { try { await Structra.imageCapture.png(document.querySelector('.view-panel.active') || document.body, 'x.png'); return 'ok'; } catch (e) { return e.message; } });
  if (png !== 'ok') fail('Export as image did not work offline: ' + png);
}, { viewport: { width: 1360, height: 800 } });
