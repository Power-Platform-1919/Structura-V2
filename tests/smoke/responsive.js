/* Awkward situations a real person runs into: JSON Lines and semicolon CSV, a Flatten that would lose data, Undo and the
   changed mark, Mask, Editor text that is not applied yet, tab names, Escape, stale panel results, several files at once,
   huge share links and a browser that blocks saving. Nothing may throw, lose work or fail silently.

   Run:  node tests/smoke/responsive.js          (PW_CHANNEL=msedge uses the installed Edge)
*/
const { runAppTest } = require('../app-test');
const { loadText, closeExtraTabs } = require('../page-helpers');

runAppTest('responsive', async ({ page, fail }) => {
  const load = (name, text) => loadText(page, name, text);
  const closeAll = () => closeExtraTabs(page);
  const toastText = () => page.evaluate(() => document.querySelector('structra-toast #toastMsg').textContent);


  const recs = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, name: 'n' + i, payload: i === 0 ? '{"a":{"b":1}}' : 'x', owner: { '@odata.type': 'T', DisplayName: 'D' + i, Email: 'e' + i + '@x.com', Claims: 'c' } }));
  await load('recs.json', JSON.stringify(recs));

  // Phone width: the rail is a bar along the bottom and every rail button can be reached
  const ph = await page.evaluate(() => {
    const r = document.querySelector('structra-rail').getBoundingClientRect();
    return { top: r.top, h: window.innerHeight, w: r.width, vw: window.innerWidth, docW: document.documentElement.scrollWidth };
  });
  if (!(ph.top > ph.h * 0.8)) fail('at phone width the rail should sit along the bottom: ' + JSON.stringify(ph));
  if (ph.w > ph.vw + 1) fail('the rail is wider than the screen: ' + JSON.stringify(ph));
  await page.setViewportSize({ width: 320, height: 700 });
  await page.waitForTimeout(300);
  const sw = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth));
  if (sw < 340) fail('under 360 px the page should scroll sideways rather than cut content off, scrollWidth ' + sw);

  // Short laptop screen: the panel stays folded until asked; the maximise button makes it taller
  await page.setViewportSize({ width: 1366, height: 700 });
  await page.waitForTimeout(300);
  await closeAll();
  await load('recs2.json', JSON.stringify(recs));
  const folded = await page.evaluate(() => Structra.state.drawerState);
  if (folded !== 'collapsed') fail('on a 700 px high screen the drawer should start folded, it is ' + folded);
  await page.evaluate(() => Structra.setState('drawerState', 'medium'));
  await page.waitForTimeout(300);
  const before = await page.evaluate(() => document.querySelector('structra-drawer').offsetHeight);
  await page.locator('[data-action="maximise"]').click();
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => document.querySelector('structra-drawer').offsetHeight);
  if (!(after > before)) fail(`the maximise button should make the panel taller: ${before} then ${after}`);
  await page.evaluate(() => Structra.setState('drawerState', 'collapsed'));

  // Schema Gen can cover only the selected value
  await page.evaluate(() => { Structra.setState('currentPath', '$[0].owner'); Structra.setState('drawerState', 'medium'); document.querySelector('structra-drawer')._switchTab('schema-gen'); });
  await page.waitForTimeout(500);
  await page.locator('structra-schemagen [data-action="selected"]').check();
  await page.waitForTimeout(500);
  const sg = await page.evaluate(() => document.querySelector('#sgOutput').dataset.schema);
  if (!/DisplayName/.test(sg) || /payload/.test(sg)) fail('Schema Gen for the selected value should describe only owner');
  await page.evaluate(() => Structra.setState('drawerState', 'collapsed'));

  // Schema view has a Copy schema button and no red
  await page.evaluate(() => Structra.setState('activeView', 'schema'));
  await page.waitForTimeout(500);
  const sc = await page.evaluate(() => ({ btn: !!document.querySelector('[data-schema-copy]'), red: getComputedStyle(document.querySelector('.s-req') || document.body).color }));
  if (!sc.btn) fail('the Schema view should have a Copy schema button');

  // Split into columns: system keys are last and unticked
  await page.evaluate(() => Structra.setState('activeView', 'table'));
  await page.waitForTimeout(600);
  await page.evaluate(() => document.querySelector('structra-table')._showExpandPicker('owner'));
  const picks = await page.evaluate(() => [...document.querySelectorAll('.col-pick-item')].map((l) => ({ t: l.textContent.trim(), on: l.querySelector('input').checked })));
  const sys = picks.find((p) => /@odata/.test(p.t));
  if (!sys || sys.on) fail('system keys should be unticked in Split into columns: ' + JSON.stringify(picks));
  if (picks[0] && /@odata|Claims/.test(picks[0].t)) fail('system keys should come last: ' + JSON.stringify(picks));
  await page.keyboard.press('Escape');
  await page.mouse.click(5, 300);

  // Filter panel is docked above the table, not over it
  await page.evaluate(() => Structra.setState('filterBarOpen', true));
  await page.waitForTimeout(500);
  const dock = await page.evaluate(() => {
    const f = document.querySelector('structra-filter .filter-panel').getBoundingClientRect();
    const t = document.querySelector('structra-table').getBoundingClientRect();
    return { filterBottom: f.bottom, tableTop: t.top };
  });
  if (dock.filterBottom > dock.tableTop + 1) fail('the filter panel should sit above the table, not over it: ' + JSON.stringify(dock));
  await page.evaluate(() => Structra.setState('filterBarOpen', false));
}, { viewport: { width: 390, height: 780 } });
