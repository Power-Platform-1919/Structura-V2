/* How a test gets its browser.

   Starting a browser takes about a second, and the runner starts about 30 tests. So tests/run-smoke.js starts a few browsers
   once, tells each test where its browser is (PW_SHARED_WS), and the next test in that slot reuses it. A test written like
   this works the same way on its own:

     const { launchBrowser } = require('../launch-browser');
     const browser = await launchBrowser(chromium);
     ...
     await browser.close();      // a shared browser: only the test's own pages and contexts close, the browser stays

   A test never touches another test's pages: each test makes its own context, which has its own storage and cookies.
   Run on its own (no PW_SHARED_WS), or with PW_HEADED=1 to watch it, a test starts its own browser as before.

   launchBrowser(chromium, extra)   extra: launch options that only matter for a browser of its own (for example slowMo) */
const { spawn } = require('child_process');

/**
 * Every page a test opens gets a longer wait for a page to load (90 seconds, PW_NAV_TIMEOUT_MS changes it). The default 30 seconds
 * is fine on a quiet computer, but when eight browsers start at once on a busy one the first page load can take longer, and the
 * test then fails for a reason that has nothing to do with the app.
 */
function patientBrowser(browser) {
  const milliseconds = Number(process.env.PW_NAV_TIMEOUT_MS || 90000);
  const makeContext = browser.newContext.bind(browser);
  browser.newContext = async (...args) => {
    const context = await makeContext(...args);
    context.setDefaultNavigationTimeout(milliseconds);
    return context;
  };
  return browser;
}

async function launchBrowser(chromium, extra = {}) {
  return patientBrowser(await startBrowser(chromium, extra));
}

async function startBrowser(chromium, extra) {
  // PW_BROWSER=firefox or webkit runs the same test in that engine (Safari uses WebKit). Those start their own browser.
  const engine = process.env.PW_BROWSER && process.env.PW_BROWSER !== 'chromium' ? require('playwright')[process.env.PW_BROWSER] : null;
  if (engine) return engine.launch(extra);
  const shared = process.env.PW_SHARED_WS;
  if (shared && !process.env.PW_HEADED) {
    try { return await chromium.connect(shared); } catch { /* the shared browser is gone: start one for this test */ }
  }
  return chromium.launch({ ...(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}), ...extra });
}

/**
 * Stop a browser that a runner started with chromium.launchServer(), and every process it started. Closing it politely takes up
 * to half a minute when a test left pages open (server.kill() waits about 13 seconds for it to go), and nothing in it needs saving.
 * Not waiting at all is not an option: the runner exits right after, and a kill that is still on its way is cut off, which left
 * the browsers running (8 per run, using about 3 GB, slowing the next run). So the whole process tree is ended at once and the
 * runner waits for that, which takes a fraction of a second.
 */
function closeSharedBrowser(server) {
  if (!server) return Promise.resolve();
  const pid = server.process().pid;
  return new Promise((resolve) => {
    const fallback = () => { server.kill().catch(() => { /* it had already gone */ }); resolve(); };
    if (process.platform === 'win32') {
      const killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
      killer.on('error', fallback);
      killer.on('close', () => resolve());
      return;
    }
    try { process.kill(-pid, 'SIGKILL'); resolve(); } catch { fallback(); }
  });
}

module.exports = { launchBrowser, closeSharedBrowser };
