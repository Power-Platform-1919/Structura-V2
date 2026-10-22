/* Layout checks that need a real browser: every view that can hold more than the screen must scroll.

   Run:  node tests/smoke/layout.js          (PW_CHANNEL=msedge uses the installed Edge)
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
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  const failures = [];
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));

  try {
    await page.goto(base);
    await page.waitForSelector('#canvasEmpty input[type=file]', { state: 'attached', timeout: 10000 });
    await page.keyboard.press('Escape');
    await page.locator('#canvasEmpty input[type=file]').first().setInputFiles(path.join(FIXTURES, 'sp_getitems.json'));
    await page.waitForTimeout(1500);

    // ---- Overview scrolls with the mouse wheel, and its scroll area ends inside the view ----
    await page.evaluate(() => Structra.set('activeView', 'overview'));
    await page.waitForTimeout(800);
    const ov = await page.evaluate(() => {
      const el = document.querySelector('structra-overview .stats-view');
      const panel = document.querySelector('structra-overview').getBoundingClientRect();
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, bottom: Math.round(r.bottom), panelBottom: Math.round(panel.bottom), viewport: innerHeight };
    });
    if (!ov) failures.push('Overview: no scroll area was drawn');
    else {
      if (ov.scrollHeight <= ov.clientHeight) failures.push(`Overview: the content (${ov.scrollHeight}px) fits its area (${ov.clientHeight}px), so this fixture cannot prove scrolling`);
      if (ov.bottom > ov.viewport) failures.push(`Overview: the scroll area ends at ${ov.bottom}px, below the window (${ov.viewport}px), so the end of the page cannot be reached`);
      await page.mouse.move(640, 300);
      await page.mouse.wheel(0, 2000);
      await page.waitForTimeout(400);
      const moved = await page.evaluate(() => document.querySelector('structra-overview .stats-view').scrollTop);
      if (moved <= 0) failures.push('Overview: the mouse wheel does not scroll it');
    }
  } catch (err) {
    failures.push('crashed: ' + err.message.slice(0, 200));
  }
  if (errors.length) failures.push('page errors: ' + [...new Set(errors)].join(' | '));

  await browser.close();
  server.close();
  if (failures.length) { console.log('FAIL\n  ' + failures.join('\n  ')); process.exit(1); }
  console.log('layout smoke test: ok');
})();
