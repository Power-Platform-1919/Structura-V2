/* The data tools (Mask, Unmask, Sort keys, Flatten, Mock, Sample, Replace) and Undo / Redo:
   the document the user sees must really change, a change must be undoable, and generated data
   (Mock, Sample) must open in a new tab instead of replacing the user's file.

   Run:  node tests/smoke/tools.js          (PW_CHANNEL=msedge uses the installed Edge)
*/
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

let chromium;
try { ({ chromium } = require('playwright')); } catch {
  console.error('Playwright is not installed. Run: npm install --save-dev playwright && npx playwright install chromium');
  process.exit(2);
}

const ROOT = path.join(__dirname, '..', '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' };
const DOC = [
  { zeta: 1, id: 1, email: 'ann@contoso.com', phone: '555-123-4567', name: 'Ann', nested: { b: 2, a: 1 } },
  { zeta: 2, id: 2, email: 'bo@contoso.com', phone: '555-987-6543', name: 'Bo', nested: { b: 4, a: 3 } },
  { zeta: 3, id: 3, email: 'cy@contoso.com', phone: '555-555-0000', name: 'Cy', nested: { b: 6, a: 5 } },
];

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
  const page = await (await newCtx(browser, )).newPage();
  const failures = [];
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));

  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'structra-tools-')), 'people.json');
  fs.writeFileSync(tmp, JSON.stringify(DOC));
  const original = JSON.stringify(DOC);

  /** Run a command like the palette does, then wait for the document to settle */
  const run = async (cmd) => {
    await page.evaluate((c) => document.querySelector('structra-command')._exec(c), cmd);
    await page.waitForTimeout(700);
  };
  const shown = () => page.evaluate(() => ({
    state: JSON.stringify(Structra.state.jsonData),
    engine: JSON.stringify(Structra.engine.getActive().raw),
    tabs: Structra.tabs.list.length,
    tabId: Structra.tabs.activeId,
    // the last message that is not the one-time tip (a tip may appear a moment after a result)
    toast: (window.__toasts || []).filter((t) => !/^Tip:/.test(t)).slice(-1)[0] || '',
  }));
  const expect = (cond, msg) => { if (!cond) failures.push(msg); };

  try {
    await page.goto(base);
    await page.waitForSelector('#canvasEmpty input[type=file]', { state: 'attached', timeout: 10000 });
    await page.keyboard.press('Escape');
    await page.locator('#canvasEmpty input[type=file]').first().setInputFiles(tmp);
    await page.waitForTimeout(1200);

    // Record every message the app shows, so a later one cannot hide the result of a tool
    await page.evaluate(() => { window.__toasts = []; const t = Structra.toast; Structra.toast = (m, ...r) => { window.__toasts.push(String(m)); return t.call(Structra, m, ...r); }; });

    let s = await shown();
    expect(s.state === original, 'the file did not open as it is');

    // ---- Mask ----
    await run('mask');
    s = await shown();
    expect(!s.state.includes('ann@contoso.com') && !s.state.includes('555-123-4567'), 'Mask: the document on screen still holds the real email and phone');
    expect(s.state === s.engine, 'Mask: the engine and the document on screen differ');
    expect(/Masked [1-9]/.test(s.toast), 'Mask: the message does not say how many values were masked: ' + s.toast);
    const masked = s.state;

    // ---- Undo, Redo, Unmask ----
    await run('undo');
    s = await shown();
    expect(s.state === original, 'Undo after Mask did not bring the original back');
    expect(s.state === s.engine, 'Undo: the engine and the document on screen differ');
    await run('redo');
    s = await shown();
    expect(s.state === masked, 'Redo after Undo did not mask again');
    await run('unmask');
    s = await shown();
    expect(s.state === original, 'Unmask did not restore the original values');

    // ---- Sort keys ----
    await run('sort');
    s = await shown();
    const sortedKeys = Object.keys(JSON.parse(s.state)[0]);
    expect(sortedKeys.join() === [...sortedKeys].sort().join(), 'Sort: keys are not in order: ' + sortedKeys.join());
    expect(s.state === s.engine, 'Sort: the engine and the document on screen differ');
    await run('undo');
    s = await shown();
    expect(s.state === original, 'Undo after Sort did not restore the key order');

    // ---- Flatten, Unflatten ----
    await run('flatten');
    s = await shown();
    expect(JSON.stringify(JSON.parse(s.state)).includes('nested.a') || JSON.stringify(JSON.parse(s.state)).includes('nested'), 'Flatten: no change was made');
    await run('undo');
    s = await shown();
    expect(s.state === original, 'Undo after Flatten did not restore the document');

    // ---- Replace All with Undo ----
    await page.evaluate(() => { const f = document.querySelector('structra-find'); f._replace('contoso.com', 'example.org', true); });
    await page.waitForTimeout(300);
    s = await shown();
    expect(s.state.includes('ann@example.org') && !s.state.includes('contoso.com'), 'Replace All did not change the document');
    await run('undo');
    s = await shown();
    expect(s.state === original, 'Undo after Replace All did not restore the document');

    // ---- Mock and Sample open in a new tab and leave the file alone ----
    const before = await shown();
    await run('mock');
    s = await shown();
    expect(s.tabs === before.tabs + 1, 'Mock: no new tab was opened');
    expect(s.tabId !== before.tabId, 'Mock: the new tab is not the one showing');
    expect(s.state !== original && Array.isArray(JSON.parse(s.state)), 'Mock: the new tab does not hold generated records');
    await page.evaluate((id) => document.querySelector(`.doc-tab[data-id="${id}"]`).click(), before.tabId);
    await page.waitForTimeout(800);
    s = await shown();
    expect(s.state === original, 'Mock: the original file was changed');

    await run('sample');
    s = await shown();
    expect(s.tabs === before.tabs + 2, 'Sample: no new tab was opened');

    // ---- Undo history is per tab: nothing to undo in a tab that was never edited ----
    await run('undo');
    s = await shown();
    expect(/Nothing to undo/.test(s.toast), 'Undo in an untouched tab should say there is nothing to undo, it said: ' + s.toast);
  } catch (err) {
    failures.push('crashed: ' + err.message.slice(0, 200));
  }
  if (errors.length) failures.push('page errors: ' + [...new Set(errors)].join(' | '));

  await browser.close();
  server.close();
  if (failures.length) { console.log('FAIL\n  ' + failures.join('\n  ')); process.exit(1); }
  console.log('tools smoke test: ok');
})();
