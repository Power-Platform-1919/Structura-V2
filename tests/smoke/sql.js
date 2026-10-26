/* The SQL mode of the Query panel: the open file is the table "data", example queries and columns come from the
   file, results show in a grid, only reading queries run, errors are in plain words, and earlier queries are kept.

   Run:  node tests/smoke/sql.js          (PW_CHANNEL=msedge uses the installed Edge)
*/
const http = require('http');
const fs = require('fs');
const path = require('path');

let chromium;
try { ({ chromium } = require('playwright')); } catch {
  console.error('Playwright is not installed. Run: npm install --save-dev playwright && npx playwright install chromium');
  process.exit(2);
}

const ROOT = path.join(__dirname, '..', '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' };

// The first-run welcome dialog opens a moment after load and would cover the page: tests start as a returning visitor
async function newCtx(browser, options) {
  const ctx = await browser.newContext(options);
  await ctx.addInitScript(() => { try { localStorage.setItem('structra.welcomeSeen', '1'); } catch { /* storage blocked */ } });
  return ctx;
}

function serve() {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const file = path.join(ROOT, url === '/' ? 'index.html' : url);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

(async () => {
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}/index.html`;
  const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
  const page = await (await newCtx(browser, { viewport: { width: 1360, height: 900 } })).newPage();
  const failures = [];
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));

  try {
    await page.goto(base);
    await page.waitForSelector('#canvasEmpty input[type=file]', { state: 'attached', timeout: 10000 });
    await page.keyboard.press('Escape');
    const rows = [
      { id: 1, name: 'Ann', region: 'North', amount: 120.5, active: true },
      { id: 2, name: 'Bo', region: 'South', amount: 80, active: false },
      { id: 3, name: 'Cy', region: 'North', amount: 200, active: true },
      { id: 4, name: 'Di', region: 'East', amount: null, active: true },
    ];
    await page.locator('#canvasEmpty input[type=file]').first().setInputFiles({ name: 'sales.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(rows)) });
    await page.waitForTimeout(1200);
    await page.evaluate(() => Structra.set('queryPanelOpen', true));
    await page.waitForTimeout(300);

    // ---- SQL is one of the modes, and the columns of the file are listed ----
    await page.locator('.seg-btn[data-mode="sql"]').click();
    await page.waitForSelector('#sqlColumns .qp-sql-col', { state: 'attached', timeout: 60000 });
    const cols = await page.evaluate(() => [...document.querySelectorAll('#sqlColumns .qp-sql-col span')].map((e) => e.textContent));
    if (cols.join(',') !== 'id,name,region,amount,active') failures.push('the table columns should be id,name,region,amount,active: ' + cols.join(','));
    const examples = await page.evaluate(() => [...document.querySelectorAll('#sqlExamples .qp-preset-btn')].map((e) => e.textContent));
    if (!examples.includes('Count by name') || !examples.includes('Totals of id')) failures.push('example queries should use the real columns: ' + examples.join(' | '));
    const hidden = await page.evaluate(() => document.querySelector('#sqlSchema').hidden);
    if (hidden) failures.push('the table and its columns should be visible in SQL mode');

    // The SQL editor is CodeMirror: read and write it through its own object, and type with the real keyboard
    const setSql = (text) => page.evaluate((t) => { const cm = document.querySelector('.CodeMirror').CodeMirror; cm.setValue(t); cm.focus(); cm.setCursor({ line: cm.lastLine(), ch: 1e6 }); }, text);
    const getSql = () => page.evaluate(() => document.querySelector('.CodeMirror').CodeMirror.getValue());
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
    if (r.error || r.head.join(',') !== 'name,amount') failures.push('the grid should have the columns name,amount: ' + JSON.stringify(r));
    if (r.cells.length !== 2 || r.cells[0][0] !== 'Cy') failures.push('the North rows should be Cy then Ann: ' + JSON.stringify(r.cells));
    if (!/2 rows in/.test(r.summary)) failures.push('the summary should say 2 rows and the time: ' + r.summary);

    r = await run('SELECT COUNT(*) AS n, SUM(amount) AS total FROM data');
    if (r.cells[0][0] !== '4' || r.cells[0][1] !== '400.5') failures.push('count and total should be 4 and 400.5: ' + JSON.stringify(r.cells));

    r = await run('SELECT name, amount FROM data WHERE amount IS NULL');
    if (!r.cells[0] || r.cells[0][1] !== 'NULL') failures.push('a missing value should read NULL: ' + JSON.stringify(r.cells));

    // Enter alone starts a new line, it does not run
    await setSql('SELECT 1');
    await page.keyboard.press('Enter');
    const val = await getSql();
    if (val !== 'SELECT 1\n') failures.push('Enter should add a new line in SQL mode: ' + JSON.stringify(val));

    // ---- Selecting part of the text runs only that part ----
    await setSql('SELECT 1 AS one;\nSELECT COUNT(*) AS n FROM data');
    await page.evaluate(() => { const cm = document.querySelector('.CodeMirror').CodeMirror; cm.setSelection({ line: 1, ch: 0 }, { line: 1, ch: 1e6 }); });
    await page.keyboard.press('Control+Enter');
    await page.waitForTimeout(600);
    const sel = await page.evaluate(() => [...document.querySelectorAll('#queryResults .qp-sql-grid tbody td:not(.qp-sql-n)')].map((t) => t.textContent));
    if (sel.join(',') !== '4') failures.push('the selected statement should run alone: ' + sel.join(','));

    // ---- Clicking a column adds it to the query ----
    await setSql('SELECT  FROM data');
    await page.evaluate(() => { const cm = document.querySelector('.CodeMirror').CodeMirror; cm.focus(); cm.setCursor({ line: 0, ch: 7 }); });
    await page.locator('#sqlSchema summary').click();                  // the column list starts folded
    await page.locator('#sqlColumns .qp-sql-col', { hasText: 'region' }).click();
    const filled = await getSql();
    if (filled !== 'SELECT region FROM data') failures.push('clicking a column should add its name where the cursor is: ' + filled);

    // ---- An example runs at once ----
    await page.locator('#sqlExamples .qp-preset-btn', { hasText: 'Count by name' }).click();
    await page.waitForTimeout(800);
    const grouped = await page.evaluate(() => [...document.querySelectorAll('#queryResults .qp-sql-grid tbody tr')].map((tr) => [...tr.querySelectorAll('td:not(.qp-sql-n)')].map((td) => td.textContent).join(':')));
    if (grouped.length !== 4 || grouped[0].split(':')[1] !== '1') failures.push('Count by name should give 4 groups of 1: ' + grouped.join(' | '));

    // ---- Only reading queries run, one at a time ----
    r = await run('DROP TABLE data');
    if (!r.error || !/Only queries that read data/.test(r.summary)) failures.push('DROP should be refused in plain words: ' + r.summary);
    r = await run('SELECT 1; SELECT 2');
    if (!r.error || !/one statement at a time/.test(r.summary)) failures.push('two statements should be refused: ' + r.summary);
    r = await run("SELECT * FROM data WHERE name = 'a;b'");
    if (r.error) failures.push('a ; inside text should not count as a second statement: ' + r.summary);

    // PIVOT and UNPIVOT only read data, so they are allowed
    r = await run("PIVOT (SELECT region, name FROM data) ON region USING COUNT(*)");
    if (r.error) failures.push('PIVOT should run: ' + r.summary);
    r = await run("UNPIVOT (SELECT id, amount FROM data) ON id, amount INTO NAME field VALUE content");
    if (r.error) failures.push('UNPIVOT should run: ' + r.summary);

    // ---- Each kind of value is shown as what it is ----
    r = await run('SELECT SUM(id) AS total FROM data');
    if (r.cells[0][0] !== '10') failures.push('a whole-number total should read 10, not quoted or odd: ' + JSON.stringify(r.cells));
    r = await run("SELECT 12.50::DECIMAL(10,2) AS price, DATE '2026-03-17' AS day, TIMESTAMP '2026-03-17 10:30:00' AS moment, TIME '10:30:15' AS clock, 5::HUGEINT AS big, TRUE AS flag");
    const kinds = r.cells[0] ? r.cells[0].join(' | ') : JSON.stringify(r);
    if (kinds !== '12.50 | 2026-03-17 | 2026-03-17 10:30:00 | 10:30:15 | 5 | true') failures.push('decimal, date, timestamp, time and whole numbers should read as themselves: ' + kinds);
    const aligned = await page.evaluate(() => [...document.querySelectorAll('#queryResults .qp-sql-grid tbody tr:first-child td:not(.qp-sql-n)')].map((td) => td.classList.contains('qp-sql-num')).join());
    if (aligned !== 'true,false,false,false,true,false') failures.push('numbers should line up on the right and the rest on the left: ' + aligned);
    // A list and a record are real data when they are copied or opened in a tab, not text
    r = await run("SELECT [1, 2, 3] AS numbers, {'a': 1, 'b': [true]} AS record");
    const plain = await page.evaluate(() => document.querySelector('structra-query')._lastSql.table.plain[0]);
    if (JSON.stringify(plain) !== '[[1,2,3],{"a":1,"b":[true]}]') failures.push('a list and a record should stay real data: ' + JSON.stringify(plain));

    // ---- Errors are short and say what to do ----
    r = await run('SELECT nope FROM data');
    if (!r.error || /Binder Error|LINE 1/.test(r.summary) || !/nope/i.test(r.summary)) failures.push('a wrong column name should give a plain message that names it: ' + r.summary);
    r = await run('SELECT * FROM sales');
    if (!r.error || !/table named data/.test(r.summary)) failures.push('a wrong table name should point to the table data: ' + r.summary);
    r = await run('SELEC 1');
    if (!r.error) failures.push('a typo should give an error');

    // ---- The Tree and Table are not changed by a panel query ----
    const filter = await page.evaluate(() => (Structra.engine.getQuery ? Structra.engine.getQuery() : null));
    if (filter && filter.source === 'sql') failures.push('a panel SQL query should not change what the Tree and Table show');

    // ---- History keeps earlier queries ----
    const history = await page.evaluate(() => [...document.querySelectorAll('#sqlHistory option')].map((o) => o.textContent));
    if (history.length < 3 || !history.some((h) => /COUNT\(\*\) AS n, SUM/.test(h))) failures.push('earlier queries should be kept: ' + history.join(' | '));

    // ---- Colours and suggestions come from CodeMirror ----
    await setSql("SELECT region, COUNT(*) FROM data WHERE name = 'Ann' -- note");
    const colours = await page.evaluate(() => {
      const kinds = (cls) => [...document.querySelectorAll('.qp-sql-host .' + cls)].map((e) => e.textContent);
      return { keyword: kinds('cm-keyword'), string: kinds('cm-string'), comment: kinds('cm-comment') };
    });
    if (!colours.keyword.includes('SELECT') || !colours.keyword.includes('FROM')) failures.push('keywords should be coloured: ' + JSON.stringify(colours));
    if (!colours.string.some((t) => t.includes('Ann'))) failures.push('text in quotes should be coloured: ' + JSON.stringify(colours));
    if (!colours.comment.some((t) => t.includes('note'))) failures.push('a comment should be coloured: ' + JSON.stringify(colours));
    const keywordColour = await page.evaluate(() => getComputedStyle(document.querySelector('.qp-sql-host .cm-keyword')).color);
    const textColour = await page.evaluate(() => getComputedStyle(document.querySelector('.qp-sql-host .CodeMirror')).color);
    if (keywordColour === textColour) failures.push('a keyword should not have the same colour as plain text');

    const hints = () => page.evaluate(() => [...document.querySelectorAll('.CodeMirror-hints li')].map((li) => li.textContent));
    const hintsShown = async () => (await hints()).length > 0;
    await setSql('');
    await page.keyboard.type('SELECT reg');
    await page.waitForTimeout(300);
    if (!(await hints()).includes('region')) failures.push('typing SELECT reg should suggest region: ' + (await hints()).join(','));
    await page.keyboard.press('Tab');
    if ((await getSql()) !== 'SELECT region') failures.push('Tab should accept the suggestion: ' + (await getSql()));
    await page.waitForTimeout(150);
    if (await hintsShown()) failures.push('the list should close after a suggestion is accepted');

    await page.keyboard.type(' FROM d');
    await page.waitForTimeout(300);
    if (!(await hints()).includes('data')) failures.push('typing FROM d should suggest the table data: ' + (await hints()).join(','));
    await page.keyboard.press('Enter');
    if ((await getSql()) !== 'SELECT region FROM data') failures.push('Enter should accept, not add a new line: ' + JSON.stringify(await getSql()));

    await setSql('SELECT data.');
    await page.keyboard.press('Control+Space');
    await page.waitForTimeout(300);
    const dotted = await hints();
    if (!dotted.includes('data.amount') || !dotted.includes('data.region')) failures.push('Ctrl+Space after data. should list the columns: ' + dotted.join(','));
    await page.keyboard.press('ArrowDown');
    const moved = await page.evaluate(() => document.querySelector('.CodeMirror-hint-active').textContent);
    if (moved === dotted[0]) failures.push('the arrow keys should move the choice');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    const afterEsc = await page.evaluate(() => ({ list: document.querySelectorAll('.CodeMirror-hints li').length, panel: !!Structra.state.queryPanelOpen }));
    if (afterEsc.list || !afterEsc.panel) failures.push('Escape should close the list and keep the panel open: ' + JSON.stringify(afterEsc));

    await setSql('');
    await page.keyboard.type('SELECT COU');
    await page.waitForTimeout(300);
    const hasCount = (await hints()).some((h) => /^COUNT/i.test(h));
    if (!hasCount) failures.push('keywords and functions should be suggested too: ' + (await hints()).join(','));
    await page.keyboard.press('Escape');

    // Brackets and quotes close themselves
    await setSql('');
    await page.keyboard.type('COUNT(');
    if ((await getSql()) !== 'COUNT()') failures.push('a bracket should close itself: ' + (await getSql()));

    // ---- Results can be kept ----
    await run('SELECT id, name FROM data ORDER BY id');
    const actions = await page.evaluate(() => [...document.querySelectorAll('#queryResults .qp-actions .btn')].map((b) => b.textContent.trim()));
    if (actions.join('|') !== 'Open as a table in a new tab|Copy as JSON|Download CSV') failures.push('the result actions are wrong: ' + actions.join('|'));
    const tabs = await page.evaluate(() => Structra.tabs.list.length);
    await page.locator('[data-action="sqlOpen"]').click();
    await page.waitForTimeout(1000);
    const tabsAfter = await page.evaluate(() => Structra.tabs.list.length);
    if (tabsAfter !== tabs + 1) failures.push('Open as a table should add a tab');
    const opened = await page.evaluate(() => JSON.stringify(Structra.state.jsonData));
    if (opened !== JSON.stringify(rows.map((x) => ({ id: x.id, name: x.name })))) failures.push('the new tab should hold the result rows: ' + opened);

    // ---- A result belongs to the mode that made it: another mode does not show it ----
    await run('SELECT id FROM data');
    if (!(await page.evaluate(() => !!document.querySelector('#queryResults .qp-sql-grid')))) failures.push('the SQL result should be showing before the mode changes');
    await page.locator('.seg-btn[data-mode="path"]').click();
    const other = await page.evaluate(() => ({ grid: !!document.querySelector('#queryResults .qp-sql-grid'), text: document.querySelector('#queryResults').textContent.trim() }));
    if (other.grid || !/Type a query/.test(other.text)) failures.push('a SQL result should not stay when another mode is chosen: ' + JSON.stringify(other));
    await page.locator('.seg-btn[data-mode="sql"]').click();
    if (await page.evaluate(() => !!document.querySelector('#queryResults .qp-sql-grid'))) failures.push('the old SQL result should not come back when SQL is chosen again');

    // ---- Other modes are unchanged ----
    await page.locator('.seg-btn[data-mode="path"]').click();
    const gone = await page.evaluate(() => ({ s: document.querySelector('#sqlSchema').hidden, e: document.querySelector('#sqlExamples').hidden, h: document.querySelector('#sqlHistory').hidden }));
    if (!gone.s || !gone.e || !gone.h) failures.push('the SQL extras should be hidden in the other modes: ' + JSON.stringify(gone));
  } catch (e) {
    failures.push('crashed: ' + e.message.split(/\r?\n/).slice(0, 5).join(' / '));
  }

  if (errors.length) failures.push('page errors: ' + [...new Set(errors)].join(' | '));
  await browser.close();
  server.close();
  if (failures.length) { console.log('sql smoke test: FAILED\n - ' + failures.join('\n - ')); process.exit(1); }
  console.log('sql smoke test: ok');
})();
