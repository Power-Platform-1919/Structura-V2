/* The line numbers in the Tree: the margin is as wide as the biggest number in the file (like the Editor's), so the text
   starts at the same place on every line, and a highlighted or bookmarked line does not move its text.

   Run:  node tests/smoke/tree-margin.js          (PW_CHANNEL=msedge uses the installed Edge)
*/
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

async function openJson(page, name, value) {
  await page.evaluate(() => Structra.setState('activeView', 'overview'));
  await page.locator('#canvasEmpty input[type=file], structra-input-panel input[type=file]').first().setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) });
  await page.waitForTimeout(1200);
  await page.evaluate(() => Structra.setState('activeView', 'tree'));
  await page.waitForSelector('.json-view .j-line', { timeout: 20000 });
  await page.waitForTimeout(300);
}

(async () => {
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}/index.html`;
  const browser = await launchBrowser(chromium);
  const page = await (await newCtx(browser, { viewport: { width: 1360, height: 900 } })).newPage();
  const failures = [];
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));

  try {
    await page.goto(base);
    await page.waitForSelector('#canvasEmpty input[type=file]', { state: 'attached', timeout: 10000 });
    await page.keyboard.press('Escape');

    // A small file gets a narrow margin, a file of 1,500 lines a wider one
    await openJson(page, 'small.json', { a: 1, b: 2 });
    const small = await page.evaluate(() => document.querySelector('.json-view').style.getPropertyValue('--ln-digits'));
    if (small !== '2') failures.push('a 4 line file should size its margin for 2 digits, got "' + small + '"');

    const big = {};
    for (let i = 0; i < 1500; i++) big['key' + i] = i;
    await openJson(page, 'wide.json', big);
    const digits = await page.evaluate(() => document.querySelector('.json-view').style.getPropertyValue('--ln-digits'));
    if (digits !== '4') failures.push('a 1,502 line file should size its margin for 4 digits, got "' + digits + '"');

    // The text starts at the same x on a line with a 1 digit, 3 digit and 4 digit number
    // The Tree draws only the lines in view (CodeMirror), so each line is scrolled to before it is measured (key498 is on line 500)
    const measure = async (wrap) => page.evaluate(async (wrapOn) => {
      const jv = document.querySelector('.json-view');
      jv.classList.toggle('wrap-mode', wrapOn);
      Structra.jsonTreeRenderer.setWrap(jv, wrapOn);
      const settle = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 60))));
      const left = async (n) => {
        Structra.jsonTreeRenderer.highlightPath(jv, 'key' + (n - 2));
        await settle();
        const line = jv.querySelector('.j-line[data-ln="' + n + '"]');
        return line ? Math.round(line.querySelector('.j-key').getBoundingClientRect().left * 10) / 10 : null;
      };
      const out = { one: await left(2), threeDigits: await left(500), fourDigits: await left(1200) };
      Structra.jsonTreeRenderer.highlightPath(jv, 'key698');
      await settle();
      // a highlighted, a bookmarked and a search match line must not move their text
      const line = jv.querySelector('.j-line[data-ln="700"]');
      const before = line.querySelector('.j-key').getBoundingClientRect().left;
      line.classList.add('highlighted');
      out.highlightShift = Math.round((line.querySelector('.j-key').getBoundingClientRect().left - before) * 10) / 10;
      line.classList.remove('highlighted');
      line.classList.add('bookmarked');
      out.bookmarkShift = Math.round((line.querySelector('.j-key').getBoundingClientRect().left - before) * 10) / 10;
      line.classList.remove('bookmarked');
      line.classList.add('search-match');
      out.matchShift = Math.round((line.querySelector('.j-key').getBoundingClientRect().left - before) * 10) / 10;
      line.classList.remove('search-match');
      return out;
    }, wrap);
    for (const wrap of [false, true]) {
      const m = await measure(wrap);
      const label = wrap ? 'with wrapping' : 'without wrapping';
      if (m.one === null || m.threeDigits === null || m.fourDigits === null) failures.push('lines 2, 500 and 1200 should all be in the page ' + label + ': ' + JSON.stringify(m));
      else if (m.one !== m.threeDigits || m.one !== m.fourDigits) failures.push('text should start at the same place on every line ' + label + ': ' + JSON.stringify(m));
      if (m.highlightShift !== 0 || m.bookmarkShift !== 0 || m.matchShift !== 0) failures.push('a highlighted, bookmarked or matching line must not move its text ' + label + ': ' + JSON.stringify(m));
    }
  } catch (err) {
    failures.push('crashed: ' + err.message.split(/\r?\n/).slice(0, 4).join(' / '));
  }

  if (errors.length) failures.push('page errors: ' + [...new Set(errors)].join(' | '));
  await browser.close();
  server.close();
  if (failures.length) { console.log('tree-margin smoke test: FAILED\n - ' + failures.join('\n - ')); process.exit(1); }
  console.log('tree-margin smoke test: ok');
})();
