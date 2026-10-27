/* Waits for the things a test really needs, instead of sleeping a fixed time.

   A fixed sleep is both too long (when the app is quick) and too short (when the computer is busy): it makes a suite slow
   and it makes tests fail now and then. These helpers wait for what the app says: "the file is in" (engine:ingested) and "the
   loading indicator is gone".

   const { uploadAndWait, waitForIdle } = require('../page-helpers');
   await uploadAndWait(page, path.join(FIXTURES, 'sp_getitems.json'));       // pick a file, wait until it has been taken in
   await uploadAndWait(page, { name: 'a.json', mimeType: 'application/json', buffer: Buffer.from('{}') });
   await waitForIdle(page);                                                 // after a click: wait until the app has stopped loading */

const FILE_INPUT = '#canvasEmpty input[type=file]';

/** The app has stopped loading: no loading indicator, and two frames have been drawn since */
async function waitForIdle(page, { settleMs = 120, timeout = 60000 } = {}) {
  await page.waitForFunction(() => !document.querySelector('#loadingOverlay.show'), null, { timeout });
  await page.evaluate((ms) => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, ms)))), settleMs);
}

/**
 * Give the file input a file (a path, or { name, mimeType, buffer }) and wait until the app has taken it in.
 * It counts the engine:ingested events, so it works for the first file and for later ones in the same page.
 */
async function uploadAndWait(page, files, { selector = FILE_INPUT, settleMs = 200, noDataMs = 1500, timeout = 60000 } = {}) {
  await page.evaluate(() => {
    if (!window.__ingest) {
      window.__ingest = { count: 0, base: 0, startedAt: 0 };
      Structra.events.on('engine:ingested', () => { window.__ingest.count++; });
    }
    window.__ingest.base = window.__ingest.count;
    window.__ingest.startedAt = performance.now();
  });
  await page.locator(selector).first().setInputFiles(files);
  // Done when the file has been taken in. Some files are never taken in as data (a document that is just null, an empty file, text
  // that is not JSON: the app shows a message or an empty view instead), so when nothing arrives and the app is idle for noDataMs,
  // that is the answer too.
  await page.waitForFunction((quietMs) => {
    const ingest = window.__ingest;
    if (ingest.count > ingest.base) return true;
    return !document.querySelector('#loadingOverlay.show') && performance.now() - ingest.startedAt > quietMs;
  }, noDataMs, { timeout });
  await waitForIdle(page, { settleMs, timeout });
}

module.exports = { uploadAndWait, waitForIdle, FILE_INPUT };
