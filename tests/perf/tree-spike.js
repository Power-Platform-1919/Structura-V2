/* Measures design B of docs/codemirror-tree-research.md: a CodeMirror document that holds only the rows that are showing.
   Runs tests/perf/tree-spike/ in a browser on a synthetic document and prints the times.

   Usage:  PW_CHANNEL=msedge node tests/perf/tree-spike.js [records]        (default 160000, about 90 MB; PW_BROWSER=firefox or webkit) */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium, firefox, webkit } = require('playwright');

const ROOT = path.join(__dirname, '..', '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const records = Number(process.argv[2] || 160000);
const engine = { chromium, firefox, webkit }[process.env.PW_BROWSER || 'chromium'];

function serve() {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const file = path.join(ROOT, url);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

(async () => {
  const server = await serve();
  const browser = await engine.launch({ channel: process.env.PW_CHANNEL || undefined, args: process.env.PW_BROWSER ? [] : ['--js-flags=--expose-gc', '--enable-precise-memory-info'] });
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  page.on('pageerror', (error) => console.log('page error:', error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/tests/perf/tree-spike/index.html`);
  await page.waitForFunction(() => window.spikeReady === true, null, { timeout: 30000 });
  const result = await page.evaluate((count) => window.spike.run({ records: count }), records);
  console.log(JSON.stringify({ engine: process.env.PW_BROWSER || (process.env.PW_CHANNEL || 'chromium'), ...result }, null, 2));
  await browser.close();
  server.close();
})();
