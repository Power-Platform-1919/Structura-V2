/* The app works with the internet cut off: any request to another site is blocked and counted. Icons, fonts, SQL,
   Repair, Validate and Export as image must all work from the app folder.

   Run:  node tests/smoke/offline.js          (PW_CHANNEL=msedge uses the installed Edge)
*/
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
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await launchBrowser(chromium);
  const ctx = await newCtx(browser, { viewport: { width: 1360, height: 800 } });
  const outside = [];
  // Nothing may leave this computer: any request to another site is recorded and blocked
  await ctx.route('**/*', (route) => {
    const u = route.request().url();
    if (u.startsWith(origin) || /^(data|blob):/.test(u)) return route.continue();
    outside.push(u.slice(0, 100));
    return route.abort();
  });
  const page = await ctx.newPage();
  const failures = [];
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));

  try {
    await page.goto(origin + '/index.html');
    await page.waitForSelector('#canvasEmpty input[type=file]', { state: 'attached', timeout: 10000 });
    await page.keyboard.press('Escape');
    await uploadAndWait(page, path.join(ROOT, 'tests', 'fixtures', 'sp_getitems.json'));

    const icons = await page.evaluate(() => document.querySelectorAll('svg').length);
    if (icons < 10) failures.push('the icons did not load without the internet: ' + icons + ' svg elements');
    const font = await page.evaluate(async () => { await document.fonts.ready; return [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/['"]/g, '')).join(','); });
    if (!/IBM Plex Sans/.test(font)) failures.push('the app font did not load from the app folder: "' + font + '"');

    // SQL starts from the app folder and answers
    await page.evaluate(() => { Structra.dataEngine.enableSql(); });
    await page.waitForFunction(() => Structra.dataEngine.duckReady || Structra.dataEngine.duckFailed, null, { timeout: 90000 });
    if (!(await page.evaluate(() => Structra.dataEngine.duckReady))) failures.push('the SQL engine did not start without the internet');
    else {
      const r = await page.evaluate(() => Structra.dataEngine.runSql('SELECT COUNT(*) AS n FROM data'));
      if (!r || r.error) failures.push('a SQL query failed offline: ' + JSON.stringify(r).slice(0, 120));
    }

    // Repair, Validate and Export as image use their own libraries
    const fixed = await page.evaluate(() => Structra.jsonRepairAndValidation.repair("{'a': 1, b: [1,2,],}"));
    if (!/"a"/.test(fixed)) failures.push('Repair did not work offline: ' + fixed);
    await page.evaluate(() => Structra.events.emit('validate:open'));
    await page.waitForTimeout(400);
    const v = await page.evaluate(async () => { try { return await Structra.jsonRepairAndValidation.validate(Structra.state.jsonData, { type: 'object' }); } catch (e) { return { error: e.message }; } });
    if (v && v.error) failures.push('Validate against a schema did not work offline: ' + v.error);
    await page.evaluate(() => Structra.events.emit('overlay:close'));
    const png = await page.evaluate(async () => { try { await Structra.imageCapture.png(document.querySelector('.view-panel.active') || document.body, 'x.png'); return 'ok'; } catch (e) { return e.message; } });
    if (png !== 'ok') failures.push('Export as image did not work offline: ' + png);
  } catch (err) {
    failures.push('crashed: ' + err.message.slice(0, 220));
  }
  if (outside.length) failures.push('the app tried to reach other sites: ' + [...new Set(outside)].join(', '));
  const real = [...new Set(errors)].filter((e) => !/Failed to load resource|404/.test(e));
  if (real.length) failures.push('page errors: ' + real.join(' | '));

  await browser.close();
  server.close();
  if (failures.length) { console.log('FAIL\n  ' + failures.join('\n  ')); process.exit(1); }
  console.log('offline smoke test: ok');
})();
