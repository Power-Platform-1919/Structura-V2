/* Awkward situations a real person runs into: JSON Lines and semicolon CSV, a Flatten that would lose data, Undo and the
   changed mark, Mask, Editor text that is not applied yet, tab names, Escape, stale panel results, several files at once,
   huge share links and a browser that blocks saving. Nothing may throw, lose work or fail silently.

   Run:  node tests/smoke/robust.js          (PW_CHANNEL=msedge uses the installed Edge)
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
  const toastText = () => page.evaluate(() => document.querySelector('structra-toast #toastMsg').textContent);

  try {
    await page.goto(base);
    await page.waitForSelector('#canvasEmpty input[type=file]', { state: 'attached', timeout: 10000 });
    await page.keyboard.press('Escape');

    // ---- formats: JSON Lines and semicolon CSV open as lists ----
    await load('events.ndjson', '{"id":1,"v":"a"}\n{"id":2,"v":"b"}\n{"id":3,"v":"c"}\n');
    let doc = await page.evaluate(() => Structra.state.jsonData);
    if (!Array.isArray(doc) || doc.length !== 3 || doc[2].v !== 'c') failures.push('JSON Lines should open as a list of 3: ' + JSON.stringify(doc));
    await closeAll();
    await load('export.csv', 'Region;Rep;Units\nNorth;Ann;10\nSouth;Bo;5\n');
    doc = await page.evaluate(() => Structra.state.jsonData);
    if (!Array.isArray(doc) || doc.length !== 2 || doc[0].Units !== 10) failures.push('semicolon CSV should open as rows: ' + JSON.stringify(doc));
    await page.evaluate(() => document.querySelector('structra-input-panel')._loadText('{"a":1}\n{"a": oops}\n', 'bad.ndjson'));
    await page.waitForTimeout(400);
    const lineErr = await page.evaluate(() => (document.querySelector('[data-role="error"] .io-error-detail') || {}).textContent || '');
    if (!/line 2/.test(lineErr)) failures.push('a bad line in JSON Lines should be named: ' + lineErr);

    // ---- undo returns the tab to unchanged; flatten refuses to lose data ----
    await closeAll();
    await load('flat.json', JSON.stringify({ 'a.b': 1, a: { b: 2 }, z: 1, y: 2 }));
    await page.evaluate(() => Structra.events.emit('command:run', 'flatten'));
    await page.waitForTimeout(500);
    if (!/lose data/.test(await toastText())) failures.push('Flatten should refuse when two paths give the same name: ' + await toastText());
    if (await page.evaluate(() => Object.keys(Structra.state.jsonData).join()) !== 'a.b,a,z,y') failures.push('a refused Flatten must leave the data alone');
    await page.evaluate(() => Structra.events.emit('command:run', 'sort'));
    await page.waitForTimeout(500);
    if (!(await page.evaluate(() => Structra.tabs.list.find((t) => t.id === Structra.tabs.activeId).modified))) failures.push('a change should mark the tab as changed');
    await page.evaluate(() => Structra.events.emit('command:run', 'undo'));
    await page.waitForTimeout(500);
    if (await page.evaluate(() => Structra.tabs.list.find((t) => t.id === Structra.tabs.activeId).modified)) failures.push('after Undo back to the original the tab should not show as changed');

    // ---- mask covers emails inside text and names, without hinting at length ----
    await closeAll();
    await load('people.json', JSON.stringify({ DisplayName: 'Ann Lee', Claims: 'i:0#.f|membership|ann@contoso.com', Email: 'ann@contoso.com', Title: 'Laptop' }));
    await page.evaluate(() => Structra.events.emit('command:run', 'mask'));
    await page.waitForTimeout(600);
    const masked = await page.evaluate(() => Structra.state.jsonData);
    if (/ann@contoso/.test(JSON.stringify(masked))) failures.push('Mask left an email in the data: ' + JSON.stringify(masked));
    if (masked.Email !== 'a***@***.com' || masked.DisplayName !== 'A*** L***' || masked.Title !== 'Laptop') failures.push('Mask output is not as expected: ' + JSON.stringify(masked));
    if (!(await page.evaluate(() => document.querySelector('#toastAction') && !document.querySelector('#toastAction').hidden))) failures.push('the Mask message should offer an Undo button');

    // ---- editor: text typed but not applied survives a tab switch ----
    await closeAll();
    await load('draft-A.json', '{"keep":"original"}');
    await load('draft-B.json', '{"other":1}');
    const ids = await page.evaluate(() => Structra.tabs.list.slice(-2).map((t) => t.id));
    await page.evaluate((id) => document.querySelector('structra-tabs')._switchTab(id), ids[0]);
    await page.waitForTimeout(500);
    await page.evaluate(() => Structra.setState('activeView', 'editor'));
    await page.waitForTimeout(500);
    await page.evaluate(() => { document.querySelector('structra-editor .cv').codeView.replaceAll('{"keep": "TYPED, not applied"}'); });
    await page.waitForTimeout(300);
    await page.evaluate((id) => document.querySelector('structra-tabs')._switchTab(id), ids[1]);
    await page.waitForTimeout(700);
    await page.evaluate((id) => document.querySelector('structra-tabs')._switchTab(id), ids[0]);
    await page.waitForTimeout(700);
    if (!/TYPED, not applied/.test(await page.evaluate(() => document.querySelector('structra-editor .cv').codeView.getValue()))) failures.push('text typed in the Editor was lost when switching tabs');
    if (!(await page.evaluate(() => Structra.tabs.list.find((t) => t.id === Structra.tabs.activeId).draft))) failures.push('a tab with typed, unapplied text should show a dot');
    await page.locator('structra-editor [data-action="apply"]').click();
    await page.waitForTimeout(500);
    if (await page.evaluate(() => Structra.tabs.list.find((t) => t.id === Structra.tabs.activeId).draft)) failures.push('applying the text should clear the dot');
    await page.evaluate(() => Structra.setState('activeView', 'tree'));

    // ---- tab names: the lowest free Untitled number ----
    await closeAll();
    for (let i = 0; i < 3; i++) { await page.evaluate(() => Structra.events.emit('tabs:add')); await page.waitForTimeout(150); }
    const names = await page.evaluate(() => Structra.tabs.list.map((t) => t.label));
    if (!names.includes('Untitled 2') || !names.includes('Untitled 3') && names.length > 2 || names.some((n) => /Untitled (9|1\d)/.test(n))) failures.push('Untitled tabs should use the lowest free number: ' + names.join(', '));

    // ---- Escape closes one thing at a time; one dialog at a time ----
    await closeAll();
    await load('esc.json', '{"a":[1,2,3]}');
    await page.evaluate(() => { Structra.events.emit('shortcuts:open'); });
    await page.waitForTimeout(250);
    await page.evaluate(() => { Structra.events.emit('settings:open'); });
    await page.waitForTimeout(250);
    const open2 = await page.evaluate(() => [...document.querySelectorAll('.ov.show')].map((o) => o.parentElement.tagName.toLowerCase()));
    if (open2.join() !== 'structra-settings') failures.push('opening a dialog should close the one before it: ' + open2.join());
    await page.evaluate(() => { Structra.events.emit('overlay:close'); Structra.setState('findBarOpen', true); });
    await page.waitForTimeout(250);
    await page.evaluate(() => { Structra.events.emit('settings:open'); });
    await page.waitForTimeout(350);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    let st = await page.evaluate(() => ({ dialogs: document.querySelectorAll('.ov.show').length, find: Structra.state.findBarOpen }));
    if (st.dialogs !== 0 || !st.find) failures.push('the first Escape should close only the dialog: ' + JSON.stringify(st));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    st = await page.evaluate(() => ({ find: Structra.state.findBarOpen }));
    if (st.find) failures.push('the second Escape should close the Find bar');

    // ---- the Query panel forgets results when the document changes; the path bar shows its hint ----
    await page.evaluate(() => Structra.setState('queryPanelOpen', true));
    await page.waitForTimeout(300);
    await page.locator('#queryInput').fill('a[*]');
    await page.locator('#queryInput').press('Enter');
    await page.waitForTimeout(400);
    if (!(await page.evaluate(() => document.querySelectorAll('#queryResults .qp-result').length))) failures.push('the query should find matches');
    await load('other.json', '{"z":1}');
    if (await page.evaluate(() => document.querySelectorAll('#queryResults .qp-result').length)) failures.push('query results from the closed document are still showing');
    await page.evaluate(() => Structra.setState('queryPanelOpen', false));
    if ((await page.evaluate(() => document.querySelector('#pathInput').value)) !== '') failures.push('with nothing selected the path bar should be empty to show its hint');

    // ---- several files at once ----
    await closeAll();
    await page.evaluate(() => Structra.events.emit('tabs:add'));
    await page.waitForTimeout(200);
    await page.evaluate(() => Structra.events.emit('input:show-tab', 'file'));
    await page.locator('structra-input-panel [data-role="file-input"]').first().setInputFiles([
      { name: 'one.json', mimeType: 'application/json', buffer: Buffer.from('{"n":1}') },
      { name: 'two.json', mimeType: 'application/json', buffer: Buffer.from('{"n":2}') },
      { name: 'three.csv', mimeType: 'text/csv', buffer: Buffer.from('a,b\n1,2') },
    ]);
    await page.waitForTimeout(2500);
    const multi = await page.evaluate(() => Structra.tabs.list.map((t) => t.label).join('|'));
    if (!/one\.json/.test(multi) || !/two\.json/.test(multi) || !/three\.csv/.test(multi)) failures.push('three files chosen together should open in three tabs: ' + multi);

    // ---- a share link that unpacks to too much is refused ----
    const refused = await page.evaluate(async () => {
      const zeros = new Uint8Array(24 * 1024 * 1024);
      const gz = await new Response(new Blob([zeros]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
      let bin = ''; const b = new Uint8Array(gz); for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000));
      const enc = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      history.replaceState(null, '', '#share=g.' + enc);
      try { await Structra.shareLink.readHash(); return 'opened'; } catch (e) { return e.message; } finally { history.replaceState(null, '', location.pathname); }
    });
    if (!/more than 20 MB/.test(refused)) failures.push('a share link unpacking to 24 MB should be refused: ' + refused);

    // ---- Find understands key:name and $.path; editing a value in the Tree can be undone; XML writes empty lists as one tag ----
    await closeAll();
    await load('edit.json', JSON.stringify({ rows: [{ Title: 'a', n: 1 }, { Title: 'b', n: 2 }], n: 5 }));
    const byKey = await page.evaluate(async () => (await Structra.dataEngine.findInDb('key:Title')).total);
    const byPath = await page.evaluate(async () => (await Structra.dataEngine.findInDb('$.rows[*].n')).total);
    if (byKey !== 2 || byPath !== 2) failures.push('Find key:Title and $.rows[*].n should each find 2: ' + byKey + ', ' + byPath);
    await page.evaluate(() => Structra.events.emit('tree:inline-edit', { path: 'n', value: 9 }));
    await page.waitForTimeout(600);
    if (await page.evaluate(() => Structra.state.jsonData.n) !== 9 || !(await page.evaluate(() => Structra.tabs.list.find((t) => t.id === Structra.tabs.activeId).modified))) failures.push('editing a value in the Tree should change the data and mark the tab');
    await page.evaluate(() => Structra.events.emit('command:run', 'undo'));
    await page.waitForTimeout(500);
    if (await page.evaluate(() => Structra.state.jsonData.n) !== 5) failures.push('editing a value in the Tree should be undoable');
    const xmlOut = await page.evaluate(() => Structra.formatConversion.jsonToXml({ a: [], b: {}, c: [{}] }));
    if (!/<a\/>/.test(xmlOut) || !/<b\/>/.test(xmlOut) || !/<item\/>/.test(xmlOut)) failures.push('XML should write empty lists and records as one tag: ' + xmlOut);
  } catch (err) {
    failures.push('crashed: ' + err.message.slice(0, 220));
  }

  // ---- with browser storage blocked the app still works ----
  try {
    const ctx2 = await browser.newContext({ viewport: { width: 1360, height: 800 } });
    await ctx2.addInitScript(() => {
      const deny = () => { throw new DOMException('denied', 'SecurityError'); };
      Object.defineProperty(window, 'localStorage', { configurable: true, get: deny });
      Object.defineProperty(window, 'sessionStorage', { configurable: true, get: deny });
    });
    const p2 = await ctx2.newPage();
    const errs2 = [];
    p2.on('pageerror', (e) => errs2.push(e.message.slice(0, 120)));
    await p2.goto(base);
    await p2.waitForSelector('#canvasEmpty input[type=file]', { state: 'attached', timeout: 10000 });
    await p2.keyboard.press('Escape');
    await p2.locator('#canvasEmpty input[type=file]').first().setInputFiles(path.join(ROOT, 'tests', 'fixtures', 'sp_getitems.json'));
    await p2.waitForTimeout(1500);
    await p2.evaluate(() => Structra.events.emit('settings:open'));
    await p2.waitForTimeout(400);
    const opened = await p2.evaluate(() => !!document.querySelector('structra-settings .ov.show'));
    await p2.keyboard.press('Escape');
    await p2.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: '=', ctrlKey: true, bubbles: true })));
    await p2.waitForTimeout(300);
    const has = await p2.evaluate(() => !!Structra.state.jsonData);
    if (!has) failures.push('with storage blocked a file did not open');
    if (!opened) failures.push('with storage blocked the Settings dialog did not open');
    if (errs2.length) failures.push('with storage blocked there were errors: ' + [...new Set(errs2)].join(' | '));
    await ctx2.close();
  } catch (err) {
    failures.push('storage-blocked check crashed: ' + err.message.slice(0, 160));
  }

  const real = [...new Set(errors)].filter((e) => !/Failed to load resource|404/.test(e));
  if (real.length) failures.push('page errors: ' + real.join(' | '));

  await browser.close();
  server.close();
  if (failures.length) { console.log('FAIL\n  ' + failures.join('\n  ')); process.exit(1); }
  console.log('robustness smoke test: ok');
})();
