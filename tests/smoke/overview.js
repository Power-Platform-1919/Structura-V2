/* The Overview: advice on findings, no pointless charts for IDs and time stamps, honest "has a value" figures,
   and a page that can be scrolled with the keyboard.

   Run:  node tests/smoke/overview.js          (PW_CHANNEL=msedge uses the installed Edge)
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
  const page = await (await newCtx(browser, { viewport: { width: 1360, height: 760 } })).newPage();
  const failures = [];
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));

  try {
    await page.goto(base);
    await page.waitForSelector('#canvasEmpty input[type=file]', { state: 'attached', timeout: 10000 });
    await page.keyboard.press('Escape');
    await page.locator('#canvasEmpty input[type=file]').first().setInputFiles(path.join(ROOT, 'tests', 'fixtures', 'sp_getitems.json'));
    await page.waitForTimeout(1800);
    await page.evaluate(() => Structra.set('activeView', 'overview'));
    await page.waitForTimeout(600);

    const o = await page.evaluate(() => ({
      findings: [...document.querySelectorAll('.ovw-find')].map((f) => f.textContent.replace(/\s+/g, ' ').trim()),
      distribution: [...document.querySelectorAll('.dist-card-title')].map((t) => t.textContent.replace(/\s+(numeric|categorical)\s*$/, '').trim()),
      coverageHeaders: [...document.querySelectorAll('.cov-table th')].map((t) => t.textContent.trim()),
      notes: (() => { const r = [...document.querySelectorAll('.cov-table tbody tr')].find((tr) => tr.querySelector('.cov-key')?.textContent.trim().startsWith('Notes')); return r ? [...r.querySelectorAll('td')].map((c) => c.textContent.trim()) : null; })(),
      region: (() => { const el = document.querySelector('structra-overview .stats-view'); return { tabindex: el.getAttribute('tabindex'), role: el.getAttribute('role') }; })(),
      headline: (() => { const h = document.querySelector('.ovw-headline'); return { width: h.getBoundingClientRect().width, lines: Math.round(h.getBoundingClientRect().height / parseFloat(getComputedStyle(h).lineHeight)) }; })(),
    }));

    if (!o.findings.some((f) => /coalesce\(/.test(f))) failures.push('findings about empty values give no advice on what to do: ' + o.findings.join(' | ').slice(0, 300));
    const noisy = o.distribution.filter((d) => /^(@|ItemInternalId|ID$|Created|Modified)/i.test(d));
    if (noisy.length) failures.push('distribution charts for identifiers or time stamps: ' + noisy.join(', '));
    if (!o.coverageHeaders.includes('Has a value')) failures.push('the coverage column should be called "Has a value": ' + o.coverageHeaders.join(', '));
    if (o.notes && o.notes[o.notes.length - 2] === '100%') failures.push('Notes is empty in 2 of 3 rows but shows 100% coverage: ' + o.notes.join(' | '));
    if (o.region.tabindex !== '0') failures.push('the Overview cannot be reached with the keyboard (no tabindex)');
    if (o.headline.lines > 2) failures.push('the headline is wrapped onto ' + o.headline.lines + ' lines');

    // Keyboard scrolling once the page is focused
    await page.locator('structra-overview .stats-view').focus();
    await page.waitForFunction(() => { const v = document.querySelector('structra-overview .stats-view'); return v && v.scrollHeight > v.clientHeight; }, null, { timeout: 5000 }).catch(() => {});
    let scrolled = 0;
    for (let attempt = 0; attempt < 3 && scrolled <= 0; attempt++) {   // a busy machine can swallow the first key press
      await page.locator('structra-overview .stats-view').focus();
      await page.keyboard.press('PageDown');
      await page.waitForTimeout(400);
      scrolled = await page.evaluate(() => document.querySelector('structra-overview .stats-view').scrollTop);
    }
    if (scrolled <= 0) failures.push('Page Down does not scroll the Overview');
  } catch (err) {
    failures.push('crashed: ' + err.message.slice(0, 200));
  }
  if (errors.length) failures.push('page errors: ' + [...new Set(errors)].join(' | '));

  await browser.close();
  server.close();
  if (failures.length) { console.log('FAIL\n  ' + failures.join('\n  ')); process.exit(1); }
  console.log('overview smoke test: ok');
})();
