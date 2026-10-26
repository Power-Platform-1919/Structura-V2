/* The Schema view must read every record (not only the first), say which fields can be empty,
   and a click on a field must select it like a node in the Tree.

   Run:  node tests/smoke/schema.js          (PW_CHANNEL=msedge uses the installed Edge)
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
  const page = await (await newCtx(browser, { viewport: { width: 1360, height: 800 } })).newPage();
  const failures = [];
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));

  try {
    await page.goto(base);
    await page.waitForSelector('#canvasEmpty input[type=file]', { state: 'attached', timeout: 10000 });
    await page.keyboard.press('Escape');
    await page.locator('#canvasEmpty input[type=file]').first().setInputFiles(path.join(ROOT, 'tests', 'fixtures', 'sp_getitems.json'));
    await page.waitForTimeout(1500);
    await page.evaluate(() => Structra.setState('activeView', 'schema'));
    await page.waitForTimeout(600);

    const lines = await page.evaluate(() => [...document.querySelectorAll('structra-schema .s-line')].map((l) => l.textContent.replace(/\s+/g, ' ').trim()));
    const has = (text) => lines.some((l) => l.startsWith(text));
    if (!lines.length) failures.push('the Schema view drew nothing');
    if (!has('Department: string | null')) failures.push('Department should read "string | null" (HR in one record, null in another); got: ' + lines.find((l) => l.startsWith('Department')));
    if (!has('Picture: string | null')) failures.push('Picture should read "string | null"; got: ' + lines.find((l) => l.startsWith('Picture')));
    if (!has('Notes: string | null')) failures.push('Notes should read "string | null"; got: ' + lines.find((l) => l.startsWith('Notes')));
    if (!lines.some((l) => /^Title: string.*required/.test(l))) failures.push('Title is in every record, so it should be marked required');
    // The Schema view and the Schema Gen tab must tell the same story
    const gen = await page.evaluate(() => {
      const s = Structra.parseJsonSchemaGenerator.smart(Structra.state.jsonData, { integers: true, required: true });
      return s.properties.value.items.properties.Requester.properties.Department.type;
    });
    if (JSON.stringify(gen) !== JSON.stringify(['string', 'null'])) failures.push('Schema Gen disagrees about Department: ' + JSON.stringify(gen));

    // A click selects the field
    await page.locator('structra-schema .s-line', { hasText: 'Email:' }).first().click();
    await page.waitForTimeout(300);
    const path1 = await page.evaluate(() => Structra.state.currentPath);
    if (path1 !== '$.value[0].Requester.Email') failures.push('clicking Email selected "' + path1 + '"');
  } catch (err) {
    failures.push('crashed: ' + err.message.slice(0, 200));
  }
  if (errors.length) failures.push('page errors: ' + [...new Set(errors)].join(' | '));

  await browser.close();
  server.close();
  if (failures.length) { console.log('FAIL\n  ' + failures.join('\n  ')); process.exit(1); }
  console.log('schema smoke test: ok');
})();
