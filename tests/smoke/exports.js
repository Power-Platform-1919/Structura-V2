/* Exports must produce files other programs can read:
   - XML is well-formed for every fixture (nulls, odd key names, lists inside lists)
   - the image export works in every view and in dark mode (the themes use CSS colour functions)

   Run:  node tests/smoke/exports.js          (PW_CHANNEL=msedge uses the installed Edge; the image part needs internet for html2canvas)
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

    // ---- XML: every fixture, plus a document made to be difficult ----
    const docs = fs.readdirSync(FIXTURES).filter((f) => f.endsWith('.json')).map((f) => ({ name: f, text: fs.readFileSync(path.join(FIXTURES, f), 'utf8') }));
    docs.push({ name: 'awkward keys', text: JSON.stringify({ '1st': 1, 'a b': [null, 1, { 'x/y': null, '': 'empty key' }], 'ü': 'ok', t: 'a & b < c "q"', c: 'tab\u0001ctrl' }) });
    const bad = await page.evaluate((list) => {
      const out = [];
      for (const d of list) {
        let json;
        try { json = JSON.parse(d.text); } catch { continue; }
        const xml = Structra.formatConversion.jsonToXml(json);
        const doc = new DOMParser().parseFromString(xml, 'application/xml');
        const err = doc.querySelector('parsererror');
        if (err) out.push(d.name + ': ' + err.textContent.split('\n')[0].slice(0, 120));
      }
      return out;
    }, docs);
    bad.forEach((b) => failures.push('XML is not well-formed for ' + b));

    // ---- Image export in every view, light and dark ----
    await page.locator('#canvasEmpty input[type=file]').first().setInputFiles(path.join(FIXTURES, 'sp_getitems.json'));
    await page.waitForTimeout(1500);
    await page.evaluate(() => { window.__saved = []; const d = Structra.sharedHelpers.download; Structra.sharedHelpers.download = (blob, name) => { window.__saved.push({ name, size: blob.size, type: blob.type }); }; });
    // SHARD=0/2 or 1/2 (set by the parallel runner) takes only some of the modes, so the slow part is split across processes
    const [shard, shards] = (process.env.SHARD || '0/1').split('/').map(Number);
    for (const mode of ['light', 'dark'].filter((_, i) => i % shards === shard)) {
      await page.evaluate((m) => Structra.themeEngine && Structra.themeEngine.setMode ? Structra.themeEngine.setMode(m) : document.documentElement.setAttribute('data-theme', m), mode);
      for (const view of ['tree', 'table', 'graph', 'schema', 'overview']) {
        await page.evaluate((v) => Structra.setState('activeView', v), view);
        await page.waitForTimeout(500);
        const result = await page.evaluate(async (v) => {
          try {
            await Structra.imageCapture.png(document.querySelector('.view-panel.active'), 'test-' + v + '.png');
            return { ok: true };
          } catch (e) { return { error: e.message }; }
        }, view);
        if (result.error) failures.push(`image export failed in ${view} (${mode}): ${result.error}`);
      }
    }
    const saved = await page.evaluate(() => window.__saved);
    if (saved.length && saved.some((s) => !(s.size > 2000))) failures.push('an exported image is empty or tiny: ' + saved.filter((s) => !(s.size > 2000)).map((s) => s.name).join(', '));
  } catch (err) {
    failures.push('crashed: ' + err.message.slice(0, 200));
  }
  if (errors.length) failures.push('page errors: ' + [...new Set(errors)].join(' | '));

  await browser.close();
  server.close();
  if (failures.length) { console.log('FAIL\n  ' + failures.join('\n  ')); process.exit(1); }
  console.log('exports smoke test: ok');
})();
