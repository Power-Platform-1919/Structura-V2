/* The Table as a grid: a true scrollbar, screen reader roles, the keyboard, selection, following the selected path, and the edges
   (0, 1, 200, 201 and 450,000 rows, many columns, a window that is resized, hidden columns).

   What this guards: the scrollbar used to know only the rows drawn so far (100,000 rows gave a 100,723 px scroll box, so row
   80,000 could not be reached by dragging); the Table had no grid roles and no keyboard navigation at all; its selected row lost
   its mark when rows were redrawn; a row selected in the Tree did not show here.

   Run:  node tests/smoke/table-grid.js          (PW_CHANNEL=msedge uses the installed Edge; PW_BROWSER=firefox or webkit) */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

let chromium;
try { ({ chromium } = require('playwright')); } catch {
  console.error('Playwright is not installed. Run: npm install --save-dev playwright && npx playwright install chromium');
  process.exit(2);
}

const { launchBrowser } = require('../launch-browser');
const { uploadAndWait } = require('../page-helpers');
const ROOT = path.join(__dirname, '..', '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' };

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

const makeRows = (count, extra = {}) => Array.from({ length: count }, (value, i) => ({ id: i, name: 'row' + i, cost: (i * 7) % 500, tags: ['a', 'b'], ...extra }));

