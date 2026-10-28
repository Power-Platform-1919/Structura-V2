/* The Editor view: line numbers, an error that says what and where, Apply that can be undone and marks the tab,
   and a warning before leaving with changes.

   Run:  node tests/smoke/editor.js          (PW_CHANNEL=msedge uses the installed Edge)
*/
const { runAppTest } = require('../app-test');
const { uploadAndWait } = require('../page-helpers');
const path = require('path');

runAppTest('editor', async ({ page, fail, ROOT }) => {
  const toasts = () => page.evaluate(() => (window.__toasts || []).slice(-1)[0] || '');


  await uploadAndWait(page, path.join(ROOT, 'tests', 'fixtures', 'jsonobject.json'));
  await page.evaluate(() => { window.__toasts = []; const t = Structra.toast; Structra.toast = (m, ...r) => { window.__toasts.push(String(m)); return t.call(Structra, m, ...r); }; });
  const original = await page.evaluate(() => JSON.stringify(Structra.state.jsonData));
  await page.evaluate(() => Structra.setState('activeView', 'editor'));
  await page.waitForTimeout(500);

  // ---- Line numbers ----
  // Only the numbers in view are drawn: the first is 1 at the top, and scrolling to the end reaches the last line
  const g = await page.evaluate(async () => {
    const box = document.querySelector('structra-editor .cv').codeView;
    const numbers = () => [...document.querySelectorAll('structra-editor .cm-lineNumbers .cm-gutterElement')].filter((e) => e.style.visibility !== 'hidden').map((e) => e.textContent.trim()).filter((t) => /^\d+$/.test(t));
    const first = numbers()[0];
    const drawn = numbers().length;
    box.scrollTo(0, 1e9);
    await new Promise((r) => setTimeout(r, 300));
    return { lines: box.lineCount(), first, drawn, last: numbers().pop() };
  });
  if (g.first !== '1' || Number(g.last) !== g.lines || g.drawn >= g.lines && g.lines > 200) fail(`the gutter should draw only the numbers in view, starting at 1 and reaching ${g.lines} at the end: ${JSON.stringify(g)}`);
  const setEditorText = (text) => page.evaluate((t) => { document.querySelector('structra-editor .cv').codeView.replaceAll(t); }, text);

  // ---- An error says what and where, and a click goes there ----
  await setEditorText('{\n  "a": 1,\n  "b": [1, 2,\n  "c": 3\n}');
  await page.waitForTimeout(700);
  const st = await page.evaluate(() => ({ text: document.querySelector('#edStatus').textContent.trim(), disabled: document.querySelector('#edStatus').disabled }));
  if (!/Line \d+, column \d+/.test(st.text)) fail('the error should say which line and column: "' + st.text + '"');
  if (/^Invalid$/.test(st.text)) fail('the error only says Invalid');
  if (!(await page.evaluate(() => !!document.querySelector('structra-editor .cv-error')))) fail('the place where the JSON breaks should be marked in the text');
  await page.locator('#edStatus').click();
  const sel = await page.evaluate(() => { const box = document.querySelector('structra-editor .cv').codeView; const at = box.view.state.selection.main; return { line: box.offsetToPosition(at.from).line + 1, text: box.getSelection() }; });
  if (!(sel.line >= 3 && sel.line <= 5) || sel.text.length !== 1) fail('clicking the error should select the character at the problem (line 3 to 5), it selected ' + JSON.stringify(sel));

  // ---- Apply refuses invalid text and says why ----
  await page.locator('structra-editor [data-action="apply"]').click();
  await page.waitForTimeout(300);
  if (!/cannot be applied/.test(await toasts())) fail('Apply on invalid JSON should say the changes cannot be applied: ' + (await toasts()));

  // ---- Apply a good change: the tab is marked, and undo brings the original back ----
  await setEditorText('{"edited": true, "n": [1, 2, 3]}');
  await page.waitForTimeout(500);
  await page.locator('structra-editor [data-action="apply"]').click();
  await page.waitForTimeout(800);
  const applied = await page.evaluate(() => ({ data: JSON.stringify(Structra.state.jsonData), modified: document.querySelector('.doc-tab.active').classList.contains('modified') }));
  if (applied.data !== '{"edited":true,"n":[1,2,3]}') fail('Apply did not change the document: ' + applied.data);
  if (!applied.modified) fail('the tab is not marked as changed after Apply');
  // A warning before leaving with changes
  const askLeave = () => page.evaluate(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; });
  if (!(await askLeave())) fail('leaving the page with a changed tab should ask first');
  await page.evaluate(() => document.querySelector('structra-command')._runCommand('undo'));
  await page.waitForTimeout(800);
  const undone = await page.evaluate(() => JSON.stringify(Structra.state.jsonData));
  if (undone !== original) fail('Undo after Apply did not restore the document');
  // Back at the original there is nothing to lose, so leaving does not ask
  if (await askLeave()) fail('after Undo back to the original, leaving the page should not ask');
}, { viewport: { width: 1360, height: 800 } });
