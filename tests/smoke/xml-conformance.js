/* The W3C XML conformance cases (xmltest, standalone files: tests/suites/xml-conformance) through the real XML opener in each browser.
   The browser's DOMParser does the parsing, but the app decides what counts as an error (it looks for the parsererror element, which each
   engine writes differently) and turns the tree into JSON. What is checked:
     - a well-formed file must open (valid: 120 files), a file that is not well-formed must be refused (not-wf: 186 files),
     - when refused, the message is one line of plain text,
     - the numbers are printed for every engine, so a difference between engines is visible.
   The engines differ on odd cases (names and characters that XML 1.0 allowed only from its 5th edition, entities in a DTD). Chromium
   (Chrome and Edge) implements the 5th edition and opens 61 of the 186 files that the suite, written for the earlier editions, marks as
   not well-formed; Firefox and Safari's engine refuse nearly all. So each engine has its own minimum (below), measured on 2026-10-28 with a
   small margin for browser updates. A fall below the minimum is a change in the browser or in our error detection, and is looked at.

   Run:  node tests/smoke/xml-conformance.js          (PW_CHANNEL=msedge uses the installed Edge; PW_BROWSER=firefox or webkit)
   SHOW_SUITE_FAILURES=1 lists the files that differ. */
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
const suite = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'suites', 'xml-conformance', 'cases.json'), 'utf8'));

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
  const engine = process.env.PW_BROWSER || (process.env.PW_CHANNEL === 'msedge' ? 'edge' : 'chromium');

  try {
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
    await page.waitForSelector('#canvasEmpty input[type=file]', { state: 'attached', timeout: 10000 });
    const result = await page.evaluate(async (cases) => {
      const decoder = new TextDecoder('utf-8');
      const out = { valid: 0, validOpened: 0, notWf: 0, notWfRefused: 0, openedButInvalid: [], refusedButValid: [], multiLineMessages: 0 };
      for (const item of cases) {
        const bytes = Uint8Array.from(atob(item.base64), (c) => c.charCodeAt(0));
        const text = decoder.decode(bytes);
        let opened = true;
        try { await Structra.parseXmlAsync(text); } catch (error) { opened = false; if (/\n/.test(error.message)) out.multiLineMessages++; }
        if (item.kind === 'valid') { out.valid++; if (opened) out.validOpened++; else out.refusedButValid.push(item.name); }
        else { out.notWf++; if (!opened) out.notWfRefused++; else out.openedButInvalid.push(item.name); }
      }
      return out;
    }, suite.cases);
    console.log(`  ${engine}: valid opened ${result.validOpened}/${result.valid}, not well-formed refused ${result.notWfRefused}/${result.notWf}`);
    if (process.env.SHOW_SUITE_FAILURES) {
      console.log('  refused but valid (' + result.refusedButValid.length + '):\n    ' + result.refusedButValid.join('\n    '));
      console.log('  opened but not well-formed (' + result.openedButInvalid.length + '):\n    ' + result.openedButInvalid.join('\n    '));
    }
    // Measured: Edge 116 / 125, Firefox 116 / 183, WebKit 114 / 181 (valid opened / not well-formed refused)
    const MINIMUM = { chromium: [110, 120], edge: [110, 120], firefox: [110, 178], webkit: [108, 176] }[engine] || [100, 100];
    if (result.validOpened < MINIMUM[0]) failures.push(`only ${result.validOpened} of ${result.valid} valid files opened (at least ${MINIMUM[0]} expected in ${engine})`);
    if (result.notWfRefused < MINIMUM[1]) failures.push(`only ${result.notWfRefused} of ${result.notWf} not-well-formed files were refused (at least ${MINIMUM[1]} expected in ${engine})`);
    if (result.multiLineMessages) failures.push(`${result.multiLineMessages} refusal messages have several lines`);
  } catch (error) {
    failures.push('crashed: ' + String(error.message).split('\n')[0]);
  }

  if (errors.length) failures.push('page errors: ' + [...new Set(errors)].join(' | '));
  await browser.close();
  server.close();
  if (failures.length) { console.log('xml-conformance smoke test: FAILED\n - ' + failures.join('\n - ')); process.exit(1); }
  console.log('xml-conformance smoke test: ok');
})();