(async () => {
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}/index.html`;
  const browser = await launchBrowser(chromium);
  const page = await (await newCtx(browser, { viewport: { width: 1360, height: 900 } })).newPage();
  const failures = [];
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
  const fail = (message) => failures.push(message);

  /* ---------- helpers ---------- */

  // Open a document and show it as a table. A big one goes through a file (a buffer over 50 MB is refused).
  const openTable = async (name, value) => {
    await page.evaluate(() => Structra.setState('activeView', 'overview'));
    const text = JSON.stringify(value);
    if (text.length > 40 * 1024 * 1024) throw new Error('too big for a buffer');
    if (text.length > 8 * 1024 * 1024) {
      const file = path.join(os.tmpdir(), 'structra-' + name);
      fs.writeFileSync(file, text);
      await uploadAndWait(page, file, { timeout: 120000 });
      fs.unlinkSync(file);
    } else {
      await uploadAndWait(page, { name, mimeType: 'application/json', buffer: Buffer.from(text) });
    }
    await page.evaluate(() => Structra.setState('activeView', 'table'));
    // A list with rows is ready when a row is drawn (a window draws after its helper loads); an empty one shows a message cell
    await page.waitForSelector(Array.isArray(value) && value.length > 100 && typeof value[0] === 'object' ? '#tableBody tr[data-index]' : '#tableBody td', { timeout: 60000 });
  };
  const active = () => page.evaluate(() => {
    const element = document.activeElement;
    if (!element || !element.closest('table.data-table')) return null;
    const row = element.closest('tr');
    return { tag: element.tagName, row: element.tagName === 'TH' ? -1 : Number(row.dataset.index), col: element.cellIndex };
  });
  const expectActive = async (row, col, label) => {
    await page.waitForFunction(([r, c]) => {
      const element = document.activeElement;
      if (!element || !element.closest || !element.closest('table.data-table')) return false;
      const tr = element.closest('tr');
      return (element.tagName === 'TH' ? -1 : Number(tr.dataset.index)) === r && element.cellIndex === c;
    }, [row, col], { timeout: 8000 }).catch(() => {});
    const got = await active();
    if (!got || got.row !== row || got.col !== col) fail(`${label}: expected the keyboard on row ${row}, column ${col}, got ${JSON.stringify(got)}`);
  };
  const grid = () => page.evaluate(() => {
    const table = document.querySelector('table.data-table');
    const scroll = document.querySelector('#tableScroll');
    const rows = [...document.querySelectorAll('#tableBody tr[data-index]')];
    return {
      role: table.getAttribute('role'), rowcount: table.getAttribute('aria-rowcount'), colcount: table.getAttribute('aria-colcount'),
      scrollTabindex: scroll.getAttribute('tabindex'), scrollHeight: scroll.scrollHeight, clientHeight: scroll.clientHeight,
      rowsInPage: rows.length, firstIndex: rows.length ? Number(rows[0].dataset.index) : null, lastIndex: rows.length ? Number(rows[rows.length - 1].dataset.index) : null,
      tabStops: document.querySelectorAll('table.data-table [tabindex="0"]').length,
      rowHeight: rows.length ? rows[0].getBoundingClientRect().height : 0,
      headerHeight: document.querySelector('#tableHead').offsetHeight,
      spacers: document.querySelectorAll('#tableBody tr.vl-spacer').length,
      pager: (document.querySelector('#tablePager') || {}).textContent || '',
    };
  });
  const press = async (key, times = 1) => { for (let i = 0; i < times; i++) await page.keyboard.press(key); };
  const section = async (name, fn) => {
    try { await fn(); } catch (error) { fail(`${name}: crashed: ` + String(error.message).split('\n')[0]); }
  };

  try {
    await page.goto(base);
    await page.waitForSelector('#canvasEmpty input[type=file]', { state: 'attached', timeout: 10000 });
    await page.keyboard.press('Escape');

    /* ---------- a long list: roles, a true scrollbar, jumping ---------- */
    const COUNT = 5000;
    await section('long list', async () => {
      await openTable('long.json', makeRows(COUNT));
      const g = await grid();
      if (g.role !== 'grid') fail('the table should have role="grid", got ' + g.role);
      if (g.rowcount !== String(COUNT + 1)) fail(`aria-rowcount should be ${COUNT + 1} (the rows and the header), got ${g.rowcount}`);
      if (g.colcount !== '4') fail('aria-colcount should be 4, got ' + g.colcount);
      if (g.scrollTabindex !== null) fail('the scroll box should not be a second tab stop beside the cell, it has tabindex=' + g.scrollTabindex);
      if (g.tabStops !== 1) fail('exactly one cell should be the tab stop, found ' + g.tabStops);
      if (g.rowsInPage < 5 || g.rowsInPage > 120) fail('only the rows on screen should be in the page, found ' + g.rowsInPage);
      const expectedHeight = COUNT * g.rowHeight + g.headerHeight;
      if (Math.abs(g.scrollHeight - expectedHeight) > expectedHeight * 0.02) fail(`the scrollbar should stand for all ${COUNT} rows (${Math.round(expectedHeight)} px), the scroll box is ${g.scrollHeight} px`);
      const header = await page.evaluate(() => ({ row: document.querySelector('#tableHead tr').getAttribute('aria-rowindex'), firstBody: document.querySelector('#tableBody tr[data-index]').getAttribute('aria-rowindex') }));
      if (header.row !== '1' || header.firstBody !== '2') fail('the header is row 1 and the first row is row 2: ' + JSON.stringify(header));

      // Drag the scrollbar to 80 percent: the rows there are drawn
      await page.evaluate(() => { const scroll = document.querySelector('#tableScroll'); scroll.scrollTop = (scroll.scrollHeight - scroll.clientHeight) * 0.8; });
      await page.waitForFunction((n) => { const rows = document.querySelectorAll('#tableBody tr[data-index]'); return rows.length && Number(rows[0].dataset.index) > n * 0.7; }, COUNT, { timeout: 8000 }).catch(() => {});
      const mid = await grid();
      if (!(mid.firstIndex > COUNT * 0.7 && mid.lastIndex < COUNT * 0.9)) fail(`at 80 percent the rows near 4000 should be drawn, got ${mid.firstIndex} to ${mid.lastIndex}`);
      if (mid.tabStops !== 1) fail('after a scroll one tab stop must remain (the header cell), found ' + mid.tabStops);
      // The cell text matches its row
      const cell = await page.evaluate(() => { const row = document.querySelector('#tableBody tr[data-index]'); return { index: Number(row.dataset.index), id: row.children[0].textContent.trim() }; });
      if (String(cell.index) !== cell.id) fail(`row ${cell.index} shows id ${cell.id}`);
    });

    /* ---------- the keyboard on the same list ---------- */
    await section('keyboard', async () => {
      await page.evaluate(() => { document.querySelector('#tableScroll').scrollTop = 0; });
      await page.waitForFunction(() => { const row = document.querySelector('#tableBody tr[data-index]'); return row && Number(row.dataset.index) === 0; }, null, { timeout: 8000 });
      await page.locator('#tableHead th').first().focus();
      await expectActive(-1, 0, 'focus on the first header');
      await press('ArrowDown'); await expectActive(0, 0, 'ArrowDown from the header');
      await press('ArrowRight'); await expectActive(0, 1, 'ArrowRight');
      await press('ArrowDown', 3); await expectActive(3, 1, 'ArrowDown three times');
      await press('ArrowLeft', 4); await expectActive(3, 0, 'ArrowLeft stops at the first column');
      await press('End'); await expectActive(3, 3, 'End goes to the last column');
      await press('Home'); await expectActive(3, 0, 'Home goes to the first column');
      await press('ArrowUp', 5); await expectActive(-1, 0, 'ArrowUp stops at the header');
      const stops = await page.evaluate(() => ({ count: document.querySelectorAll('table.data-table [tabindex="0"]').length, focusedIsStop: document.activeElement.getAttribute('tabindex') === '0' }));
      if (stops.count !== 1 || !stops.focusedIsStop) fail('the focused cell must be the one tab stop: ' + JSON.stringify(stops));

      // A page, then the far end and back, through rows that are not drawn yet
      await press('ArrowDown');
      const perScreen = await page.evaluate(() => { const s = document.querySelector('#tableScroll'); const row = document.querySelector('#tableBody tr[data-index]'); return Math.max(1, Math.floor((s.clientHeight - document.querySelector('#tableHead').offsetHeight) / row.getBoundingClientRect().height) - 1); });
      await press('PageDown'); await expectActive(perScreen, 0, 'PageDown moves a screen');
      await press('Control+End'); await expectActive(COUNT - 1, 3, 'Ctrl+End reaches the last row, which was not drawn');
      const end = await page.evaluate(() => { const row = document.activeElement.closest('tr'); return { rowindex: row.getAttribute('aria-rowindex'), id: row.children[0].textContent.trim() }; });
      if (end.rowindex !== String(COUNT + 1) || end.id !== String(COUNT - 1)) fail('the last row should be aria-rowindex ' + (COUNT + 1) + ' with id ' + (COUNT - 1) + ': ' + JSON.stringify(end));
      await press('ArrowDown'); await expectActive(COUNT - 1, 3, 'ArrowDown stops at the last row');
      await press('Control+Home'); await expectActive(-1, 0, 'Ctrl+Home goes to the header');
      // Tab leaves the grid
      await press('Tab');
      const left = await page.evaluate(() => !(document.activeElement && document.activeElement.closest('table.data-table')));
      if (!left) fail('Tab should leave the grid');
    });

    /* ---------- selection, sorting, the context menu from the keyboard ---------- */
    await section('selection and sort', async () => {
      await page.evaluate(() => { document.querySelector('#tableScroll').scrollTop = 0; });
      await page.waitForFunction(() => { const row = document.querySelector('#tableBody tr[data-index]'); return row && Number(row.dataset.index) === 0; }, null, { timeout: 8000 });
      await page.locator('#tableHead th').first().focus();
      await press('ArrowDown', 3);                       // row 2
      await press('Enter');
      const sel = await page.evaluate(() => ({ path: Structra.state.currentPath, marked: [...document.querySelectorAll('#tableBody tr.row-sel')].map((r) => r.dataset.path + ':' + r.getAttribute('aria-selected')) }));
      if (sel.path !== '[2]') fail('Enter on a row should select it: the path is ' + sel.path);
      if (sel.marked.join() !== '[2]:true') fail('the selected row should carry the mark and aria-selected: ' + sel.marked.join());

      // The mark survives a scroll away and back
      await page.evaluate(() => { const s = document.querySelector('#tableScroll'); s.scrollTop = s.scrollHeight; });
      await page.waitForFunction(() => Number(document.querySelector('#tableBody tr[data-index]').dataset.index) > 3000, null, { timeout: 8000 });
      await page.evaluate(() => { document.querySelector('#tableScroll').scrollTop = 0; });
      await page.waitForFunction(() => Number(document.querySelector('#tableBody tr[data-index]').dataset.index) === 0, null, { timeout: 8000 });
      const kept = await page.evaluate(() => !!document.querySelector('#tableBody tr[data-path="[2]"].row-sel'));
      if (!kept) fail('the selected row lost its mark after scrolling away and back');

      // Sort by the keyboard: Enter on the cost header; the selection stays on the same record
      await page.locator('#tableHead th').first().focus();
      await press('ArrowRight', 2);                      // the cost header (the arrow keys are how a person gets there)
      await press('Enter');
      await page.waitForFunction(() => document.querySelector('#tableHead th[data-col="cost"]').getAttribute('aria-sort') === 'ascending', null, { timeout: 8000 }).catch(() => {});
      let sorted = await page.evaluate(() => ({ sort: document.querySelector('#tableHead th[data-col="cost"]').getAttribute('aria-sort'), first: document.querySelector('#tableBody tr[data-index] td:nth-child(3)').textContent.trim(), active: document.activeElement.tagName + ':' + document.activeElement.getAttribute('data-col') }));
      if (sorted.sort !== 'ascending' || sorted.first !== '0') fail('Enter on a header should sort it ascending: ' + JSON.stringify(sorted));
      if (sorted.active !== 'TH:cost') fail('the focus should stay on the header after sorting: ' + sorted.active);
      await press('Enter');
      await page.waitForFunction(() => document.querySelector('#tableHead th[data-col="cost"]').getAttribute('aria-sort') === 'descending', null, { timeout: 8000 }).catch(() => {});
      sorted = await page.evaluate(() => ({ sort: document.querySelector('#tableHead th[data-col="cost"]').getAttribute('aria-sort'), first: document.querySelector('#tableBody tr[data-index] td:nth-child(3)').textContent.trim() }));
      if (sorted.sort !== 'descending' || sorted.first !== '499') fail('the second Enter should sort descending: ' + JSON.stringify(sorted));
      const stillRow2 = await page.evaluate(() => Structra.state.currentPath);
      if (stillRow2 !== '[2]') fail('sorting must not change the selected path, it is ' + stillRow2);

      // Shift+F10 on a header opens its menu
      await press('Shift+F10');
      const menu = await page.waitForSelector('.col-ctx-menu', { timeout: 3000 }).then(() => true).catch(() => false);
      if (!menu) fail('Shift+F10 on a header should open the column menu');
      await press('Escape');
      await page.mouse.click(5, 5);
    });

    /* ---------- following the path chosen elsewhere ---------- */
    await section('following a path', async () => {
      await page.evaluate(() => Structra.setState('activeView', 'table'));
      // Unsorted again: the document's own order
      await page.evaluate(() => { document.querySelector('structra-table')._sortCol = null; document.querySelector('structra-table').renderTable(); });
      await page.waitForSelector('#tableBody tr[data-index]');
      await page.evaluate(() => Structra.setState('currentPath', '[3200].name'));
      await page.waitForFunction(() => !!document.querySelector('#tableBody tr[data-path="[3200]"]'), null, { timeout: 8000 }).catch(() => {});
      const shown = await page.evaluate(() => {
        const row = document.querySelector('#tableBody tr[data-path="[3200]"]');
        if (!row) return null;
        const box = row.getBoundingClientRect(); const scroll = document.querySelector('#tableScroll').getBoundingClientRect();
        return { marked: row.classList.contains('row-sel'), inView: box.top >= scroll.top && box.bottom <= scroll.bottom };
      });
      if (!shown) fail('a path chosen elsewhere ([3200].name) should bring its row into the table');
      else { if (!shown.marked) fail('the row of the chosen path should be marked'); if (!shown.inView) fail('the row of the chosen path should be scrolled into view'); }
      // A path outside the list changes nothing
      await page.evaluate(() => Structra.setState('currentPath', 'somethingElse.name'));
      const stays = await page.evaluate(() => !!document.querySelector('#tableBody tr[data-path="[3200]"].row-sel'));
      if (!stays) fail('a path that is not a row of this table should leave the selection alone');
      // Chosen in another view, then the table is shown
      await page.evaluate(() => { Structra.setState('activeView', 'tree'); Structra.setState('currentPath', '[700].name'); });
      await page.evaluate(() => Structra.setState('activeView', 'table'));
      await page.waitForFunction(() => !!document.querySelector('#tableBody tr[data-path="[700]"].row-sel'), null, { timeout: 8000 }).catch(() => {});
      const later = await page.evaluate(() => !!document.querySelector('#tableBody tr[data-path="[700]"].row-sel'));
      if (!later) fail('a row chosen in the Tree should be marked when the table is shown afterwards');
    });

    /* ---------- the edges ---------- */
    await section('200 and 201 rows', async () => {
      await openTable('rows200.json', makeRows(200));
      let g = await grid();
      if (g.spacers !== 0 || g.rowsInPage !== 50 || !/of 200/.test(g.pager)) fail('200 rows should be shown a page at a time (50 rows), got ' + JSON.stringify({ rows: g.rowsInPage, spacers: g.spacers, pager: g.pager.slice(0, 60) }));
      if (g.rowcount !== '201') fail('aria-rowcount for 200 rows should be 201, got ' + g.rowcount);
      // In a page the keyboard stops at the end of the page
      await page.locator('#tableHead th').first().focus();
      await press('Control+End'); await expectActive(49, 3, 'Ctrl+End in a page goes to the last row of the page');
      await press('ArrowDown'); await expectActive(49, 3, 'ArrowDown stops at the end of the page');
      await openTable('rows201.json', makeRows(201));
      g = await grid();
      if (!(g.scrollHeight > 201 * g.rowHeight * 0.95) || !/201 rows/.test(g.pager)) fail('201 rows should scroll as one list: ' + JSON.stringify({ scrollHeight: g.scrollHeight, pager: g.pager.slice(0, 60) }));
    });

    await section('one row, no rows, one record, a list of numbers', async () => {
      await openTable('one.json', [{ a: 1, b: 'x' }]);
      let g = await grid();
      if (g.role !== 'grid' || g.rowcount !== '2' || g.rowsInPage !== 1) fail('one row: ' + JSON.stringify({ role: g.role, rowcount: g.rowcount, rows: g.rowsInPage }));
      await page.locator('#tableHead th').first().focus();
      await press('ArrowDown'); await expectActive(0, 0, 'the only row');
      await press('ArrowDown'); await expectActive(0, 0, 'no row below the only row');

      await openTable('empty.json', []);
      const empty = await page.evaluate(() => ({ role: document.querySelector('table.data-table').getAttribute('role'), tab: document.querySelector('#tableScroll').getAttribute('tabindex'), text: document.querySelector('#tableBody').textContent.trim().slice(0, 60) }));
      if (empty.role || empty.tab !== '0') fail('with no rows the box (not a grid) must be reachable by keyboard: ' + JSON.stringify(empty));

      await openTable('record.json', { name: 'x', count: 3 });
      const record = await page.evaluate(() => ({ role: document.querySelector('table.data-table').getAttribute('role'), tab: document.querySelector('#tableScroll').getAttribute('tabindex'), cells: document.querySelectorAll('#tableBody td').length }));
      if (record.role || record.tab !== '0' || record.cells < 2) fail('one record is a field list, not a grid, and its box is reachable: ' + JSON.stringify(record));

      await openTable('numbers.json', [1, 2, 3]);
    });

    await section('many columns', async () => {
      const wide = Array.from({ length: 30 }, (value, i) => { const row = { id: i }; for (let c = 0; c < 150; c++) row['col' + c] = c + i; return row; });
      await openTable('wide.json', wide);
      const g = await grid();
      if (g.colcount !== '80') fail('150 columns show 80 at first (aria-colcount 80), got ' + g.colcount);
      await page.locator('#tableHead th').first().focus();
      await press('End');
      const where = await active();
      if (!where || where.col !== 79) fail('End should reach the last column shown (79): ' + JSON.stringify(where));
      const more = await page.locator('[data-page-action="more-cols"]').count();
      if (!more) fail('more columns should be offered');
    });

    await section('hidden columns and filters', async () => {
      await openTable('cols.json', makeRows(300));
      await page.evaluate(() => document.querySelector('structra-table')._execColumnAction('hide', 'name'));
      await page.waitForFunction(() => !document.querySelector('#tableHead th[data-col="name"]'), null, { timeout: 5000 });
      await page.locator('#tableHead th').first().focus();
      await press('End');
      const hidden = await active();
      if (!hidden || hidden.col !== 2) fail('with a column hidden End should reach column 2 of 3: ' + JSON.stringify(hidden));
      // A filter makes the list shorter; the grid follows
      await page.evaluate(() => { const table = document.querySelector('structra-table'); table._colFilters = { cost: '7' }; table.renderTable(); });
      await page.waitForTimeout(400);
      const filtered = await grid();
      if (Number(filtered.rowcount) >= 301) fail('a column filter should shorten the list, aria-rowcount is ' + filtered.rowcount);
    });

    await section('a window that is resized', async () => {
      await openTable('resize.json', makeRows(3000));
      await page.setViewportSize({ width: 1360, height: 420 });
      await page.waitForTimeout(500);
      let g = await grid();
      const smallRows = g.rowsInPage;
      await page.setViewportSize({ width: 1360, height: 1000 });
      await page.waitForFunction((n) => document.querySelectorAll('#tableBody tr[data-index]').length > n, smallRows, { timeout: 8000 }).catch(() => {});
      g = await grid();
      if (g.rowsInPage <= smallRows) fail(`a taller window should draw more rows (${smallRows} before, ${g.rowsInPage} after)`);
      // Rows fill the box from top to bottom: nothing blank under the last drawn row
      const gap = await page.evaluate(() => {
        const scroll = document.querySelector('#tableScroll');
        const rows = [...document.querySelectorAll('#tableBody tr[data-index]')];
        const last = rows[rows.length - 1].getBoundingClientRect();
        return Math.round(scroll.getBoundingClientRect().bottom - last.bottom);
      });
      if (gap > 40) fail('after growing the window there is a blank gap of ' + gap + ' px under the last row');
      await page.setViewportSize({ width: 1360, height: 900 });
    });

    await section('a list too long to scroll as one', async () => {
      const long = Array.from({ length: 450000 }, (value, i) => ({ i, n: 'r' + i }));
      await openTable('huge.json', long);
      const g = await grid();
      if (g.spacers !== 0 || g.rowsInPage !== 50) fail('450,000 rows should be shown a page at a time: ' + JSON.stringify({ spacers: g.spacers, rows: g.rowsInPage }));
      if (!/very long list/.test(g.pager) || !/of 450,000/.test(g.pager)) fail('the pager should say it is a very long list: ' + g.pager.slice(0, 120));
      if (g.rowcount !== '450001') fail('aria-rowcount should still be 450001, got ' + g.rowcount);
    });

    /* ---------- one set of handlers, however often it is drawn ---------- */
    await section('no stacked handlers', async () => {
      await openTable('handlers.json', makeRows(60));
      const count = await page.evaluate(async () => {
        const table = document.querySelector('structra-table');
        for (let i = 0; i < 4; i++) { table.render(); table.renderTable(); }
        let selected = 0;
        Structra.events.on('tree:node-selected', () => selected++);
        document.querySelector('#tableBody tr[data-path] td').click();
        await new Promise((resolve) => setTimeout(resolve, 200));
        return selected;
      });
      if (count !== 1) fail('after several renders one click should select once, it selected ' + count + ' times');
    });
  } catch (err) {
    fail('crashed: ' + err.message.split(/\r?\n/).slice(0, 4).join(' / '));
  }

  if (errors.length) fail('page errors: ' + [...new Set(errors)].join(' | '));
  await browser.close();
  server.close();
  if (failures.length) { console.log('table-grid smoke test: FAILED\n - ' + failures.join('\n - ')); process.exit(1); }
  console.log('table-grid smoke test: ok');
})();
