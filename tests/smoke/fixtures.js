/* Opens every fixture in a real browser, visits every view, and fails on any page error.
   Also checks that a document that can be read gets an Overview headline.

   Setup (once):  npm install --save-dev playwright && npx playwright install chromium
   Run:           node tests/smoke/fixtures.js            (all fixtures)
                  PW_CHANNEL=msedge node tests/smoke/fixtures.js   (use the installed Edge instead of downloading Chromium)
                  node tests/smoke/fixtures.js edge_null  (names containing the text)
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
const VIEWS = ['tree', 'table', 'graph', 'schema', 'editor', 'overview'];
// Documents that are a single falsy value cannot be opened; the app says so instead of showing an overview
const NO_OVERVIEW = /^(edge_null|edge_bool|edge_number|edge_string|test_case6)/;
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
  const filter = process.argv[2];
  const files = fs.readdirSync(FIXTURES).filter((f) => f.endsWith('.json') && (!filter || f.includes(filter))).sort();
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}/index.html`;
  const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});   // PW_CHANNEL=msedge or chrome uses the installed browser
  const failures = [];

  for (const f of files) {
    const context = await browser.newContext();             // a clean profile each time: no stored session, welcome shown
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
    try {
      await page.goto(base);
      await page.waitForSelector('#canvasEmpty input[type=file]', { state: 'attached', timeout: 10000 });
      await page.keyboard.press('Escape');                  // close the welcome dialog
      await page.locator('#canvasEmpty input[type=file]').setInputFiles(path.join(FIXTURES, f));
      await page.waitForTimeout(1200);

      const headline = await page.evaluate(() => (document.querySelector('.ovw-headline') || {}).textContent || null);
      if (headline === null && !NO_OVERVIEW.test(f)) failures.push(`${f}: no overview headline`);

      for (const v of VIEWS) {
        await page.evaluate((view) => Structra.set('activeView', view), v);
        await page.waitForTimeout(120);
      }
    } catch (err) {
      errors.push(String(err.message).split('\n')[0]);
    }
    if (errors.length) failures.push(`${f}: ${errors.join(' | ')}`);
    console.log((errors.length ? 'FAIL ' : 'ok   ') + f);
    await context.close();
  }

  await browser.close();
  server.close();
  console.log(failures.length ? `\n${failures.length} problem(s):\n  ` + failures.join('\n  ') : `\nAll ${files.length} fixtures opened in every view with no errors`);
  process.exit(failures.length ? 1 : 0);
})();
