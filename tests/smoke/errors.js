/* Errors nobody caught must not vanish and must not leak the document. This test throws on purpose in three places (a timer in the page,
   a promise, a worker) while a document with a secret value is open, and checks that:
     - each error is recorded and one short message with a "Copy a bug report" button is shown (not three),
     - the bug report names the problems but holds none of the document (no value, no key, no file name),
     - the command palette has "Copy a bug report".

   Run:  node tests/smoke/errors.js          (PW_CHANNEL=msedge uses the installed Edge; PW_BROWSER=firefox or webkit) */
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
const SECRET_VALUE = 'TOPSECRET-VALUE-4711';
const SECRET_KEY = 'secretKeyName';

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
  const browser = await launchBrowser(chromium);
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('structra.welcomeSeen', '1'); } catch { /* storage blocked */ } });
  const page = await ctx.newPage();
  const failures = [];
  const fail = (message) => failures.push(message);
  // The errors below are thrown on purpose, so the page reporting them is expected
  const reported = [];
  page.on('pageerror', (error) => reported.push(error.message));

  try {
    await page.goto(base);
    await page.waitForSelector('#canvasEmpty input[type=file]', { state: 'attached', timeout: 10000 });
    await page.keyboard.press('Escape');
    await uploadAndWait(page, { name: 'private-customers.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify([{ [SECRET_KEY]: SECRET_VALUE }])) });

    await page.evaluate(({ value }) => {
      // 1. an error in a timer, the way a bug in a component would surface
      setTimeout(() => { throw new Error('boom in a timer "' + value + '"'); }, 0);
      // 2. a promise nobody waits for
      Promise.reject(new Error('boom in a promise'));
      // 3. a worker that throws
      const worker = new Worker(URL.createObjectURL(new Blob(['throw new Error("boom in a worker");'], { type: 'text/javascript' })));
      worker.onerror = null;
    }, { value: SECRET_VALUE });

    const recorded = await page.waitForFunction(() => Structra.errorReporter.list().length >= 3, null, { timeout: 8000 }).then(() => true, () => false);
    const list = await page.evaluate(() => Structra.errorReporter.list().map((entry) => entry.kind + ': ' + entry.message));
    if (!recorded) fail('three errors should be recorded, got ' + JSON.stringify(list));
    for (const wanted of ['boom in a timer', 'boom in a promise', 'boom in a worker']) {
      if (!list.some((line) => line.includes(wanted))) fail(`no record for "${wanted}": ${JSON.stringify(list)}`);
    }

    // One short message with a button, not one per error
    const toast = await page.evaluate(() => { const element = document.querySelector('structra-toast'); return element ? { text: element.textContent.replace(/\s+/g, ' ').trim(), action: (element.querySelector('#toastAction') || {}).textContent || '' } : null; });
    if (!toast || !/Something went wrong/.test(toast.text)) fail('a short "Something went wrong" message should be shown: ' + JSON.stringify(toast));
    if (toast && !/bug report/i.test(toast.action)) fail('the message should offer "Copy a bug report": ' + JSON.stringify(toast));

    // The report names the problems and holds none of the document
    const report = await page.evaluate(() => Structra.errorReporter.buildReport());
    for (const wanted of ['Version:', 'Browser:', 'boom in a promise', 'boom in a worker']) if (!report.includes(wanted)) fail(`the bug report should contain "${wanted}"`);
    for (const secret of [SECRET_VALUE, SECRET_KEY, 'private-customers']) if (report.includes(secret)) fail(`the bug report must not contain "${secret}"`);

    // The palette offers it
    const inPalette = await page.evaluate(() => [...document.querySelectorAll('structra-command')].length > 0 && !!Structra.errorReporter.copyReport);
    if (!inPalette) fail('the command palette and copyReport should exist');
    await page.evaluate(() => Structra.events.emit('command-palette:toggle'));
    await page.waitForSelector('structra-command input', { timeout: 5000 }).catch(() => {});
    await page.keyboard.type('bug report');
    const shown = await page.waitForFunction(() => /Copy a bug report/.test(document.querySelector('structra-command').textContent), null, { timeout: 4000 }).then(() => true, () => false);
    if (!shown) fail('the palette should list "Copy a bug report"');
  } catch (error) {
    fail('crashed: ' + String(error.message).split('\n')[0]);
  }

  await browser.close();
  server.close();
  if (failures.length) { console.log('errors smoke test: FAILED\n - ' + failures.join('\n - ')); process.exit(1); }
  console.log('errors smoke test: ok (' + reported.length + ' deliberate errors reached the page, as intended)');
})();
