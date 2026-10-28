/* What the sandbox costs on a big file: the first job (which sends the document to the worker), a second job, a pattern over the whole
   document, and the page's longest freeze while that happens.

   Usage:  PW_CHANNEL=msedge node tests/perf/sandbox-large.js <path to a .json file>        (PW_BROWSER=firefox or webkit) */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium, firefox, webkit } = require('playwright');
const { uploadAndWait } = require('../page-helpers');

const ROOT = path.join(__dirname, '..', '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' };
const file = process.argv[2];
if (!file) { console.log('Give the path of a JSON file'); process.exit(2); }
const engine = { chromium, firefox, webkit }[process.env.PW_BROWSER || 'chromium'];

function serve() {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const target = path.join(ROOT, url === '/' ? 'index.html' : url);
    if (!target.startsWith(ROOT) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(target).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

(async () => {
  const server = await serve();
  const browser = await engine.launch({ channel: process.env.PW_CHANNEL || undefined });
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('structra.welcomeSeen', '1'); } catch { /* storage blocked */ } });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await page.waitForSelector('#canvasEmpty input[type=file]', { state: 'attached', timeout: 15000 });
  await page.keyboard.press('Escape');
  await uploadAndWait(page, file, { timeout: 180000 });
  const result = await page.evaluate(async () => {
    const data = Structra.state.jsonData;
    const out = {};
    let longest = 0;
    const watch = setInterval(() => {}, 10);
    let last = performance.now();
    const tick = setInterval(() => { const now = performance.now(); longest = Math.max(longest, now - last - 20); last = now; }, 20);
    const time = async (name, fn) => { const started = performance.now(); try { await fn(); } catch (error) { out[name + 'Error'] = error.message; } out[name] = Math.round(performance.now() - started); };
    await time('firstJobMs', () => Structra.sandbox.evaluate(data, 'Array.isArray(data) ? data.length : Object.keys(data).length'));
    await time('secondJobMs', () => Structra.sandbox.evaluate(data, 'Array.isArray(data) ? data.length : Object.keys(data).length'));
    await time('patternOverEverythingMs', () => Structra.sandbox.findPattern(data, '^zzzz-not-there$', { primitives: true }));
    clearInterval(watch); clearInterval(tick);
    out.pageLongestFreezeMs = Math.round(longest);
    out.heapMB = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null;
    return out;
  });
  console.log(JSON.stringify({ file: path.basename(file), sizeMB: Math.round(fs.statSync(file).size / 1048576), engine: process.env.PW_BROWSER || 'chromium', ...result }, null, 2));
  await browser.close();
  server.close();
})();
