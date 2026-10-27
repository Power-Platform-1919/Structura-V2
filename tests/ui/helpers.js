/* Shared helpers for the UI audit scripts in tests/ui.

   These scripts LOOK at the app (colours, layout, positions, names, what a control does) and
   write what they find to .playwright-mcp/ui-audit/findings.json plus screenshots in the same folder.
   They report; they do not fail. Read the findings, then fix and add a real test in tests/smoke.

   Run one:   node tests/ui/02-layout.js          (PW_CHANNEL=msedge uses the installed Edge)
   Run all:   node tests/ui/run-all.js
*/
const http = require('http');
const { launchBrowser } = require('../launch-browser');
const fs = require('fs');
const path = require('path');

let chromium;
try { ({ chromium } = require('playwright')); } catch {
  console.error('Playwright is not installed. Run: npm install --save-dev playwright && npx playwright install chromium');
  process.exit(2);
}

const ROOT = path.join(__dirname, '..', '..');
const FIXTURES = path.join(ROOT, 'tests', 'fixtures');
const OUT = path.join(ROOT, '.playwright-mcp', 'ui-audit');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' };
const VIEWS = ['overview', 'tree', 'table', 'graph', 'schema', 'editor'];

fs.mkdirSync(OUT, { recursive: true });

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

/** A returning visitor (no welcome dialog), optionally with a theme chosen */
async function newPage(browser, { width = 1360, height = 800, theme, mode } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  await ctx.addInitScript(([t, m]) => {
    try {
      localStorage.setItem('structra.welcomeSeen', '1');
      if (t || m) localStorage.setItem('structra.theme', JSON.stringify({ mode: m || 'dark', light: 'structra-light', dark: t || 'structra-dark', custom: [] }));
    } catch { /* storage blocked */ }
  }, [theme, mode]);
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message.slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push('console: ' + m.text().slice(0, 200)); });
  return page;
}

async function open(page, base, fixture = 'sp_getitems.json') {
  await page.goto(base);
  await page.waitForSelector('#canvasEmpty input[type=file]', { state: 'attached', timeout: 10000 });
  await page.keyboard.press('Escape');
  await page.locator('#canvasEmpty input[type=file]').first().setInputFiles(path.join(FIXTURES, fixture));
  await page.waitForTimeout(1500);
}

/** Make the in-page audit functions available (window.__ui) */
async function inject(page) {
  if (!(await page.evaluate(() => !!window.__ui))) await page.addScriptTag({ path: path.join(__dirname, 'in-page.js') });
}

async function view(page, name) {
  await page.evaluate((v) => Structra.setState('activeView', v), name);
  await page.waitForTimeout(450);
}

async function shot(page, name) {
  const file = path.join(OUT, name.replace(/[^\w.-]+/g, '_') + '.png');
  await page.screenshot({ path: file });
  return file;
}

/** findings.json: every finding of every script, in script order (read from the findings-<script>.json files) */
function mergeFindings() {
  const all = [];
  for (const name of fs.readdirSync(OUT).filter((f) => /^findings-.*\.json$/.test(f)).sort()) {
    try { all.push(...JSON.parse(fs.readFileSync(path.join(OUT, name), 'utf8'))); } catch { /* a file being written: the next merge has it */ }
  }
  fs.writeFileSync(path.join(OUT, 'findings.json'), JSON.stringify(all, null, 2));
  return all;
}

/** Collects findings: { area, severity, what, where } */
function reporter(script) {
  const list = [];
  return {
    add(area, severity, what, where = '') { list.push({ script, area, severity, what, where }); },
    list,
    save() {
      // Each script writes its own file, so scripts that run at the same time cannot overwrite each other's findings.
      // findings.json is rebuilt from all of them (tests/ui/run-all.js does the same once every script has finished).
      fs.writeFileSync(path.join(OUT, 'findings-' + script + '.json'), JSON.stringify(list, null, 2));
      mergeFindings();
      console.log(`${script}: ${list.length} finding(s)`);
      for (const f of list) console.log(`  [${f.severity}] ${f.area}: ${f.what}${f.where ? '  @ ' + f.where : ''}`);
    },
  };
}

async function main(script, fn) {
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}/index.html`;
  const browser = await launchBrowser(chromium, { headless: !process.env.PW_HEADED, slowMo: process.env.PW_HEADED ? 250 : 0 });
  const rep = reporter(script);
  try { await fn({ browser, base, rep }); }
  catch (err) { rep.add('script', 'high', 'the audit script crashed: ' + err.message.slice(0, 200)); }
  rep.save();
  await browser.close();
  server.close();
}

module.exports = { ROOT, FIXTURES, OUT, VIEWS, newPage, open, view, shot, inject, main, mergeFindings };
