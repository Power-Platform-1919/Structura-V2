/* The SQL mode of the Query panel: the open file is the table "data", example queries and columns come from the
   file, results show in a grid, only reading queries run, errors are in plain words, and earlier queries are kept.

   Run:  node tests/smoke/sql.js          (PW_CHANNEL=msedge uses the installed Edge)
*/
const { runAppTest } = require('../app-test');
const { uploadAndWait } = require('../page-helpers');

runAppTest('sql', async ({ page, fail }) => {
  const rows = [
    { id: 1, name: 'Ann', region: 'North', amount: 120.5, active: true },
    { id: 2, name: 'Bo', region: 'South', amount: 80, active: false },
    { id: 3, name: 'Cy', region: 'North', amount: 200, active: true },
    { id: 4, name: 'Di', region: 'East', amount: null, active: true },
  ];
  await uploadAndWait(page, { name: 'sales.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(rows)) });
  await page.evaluate(() => Structra.setState('queryPanelOpen', true));
  await page.waitForTimeout(300);

  // ---- SQL is one of the modes, and the columns of the file are listed ----
  await page.locator('.seg-btn[data-mode="sql"]').click();
  await page.waitForSelector('#sqlColumns .qp-sql-col', { state: 'attached', timeout: 60000 });
  const cols = await page.evaluate(() => [...document.querySelectorAll('#sqlColumns .qp-sql-col span')].map((e) => e.textContent));
  if (cols.join(',') !== 'id,name,region,amount,active') fail('the table columns should be id,name,region,amount,active: ' + cols.join(','));
  const examples = await page.evaluate(() => [...document.querySelectorAll('#sqlExamples .qp-preset-btn')].map((e) => e.textContent));
  if (!examples.includes('Count by name') || !examples.includes('Totals of id')) fail('example queries should use the real columns: ' + examples.join(' | '));
  // a column that holds a list of numbers (BIGINT[]) is not a number to total: the example would fail with a Binder Error
  const listExamples = await page.evaluate(() => document.querySelector('structra-query')._sqlExamples([{ name: 'id', type: 'BIGINT' }, { name: 'price', type: 'DECIMAL(18,3)' }, { name: 'scores', type: 'BIGINT[]' }, { name: 'box', type: 'STRUCT(a INTEGER)' }]).map((example) => example.label));
  if (!listExamples.includes('Totals of id')) fail('a BIGINT column should get a Totals example: ' + listExamples.join(' | '));
  const listTotals = await page.evaluate(() => document.querySelector('structra-query')._sqlExamples([{ name: 'scores', type: 'BIGINT[]' }, { name: 'price', type: 'DECIMAL(18,3)' }]).map((example) => example.label));
  if (listTotals.includes('Totals of scores') || !listTotals.includes('Totals of price')) fail('Totals should skip a list of numbers and accept DECIMAL(18,3): ' + listTotals.join(' | '));
  const hidden = await page.evaluate(() => document.querySelector('#sqlSchema').hidden);
  if (hidden) fail('the table and its columns should be visible in SQL mode');

  // The SQL editor is a code box (Structra.codeView): read and write it through its box, and type with the real keyboard
  const setSql = (text) => page.evaluate((t) => { const box = document.querySelector('.qp-sql-host').codeView; box.setValue(t); box.focus(); box.moveToEnd(); }, text);
  const getSql = () => page.evaluate(() => document.querySelector('.qp-sql-host').codeView.getValue());
  const run = async (text, keys = 'Control+Enter') => {
    await setSql(text);
    await page.keyboard.press(keys);
    await page.waitForFunction(() => !/Running/.test((document.querySelector('#queryResults .qp-summary') || {}).textContent || ''), null, { timeout: 30000 });
    return page.evaluate(() => ({
      summary: (document.querySelector('#queryResults .qp-summary') || {}).textContent || '',
      error: !!document.querySelector('#queryResults .is-error'),
      head: [...document.querySelectorAll('#queryResults .qp-sql-grid thead th:not(.qp-sql-n)')].map((t) => t.textContent),
      cells: [...document.querySelectorAll('#queryResults .qp-sql-grid tbody tr')].map((tr) => [...tr.querySelectorAll('td:not(.qp-sql-n)')].map((td) => td.textContent)),
    }));
  };

  // ---- A query runs with Ctrl+Enter and shows a grid ----
  let r = await run("SELECT name, amount FROM data WHERE region = 'North' ORDER BY amount DESC");
  if (r.error || r.head.join(',') !== 'name,amount') fail('the grid should have the columns name,amount: ' + JSON.stringify(r));
  if (r.cells.length !== 2 || r.cells[0][0] !== 'Cy') fail('the North rows should be Cy then Ann: ' + JSON.stringify(r.cells));
  if (!/2 rows in/.test(r.summary)) fail('the summary should say 2 rows and the time: ' + r.summary);

  r = await run('SELECT COUNT(*) AS n, SUM(amount) AS total FROM data');
  if (r.cells[0][0] !== '4' || r.cells[0][1] !== '400.5') fail('count and total should be 4 and 400.5: ' + JSON.stringify(r.cells));

  r = await run('SELECT name, amount FROM data WHERE amount IS NULL');
  if (!r.cells[0] || r.cells[0][1] !== 'NULL') fail('a missing value should read NULL: ' + JSON.stringify(r.cells));

  // Enter alone starts a new line, it does not run
  await setSql('SELECT 1');
  await page.keyboard.press('Enter');
  const val = await getSql();
  if (val !== 'SELECT 1\n') fail('Enter should add a new line in SQL mode: ' + JSON.stringify(val));

  // ---- Selecting part of the text runs only that part ----
  await setSql('SELECT 1 AS one;\nSELECT COUNT(*) AS n FROM data');
  await page.evaluate(() => { const box = document.querySelector('.qp-sql-host').codeView; const at = box.getValue().indexOf('SELECT COUNT'); box.focus(); box.view.dispatch({ selection: { anchor: at, head: box.view.state.doc.length } }); });
  await page.keyboard.press('Control+Enter');
  await page.waitForTimeout(600);
  const sel = await page.evaluate(() => [...document.querySelectorAll('#queryResults .qp-sql-grid tbody td:not(.qp-sql-n)')].map((t) => t.textContent));
  if (sel.join(',') !== '4') fail('the selected statement should run alone: ' + sel.join(','));

  // ---- Clicking a column adds it to the query ----
  await setSql('SELECT  FROM data');
  await page.evaluate(() => { const box = document.querySelector('.qp-sql-host').codeView; box.focus(); box.setCursor(0, 7); });
  await page.locator('#sqlSchema summary').click();                  // the column list starts folded
  await page.locator('#sqlColumns .qp-sql-col', { hasText: 'region' }).click();
  const filled = await getSql();
  if (filled !== 'SELECT region FROM data') fail('clicking a column should add its name where the cursor is: ' + filled);

  // ---- An example runs at once ----
  await page.locator('#sqlExamples .qp-preset-btn', { hasText: 'Count by name' }).click();
  await page.waitForTimeout(800);
  const grouped = await page.evaluate(() => [...document.querySelectorAll('#queryResults .qp-sql-grid tbody tr')].map((tr) => [...tr.querySelectorAll('td:not(.qp-sql-n)')].map((td) => td.textContent).join(':')));
  if (grouped.length !== 4 || grouped[0].split(':')[1] !== '1') fail('Count by name should give 4 groups of 1: ' + grouped.join(' | '));

  // ---- Only reading queries run, one at a time ----
  r = await run('DROP TABLE data');
  if (!r.error || !/Only queries that read data/.test(r.summary)) fail('DROP should be refused in plain words: ' + r.summary);
  r = await run('SELECT 1; SELECT 2');
  if (!r.error || !/one statement at a time/.test(r.summary)) fail('two statements should be refused: ' + r.summary);
  r = await run("SELECT * FROM data WHERE name = 'a;b'");
  if (r.error) fail('a ; inside text should not count as a second statement: ' + r.summary);

  // PIVOT and UNPIVOT only read data, so they are allowed
  r = await run("PIVOT (SELECT region, name FROM data) ON region USING COUNT(*)");
  if (r.error) fail('PIVOT should run: ' + r.summary);
  r = await run("UNPIVOT (SELECT id, amount FROM data) ON id, amount INTO NAME field VALUE content");
  if (r.error) fail('UNPIVOT should run: ' + r.summary);

  // ---- Each kind of value is shown as what it is ----
  r = await run('SELECT SUM(id) AS total FROM data');
  if (r.cells[0][0] !== '10') fail('a whole-number total should read 10, not quoted or odd: ' + JSON.stringify(r.cells));
  r = await run("SELECT 12.50::DECIMAL(10,2) AS price, DATE '2026-03-17' AS day, TIMESTAMP '2026-03-17 10:30:00' AS moment, TIME '10:30:15' AS clock, 5::HUGEINT AS big, TRUE AS flag");
  const kinds = r.cells[0] ? r.cells[0].join(' | ') : JSON.stringify(r);
  if (kinds !== '12.50 | 2026-03-17 | 2026-03-17 10:30:00 | 10:30:15 | 5 | true') fail('decimal, date, timestamp, time and whole numbers should read as themselves: ' + kinds);
  const aligned = await page.evaluate(() => [...document.querySelectorAll('#queryResults .qp-sql-grid tbody tr:first-child td:not(.qp-sql-n)')].map((td) => td.classList.contains('qp-sql-num')).join());
  if (aligned !== 'true,false,false,false,true,false') fail('numbers should line up on the right and the rest on the left: ' + aligned);
  // A list and a record are real data when they are copied or opened in a tab, not text
  r = await run("SELECT [1, 2, 3] AS numbers, {'a': 1, 'b': [true]} AS record");
  const plain = await page.evaluate(() => document.querySelector('structra-query')._lastSql.table.plain[0]);
  if (JSON.stringify(plain) !== '[[1,2,3],{"a":1,"b":[true]}]') fail('a list and a record should stay real data: ' + JSON.stringify(plain));

  // ---- Errors are short and say what to do ----
  r = await run('SELECT nope FROM data');
  if (!r.error || /Binder Error|LINE 1/.test(r.summary) || !/nope/i.test(r.summary)) fail('a wrong column name should give a plain message that names it: ' + r.summary);
  r = await run('SELECT * FROM sales');
  if (!r.error || !/table named data/.test(r.summary)) fail('a wrong table name should point to the table data: ' + r.summary);
  r = await run('SELEC 1');
  if (!r.error) fail('a typo should give an error');

  // ---- The Tree and Table are not changed by a panel query ----
  const filter = await page.evaluate(() => (Structra.dataEngine.getQuery ? Structra.dataEngine.getQuery() : null));
  if (filter && filter.source === 'sql') fail('a panel SQL query should not change what the Tree and Table show');

  // ---- History keeps earlier queries ----
  const history = await page.evaluate(() => [...document.querySelectorAll('#sqlHistory option')].map((o) => o.textContent));
  if (history.length < 3 || !history.some((h) => /COUNT\(\*\) AS n, SUM/.test(h))) fail('earlier queries should be kept: ' + history.join(' | '));

  // ---- Colours and suggestions ----
  await setSql("SELECT region, COUNT(*) FROM data WHERE name = 'Ann' -- note");
  const colours = await page.evaluate(() => {
    const kinds = (cls) => [...document.querySelectorAll('.qp-sql-host .' + cls)].map((e) => e.textContent);
    return { keyword: kinds('tok-keyword'), string: kinds('tok-string'), comment: kinds('tok-comment') };
  });
  if (!colours.keyword.includes('SELECT') || !colours.keyword.includes('FROM')) fail('keywords should be coloured: ' + JSON.stringify(colours));
  if (!colours.string.some((t) => t.includes('Ann'))) fail('text in quotes should be coloured: ' + JSON.stringify(colours));
  if (!colours.comment.some((t) => t.includes('note'))) fail('a comment should be coloured: ' + JSON.stringify(colours));
  const keywordColour = await page.evaluate(() => getComputedStyle(document.querySelector('.qp-sql-host .tok-keyword')).color);
  const textColour = await page.evaluate(() => getComputedStyle(document.querySelector('.qp-sql-host .cm-editor')).color);
  if (keywordColour === textColour) fail('a keyword should not have the same colour as plain text');

  const hints = () => page.evaluate(() => [...document.querySelectorAll('.qp-sql-host .cm-tooltip-autocomplete li .cm-completionLabel')].map((e) => e.textContent));
  const hintsShown = async () => (await hints()).length > 0;
  await setSql('');
  await page.keyboard.type('SELECT reg');
  await page.waitForTimeout(300);
  if (!(await hints()).includes('region')) fail('typing SELECT reg should suggest region: ' + (await hints()).join(','));
  await page.keyboard.press('Tab');
  if ((await getSql()) !== 'SELECT region') fail('Tab should accept the suggestion: ' + (await getSql()));
  await page.waitForTimeout(150);
  if (await hintsShown()) fail('the list should close after a suggestion is accepted');

  await page.keyboard.type(' FROM d');
  await page.waitForTimeout(300);
  if (!(await hints()).includes('data')) fail('typing FROM d should suggest the table data: ' + (await hints()).join(','));
  await page.keyboard.press('Enter');
  if ((await getSql()) !== 'SELECT region FROM data') fail('Enter should accept, not add a new line: ' + JSON.stringify(await getSql()));

  await setSql('SELECT data.');
  await page.keyboard.press('Control+Space');
  await page.waitForTimeout(300);
  const dotted = await hints();
  if (!dotted.includes('amount') || !dotted.includes('region')) fail('Ctrl+Space after data. should list the columns: ' + dotted.join(','));
  await page.keyboard.press('ArrowDown');
  const moved = await page.evaluate(() => document.querySelector('.qp-sql-host .cm-tooltip-autocomplete li[aria-selected] .cm-completionLabel').textContent);
  if (moved === dotted[0]) fail('the arrow keys should move the choice');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  const afterEsc = await page.evaluate(() => ({ list: document.querySelectorAll('.qp-sql-host .cm-tooltip-autocomplete li').length, panel: !!Structra.state.queryPanelOpen }));
  if (afterEsc.list || !afterEsc.panel) fail('Escape should close the list and keep the panel open: ' + JSON.stringify(afterEsc));

  await setSql('');
  await page.keyboard.type('SELECT COU');
  await page.waitForTimeout(300);
  const hasCount = (await hints()).some((h) => /^COUNT/i.test(h));
  if (!hasCount) fail('keywords and functions should be suggested too: ' + (await hints()).join(','));
  await page.keyboard.press('Escape');

  // Brackets and quotes close themselves
  await setSql('');
  await page.keyboard.type('COUNT(');
  if ((await getSql()) !== 'COUNT()') fail('a bracket should close itself: ' + (await getSql()));

  // ---- Results can be kept ----
  await run('SELECT id, name FROM data ORDER BY id');
  const actions = await page.evaluate(() => [...document.querySelectorAll('#queryResults .qp-actions .btn')].map((b) => b.textContent.trim()));
  if (actions.join('|') !== 'Open as a table in a new tab|Copy as JSON|Download CSV') fail('the result actions are wrong: ' + actions.join('|'));
  const tabs = await page.evaluate(() => Structra.tabs.list.length);
  await page.locator('[data-action="sqlOpen"]').click();
  await page.waitForTimeout(1000);
  const tabsAfter = await page.evaluate(() => Structra.tabs.list.length);
  if (tabsAfter !== tabs + 1) fail('Open as a table should add a tab');
  const opened = await page.evaluate(() => JSON.stringify(Structra.state.jsonData));
  if (opened !== JSON.stringify(rows.map((x) => ({ id: x.id, name: x.name })))) fail('the new tab should hold the result rows: ' + opened);

  // ---- A result belongs to the mode that made it: another mode does not show it ----
  await run('SELECT id FROM data');
  if (!(await page.evaluate(() => !!document.querySelector('#queryResults .qp-sql-grid')))) fail('the SQL result should be showing before the mode changes');
  await page.locator('.seg-btn[data-mode="path"]').click();
  const other = await page.evaluate(() => ({ grid: !!document.querySelector('#queryResults .qp-sql-grid'), text: document.querySelector('#queryResults').textContent.trim() }));
  if (other.grid || !/Type a query/.test(other.text)) fail('a SQL result should not stay when another mode is chosen: ' + JSON.stringify(other));
  await page.locator('.seg-btn[data-mode="sql"]').click();
  if (await page.evaluate(() => !!document.querySelector('#queryResults .qp-sql-grid'))) fail('the old SQL result should not come back when SQL is chosen again');

  // ---- Other modes are unchanged ----
  await page.locator('.seg-btn[data-mode="path"]').click();
  const gone = await page.evaluate(() => ({ s: document.querySelector('#sqlSchema').hidden, e: document.querySelector('#sqlExamples').hidden, h: document.querySelector('#sqlHistory').hidden }));
  if (!gone.s || !gone.e || !gone.h) fail('the SQL extras should be hidden in the other modes: ' + JSON.stringify(gone));
}, { viewport: { width: 1360, height: 900 } });
