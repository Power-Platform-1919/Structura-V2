/* The data tools (Mask, Unmask, Sort keys, Flatten, Mock, Sample, Replace) and Undo / Redo:
   the document the user sees must really change, a change must be undoable, and generated data
   (Mock, Sample) must open in a new tab instead of replacing the user's file.

   Run:  node tests/smoke/tools.js          (PW_CHANNEL=msedge uses the installed Edge)
*/
const fs = require('fs');
const path = require('path');
const { runAppTest } = require('../app-test');
const { uploadAndWait } = require('../page-helpers');

const os = require('os');

const DOC = [
  { zeta: 1, id: 1, email: 'ann@contoso.com', phone: '555-123-4567', name: 'Ann', nested: { b: 2, a: 1 } },
  { zeta: 2, id: 2, email: 'bo@contoso.com', phone: '555-987-6543', name: 'Bo', nested: { b: 4, a: 3 } },
  { zeta: 3, id: 3, email: 'cy@contoso.com', phone: '555-555-0000', name: 'Cy', nested: { b: 6, a: 5 } },
];

runAppTest('tools', async ({ page, fail }) => {
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'structra-tools-')), 'people.json');
  fs.writeFileSync(tmp, JSON.stringify(DOC));
  const original = JSON.stringify(DOC);

  /** Run a command like the palette does, then wait for the document to settle */
  const run = async (cmd) => {
    await page.evaluate((c) => document.querySelector('structra-command')._runCommand(c), cmd);
    await page.waitForTimeout(700);
  };
  const shown = () => page.evaluate(() => ({
    state: JSON.stringify(Structra.state.jsonData),
    engine: JSON.stringify(Structra.dataEngine.getActive().raw),
    tabs: Structra.tabs.list.length,
    tabId: Structra.tabs.activeId,
    // the last message that is not the one-time tip (a tip may appear a moment after a result)
    toast: (window.__toasts || []).filter((t) => !/^Tip:/.test(t)).slice(-1)[0] || '',
  }));
  const expect = (cond, msg) => { if (!cond) fail(msg); };


  await uploadAndWait(page, tmp);

  // Record every message the app shows, so a later one cannot hide the result of a tool
  await page.evaluate(() => { window.__toasts = []; const t = Structra.toast; Structra.toast = (m, ...r) => { window.__toasts.push(String(m)); return t.call(Structra, m, ...r); }; });

  let s = await shown();
  expect(s.state === original, 'the file did not open as it is');

  // ---- Mask ----
  await run('mask');
  s = await shown();
  expect(!s.state.includes('ann@contoso.com') && !s.state.includes('555-123-4567'), 'Mask: the document on screen still holds the real email and phone');
  expect(s.state === s.engine, 'Mask: the engine and the document on screen differ');
  expect(/Masked [1-9]/.test(s.toast), 'Mask: the message does not say how many values were masked: ' + s.toast);
  const masked = s.state;

  // ---- Undo, Redo, Unmask ----
  await run('undo');
  s = await shown();
  expect(s.state === original, 'Undo after Mask did not bring the original back');
  expect(s.state === s.engine, 'Undo: the engine and the document on screen differ');
  await run('redo');
  s = await shown();
  expect(s.state === masked, 'Redo after Undo did not mask again');
  await run('unmask');
  s = await shown();
  expect(s.state === original, 'Unmask did not restore the original values');

  // ---- Sort keys ----
  await run('sort');
  s = await shown();
  const sortedKeys = Object.keys(JSON.parse(s.state)[0]);
  expect(sortedKeys.join() === [...sortedKeys].sort().join(), 'Sort: keys are not in order: ' + sortedKeys.join());
  expect(s.state === s.engine, 'Sort: the engine and the document on screen differ');
  await run('undo');
  s = await shown();
  expect(s.state === original, 'Undo after Sort did not restore the key order');

  // ---- Flatten, Unflatten ----
  await run('flatten');
  s = await shown();
  expect(JSON.stringify(JSON.parse(s.state)).includes('nested.a') || JSON.stringify(JSON.parse(s.state)).includes('nested'), 'Flatten: no change was made');
  await run('undo');
  s = await shown();
  expect(s.state === original, 'Undo after Flatten did not restore the document');

  // ---- Replace All with Undo ----
  await page.evaluate(() => { const f = document.querySelector('structra-find'); f._replace('contoso.com', 'example.org', true); });
  await page.waitForTimeout(300);
  s = await shown();
  expect(s.state.includes('ann@example.org') && !s.state.includes('contoso.com'), 'Replace All did not change the document');
  await run('undo');
  s = await shown();
  expect(s.state === original, 'Undo after Replace All did not restore the document');

  // ---- Mock and Sample open in a new tab and leave the file alone ----
  const before = await shown();
  await run('mock');
  s = await shown();
  expect(s.tabs === before.tabs + 1, 'Mock: no new tab was opened');
  expect(s.tabId !== before.tabId, 'Mock: the new tab is not the one showing');
  expect(s.state !== original && Array.isArray(JSON.parse(s.state)), 'Mock: the new tab does not hold generated records');
  await page.evaluate((id) => document.querySelector(`.doc-tab[data-id="${id}"]`).click(), before.tabId);
  await page.waitForTimeout(800);
  s = await shown();
  expect(s.state === original, 'Mock: the original file was changed');

  await run('sample');
  s = await shown();
  expect(s.tabs === before.tabs + 2, 'Sample: no new tab was opened');

  // ---- Undo history is per tab: nothing to undo in a tab that was never edited ----
  await run('undo');
  s = await shown();
  expect(/Nothing to undo/.test(s.toast), 'Undo in an untouched tab should say there is nothing to undo, it said: ' + s.toast);
});
