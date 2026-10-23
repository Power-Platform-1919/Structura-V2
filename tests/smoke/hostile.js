/* Hostile and odd input: names, keys and values that are really markup, columns named like built-in properties, XML,
   every Filter tab and the palette commands. Nothing may run, throw or fail silently.

   Run:  node tests/smoke/hostile.js          (PW_CHANNEL=msedge uses the installed Edge)
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

  const load = async (name, text) => {
    await page.evaluate(() => Structra.events.emit('tabs:add'));
    await page.waitForTimeout(250);
    await page.evaluate(([n, t]) => document.querySelector('structra-input-panel')._loadText(t, n), [name, text]);
    await page.waitForTimeout(700);
  };
  const closeAll = () => page.evaluate(() => { while (Structra.tabs.list.length > 1) document.querySelector('structra-tabs')._closeTab(Structra.tabs.list[Structra.tabs.list.length - 1].id); });
  const fresh = async () => {
    await page.goto(base);
    await page.waitForSelector('#canvasEmpty input[type=file]', { state: 'attached', timeout: 10000 });
    await page.keyboard.press('Escape');
    await page.evaluate(() => { window.__xss = []; });
  };

  try {
    await fresh();

    // ---- markup in names, keys and values never runs, in any view or dialog ----
    const mk = (n) => `<img src=x onerror="window.__xss.push('${n}')">`;
    const hostile = [{ id: 1, [mk('key')]: 'v', name: mk('value'), tags: [mk('array')], status: 'Open' }, { id: 2, name: mk('value2'), status: mk('status') }];
    await load(mk('tab') + '.json', JSON.stringify(hostile));
    for (const v of ['overview', 'tree', 'table', 'graph', 'schema', 'editor']) { await page.evaluate((x) => Structra.set('activeView', x), v); await page.waitForTimeout(500); }
    await page.evaluate(() => { Structra.set('activeView', 'table'); Structra.set('filterBarOpen', true); Structra.set('findBarOpen', true); });
    await page.waitForTimeout(400);
    for (const ev of ['pivot:open', 'nullfinder:open', 'charts:open', 'typedef:open', 'diff:open', 'settings:open', 'snippets:open', 'workspace:open']) {
      await page.evaluate((e) => Structra.events.emit(e), ev);
      await page.waitForTimeout(350);
      await page.evaluate(() => Structra.events.emit('overlay:close'));
    }
    const ran = await page.evaluate(() => window.__xss.slice());
    if (ran.length) failures.push('markup in a name, key or value ran as script: ' + ran.join(', '));

    // a share link carrying a hostile name
    const link = await page.evaluate(async () => (await Structra.share.createUrl({ a: 1 }, '<img src=x onerror="window.__xss.push(\'share\')">')).url);
    await page.goto('about:blank');
    await page.goto(link);
    await page.waitForTimeout(2500);
    if ((await page.evaluate(() => (window.__xss || []).slice())).length) failures.push('a share link name ran as script');
    await fresh();

    // a workspace file with a hostile tab label
    await page.evaluate(() => Structra.events.emit('workspace:open'));
    await page.waitForTimeout(300);
    const ws = JSON.stringify({ type: 'structra-workspace', tabs: [{ label: '<img src=x onerror="window.__xss.push(\'ws\')">', data: { a: 1 } }] });
    await page.locator('#wsImportFile').setInputFiles({ name: 'w.structra', mimeType: 'application/json', buffer: Buffer.from(ws) });
    await page.locator('structra-workspace [data-action="import"]').click();
    await page.waitForTimeout(1500);
    if ((await page.evaluate(() => window.__xss.slice())).length) failures.push('a workspace tab label ran as script');

    // ---- columns named like built-in properties load and show ----
    await closeAll();
    for (const key of ['constructor', 'toString', 'valueOf', 'hasOwnProperty', 'length', 'name']) {
      await load('k-' + key, JSON.stringify([{ [key]: 1, id: 1 }, { [key]: 2, id: 2 }]));
      const ok = await page.evaluate((k) => Structra.state.jsonData && Structra.state.jsonData.length === 2 && Object.prototype.hasOwnProperty.call(Structra.state.jsonData[0], k), key);
      if (!ok) failures.push('a document with a column named ' + key + ' did not open');
      await page.evaluate(() => Structra.set('activeView', 'table'));
      await page.waitForTimeout(400);
      await closeAll();
    }
    await load('proto.json', '{"__proto__": {"x": 1}, "a": 1}');
    if (!(await page.evaluate(() => !!Structra.state.jsonData))) failures.push('a document with a __proto__ key did not open');
    if (await page.evaluate(() => ({}).x !== undefined)) failures.push('a __proto__ key changed Object.prototype');

    // ---- XML opens ----
    await closeAll();
    await load('orders.xml', '<orders><order id="1"><customer>Ann</customer><total>10.5</total></order><order id="2"><customer>Bo</customer><total>7</total></order></orders>');
    const xml = await page.evaluate(() => JSON.stringify(Structra.state.jsonData || null).slice(0, 200));
    if (!/Ann/.test(xml) || !/orders/.test(xml)) failures.push('valid XML did not open: ' + xml);

    // ---- every Filter tab works ----
    await closeAll();
    await load('rows.json', JSON.stringify(Array.from({ length: 50 }, (_, i) => ({ id: i, v: i % 5, name: 'n' + i }))));
    await page.evaluate(() => { Structra.set('activeView', 'table'); Structra.set('filterBarOpen', true); });
    await page.waitForTimeout(400);
    const tryTab = async (label, text) => {
      await page.locator('structra-filter button', { hasText: new RegExp('^' + label + '$') }).first().click();
      await page.waitForTimeout(250);
      await page.locator('#filterExprInput').fill(text);
      await page.locator('structra-filter [data-action="apply"]').click();
      await page.waitForTimeout(700);
      return page.evaluate(() => ({ count: document.querySelector('#filterCount').textContent, toast: document.querySelector('structra-toast #toastMsg').textContent }));
    };
    let r = await tryTab('JSONPath', '$[?(@.v==2)]');
    if (r.count !== '10 rows match') failures.push('the JSONPath filter should find 10 rows: ' + JSON.stringify(r));
    r = await tryTab('Formula', 'row.v === 3 && row.id > 10');
    if (!/^\d+ rows? match$/.test(r.count) || r.count === '50 rows match') failures.push('the Expression filter did not filter: ' + JSON.stringify(r));
    r = await tryTab('Formula', 'row.v ===');
    if (!/could not be read/.test(r.toast)) failures.push('a broken expression should say it could not be read: ' + r.toast);
    await page.evaluate(() => Structra.set('filterBarOpen', false));

    // ---- palette Find and Filter open their bars ----
    await page.evaluate(() => { Structra.set('findBarOpen', false); Structra.set('filterBarOpen', false); Structra.events.emit('command:run', 'find'); });
    await page.waitForTimeout(300);
    if (!(await page.evaluate(() => Structra.state.findBarOpen))) failures.push('the palette command Find in JSON did not open the Find bar');
    await page.evaluate(() => { Structra.set('findBarOpen', false); Structra.events.emit('command:run', 'filter'); });
    await page.waitForTimeout(300);
    if (!(await page.evaluate(() => Structra.state.filterBarOpen))) failures.push('the palette command Filter Data did not open the Filter bar');

    // ---- CSV export writes rows for a list that is not at the top ----
    await closeAll();
    await load('orders.json', JSON.stringify({ orders: [{ id: 1, customer: 'Ann', status: { Value: 'Open' }, items: [{ sku: 'A' }] }, { id: 2, customer: 'Bo', status: { Value: 'Closed' }, items: [] }] }));
    const csv = await page.evaluate(() => Structra.engine.exportData('csv'));
    const head = (csv || '').split('\n')[0];
    if (head !== 'id,customer,status.Value,items' || !/^1,Ann,Open,/.test((csv || '').split('\n')[1] || '')) failures.push('Export as CSV should write the rows of the list, got: ' + JSON.stringify((csv || '').slice(0, 120)));

    // ---- a binary file is refused, with a way forward ----
    await closeAll();
    await page.evaluate(() => Structra.events.emit('tabs:add'));
    await page.waitForTimeout(250);
    const before = await page.evaluate(() => Structra.state.fileName);
    await page.evaluate(() => document.querySelector('structra-input-panel')._loadText('PK\u0003\u0004\u0014\u0000\u0006\u0000binary', 'report.xlsx'));
    await page.waitForTimeout(500);
    const bin = await page.evaluate(() => ({ file: Structra.state.fileName, title: (document.querySelector('[data-role="error"] .io-error-title') || {}).textContent || '', detail: (document.querySelector('[data-role="error"] .io-error-detail') || {}).textContent || '' }));
    if (bin.file !== before || !/Excel/.test(bin.title) || !/CSV/.test(bin.detail)) failures.push('an Excel file should be refused with advice to save as CSV: ' + JSON.stringify(bin));

    // ---- Snippet Load opens a new tab and leaves the document alone ----
    await closeAll();
    await load('keep-me.json', '{"keep": true}');
    await page.evaluate(() => { localStorage.setItem('structra_snippets', JSON.stringify([{ name: 'snip', content: '{"from":"snippet"}', size: 18 }])); const s = document.querySelector('structra-snippets'); s._snippets = s._load(); s._renderList(); });
    const tabsBefore = await page.evaluate(() => Structra.tabs.list.length);
    await page.evaluate(() => document.querySelector('structra-snippets')._useSnippet(0));
    await page.waitForTimeout(900);
    const sn = await page.evaluate(() => ({ tabs: Structra.tabs.list.map((t) => t.label), file: Structra.state.fileName }));
    if (sn.tabs.length !== tabsBefore + 1 || !sn.tabs.includes('keep-me.json') || sn.file !== 'snip') failures.push('loading a snippet should open a new tab and keep the open document: ' + JSON.stringify(sn));
    await page.evaluate(() => { localStorage.setItem('structra_snippets', JSON.stringify('not-a-list')); const s = document.querySelector('structra-snippets'); s._snippets = s._load(); s._renderList(); });
    if (!(await page.evaluate(() => Array.isArray(document.querySelector('structra-snippets')._snippets)))) failures.push('a damaged saved snippet list should read as empty');
    await page.evaluate(() => localStorage.removeItem('structra_snippets'));

    // ---- a damaged workspace file is refused and writes nothing ----
    await page.evaluate(() => Structra.events.emit('workspace:open'));
    await page.waitForTimeout(300);
    const bad = JSON.stringify({ type: 'structra-workspace', tabs: 'oops', snippets: 'not-a-list' });
    await page.locator('#wsImportFile').setInputFiles({ name: 'bad.structra', mimeType: 'application/json', buffer: Buffer.from(bad) });
    await page.locator('structra-workspace [data-action="import"]').click();
    await page.waitForTimeout(800);
    const toast = await page.evaluate(() => document.querySelector('structra-toast #toastMsg').textContent);
    if (!/damaged/.test(toast)) failures.push('a workspace with tabs that are not a list should say it is damaged: ' + toast);
    if (await page.evaluate(() => localStorage.getItem('structra_snippets'))) failures.push('a damaged workspace wrote its snippets into saved data');

    // ---- large numbers keep every digit ----
    await closeAll();
    await load('ids.json', '{"id": 12345678901234567890, "small": 42, "money": 1.10, "ratio": 0.1000000000000000055, "huge": 1e400, "safe": 9007199254740991, "list": [9007199254740993], "text": "12345678901234567890"}');
    const num = await page.evaluate(() => Structra.state.jsonData);
    if (!num || num.id !== '12345678901234567890' || num.list[0] !== '9007199254740993' || num.huge !== '1e400' || num.ratio !== '0.1000000000000000055') failures.push('large numbers should be kept as text with every digit: ' + JSON.stringify(num));
    if (!num || num.small !== 42 || num.money !== 1.1 || num.safe !== 9007199254740991) failures.push('ordinary numbers should stay numbers: ' + JSON.stringify(num));
    const toastBig = await page.evaluate(() => document.querySelector('structra-toast #toastMsg').textContent);
    if (!/very large number/.test(toastBig)) failures.push('opening a file with large numbers should say they were kept as text: ' + toastBig);

    // ---- a message without a button shows no button ----
    await page.evaluate(() => Structra.toast('A plain message'));
    await page.waitForTimeout(300);
    if (await page.evaluate(() => { const b = document.querySelector('#toastAction'); return !b.hidden && b.offsetParent !== null; })) failures.push('a message that has no action should not show an action button');
  } catch (err) {
    failures.push('crashed: ' + err.message.slice(0, 220));
  }
  const real = [...new Set(errors)].filter((e) => !/Failed to load resource|404/.test(e));
  if (real.length) failures.push('page errors: ' + real.join(' | '));

  await browser.close();
  server.close();
  if (failures.length) { console.log('FAIL\n  ' + failures.join('\n  ')); process.exit(1); }
  console.log('hostile input smoke test: ok');
})();
