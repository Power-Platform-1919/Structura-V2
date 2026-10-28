/* Errors nobody caught must not vanish and must not leak the document. This test throws on purpose in three places (a timer in the page,
   a promise, a worker) while a document with a secret value is open, and checks that:
     - each error is recorded and one short message with a "Copy a bug report" button is shown (not three),
     - the bug report names the problems but holds none of the document (no value, no key, no file name),
     - the command palette has "Copy a bug report".

   Run:  node tests/smoke/errors.js          (PW_CHANNEL=msedge uses the installed Edge; PW_BROWSER=firefox or webkit) */
const { runAppTest } = require('../app-test');
const { uploadAndWait } = require('../page-helpers');

const SECRET_VALUE = 'TOPSECRET-VALUE-4711';
const SECRET_KEY = 'secretKeyName';

runAppTest('errors', async ({ page, fail, errors }) => {
  await uploadAndWait(page, { name: 'private-customers.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify([{ [SECRET_KEY]: SECRET_VALUE }])) });

  await page.evaluate(({ value }) => {
    // 1. an error in a timer, the way a bug in a component would surface
    setTimeout(() => { throw new Error('boom in a timer "' + value + '"'); }, 0);
    // 2. a promise nobody waits for
    Promise.reject(new Error('boom in a promise'));
    // 3. a worker that throws
    const worker = new Worker(URL.createObjectURL(new Blob(['throw new Error("boom in a worker");'], { type: 'text/javascript' })));
    worker.onerror = null;
  }, { value: SECRET_VALUE });

  const recorded = await page.waitForFunction(() => Structra.errorReporter.list().length >= 3, null, { timeout: 8000 }).then(() => true, () => false);
  const list = await page.evaluate(() => Structra.errorReporter.list().map((entry) => entry.kind + ': ' + entry.message));
  if (!recorded) fail('three errors should be recorded, got ' + JSON.stringify(list));
  for (const wanted of ['boom in a timer', 'boom in a promise', 'boom in a worker']) {
    if (!list.some((line) => line.includes(wanted))) fail(`no record for "${wanted}": ${JSON.stringify(list)}`);
  }

  // One short message with a button, not one per error
  const toast = await page.evaluate(() => { const element = document.querySelector('structra-toast'); return element ? { text: element.textContent.replace(/\s+/g, ' ').trim(), action: (element.querySelector('#toastAction') || {}).textContent || '' } : null; });
  if (!toast || !/Something went wrong/.test(toast.text)) fail('a short "Something went wrong" message should be shown: ' + JSON.stringify(toast));
  if (toast && !/bug report/i.test(toast.action)) fail('the message should offer "Copy a bug report": ' + JSON.stringify(toast));

  // The report names the problems and holds none of the document
  const report = await page.evaluate(() => Structra.errorReporter.buildReport());
  for (const wanted of ['Version:', 'Browser:', 'boom in a promise', 'boom in a worker']) if (!report.includes(wanted)) fail(`the bug report should contain "${wanted}"`);
  for (const secret of [SECRET_VALUE, SECRET_KEY, 'private-customers']) if (report.includes(secret)) fail(`the bug report must not contain "${secret}"`);

  // The palette offers it
  const inPalette = await page.evaluate(() => [...document.querySelectorAll('structra-command')].length > 0 && !!Structra.errorReporter.copyReport);
  if (!inPalette) fail('the command palette and copyReport should exist');
  await page.evaluate(() => Structra.events.emit('command-palette:toggle'));
  await page.waitForSelector('structra-command input', { timeout: 5000 }).catch(() => {});
  await page.keyboard.type('bug report');
  const shown = await page.waitForFunction(() => /Copy a bug report/.test(document.querySelector('structra-command').textContent), null, { timeout: 4000 }).then(() => true, () => false);
  if (!shown) fail('the palette should list "Copy a bug report"');
}, { viewport: { width: 1360, height: 900 }, ignoreErrors: /./ });      // this test throws page errors on purpose and checks them itself
