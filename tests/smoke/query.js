/* The Query panel: each mode finds what it should on a real document, an empty or broken query
   says what to do, a result opens in the Tree, and matches can be kept in a new tab.

   Run:  node tests/smoke/query.js          (PW_CHANNEL=msedge uses the installed Edge)
*/
const { runAppTest } = require('../app-test');
const { uploadAndWait } = require('../page-helpers');
const path = require('path');

runAppTest('query', async ({ page, fail, ROOT }) => {
  await uploadAndWait(page, path.join(ROOT, 'tests', 'fixtures', 'sp_getitems.json'));
  await page.evaluate(() => Structra.setState('queryPanelOpen', true));
  await page.waitForTimeout(300);

  const ask = async (mode, text) => {
    await page.locator(`.seg-btn[data-mode="${mode}"]`).click();
    await page.locator('#queryInput').fill(text);
    await page.locator('#queryInput').press('Enter');                 // Enter runs the query
    await page.waitForTimeout(250);
    return page.evaluate(() => ({
      summary: (document.querySelector('#queryResults .qp-summary') || {}).textContent || '',
      error: !!document.querySelector('#queryResults .is-error'),
      rows: [...document.querySelectorAll('#queryResults .qp-result')].map((r) => ({ path: r.dataset.path, text: r.textContent.replace(/\s+/g, ' ').trim() })),
    }));
  };
  const countOf = (r) => Number((/^([\d,]+) match/.exec(r.summary) || [])[1]);

  let r = await ask('path', 'value[*].Requester.Email');
  if (countOf(r) !== 3) fail('Path value[*].Requester.Email should find 3, said: ' + r.summary);
  if (!r.rows[1] || r.rows[1].path !== '$.value[1].Requester.Email') fail('the match path is not $.value[1].Requester.Email: ' + (r.rows[1] && r.rows[1].path));

  r = await ask('jsonpath', '$.value[?(@.Cost > 100)].Title');
  if (countOf(r) !== 1 || !/Laptop/.test(r.rows[0].text)) fail('JSONPath with a filter should find Laptop only, said: ' + r.summary);

  r = await ask('jsonpath', '$..Value');
  if (countOf(r) < 4) fail('JSONPath $..Value should find at least 4 values, said: ' + r.summary);

  // The standard's own forms and the pattern test (JSONPath is json-p3, plus the app's conveniences)
  r = await ask('jsonpath', '$.value[?@.Cost > 100].Title');
  if (countOf(r) !== 1 || !/Laptop/.test(r.rows[0].text)) fail('JSONPath filter without parentheses should find Laptop, said: ' + r.summary);
  r = await ask('jsonpath', '$.value[?(@.Title =~ /^LAP/i)].Cost');
  if (countOf(r) !== 1) fail('JSONPath =~ with the i flag should find 1, said: ' + r.summary);
  r = await ask('jsonpath', '$.value[::-1].Title');
  if (countOf(r) !== 3 || !/Parking/.test(r.rows[0].text)) fail('JSONPath [::-1] should list the items backwards, said: ' + r.summary + ' / ' + (r.rows[0] && r.rows[0].text));
  r = await ask('jsonpath', '$.value[');
  if (!r.error || !/character/.test(r.summary)) fail('a broken JSONPath should show an error that says where, said: ' + r.summary);

  r = await ask('regex', '^ann@');
  if (countOf(r) < 1) fail('Regex ^ann@ should find the email, said: ' + r.summary);

  r = await ask('regex', '(');
  if (!r.error) fail('a broken pattern should show an error, said: ' + r.summary);

  r = await ask('js', '=data.value.filter(x => x.Approved)');
  if (countOf(r) !== 2) fail('JS filter should find 2 records, said: ' + r.summary);
  if (!r.rows[0] || !/^\$\.value\[\d\]$/.test(r.rows[0].path)) fail('a JS result that is part of the document should show its real path, got: ' + (r.rows[0] && r.rows[0].path));

  r = await ask('path', 'value[*].DoesNotExist');
  if (!/No matches/.test(r.summary)) fail('no match should say "No matches", said: ' + r.summary);

  await page.locator('#queryInput').fill('');
  await page.locator('structra-query [data-action="run"]').click();
  const empty = await page.evaluate(() => (document.querySelector('#queryResults .qp-summary') || {}).textContent || '');
  if (!/Example/i.test(empty)) fail('running an empty box should show an example, said: ' + empty);

  // A result opens in the Tree on that value
  r = await ask('path', 'value[*].Title');
  await page.locator('#queryResults .qp-result').nth(1).click();
  await page.waitForTimeout(400);
  const where = await page.evaluate(() => ({ view: Structra.state.activeView, path: Structra.state.currentPath }));
  if (where.view !== 'tree' || where.path !== '$.value[1].Title') fail('clicking a result should select it in the Tree, got ' + JSON.stringify(where));

  const lit = await page.evaluate(() => document.querySelectorAll('.j-line.find-match').length);
  if (lit !== 3) fail('all 3 matches should be marked in the Tree, ' + lit + ' are');
  await page.evaluate(() => Structra.setState('activeView', 'tree'));
  await page.locator('structra-query [data-copy-expr="pa"]').first().click();
  await page.waitForTimeout(300);
  const toastText = await page.evaluate(() => document.querySelector('structra-toast').textContent);
  if (!/Power Automate expression copied/.test(toastText)) fail('a result should copy its Power Automate expression: ' + toastText.slice(0, 80));

  // Keep the matches in a new tab
  const before = await page.evaluate(() => Structra.tabs.list.length);
  await page.locator('structra-query [data-action="openMatches"]').click();
  await page.waitForTimeout(800);
  const after = await page.evaluate(() => ({ tabs: Structra.tabs.list.length, data: JSON.stringify(Structra.state.jsonData) }));
  if (after.tabs !== before + 1 || after.data !== JSON.stringify(['Laptop refresh', 'Badge request', 'Parking pass'])) fail('Open in a new tab did not hold the 3 titles: ' + JSON.stringify(after).slice(0, 160));
}, { viewport: { width: 1360, height: 800 } });
