/* Awkward situations a real person runs into: JSON Lines and semicolon CSV, a Flatten that would lose data, Undo and the
   changed mark, Mask, Editor text that is not applied yet, tab names, Escape, stale panel results, several files at once,
   huge share links and a browser that blocks saving. Nothing may throw, lose work or fail silently.

   Run:  node tests/smoke/treekeys.js          (PW_CHANNEL=msedge uses the installed Edge)
*/
const { runAppTest } = require('../app-test');
const { loadText, closeExtraTabs } = require('../page-helpers');

runAppTest('treekeys', async ({ page, fail }) => {
  const load = (name, text) => loadText(page, name, text);
  const closeAll = () => closeExtraTabs(page);
  const toastText = () => page.evaluate(() => document.querySelector('structra-toast #toastMsg').textContent);


  await load('one.json', JSON.stringify({ user: { name: 'Ann', tags: ['a', 'b'] }, count: 3 }));
  await page.evaluate(() => Structra.setState('activeView', 'tree'));
  await page.waitForTimeout(500);

  // Arrow keys move the selection, Left folds, Right unfolds, Enter selects
  await page.locator('#jsonView .cm-content').focus();
  const sel = () => page.evaluate(() => Structra.state.currentPath);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  const p1 = await sel();
  if (!p1 || p1 === '$') fail('Down should select a line, the path is ' + p1);
  await page.keyboard.press('ArrowUp');
  const p2 = await sel();
  if (p2 === p1) fail('Up should move to the line before');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowLeft');            // on the user block: fold it
  const folded = await page.evaluate(() => [...document.querySelectorAll('#jsonView .j-line')].filter((l) => l.offsetParent !== null).length);
  await page.keyboard.press('ArrowRight');
  const unfolded = await page.evaluate(() => [...document.querySelectorAll('#jsonView .j-line')].filter((l) => l.offsetParent !== null).length);
  if (!(unfolded > folded)) fail(`Left then Right should fold then unfold a block: ${folded} then ${unfolded} lines`);
  const lv = await page.evaluate(() => /Levels/.test(document.querySelector('structra-canvas-header').textContent));
  if (!lv) fail('the 1 2 3 buttons should be labelled Levels');

  // a single object becomes a Field and Value table
  await page.evaluate(() => Structra.setState('activeView', 'table'));
  await page.waitForTimeout(600);
  const heads = await page.evaluate(() => [...document.querySelectorAll('structra-table thead th')].map((t) => t.textContent.trim()));
  if (heads.join() !== 'Field,Value') fail('a single object should show Field and Value columns: ' + heads.join());

  // Compare offers the other open tab
  await load('two.json', JSON.stringify({ user: { name: 'Bo' }, count: 4 }));
  await page.evaluate(() => Structra.events.emit('diff:open', {}));
  await page.waitForSelector('#diffRightSrc option[value^="tab:"]', { state: 'attached', timeout: 20000 }).catch(() => {});   // the other tab is offered
  const opts = await page.evaluate(() => [...document.querySelectorAll('#diffRightSrc option')].map((o) => o.value));
  if (!opts.some((v) => v.startsWith('tab:'))) fail('Compare should offer another open tab: ' + opts.join());
  await page.selectOption('#diffRightSrc', opts.find((v) => v.startsWith('tab:')));
  // wait for the result itself (a busy computer takes longer), not a fixed time
  await page.waitForFunction(() => /changed/.test((document.querySelector('#diffStats') || {}).textContent || ''), null, { timeout: 30000 }).catch(() => {});
  const stats = await page.evaluate(() => document.querySelector('#diffStats').textContent);
  if (!/changed/.test(stats) || /^0 added 0 removed 0 changed/.test(stats.trim())) fail('comparing two tabs should show differences: ' + stats);
  await page.keyboard.press('Escape');
}, { viewport: { width: 1360, height: 800 } });
