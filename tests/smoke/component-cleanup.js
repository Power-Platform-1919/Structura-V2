/* Components clean up after themselves: an element taken off the page stops listening to the event bus and to the document, and listens
   again, once, when it is added back. Checked with a small test element and with the real zoom and input panel elements.

   Run:  node tests/smoke/component-cleanup.js          (PW_CHANNEL=msedge uses the installed Edge; PW_BROWSER=firefox or webkit) */
const http = require('http');
const fs = require('fs');
const path = require('path');

let chromium;
try { ({ chromium } = require('playwright')); } catch {
  console.error('Playwright is not installed. Run: npm install --save-dev playwright && npx playwright install chromium');
  process.exit(2);
}

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

(async () => {
  const server = await serve();
  const browser = await launchBrowser(chromium);
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('structra.welcomeSeen', '1'); } catch { /* storage blocked */ } });
  const page = await ctx.newPage();
  const failures = [];
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
  const fail = (message) => failures.push(message);

  try {
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
    await page.waitForSelector('#canvasEmpty input[type=file]', { state: 'attached', timeout: 10000 });
    await page.keyboard.press('Escape');

    // a test element: bus events and a document listener are counted while it is on the page, off the page, and back on it (twice)
    const counts = await page.evaluate(() => {
      window.__bus = 0; window.__keys = 0;
      class CleanupProbe extends StructraComponent {
        init() { this.on('probe:ping', () => { window.__bus++; }); this._bindKeys(); }
        listenersReturned() { this._bindKeys(); }
        _bindKeys() { document.addEventListener('probe-key', () => { window.__keys++; }, { signal: this.listenerSignal }); }
      }
      customElements.define('cleanup-probe', CleanupProbe);
      const probe = document.createElement('cleanup-probe');
      const ping = () => { Structra.events.emit('probe:ping'); document.dispatchEvent(new Event('probe-key')); return [window.__bus, window.__keys]; };
      const steps = {};
      document.body.appendChild(probe);
      steps.onPage = ping();
      probe.remove();
      steps.removed = ping();
      document.body.appendChild(probe);
      steps.added = ping();
      probe.remove(); document.body.appendChild(probe);
      steps.addedAgain = ping();
      probe.remove();
      steps.gone = ping();
      return steps;
    });
    const expected = { onPage: [1, 1], removed: [1, 1], added: [2, 2], addedAgain: [3, 3], gone: [3, 3] };
    for (const step of Object.keys(expected)) {
      if (counts[step].join() !== expected[step].join()) fail(`${step}: bus and document handled ${counts[step].join(' and ')} times, expected ${expected[step].join(' and ')}`);
    }

    // the real zoom element: Ctrl+= makes the text one step larger, once, also after it was taken off the page and put back
    const zoom = await page.evaluate(() => {
      const element = document.querySelector('structra-zoom');
      const size = () => element._size;
      const press = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: '=', ctrlKey: true, bubbles: true }));
      const parent = element.parentNode;
      const out = {};
      const start = size();
      press(); out.first = size() - start;
      element.remove(); press(); out.whileRemoved = size() - start - out.first;
      parent.appendChild(element);
      const before = size(); press(); out.afterReturn = size() - before;
      return out;
    });
    if (zoom.first !== 1) fail('Ctrl+= should make the text one step larger: ' + JSON.stringify(zoom));
    if (zoom.whileRemoved !== 0) fail('a removed zoom element should not answer to Ctrl+=: ' + JSON.stringify(zoom));
    if (zoom.afterReturn !== 1) fail('a zoom element put back should answer once: ' + JSON.stringify(zoom));
  } catch (error) {
    fail('crashed: ' + String(error.message).split('\n')[0]);
  }

  if (errors.length) fail('page errors: ' + [...new Set(errors)].join(' | '));
  await browser.close();
  server.close();
  if (failures.length) { console.log('component-cleanup smoke test: FAILED\n - ' + failures.join('\n - ')); process.exit(1); }
  console.log('component-cleanup smoke test: ok');
})();
