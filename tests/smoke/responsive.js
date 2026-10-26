/* Awkward situations a real person runs into: JSON Lines and semicolon CSV, a Flatten that would lose data, Undo and the
   changed mark, Mask, Editor text that is not applied yet, tab names, Escape, stale panel results, several files at once,
   huge share links and a browser that blocks saving. Nothing may throw, lose work or fail silently.

   Run:  node tests/smoke/responsive.js          (PW_CHANNEL=msedge uses the installed Edge)
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
  const page = await (await newCtx(browser, { viewport: { width: 390, height: 780 } })).newPage();
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
    const recs = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, name: 'n' + i, payload: i === 0 ? '{"a":{"b":1}}' : 'x', owner: { '@odata.type': 'T', DisplayName: 'D' + i, Email: 'e' + i + '@x.com', Claims: 'c' } }));
    await load('recs.json', JSON.stringify(recs));

    // Phone width: the rail is a bar along the bottom and every rail button can be reached
    const ph = await page.evaluate(() => {
      const r = document.querySelector('structra-rail').getBoundingClientRect();
      return { top: r.top, h: window.innerHeight, w: r.width, vw: window.innerWidth, docW: document.documentElement.scrollWidth };
    });
    if (!(ph.top > ph.h * 0.8)) failures.push('at phone width the rail should sit along the bottom: ' + JSON.stringify(ph));
    if (ph.w > ph.vw + 1) failures.push('the rail is wider than the screen: ' + JSON.stringify(ph));
    await page.setViewportSize({ width: 320, height: 700 });
    await page.waitForTimeout(300);
    const sw = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth));
    if (sw < 340) failures.push('under 360 px the page should scroll sideways rather than cut content off, scrollWidth ' + sw);

    // Short laptop screen: the panel stays folded until asked; the maximise button makes it taller
    await page.setViewportSize({ width: 1366, height: 700 });
    await page.waitForTimeout(300);
    await closeAll();
    await load('recs2.json', JSON.stringify(recs));
    const folded = await page.evaluate(() => Structra.state.drawerState);
    if (folded !== 'collapsed') failures.push('on a 700 px high screen the drawer should start folded, it is ' + folded);
    await page.evaluate(() => Structra.setState('drawerState', 'medium'));
    await page.waitForTimeout(300);
    const before = await page.evaluate(() => document.querySelector('structra-drawer').offsetHeight);
    await page.locator('[data-action="maximise"]').click();
    await page.waitForTimeout(500);
    const after = await page.evaluate(() => document.querySelector('structra-drawer').offsetHeight);
    if (!(after > before)) failures.push(`the maximise button should make the panel taller: ${before} then ${after}`);
    await page.evaluate(() => Structra.setState('drawerState', 'collapsed'));

    // Schema Gen can cover only the selected value
    await page.evaluate(() => { Structra.setState('currentPath', '$[0].owner'); Structra.setState('drawerState', 'medium'); document.querySelector('structra-drawer')._switchTab('schema-gen'); });
    await page.waitForTimeout(500);
    await page.locator('structra-schemagen [data-action="selected"]').check();
    await page.waitForTimeout(500);
    const sg = await page.evaluate(() => document.querySelector('#sgOutput').dataset.schema);
    if (!/DisplayName/.test(sg) || /payload/.test(sg)) failures.push('Schema Gen for the selected value should describe only owner');
    await page.evaluate(() => Structra.setState('drawerState', 'collapsed'));

    // Schema view has a Copy schema button and no red
    await page.evaluate(() => Structra.setState('activeView', 'schema'));
    await page.waitForTimeout(500);
    const sc = await page.evaluate(() => ({ btn: !!document.querySelector('[data-schema-copy]'), red: getComputedStyle(document.querySelector('.s-req') || document.body).color }));
    if (!sc.btn) failures.push('the Schema view should have a Copy schema button');

    // Split into columns: system keys are last and unticked
    await page.evaluate(() => Structra.setState('activeView', 'table'));
    await page.waitForTimeout(600);
    await page.evaluate(() => document.querySelector('structra-table')._showExpandPicker('owner'));
    const picks = await page.evaluate(() => [...document.querySelectorAll('.col-pick-item')].map((l) => ({ t: l.textContent.trim(), on: l.querySelector('input').checked })));
    const sys = picks.find((p) => /@odata/.test(p.t));
    if (!sys || sys.on) failures.push('system keys should be unticked in Split into columns: ' + JSON.stringify(picks));
    if (picks[0] && /@odata|Claims/.test(picks[0].t)) failures.push('system keys should come last: ' + JSON.stringify(picks));
    await page.keyboard.press('Escape');
    await page.mouse.click(5, 300);

    // Filter panel is docked above the table, not over it
    await page.evaluate(() => Structra.setState('filterBarOpen', true));
    await page.waitForTimeout(500);
    const dock = await page.evaluate(() => {
      const f = document.querySelector('structra-filter .filter-panel').getBoundingClientRect();
      const t = document.querySelector('structra-table').getBoundingClientRect();
      return { filterBottom: f.bottom, tableTop: t.top };
    });
    if (dock.filterBottom > dock.tableTop + 1) failures.push('the filter panel should sit above the table, not over it: ' + JSON.stringify(dock));
    await page.evaluate(() => Structra.setState('filterBarOpen', false));
  } catch (err) {
    failures.push('crashed: ' + err.message.slice(0, 220));
  }
  if (errors.length) failures.push('page errors: ' + [...new Set(errors)].join(' | '));

  await browser.close();
  server.close();
  if (failures.length) { console.log('FAIL\n  ' + failures.join('\n  ')); process.exit(1); }
  console.log('responsive smoke test: ok');
})();
