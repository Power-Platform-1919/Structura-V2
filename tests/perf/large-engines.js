/* Large files in one engine: how long each step takes and how much memory is used, for the Chromium, Firefox or WebKit build that Playwright
   starts (PW_CHANNEL=msedge for the installed Edge, PW_BROWSER=firefox or webkit).

   Measured: from choosing the file until the data is open; until the Tree shows its first line; until the Table and the Overview show;
   the longest time the page did not answer (a timer that should run every 50 ms is late); the page's memory where the engine tells it
   (Chromium: JS heap) and the memory of the browser processes as the system sees it (the peak working set of the processes the test started).

   Usage:  PW_CHANNEL=msedge node tests/perf/large-engines.js <file.json> [more files]
   Files used so far: perf_100k.json (37 MB, 2.2 million lines) and perf_150k_complex.json (88 MB, 6.9 million lines) from the v1 Tests folder. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const { launchBrowser } = require('../launch-browser');

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

/** The memory (MB) of every process that started after `since` (a Date) and whose name is one of the browsers, summed */
function browserMemoryMb(since) {
  if (process.platform !== 'win32') return null;
  try {
    const script = `$s=[datetime]'${since.toISOString()}'; (Get-Process | Where-Object { $_.StartTime -gt $s -and $_.ProcessName -match '^(firefox|msedge|chrome|chromium|Playwright|MiniBrowser|plugin-container|WebKitWebProcess)' } | Measure-Object -Property WorkingSet64 -Sum).Sum`;
    const out = execFileSync('powershell', ['-NoProfile', '-Command', script], { encoding: 'utf8', timeout: 20000 }).trim();
    return out ? Math.round(Number(out) / 1048576) : 0;
  } catch { return null; }
}

(async () => {
  const files = process.argv.slice(2).filter((file) => fs.existsSync(file));
  if (!files.length) { console.error('Give the path of one or more JSON files'); process.exit(2); }
  const server = await serve();
  const engine = process.env.PW_BROWSER || (process.env.PW_CHANNEL || 'chromium');
  for (const file of files) {
    const startedAt = new Date();
    const browser = await launchBrowser(chromium);
    const context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
    await context.addInitScript(() => { try { localStorage.setItem('structra.welcomeSeen', '1'); } catch { /* storage blocked */ } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message.slice(0, 160)));
    const result = { engine, file: path.basename(file), megabytes: Math.round(fs.statSync(file).size / 1048576) };
    let peak = 0;
    const sampler = setInterval(() => { const mb = browserMemoryMb(startedAt); if (mb && mb > peak) peak = mb; }, 4000);
    try {
      await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
      await page.waitForSelector('#canvasEmpty input[type=file]', { state: 'attached', timeout: 20000 });
      await page.keyboard.press('Escape');
      // a timer that should run every 50 ms: how late it ever is
      await page.evaluate(() => { window.__late = 0; let last = performance.now(); setInterval(() => { const now = performance.now(); window.__late = Math.max(window.__late, now - last - 50); last = now; }, 50); });
      const started = Date.now();
      await page.locator('#canvasEmpty input[type=file]').setInputFiles(file);
      await page.waitForFunction(() => !!Structra.state.jsonData, null, { timeout: 300000, polling: 500 });
      result.openMs = Date.now() - started;
      for (const view of ['tree', 'table', 'overview']) {
        const t = Date.now();
        await page.evaluate((v) => Structra.setState('activeView', v), view);
        const selector = { tree: 'structra-tree .j-line', table: 'structra-table tbody tr, structra-table [role="row"]', overview: 'structra-overview .stats-view' }[view];
        await page.waitForSelector(selector, { timeout: 120000 }).catch(() => { result[view + 'Missing'] = true; });
        result[view + 'Ms'] = Date.now() - t;
      }
      result.longestStallMs = Math.round(await page.evaluate(() => window.__late));
      result.heapMb = await page.evaluate(() => (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null));
      const after = browserMemoryMb(startedAt);
      if (after && after > peak) peak = after;
      result.browserMemoryMb = peak || null;
    } catch (error) {
      result.error = String(error.message).split('\n')[0];
    }
    clearInterval(sampler);
    result.pageErrors = [...new Set(errors)].slice(0, 3);
    console.log(JSON.stringify(result));
    await browser.close().catch(() => {});
  }
  server.close();
})();
