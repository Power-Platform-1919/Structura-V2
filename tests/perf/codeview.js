/* How the code box (Structra.codeView, CodeMirror 5) copes with big documents.
   Opens a JSON file, pretty-prints it, puts it in a box, then times: opening, the first screen, a jump to the middle,
   one keystroke in the middle, and memory. Use it to pick the size limits in core/code-view.js.

   Run:  node tests/perf/codeview.js <file.json> [more files]     (PW_CHANNEL=msedge uses the installed Edge)
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

function serve(dataFile) {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    if (url === '/bench-data.json') { res.writeHead(200, { 'Content-Type': 'application/json' }); fs.createReadStream(dataFile).pipe(res); return; }
    const file = path.join(ROOT, url === '/' ? 'index.html' : url);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function measure(file, mode) {
  const server = await serve(file);
  const base = `http://127.0.0.1:${server.address().port}/index.html`;
  const browser = await chromium.launch({
    ...(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}),
    args: ['--js-flags=--max-old-space-size=6144'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 800 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('structra.welcomeSeen', '1'); } catch { /* storage blocked */ } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(280000);
  let result;
  try {
    await page.goto(base);
    await page.waitForFunction(() => window.Structra && Structra.codeView);
    result = await page.evaluate(async (mode) => {
      const out = {};
      const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      let t = performance.now();
      const raw = await (await fetch('/bench-data.json')).text();
      out.fileMB = +(raw.length / 1048576).toFixed(1);
      out.readMs = Math.round(performance.now() - t);
      t = performance.now();
      const pretty = JSON.stringify(JSON.parse(raw), null, 2);
      out.prettyMB = +(pretty.length / 1048576).toFixed(1);
      out.prettyMs = Math.round(performance.now() - t);

      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:0;top:0;width:1200px;height:700px;z-index:99999;background:#fff';
      document.body.appendChild(host);
      t = performance.now();
      const box = await Structra.codeView.create(host, { mode: 'json', value: '', readOnly: mode === 'view', label: 'bench' });
      host.querySelector('.CodeMirror').style.height = '700px';
      out.createMs = Math.round(performance.now() - t);
      t = performance.now();
      box.setValue(pretty);
      out.setValueMs = Math.round(performance.now() - t);
      t = performance.now();
      await frame();
      out.firstPaintMs = Math.round(performance.now() - t);
      out.lines = box.cm.lineCount();
      out.foldOn = !!box.cm.getOption('foldGutter');

      const scroller = box.cm.getScrollerElement();
      t = performance.now();
      box.cm.scrollTo(0, scroller.scrollHeight / 2);
      await frame();
      out.jumpToMiddleMs = Math.round(performance.now() - t);

      if (mode !== 'view') {
        const mid = box.cm.getCursor();
        box.cm.setCursor({ line: Math.floor(out.lines / 2), ch: 0 });
        t = performance.now();
        box.cm.replaceSelection('x', 'end');
        await frame();
        out.keystrokeMs = Math.round(performance.now() - t);
        t = performance.now();
        box.cm.undo();
        await frame();
        out.undoMs = Math.round(performance.now() - t);
      }
      t = performance.now();
      box.cm.scrollTo(0, scroller.scrollHeight);
      await frame();
      out.jumpToEndMs = Math.round(performance.now() - t);

      out.heapMB = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null;
      return out;
    }, mode);
  } catch (e) {
    result = { error: e.message.split('\n')[0] };
  }
  await browser.close();
  server.close();
  return result;
}

(async () => {
  const files = process.argv.slice(2);
  if (!files.length) { console.error('Usage: node tests/perf/codeview.js <file.json> [more files]'); process.exit(2); }
  for (const f of files) {
    for (const mode of ['edit', 'view']) {
      const r = await measure(path.resolve(f), mode);
      console.log(path.basename(f).padEnd(26), mode.padEnd(5), JSON.stringify(r));
    }
  }
})();
