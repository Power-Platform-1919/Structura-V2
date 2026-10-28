/* Getting around: the path bar, Back and Forward, selecting in the Tree, the right-click menu,
   and opening a collapsed node. Paths are written one way everywhere ($.value[0].Title).

   Run:  node tests/smoke/path-history.js          (PW_CHANNEL=msedge uses the installed Edge)
*/
const path = require('path');
const { runAppTest } = require('../app-test');
const { uploadAndWait, readClipboard } = require('../page-helpers');

runAppTest('path-history', async ({ page, fail, ROOT }) => {
  const state = () => page.evaluate(() => ({
    path: Structra.state.currentPath,
    view: Structra.state.activeView,
    bar: document.querySelector('#pathInput').value,
    invalid: document.querySelector('#pathInput').classList.contains('invalid'),
    ac: document.querySelector('#acDropdown') ? document.querySelector('#acDropdown').style.display : 'none',
    hl: (() => { const l = document.querySelector('structra-tree .j-line.highlighted'); if (!l) return null; const r = l.getBoundingClientRect(), v = document.querySelector('structra-tree').getBoundingClientRect(); return { path: l.dataset.path, visible: r.top >= v.top - 1 && r.bottom <= v.bottom + 1 }; })(),
  }));
  const typePath = async (text) => {
    await page.locator('#pathInput').fill(text);
    await page.locator('#pathInput').press('Enter');
    await page.waitForTimeout(500);
  };


  await uploadAndWait(page, path.join(ROOT, 'tests', 'fixtures', 'sp_getitems.json'));
  await page.evaluate(() => Structra.setState('activeView', 'tree'));
  await page.waitForTimeout(400);

  // ---- A click in the Tree selects it, written as $.…, and opens the Node panel ----
  await page.locator('structra-tree .j-str', { hasText: 'Laptop refresh' }).click();
  await page.waitForTimeout(500);
  let s = await state();
  if (s.path !== '$.value[0].Title') fail('clicking "Laptop refresh" should select $.value[0].Title, it selected ' + s.path);
  if (s.bar !== '$.value[0].Title') fail('the path bar should show $.value[0].Title, it shows ' + s.bar);

  // ---- Path bar: find the value and scroll to it ----
  await typePath('$.value[2].Requester.Email');
  s = await state();
  if (s.path !== '$.value[2].Requester.Email') fail('the path bar did not go to the path: ' + s.path);
  if (!s.hl || s.hl.path !== 'value[2].Requester.Email') fail('the Tree did not highlight the line for the typed path: ' + JSON.stringify(s.hl));
  else if (!s.hl.visible) fail('the highlighted line is not scrolled into view');
  if (s.ac !== 'none') fail('the suggestion list is still open after Enter');

  // ---- A path without the $ works too, and a wrong path says so ----
  await typePath('value[1].Title');
  s = await state();
  if (s.path !== '$.value[1].Title') fail('value[1].Title (no $) should become $.value[1].Title, got ' + s.path);
  const before = s.path;
  await typePath('value[1].Titel');
  s = await state();
  if (!s.invalid) fail('a path that does not exist should be marked as wrong in the path bar');
  if (s.path !== before) fail('a wrong path changed the selection to ' + s.path);

  // ---- A path typed in a view that cannot show it opens the Tree ----
  await page.evaluate(() => Structra.setState('activeView', 'overview'));
  await page.waitForTimeout(300);
  await typePath('$.value[0].Title');
  s = await state();
  if (s.view !== 'tree') fail('typing a path while the Overview is open should open the Tree, the view is ' + s.view);

  // ---- Back and Forward move the Tree too ----
  await typePath('$.value[2].Title');
  await page.locator('structra-header [data-action="back"]').click();
  await page.waitForTimeout(500);
  s = await state();
  if (s.path !== '$.value[0].Title') fail('Back should return to $.value[0].Title, it went to ' + s.path);
  if (!s.hl || s.hl.path !== 'value[0].Title') fail('Back did not move the Tree to the line: ' + JSON.stringify(s.hl));

  // ---- Right-click: selects the line, real icons, Power Platform entries ----
  // The Tree draws only the lines in view: go to the value first (what a person does by scrolling)
  await typePath('$.value[1].Title');
  await page.waitForSelector('structra-tree .j-line.highlighted', { timeout: 5000 });
  await page.locator('structra-tree .j-str', { hasText: 'Badge request' }).click({ button: 'right' });
  await page.waitForTimeout(300);
  const menu = await page.evaluate(() => {
    const m = document.querySelector('.tree-ctx-menu');
    if (!m) return null;
    return { icons: m.querySelectorAll('.tree-ctx-icon svg').length, text: m.textContent, emoji: /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(m.textContent) };
  });
  s = await state();
  if (!menu) fail('right-click did not open a menu');
  else {
    if (menu.emoji) fail('the right-click menu still uses emoji: ' + menu.text.slice(0, 80));
    if (menu.icons < 5) fail('the right-click menu should have an icon on every action, it has ' + menu.icons);
    if (!/Power Automate expression/.test(menu.text) || !/Power Fx formula/.test(menu.text)) fail('the right-click menu has no Power Automate / Power Fx copy');
  }
  if (s.path !== '$.value[1].Title') fail('right-clicking a line should select it, the selection is ' + s.path);
  await page.locator('.tree-ctx-item', { hasText: 'Power Automate expression' }).click();
  await page.waitForTimeout(200);
  const clip = await readClipboard(page);
  if (!/items\('Apply_to_each'\)\?\['Title'\]/.test(clip)) fail('the copied Power Automate expression is wrong: ' + clip);

  // ---- A click anywhere on a collapsed node opens it ----
  await page.locator('structra-canvas-header [data-action="depth-1"]').click();
  await page.waitForTimeout(300);
  const collapsed = await page.evaluate(() => document.querySelectorAll('structra-tree .j-ellipsis').length && [...document.querySelectorAll('structra-tree .j-ellipsis')].filter((e) => e.offsetParent !== null).length);
  if (!collapsed) fail('Level 1 did not collapse anything');
  // the block is named by the path of its line (the lines are drawn by CodeMirror and have no block ids)
  const block = await page.evaluate(() => [...document.querySelectorAll('structra-tree .j-ellipsis')].find((e) => e.offsetParent !== null).closest('.j-line').dataset.path);
  await page.locator('structra-tree .j-line[data-path="' + block.replace(/"/g, '\\"') + '"] .j-ellipsis').click();
  await page.waitForTimeout(300);
  const stillShut = await page.evaluate((path) => !!document.querySelector('structra-tree .j-line[data-path="' + path.replace(/"/g, '\\"') + '"] .j-ellipsis'), block);
  if (stillShut) fail('clicking the text of a collapsed node did not open it');
}, { viewport: { width: 1360, height: 800 }, clipboard: true });
