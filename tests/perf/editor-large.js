/* The Editor view on a big file, in the real app: how long it takes to open, whether typing stays smooth, and how long
   the validity check takes after a change.

   Run:  node tests/perf/editor-large.js <file.json>        (PW_CHANNEL=msedge uses the installed Edge)
   Big test files live in the older project folder: ..\structura-v1\Tests (perf_100k.json 37 MB, perf_150k_complex.json 88 MB)
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
  const file = process.argv[2];
  if (!file) { console.error('Usage: node tests/perf/editor-large.js <file.json>'); process.exit(2); }
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}/index.html`;
  const browser = await chromium.launch({
    ...(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}),
    args: ['--js-flags=--max-old-space-size=6144'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 800 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('structra.welcomeSeen', '1'); } catch { /* storage blocked */ } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(280000);
  const out = { file: path.basename(file), mb: +(fs.statSync(file).size / 1048576).toFixed(1) };
  try {
    await page.goto(base);
    await page.waitForSelector('#canvasEmpty input[type=file]', { state: 'attached' });
    await page.keyboard.press('Escape');
    let t = Date.now();
    await page.locator('#canvasEmpty input[type=file]').first().setInputFiles(path.resolve(file));
    await page.waitForFunction(() => Structra.state.jsonData, null, { timeout: 280000 });
    out.openFileS = +((Date.now() - t) / 1000).toFixed(1);

    t = Date.now();
    await page.evaluate(() => Structra.setState('activeView', 'editor'));
    await page.waitForFunction(() => {
      const host = document.querySelector('structra-editor .cv');
      return host && host.codeView && host.codeView.lineCount() > 5 && !document.querySelector('structra-loading.show, structra-loading[open], .loading-overlay.show');
    }, null, { timeout: 280000, polling: 200 });
    out.editorOpenS = +((Date.now() - t) / 1000).toFixed(1);
    out.status = await page.evaluate(() => document.querySelector('#edStatus').textContent.trim());
    out.lines = await page.evaluate(() => document.querySelector('structra-editor .cv').codeView.lineCount());

    // One keystroke in the middle, then how long until the check says valid again
    const typed = await page.evaluate(async () => {
      const box = document.querySelector('structra-editor .cv').codeView;
      box.setCursor(Math.floor(box.lineCount() / 2), 0);
      const t0 = performance.now();
      box.view.dispatch(box.view.state.replaceSelection(' '));
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return Math.round(performance.now() - t0);
    });
    out.keystrokeMs = typed;
    t = Date.now();
    await page.waitForFunction(() => /Valid JSON|Line \d+/.test(document.querySelector('#edStatus').textContent), null, { timeout: 280000, polling: 100 });
    out.checkAfterTypingS = +((Date.now() - t) / 1000).toFixed(1);
    out.statusAfter = await page.evaluate(() => document.querySelector('#edStatus').textContent.trim());
    out.heapMB = await page.evaluate(() => (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null));
  } catch (e) {
    out.error = e.message.split('\n')[0];
  }
  console.log(JSON.stringify(out));
  await browser.close();
  server.close();
})();
