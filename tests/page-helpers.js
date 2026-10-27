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

/**
 * Let the page use the clipboard, and make it readable by the test. Chromium lets a test grant read and write. Firefox and
 * WebKit refuse those permissions and refuse to let a page read the clipboard back, so there the test records what the app copies
 * (through navigator.clipboard.writeText and through the copy command the app falls back to) and reads that record.
 *   await allowClipboard(context);          // right after making the context
 *   const text = await readClipboard(page); // what the app copied
 */
async function allowClipboard(context) {
  if (context.browser().browserType().name() === 'chromium') {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    return;
  }
  await context.addInitScript(() => {
    window.__clipboardSpy = { text: '' };
    if (navigator.clipboard) {
      const original = navigator.clipboard.writeText ? navigator.clipboard.writeText.bind(navigator.clipboard) : null;
      navigator.clipboard.writeText = async (text) => {
        window.__clipboardSpy.text = String(text);
        if (original) { try { await original(text); } catch { /* refused here: the record above is enough */ } }
      };
    }
    document.addEventListener('copy', () => {
      const box = document.activeElement;
      if (box && typeof box.value === 'string' && box.selectionEnd > box.selectionStart) window.__clipboardSpy.text = box.value.slice(box.selectionStart, box.selectionEnd);
    }, true);
  });
}

function readClipboard(page) {
  return page.evaluate(() => (window.__clipboardSpy ? window.__clipboardSpy.text : navigator.clipboard.readText()));
}

module.exports = { uploadAndWait, waitForIdle, allowClipboard, readClipboard, FILE_INPUT };
