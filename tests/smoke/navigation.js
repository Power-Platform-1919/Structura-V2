/* Getting around: the path bar, Back and Forward, selecting in the Tree, the right-click menu,
   and opening a collapsed node. Paths are written one way everywhere ($.value[0].Title).

   Run:  node tests/smoke/navigation.js          (PW_CHANNEL=msedge uses the installed Edge)
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
  const context = await browser.newContext({ viewport: { width: 1360, height: 800 } });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const page = await context.newPage();
  const failures = [];
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
  const state = () => page.evaluate(() => ({
    path: Structra.state.currentPath,
    view: Structra.state.activeView,
    bar: document.querySelector('#pathInput').value,
    invalid: document.querySelector('#pathInput').classList.contains('invalid'),
    ac: document.querySelector('#acDropdown') ? document.querySelector('#acDropdown').style.display : 'none',
    hl: (() => { const l = document.querySelector('structra-tree .j-line.highlighted'); if (!l) return null; const r = l.getBoundingClientRect(), v = document.querySelector('structra-tree').getBoundingClientRect(); return { path: l.dataset.path, visible: r.top >= v.top - 1 && r.bottom <= v.bottom + 1 }; })(),
  }));
  const typePath = async (text) => {
    await page.locator('#pathInput').fill(text);
    await page.locator('#pathInput').press('Enter');
    await page.waitForTimeout(500);
  };

  try {
    await page.goto(base);
    await page.waitForSelector('#canvasEmpty input[type=file]', { state: 'attached', timeout: 10000 });
    await page.keyboard.press('Escape');
    await page.locator('#canvasEmpty input[type=file]').first().setInputFiles(path.join(ROOT, 'tests', 'fixtures', 'sp_getitems.json'));
    await page.waitForTimeout(1500);
    await page.evaluate(() => Structra.set('activeView', 'tree'));
    await page.waitForTimeout(400);

    // ---- A click in the Tree selects it, written as $.…, and opens the Node panel ----
    await page.locator('structra-tree .j-str', { hasText: 'Laptop refresh' }).click();
    await page.waitForTimeout(500);
    let s = await state();
    if (s.path !== '$.value[0].Title') failures.push('clicking "Laptop refresh" should select $.value[0].Title, it selected ' + s.path);
    if (s.bar !== '$.value[0].Title') failures.push('the path bar should show $.value[0].Title, it shows ' + s.bar);

    // ---- Path bar: find the value and scroll to it ----
    await typePath('$.value[2].Requester.Email');
    s = await state();
    if (s.path !== '$.value[2].Requester.Email') failures.push('the path bar did not go to the path: ' + s.path);
    if (!s.hl || s.hl.path !== 'value[2].Requester.Email') failures.push('the Tree did not highlight the line for the typed path: ' + JSON.stringify(s.hl));
    else if (!s.hl.visible) failures.push('the highlighted line is not scrolled into view');
    if (s.ac !== 'none') failures.push('the suggestion list is still open after Enter');

    // ---- A path without the $ works too, and a wrong path says so ----
    await typePath('value[1].Title');
    s = await state();
    if (s.path !== '$.value[1].Title') failures.push('value[1].Title (no $) should become $.value[1].Title, got ' + s.path);
    const before = s.path;
    await typePath('value[1].Titel');
    s = await state();
    if (!s.invalid) failures.push('a path that does not exist should be marked as wrong in the path bar');
    if (s.path !== before) failures.push('a wrong path changed the selection to ' + s.path);

    // ---- A path typed in a view that cannot show it opens the Tree ----
    await page.evaluate(() => Structra.set('activeView', 'overview'));
    await page.waitForTimeout(300);
    await typePath('$.value[0].Title');
    s = await state();
    if (s.view !== 'tree') failures.push('typing a path while the Overview is open should open the Tree, the view is ' + s.view);

    // ---- Back and Forward move the Tree too ----
    await typePath('$.value[2].Title');
    await page.locator('structra-header [data-action="back"]').click();
    await page.waitForTimeout(500);
    s = await state();
    if (s.path !== '$.value[0].Title') failures.push('Back should return to $.value[0].Title, it went to ' + s.path);
    if (!s.hl || s.hl.path !== 'value[0].Title') failures.push('Back did not move the Tree to the line: ' + JSON.stringify(s.hl));

    // ---- Right-click: selects the line, real icons, Power Platform entries ----
    await page.locator('structra-tree .j-str', { hasText: 'Badge request' }).click({ button: 'right' });
    await page.waitForTimeout(300);
    const menu = await page.evaluate(() => {
      const m = document.querySelector('.tree-ctx-menu');
      if (!m) return null;
      return { icons: m.querySelectorAll('.tree-ctx-icon svg').length, text: m.textContent, emoji: /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(m.textContent) };
    });
    s = await state();
    if (!menu) failures.push('right-click did not open a menu');
    else {
      if (menu.emoji) failures.push('the right-click menu still uses emoji: ' + menu.text.slice(0, 80));
      if (menu.icons < 5) failures.push('the right-click menu should have an icon on every action, it has ' + menu.icons);
      if (!/Power Automate expression/.test(menu.text) || !/Power Fx formula/.test(menu.text)) failures.push('the right-click menu has no Power Automate / Power Fx copy');
    }
    if (s.path !== '$.value[1].Title') failures.push('right-clicking a line should select it, the selection is ' + s.path);
    await page.locator('.tree-ctx-item', { hasText: 'Power Automate expression' }).click();
    await page.waitForTimeout(200);
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    if (!/items\('Apply_to_each'\)\?\['Title'\]/.test(clip)) failures.push('the copied Power Automate expression is wrong: ' + clip);

    // ---- A click anywhere on a collapsed node opens it ----
    await page.locator('structra-canvas-header [data-action="depth-1"]').click();
    await page.waitForTimeout(300);
    const collapsed = await page.evaluate(() => document.querySelectorAll('structra-tree .j-ellipsis').length && [...document.querySelectorAll('structra-tree .j-ellipsis')].filter((e) => e.offsetParent !== null).length);
    if (!collapsed) failures.push('Level 1 did not collapse anything');
    const block = await page.evaluate(() => [...document.querySelectorAll('structra-tree .j-ellipsis')].find((e) => e.offsetParent !== null).dataset.block);
    await page.locator(`structra-tree .j-ellipsis[data-block="${block}"]`).click();
    await page.waitForTimeout(300);
    const stillShut = await page.evaluate((b) => document.querySelector(`structra-tree .j-ellipsis[data-block="${b}"]`).offsetParent !== null, block);
    if (stillShut) failures.push('clicking the text of a collapsed node did not open it');
  } catch (err) {
    failures.push('crashed: ' + err.message.slice(0, 220));
  }
  if (errors.length) failures.push('page errors: ' + [...new Set(errors)].join(' | '));

  await browser.close();
  server.close();
  if (failures.length) { console.log('FAIL\n  ' + failures.join('\n  ')); process.exit(1); }
  console.log('navigation smoke test: ok');
})();
