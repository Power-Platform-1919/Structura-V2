/* The shared set-up of a browser test of the app. Write only what the test checks; this does the rest:
   a static server on a free port, the browser (shared with the runner, or its own), a context that starts as a returning visitor (no
   welcome dialog), a page that records page errors, the app opened and ready, the result line and the exit code.

     const { runAppTest } = require('../app-test');
     runAppTest('popup', async ({ page, fail, fixture }) => {
       await page.locator('.doc-tab').first().click({ button: 'right' });
       if (!(await page.locator('.menu').count())) fail('the menu should open');
     });

   The test function gets one object:
     page, context, browser   the page the app is open in, its context, and the browser
     base                     the address of index.html
     origin                   the address of the server (http://127.0.0.1:port), for a test that opens other files
     fail(message)            record a failure (the test goes on, the result lists every failure)
     errors                   the page errors recorded so far
     fixture(name)            the path of a file in tests/fixtures
     newContext(options)      another context of the same kind (returning visitor), for a test that needs two pages or other options
     openApp(page)            go to the app in another page and wait until it can take a file
     ROOT                     the folder of the repository

   Options (second argument, optional):
     viewport      { width, height }, default 1360 x 900
     open          false: do not open the app (a test that measures the load itself, or opens it another way)
     ignoreErrors  a pattern: page errors that match it are not failures (/./ for a test that throws errors on purpose and reads `errors` itself)
     contextOptions  more options for the context (a colour scheme, a locale)
     clipboard     true: the page may read and write the clipboard (Chromium needs the permission; the other engines use a spy), see page-helpers allowClipboard
     firstVisit    true: start as a person who has never been here, so the welcome dialog opens (the test closes it); the app is opened but Escape is not pressed

   Run a test on its own:  node tests/smoke/<name>.js        (PW_CHANNEL=msedge uses the installed Edge; PW_BROWSER=firefox or webkit)
   The runner (tests/run-smoke.js) finds the file by its place in tests/smoke and reads the exit code. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { launchBrowser } = require('./launch-browser');
const { allowClipboard } = require('./page-helpers');

const ROOT = path.join(__dirname, '..');
const FIXTURES = path.join(ROOT, 'tests', 'fixtures');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.png': 'image/png' };

/** A static server for the repository (index.html is the page), on a free port. Nothing is cached, so a test always reads the files as they are. */
function startAppServer() {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const file = path.join(ROOT, url === '/' ? 'index.html' : url);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function loadPlaywright() {
  try { return require('playwright'); } catch {
    console.error('Playwright is not installed. Run: npm install --save-dev playwright && npx playwright install chromium');
    process.exit(2);
  }
}

/** A context that starts as a returning visitor: the first-run welcome dialog opens a moment after load and would cover the page */
async function newAppContext(browser, options = {}, returning = true) {
  const context = await browser.newContext({ viewport: { width: 1360, height: 900 }, ...options });
  if (returning) await context.addInitScript(() => { try { localStorage.setItem('structra.welcomeSeen', '1'); } catch { /* storage blocked */ } });
  return context;
}

async function runAppTest(name, body, options = {}) {
  const { chromium } = loadPlaywright();
  const server = await startAppServer();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const base = origin + '/index.html';
  const browser = await launchBrowser(chromium);
  const failures = [];
  const errors = [];
  const fail = (message) => failures.push(message);
  const context = await newAppContext(browser, { ...(options.viewport ? { viewport: options.viewport } : {}), ...(options.contextOptions || {}) }, !options.firstVisit);
  if (options.clipboard) await allowClipboard(context);
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message.slice(0, 160)));
  const openApp = async (target) => {
    await target.goto(base);
    await target.waitForSelector('#canvasEmpty input[type=file]', { state: 'attached', timeout: 20000 });
    if (!options.firstVisit) await target.keyboard.press('Escape');      // closes anything the start opened
  };

  try {
    if (options.open !== false) await openApp(page);
    await body({
      page, context, browser, base, origin, fail, errors, ROOT, openApp,
      fixture: (file) => path.join(FIXTURES, file),
      newContext: (extra) => newAppContext(browser, { ...(options.viewport ? { viewport: options.viewport } : {}), ...extra }),
    });
  } catch (error) {
    fail('crashed: ' + String(error && error.message || error).split('\n')[0]);
  }

  const real = [...new Set(errors)].filter((message) => !(options.ignoreErrors && options.ignoreErrors.test(message)));
  if (real.length) fail('page errors: ' + real.join(' | '));
  await browser.close().catch(() => {});
  server.close();
  if (failures.length) { console.log(`${name} smoke test: FAILED\n - ` + failures.join('\n - ')); process.exit(1); }
  console.log(`${name} smoke test: ok`);
}

module.exports = { runAppTest, startAppServer, newAppContext, loadPlaywright, ROOT, FIXTURES, TYPES };
