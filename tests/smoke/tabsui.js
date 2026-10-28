/* Document tabs: drag to reorder, a right-click menu, closing can be undone with Reopen, keyboard arrows.

   Run:  node tests/smoke/tabsui.js          (PW_CHANNEL=msedge uses the installed Edge)
*/
const path = require('path');
const { runAppTest, ROOT } = require('../app-test');
const { uploadAndWait } = require('../page-helpers');

const FIXTURES = path.join(ROOT, 'tests', 'fixtures');
const DOCS = ['jsonobject.json', 'test8_toplevel_array.json', 'edge_odata.json'];

runAppTest('tabsui', async ({ page, fail }) => {
  const order = () => page.evaluate(() => Structra.tabs.list.map((t) => t.label));
  const active = () => page.evaluate(() => Structra.tabs.list.find((t) => t.id === Structra.tabs.activeId)?.label);


  for (let i = 0; i < DOCS.length; i++) {
    if (i) await page.evaluate(() => Structra.events.emit('tabs:add'));
    await uploadAndWait(page, path.join(FIXTURES, DOCS[i]));
  }
  let names = await order();
  if (names.join() !== DOCS.join()) fail('tabs are not in the order they were opened: ' + names.join());

  // ---- drag the last tab to the front ----
  await page.locator('.doc-tab', { hasText: 'edge_odata' }).dragTo(page.locator('.doc-tab', { hasText: 'jsonobject' }), { targetPosition: { x: 4, y: 10 } });
  await page.waitForTimeout(300);
  names = await order();
  if (names[0] !== 'edge_odata.json') fail('dragging a tab to the front did not move it: ' + names.join());

  // ---- keyboard arrows ----
  await page.locator('.doc-tab.active').focus();
  const first = await active();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(500);
  if ((await active()) === first) fail('the right arrow key did not move to the next tab');

  // ---- keyboard: Ctrl+Shift+arrows move the focused tab, the focus stays on it, and the new place is announced ----
  const movedLabel = await active();
  const placeBefore = (await order()).indexOf(movedLabel);
  await page.locator('.doc-tab.active').focus();
  await page.keyboard.press('Control+Shift+ArrowLeft');
  await page.waitForTimeout(300);
  names = await order();
  if (names.indexOf(movedLabel) !== placeBefore - 1) fail('Ctrl+Shift+Left should move the tab one place left: ' + names.join());
  const stillFocused = await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('doc-tab') && document.activeElement.classList.contains('active'));
  if (!stillFocused) fail('the moved tab should keep the focus');
  const announced = await page.evaluate(() => document.querySelector('#toastMsg').textContent);
  if (!/moved to place \d+ of \d+/.test(announced)) fail('the move should be announced: ' + announced);
  await page.keyboard.press('Control+Shift+ArrowRight');
  await page.waitForTimeout(300);
  if ((await order()).indexOf(movedLabel) !== placeBefore) fail('Ctrl+Shift+Right should move the tab back');
  // the right-click menu has the same two actions
  await page.locator('.doc-tab.active').click({ button: 'right' });
  await page.locator('.menu .menu-item', { hasText: 'Move left' }).click();
  await page.waitForTimeout(300);
  if ((await order()).indexOf(movedLabel) !== placeBefore - 1) fail('the menu item Move left should move the tab: ' + (await order()).join());
  await page.locator('.doc-tab.active').click({ button: 'right' });
  await page.locator('.menu .menu-item', { hasText: 'Move right' }).click();
  await page.waitForTimeout(300);

  // ---- right-click menu: Duplicate ----
  const countBefore = (await order()).length;
  await page.locator('.doc-tab', { hasText: 'jsonobject' }).click({ button: 'right' });
  await page.locator('.menu .menu-item', { hasText: 'Duplicate' }).click();
  await page.waitForTimeout(900);
  names = await order();
  if (names.length !== countBefore + 1 || !names.some((n) => /jsonobject.*\(copy\)/.test(n))) fail('Duplicate did not make a copy of the tab: ' + names.join());
  const same = await page.evaluate(() => { const t = Structra.tabs.list.find((x) => /\(copy\)/.test(x.label)); const o = Structra.tabs.list.find((x) => x.label === 'jsonobject.json'); return !!t && !!o && JSON.stringify(t.data) === JSON.stringify(o.data) && JSON.stringify(Structra.state.jsonData) === JSON.stringify(o.data); });
  if (!same) fail('the duplicate does not hold the same data');

  // ---- closing is not final ----
  await page.locator('.doc-tab', { hasText: '(copy)' }).locator('.tab-close').click();
  await page.waitForTimeout(400);
  const toast = await page.evaluate(() => ({ text: document.querySelector('#toastMsg').textContent, action: document.querySelector('#toastAction').hidden ? '' : document.querySelector('#toastAction').textContent }));
  if (!/Closed/.test(toast.text) || toast.action !== 'Reopen') fail('closing a tab should offer Reopen: ' + JSON.stringify(toast));
  if ((await order()).some((n) => /\(copy\)/.test(n))) fail('the tab was not closed');
  await page.locator('#toastAction').click();
  await page.waitForTimeout(900);
  names = await order();
  if (!names.some((n) => /\(copy\)/.test(n))) fail('Reopen did not bring the tab back: ' + names.join());
  const back = await page.evaluate(() => JSON.stringify(Structra.state.jsonData) === JSON.stringify(Structra.tabs.list.find((t) => t.id === Structra.tabs.activeId).data) && !!Structra.dataEngine.getActive() && Structra.dataEngine.getActive().id === Structra.tabs.activeId);
  if (!back) fail('the reopened tab is not showing its data');

  // ---- Close other tabs ----
  await page.locator('.doc-tab', { hasText: 'test8' }).click({ button: 'right' });
  await page.locator('.menu .menu-item', { hasText: 'Close other tabs' }).click();
  await page.waitForTimeout(600);
  names = await order();
  if (names.length !== 1 || names[0] !== 'test8_toplevel_array.json') fail('Close other tabs left: ' + names.join());
}, { viewport: { width: 1360, height: 800 } });
