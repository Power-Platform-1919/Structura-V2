/* Content-Security-Policy study: what does a strict policy block in this app?
   The app is loaded with a strict policy (no inline scripts, no eval) and each feature that could need more is used once.
   Every policy violation the browser reports is printed with the feature that caused it. Nothing is changed in the app.

   Run:  PW_CHANNEL=msedge node tests/perf/csp-study.js [relaxed]
         "relaxed" adds the two things the study found necessary, to confirm that they are enough. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { uploadAndWait } = require('../page-helpers');

const ROOT = path.join(__dirname, '..', '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' };
const STRICT = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' blob: data:; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'none'";
const RELAXED = process.argv[2] === 'relaxed'
  ? "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' blob: data:; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'none'"
  : STRICT;

function serve() {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const file = path.join(ROOT, url === '/' ? 'index.html' : url);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'Content-Security-Policy': RELAXED });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

(async () => {
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}/index.html`;
  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('structra.welcomeSeen', '1'); } catch { /* storage blocked */ } });
  const page = await ctx.newPage();
  let feature = 'startup';
  const found = new Map();
  await page.exposeFunction('reportViolation', (directive, blocked) => {
    const key = `${feature} | ${directive} | ${blocked}`;
    found.set(key, (found.get(key) || 0) + 1);
  });
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => window.reportViolation(event.effectiveDirective, (event.blockedURI || '').slice(0, 40) || event.sample || 'inline'));
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(feature + ': ' + error.message.slice(0, 120)));

  const step = async (name, fn) => {
    feature = name;
    // A blocked feature often never answers: a step gets 25 seconds, and "no answer" is reported as a finding
    try { await Promise.race([fn(), new Promise((resolve, reject) => setTimeout(() => reject(new Error('no answer in 25 s (blocked?)')), 25000))]); } catch (error) { errors.push(`${name}: ${String(error.message).split('\n')[0].slice(0, 140)}`); }
    await page.waitForTimeout(400);
  };

  await page.goto(base);
  await page.waitForSelector('#canvasEmpty input[type=file]', { state: 'attached', timeout: 15000 });
  await page.keyboard.press('Escape');
  await step('open a document', () => uploadAndWait(page, { name: 'a.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify([{ id: 1, name: 'Ann', cost: 4.5 }, { id: 2, name: 'Bo', cost: 7 }])) }));
  for (const view of ['tree', 'table', 'graph', 'schema', 'editor']) await step('view: ' + view, () => page.evaluate((v) => Structra.setState('activeView', v), view));
  await step('JSON Schema validation (Ajv)', () => page.evaluate(async () => Structra.jsonRepairAndValidation.validate(Structra.state.jsonData, { type: 'array', items: { type: 'object', required: ['id'] } })));
  await step('SQL (DuckDB-Wasm)', () => page.evaluate(async () => { const r = await Structra.dataEngine.runSql('SELECT COUNT(*) AS n FROM data'); if (r.error) throw new Error(r.error); }));
  await step('JSONPath query (json-p3)', () => page.evaluate(async () => Structra.jsonpathQuery.query(Structra.state.jsonData, '$[?@.cost > 5]')));
  await step('user code in a worker (new Function in a blob worker)', () => page.evaluate(async () => Structra.sharedHelpers.tryCodeInWorker('data.length', Structra.state.jsonData)));
  await step('Query panel code (new Function on the page)', () => page.evaluate(() => { try { return new Function('data', 'return data.length')([1]); } catch (error) { throw new Error(error.message); } }));
  await step('Transform step code (new Function on the page)', () => page.evaluate(() => { try { return new Function('row', 'return (row.id)')({ id: 1 }); } catch (error) { throw new Error(error.message); } }));
  await step('compare (jsondiffpatch)', () => page.evaluate(() => Structra.state.jsonData && Structra.jsonDiff && 1));
  await step('save as image (modern-screenshot)', () => page.evaluate(async () => { await Structra.libraryLoader.loadLibrary('modernscreenshot'); }));
  await step('YAML and TOML', () => page.evaluate(async () => { await Structra.formatConversion.jsonToYaml({ a: 1 }); }));
  await step('command palette and dialogs', () => page.evaluate(() => Structra.events.emit('command-palette:toggle')));

  await browser.close();
  server.close();
  console.log(`Policy tested: ${RELAXED === STRICT ? 'STRICT' : 'RELAXED'}\n  ${RELAXED}\n`);
  if (!found.size) console.log('No violations.');
  else { console.log('Violations (feature | directive | blocked):'); for (const [key, count] of found) console.log(`  ${count}x  ${key}`); }
  if (errors.length) console.log('\nPage errors:\n  ' + errors.join('\n  '));
})();
