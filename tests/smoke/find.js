/* Find must always leave the Tree showing the matches: it must never turn blank, with or without the SQL engine.
   Also checks that the count is about what the user searched for, and that SQL's `data` table is the open document.

   Run:  node tests/smoke/find.js          (PW_CHANNEL=msedge uses the installed Edge)
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
const FIXTURES = path.join(ROOT, 'tests', 'fixtures');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' };
// An object that wraps a list (SharePoint style), a plain list, and an OData response
const DOCS = ['sp_getitems.json', 'test8_toplevel_array.json', 'edge_odata.json'];

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
  const failures = [];

  for (const file of DOCS) {
    const page = await (await browser.newContext()).newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
    try {
      await page.goto(base);
      await page.waitForSelector('#canvasEmpty input[type=file]', { state: 'attached', timeout: 10000 });
      await page.keyboard.press('Escape');
      await page.locator('#canvasEmpty input[type=file]').first().setInputFiles(path.join(FIXTURES, file));
      await page.waitForTimeout(1200);
      await page.evaluate(() => Structra.set('activeView', 'tree'));
      await page.waitForTimeout(400);

      // A word that is really in the document: the first text value of 4 or more letters
      const term = await page.evaluate(() => {
        let found = null;
        (function walk(v) {
          if (found) return;
          if (typeof v === 'string' && /^[A-Za-z]{4,}$/.test(v)) found = v;
          else if (Array.isArray(v)) v.forEach(walk);
          else if (v && typeof v === 'object') Object.values(v).forEach(walk);
        })(Structra.state.jsonData);
        return found;
      });
      if (!term) { failures.push(`${file}: no text value to search for`); continue; }

      for (const sql of [false, true]) {
        const label = `${file} (${sql ? 'SQL on' : 'SQL off'}), searching "${term}"`;
        if (sql) await page.evaluate(() => Structra.engine.enableSql());
        await page.evaluate(() => { Structra.set('findBarOpen', true); });
        await page.waitForTimeout(300);
        await page.locator('#findInput').fill(term);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(1200);

        const seen = await page.evaluate((t) => {
          const lines = [...document.querySelectorAll('structra-tree .j-line')].filter((l) => l.offsetParent !== null);
          return {
            lines: lines.length,
            withTerm: lines.filter((l) => l.textContent.toLowerCase().includes(t.toLowerCase())).length,
            count: (document.querySelector('#findCount') || {}).textContent || '',
          };
        }, term);
        if (seen.lines === 0) failures.push(`${label}: the Tree is blank after Find (count says "${seen.count}")`);
        else if (seen.withTerm === 0) failures.push(`${label}: the Tree shows ${seen.lines} lines but none contain the word`);
        if (/^0|error/i.test(seen.count.trim())) failures.push(`${label}: the count says "${seen.count}"`);

        // clear before the next round
        await page.evaluate(() => Structra.set('findBarOpen', false));
        await page.waitForTimeout(400);
      }

      // `data` is the open document in SQL
      const sqlCheck = await page.evaluate(async () => {
        const r = await Structra.engine.runSql('SELECT COUNT(*) AS n FROM data');
        return r.error ? { error: r.error } : { n: Number(Object.values(r.rows[0])[0]) };
      });
      if (sqlCheck.error) failures.push(`${file}: SELECT COUNT(*) FROM data failed: ${sqlCheck.error}`);
    } catch (err) {
      failures.push(`${file}: crashed: ${err.message.slice(0, 160)}`);
    }
    if (errors.length) failures.push(`${file}: page errors: ${[...new Set(errors)].join(' | ')}`);
    await page.close();
  }

  await browser.close();
  server.close();
  if (failures.length) { console.log('FAIL\n  ' + failures.join('\n  ')); process.exit(1); }
  console.log('find smoke test: ok');
})();
