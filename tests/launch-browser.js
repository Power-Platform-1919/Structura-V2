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
async function launchBrowser(chromium, extra = {}) {
  const shared = process.env.PW_SHARED_WS;
  if (shared && !process.env.PW_HEADED) {
    try { return await chromium.connect(shared); } catch { /* the shared browser is gone: start one for this test */ }
  }
  return chromium.launch({ ...(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}), ...extra });
}

/**
 * Stop a browser that a runner started with chromium.launchServer(). Closing it politely takes up to half a minute when a test
 * left pages open, and nothing in it needs saving, so it is killed and the runner does not wait for it to finish dying.
 * (Playwright also kills every browser it started when the runner exits, so none is left behind.)
 */
function closeSharedBrowser(server) {
  if (!server) return Promise.resolve();
  server.kill().catch(() => { /* it had already gone */ });
  return Promise.resolve();
}

module.exports = { launchBrowser, closeSharedBrowser };
