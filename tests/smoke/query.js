/* The Query panel: each mode finds what it should on a real document, an empty or broken query
   says what to do, a result opens in the Tree, and matches can be kept in a new tab.

   Run:  node tests/smoke/query.js          (PW_CHANNEL=msedge uses the installed Edge)
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
  const page = await (await browser.newContext({ viewport: { width: 1360, height: 800 } })).newPage();
  const failures = [];
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));

  try {
    await page.goto(base);
    await page.waitForSelector('#canvasEmpty input[type=file]', { state: 'attached', timeout: 10000 });
    await page.keyboard.press('Escape');
    await page.locator('#canvasEmpty input[type=file]').first().setInputFiles(path.join(ROOT, 'tests', 'fixtures', 'sp_getitems.json'));
    await page.waitForTimeout(1500);
    await page.evaluate(() => Structra.set('queryPanelOpen', true));
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
    if (countOf(r) !== 3) failures.push('Path value[*].Requester.Email should find 3, said: ' + r.summary);
    if (!r.rows[1] || r.rows[1].path !== '$.value[1].Requester.Email') failures.push('the match path is not $.value[1].Requester.Email: ' + (r.rows[1] && r.rows[1].path));

    r = await ask('jsonpath', '$.value[?(@.Cost > 100)].Title');
    if (countOf(r) !== 1 || !/Laptop/.test(r.rows[0].text)) failures.push('JSONPath with a filter should find Laptop only, said: ' + r.summary);

    r = await ask('jsonpath', '$..Value');
    if (countOf(r) < 4) failures.push('JSONPath $..Value should find at least 4 values, said: ' + r.summary);

    r = await ask('regex', '^ann@');
    if (countOf(r) < 1) failures.push('Regex ^ann@ should find the email, said: ' + r.summary);

    r = await ask('regex', '(');
    if (!r.error) failures.push('a broken pattern should show an error, said: ' + r.summary);

    r = await ask('js', '=data.value.filter(x => x.Approved)');
    if (countOf(r) !== 2) failures.push('JS filter should find 2 records, said: ' + r.summary);
    if (!r.rows[0] || !/^\$\.value\[\d\]$/.test(r.rows[0].path)) failures.push('a JS result that is part of the document should show its real path, got: ' + (r.rows[0] && r.rows[0].path));

    r = await ask('path', 'value[*].DoesNotExist');
    if (!/No matches/.test(r.summary)) failures.push('no match should say "No matches", said: ' + r.summary);

    await page.locator('#queryInput').fill('');
    await page.locator('structra-query [data-action="run"]').click();
    const empty = await page.evaluate(() => (document.querySelector('#queryResults .qp-summary') || {}).textContent || '');
    if (!/Example/i.test(empty)) failures.push('running an empty box should show an example, said: ' + empty);

    // A result opens in the Tree on that value
    r = await ask('path', 'value[*].Title');
    await page.locator('#queryResults .qp-result').nth(1).click();
    await page.waitForTimeout(400);
    const where = await page.evaluate(() => ({ view: Structra.state.activeView, path: Structra.state.currentPath }));
    if (where.view !== 'tree' || where.path !== '$.value[1].Title') failures.push('clicking a result should select it in the Tree, got ' + JSON.stringify(where));

    // Keep the matches in a new tab
    const before = await page.evaluate(() => Structra.tabs.list.length);
    await page.locator('structra-query [data-action="openMatches"]').click();
    await page.waitForTimeout(800);
    const after = await page.evaluate(() => ({ tabs: Structra.tabs.list.length, data: JSON.stringify(Structra.state.jsonData) }));
    if (after.tabs !== before + 1 || after.data !== JSON.stringify(['Laptop refresh', 'Badge request', 'Parking pass'])) failures.push('Open in a new tab did not hold the 3 titles: ' + JSON.stringify(after).slice(0, 160));
  } catch (err) {
    failures.push('crashed: ' + err.message.slice(0, 200));
  }
  if (errors.length) failures.push('page errors: ' + [...new Set(errors)].join(' | '));

  await browser.close();
  server.close();
  if (failures.length) { console.log('FAIL\n  ' + failures.join('\n  ')); process.exit(1); }
  console.log('query smoke test: ok');
})();
