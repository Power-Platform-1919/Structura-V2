/* The way XML and JSON map to each other, through the real XML worker (DOMParser) and the real export:
     - JSON to XML and back gives the same data (values come back as text, which XML cannot tell from numbers),
     - null comes back as null, keys that collide stay apart, text between elements is kept, attributes and CDATA are read,
     - an empty element is null, repeated elements are a list, a single element is not.

   Run:  node tests/smoke/xml-mapping.js          (PW_CHANNEL=msedge uses the installed Edge; PW_BROWSER=firefox or webkit) */
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

    const result = await page.evaluate(async () => {
      const out = {};
      const roundTrip = async (data) => (await Structra.parseXmlAsync(Structra.formatConversion.jsonToXml(data))).root;
      // 1. text values, objects, a list of objects, a null, keys that collide
      out.basic = await roundTrip({ name: 'Ann', address: { city: 'Oslo', zip: '0150' }, tags: ['a', 'b'], gone: null });
      out.collide = await roundTrip({ 'a b': 'one', a_b: 'two', 'a-b': 'three' });
      // 2. text with markup characters and quotes comes back as typed
      out.escaped = await roundTrip({ v: '<b> & "q" \'s\' </b>' });
      // 3. numbers and booleans come back as text (XML has no types)
      out.typed = await roundTrip({ n: 1.5, t: true });
      // 4. reading: attributes, CDATA, mixed text, empty element, a single child versus repeated children, namespaces
      const read = async (xml) => (await Structra.parseXmlAsync(xml));
      out.attributes = await read('<a id="1" kind="x"><b>text</b></a>');
      out.cdata = await read('<a><![CDATA[<not & markup>]]></a>');
      out.mixed = await read('<p>Hello <b>big</b> world</p>');
      out.empty = await read('<a><b/><c></c></a>');
      out.single = await read('<a><b>1</b></a>');
      out.repeated = await read('<a><b>1</b><b>2</b></a>');
      out.namespace = await read('<s:Envelope xmlns:s="http://x"><s:Body><m:Get xmlns:m="http://y">1</m:Get></s:Body></s:Envelope>');
      out.comment = await read('<a><!-- note --><b>1</b></a>');
      return out;
    });
    const same = (name, actual, expected) => { if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(`${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); };
    // a list is written as <tags><item>a</item><item>b</item></tags>, so it comes back as { item: [...] }
    same('basic round trip', result.basic, { name: 'Ann', address: { city: 'Oslo', zip: '0150' }, tags: { item: ['a', 'b'] }, gone: null });
    same('colliding keys stay apart', result.collide, { a_b: 'one', a_b_2: 'two', 'a-b': 'three' });
    same('markup characters in text', result.escaped, { v: '<b> & "q" \'s\' </b>'.trim() });
    same('numbers and booleans come back as text', result.typed, { n: '1.5', t: 'true' });
    same('attributes', result.attributes, { a: { '@attributes': { id: '1', kind: 'x' }, b: 'text' } });
    same('CDATA', result.cdata, { a: '<not & markup>' });
    same('text between elements is kept', result.mixed, { p: { b: 'big', '#text': 'Hello world' } });
    same('empty elements are null', result.empty, { a: { b: null, c: null } });
    same('one child is not a list', result.single, { a: { b: '1' } });
    same('repeated children are a list', result.repeated, { a: { b: ['1', '2'] } });
    same('namespaces keep their prefix', result.namespace, { 's:Envelope': { '@attributes': { 'xmlns:s': 'http://x' }, 's:Body': { 'm:Get': { '@attributes': { 'xmlns:m': 'http://y' }, '#text': '1' } } } });
    same('comments are skipped', result.comment, { a: { b: '1' } });
  } catch (error) {
    fail('crashed: ' + String(error.message).split('\n')[0]);
  }

  if (errors.length) fail('page errors: ' + [...new Set(errors)].join(' | '));
  await browser.close();
  server.close();
  if (failures.length) { console.log('xml-mapping smoke test: FAILED\n - ' + failures.join('\n - ')); process.exit(1); }
  console.log('xml-mapping smoke test: ok');
})();
