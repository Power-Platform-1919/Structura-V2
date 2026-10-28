/* Odd property names (the ones SharePoint, Dataverse and OData send: @odata.etag, names with dots, brackets, quotes, a leading $)
   must work everywhere a path is used: the Tree highlight, Find (Next and Previous), the Query results, and the Table headers.

   What this guards: the Tree wrote value[0]["@odata.etag"] but Find wrote $.value[0].@odata.etag, which the reader took for the
   keys "@odata" and "etag", so Next, Previous and the highlight did not find the value.

   Run:  node tests/smoke/paths-hostile.js          (PW_CHANNEL=msedge uses the installed Edge; PW_BROWSER=firefox or webkit) */
const http = require('http');
const fs = require('fs');
const path = require('path');

let chromium;
try { ({ chromium } = require('playwright')); } catch {
  console.error('Playwright is not installed. Run: npm install --save-dev playwright && npx playwright install chromium');
  process.exit(2);
}

const { launchBrowser } = require('../launch-browser');
const { uploadAndWait } = require('../page-helpers');
const { HOSTILE_KEYS } = require('../hostile-keys');
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

// Keys that fit in a screen of Tree lines and a table header; the very long one is covered by the unit tests
const KEYS = HOSTILE_KEYS.filter((key) => key.length > 0 && key.length < 60);
const needleOf = (index, row) => `needle${row}x${index}`;

// JSON text, so that __proto__ stays an own key
const makeText = () => '[' + [0, 1, 2].map((row) => '{' + KEYS.map((key, index) => JSON.stringify(key) + ':' + JSON.stringify(needleOf(index, row))).join(',') + '}').join(',') + ']';

(async () => {
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}/index.html`;
  const browser = await launchBrowser(chromium);
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('structra.welcomeSeen', '1'); } catch { /* storage blocked */ } });
  const page = await ctx.newPage();
  const failures = [];
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
  const fail = (message) => failures.push(message);
  const label = (key) => JSON.stringify(key).slice(0, 40);

  try {
    await page.goto(base);
    await page.waitForSelector('#canvasEmpty input[type=file]', { state: 'attached', timeout: 10000 });
    await page.keyboard.press('Escape');
    await uploadAndWait(page, { name: 'hostile.json', mimeType: 'application/json', buffer: Buffer.from(makeText()) });
    await page.evaluate(() => Structra.setState('activeView', 'tree'));
    await page.waitForSelector('structra-tree .j-line', { timeout: 20000 });

    /* ---------- the Tree highlights the line of a path written by the one writer ---------- */
    for (const [index, key] of KEYS.entries()) {
      const wanted = await page.evaluate((k) => Structra.dataPaths.child('[1]', k), key);
      await page.evaluate((p) => Structra.setState('currentPath', p), wanted);
      const ok = await page.waitForFunction((p) => {
        const line = [...document.querySelectorAll('structra-tree .j-line.highlighted')].find((l) => l.dataset.path === p);
        return !!line;
      }, wanted, { timeout: 4000 }).then(() => true, () => false);
      if (!ok) { fail(`Tree: key ${label(key)} (path ${JSON.stringify(wanted).slice(0, 50)}) was not highlighted`); continue; }
      const text = await page.evaluate((p) => [...document.querySelectorAll('structra-tree .j-line.highlighted')].find((l) => l.dataset.path === p).textContent, wanted);
      if (!text.includes(needleOf(index, 1))) fail(`Tree: the highlighted line for ${label(key)} shows "${text.trim().slice(0, 60)}", not its own value`);
    }

    /* ---------- Find leads to the value, and the path it sets resolves to that value ---------- */
    const findKeys = KEYS.map((key, index) => ({ key, index })).filter(({ key }) => ['@odata.etag', 'a.b', 'a[0]', 'say "hi"', '$ref', '\\', 'Created By', 'body/field', '$a'].includes(key));
    // Find reports the place of a match as a navigation request: that path is what the Tree, the Table and the Node panel follow
    await page.evaluate(() => { window.__navigated = null; Structra.events.on('tree:navigate-path', (p) => { window.__navigated = p; }); });
    await page.evaluate(() => Structra.setState('findBarOpen', true));
    await page.waitForSelector('#findInput', { timeout: 5000 });
    for (const { key, index } of findKeys) {
      const needle = needleOf(index, 2);
      await page.evaluate(() => { window.__navigated = null; });
      await page.locator('#findInput').fill(needle);
      await page.keyboard.press('Enter');
      const ok = await page.waitForFunction((n) => {
        const p = window.__navigated;
        return p && Structra.dataPaths.resolve(Structra.state.jsonData, p) === n;
      }, needle, { timeout: 8000 }).then(() => true, () => false);
      if (!ok) {
        const got = await page.evaluate(() => window.__navigated);
        fail(`Find: searching the value of ${label(key)} gave the path ${JSON.stringify(got)}, which does not resolve to the value`);
        continue;
      }
      // the line is drawn and marked
      const marked = await page.waitForFunction(() => document.querySelector('structra-tree .j-line.highlighted') !== null, null, { timeout: 4000 }).then(() => true, () => false);
      if (!marked) fail(`Find: no Tree line is highlighted for ${label(key)}`);
    }
    await page.evaluate(() => Structra.setState('findBarOpen', false));

    /* ---------- the Query panel: every path in the results reads back to its own value ---------- */
    const query = await page.evaluate(async () => {
      const hits = await Structra.jsonpathQuery.query(Structra.state.jsonData, '$[1].*');
      const wrong = hits.filter((hit) => Structra.dataPaths.resolve(Structra.state.jsonData, hit.path) !== hit.value).map((hit) => hit.path);
      return { count: hits.length, wrong: wrong.slice(0, 5) };
    });
    if (query.count !== KEYS.length) fail(`Query: $[1].* found ${query.count} values, the record has ${KEYS.length}`);
    if (query.wrong.length) fail(`Query: result paths that do not read back: ${JSON.stringify(query.wrong)}`);

    /* ---------- the Table: every odd key is a column header, exactly as named ---------- */
    await page.evaluate(() => Structra.setState('activeView', 'table'));
    await page.waitForSelector('#tableBody tr[data-index]', { timeout: 20000 });
    const headers = await page.evaluate(() => [...document.querySelectorAll('#tableHead th')].map((th) => th.textContent.trim()));
    for (const key of ['@odata.etag', 'a.b', 'Created By', 'body/field']) {
      if (!headers.some((header) => header.includes(key))) fail(`Table: no column header for ${label(key)}`);
    }
  } catch (error) {
    fail('crashed: ' + String(error.message).split('\n')[0]);
  }

  if (errors.length) fail('page errors: ' + [...new Set(errors)].join(' | '));
  await browser.close();
  server.close();
  if (failures.length) { console.log('paths-hostile smoke test: FAILED\n - ' + failures.join('\n - ')); process.exit(1); }
  console.log('paths-hostile smoke test: ok');
})();
