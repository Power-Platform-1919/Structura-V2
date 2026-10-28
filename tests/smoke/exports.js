/* Exports must produce files other programs can read:
   - XML is well-formed for every fixture (nulls, odd key names, lists inside lists)
   - the image export works in every view and in dark mode (the themes use CSS colour functions)

   Run:  node tests/smoke/exports.js          (PW_CHANNEL=msedge uses the installed Edge; images are drawn by modern-screenshot from this folder)
*/
const fs = require('fs');
const path = require('path');
const { runAppTest, ROOT } = require('../app-test');
const { uploadAndWait } = require('../page-helpers');

const FIXTURES = path.join(ROOT, 'tests', 'fixtures');

runAppTest('exports', async ({ page, fail, context, fixture }) => {
  // ---- XML: every fixture, plus a document made to be difficult ----
  const docs = fs.readdirSync(FIXTURES).filter((f) => f.endsWith('.json')).map((f) => ({ name: f, text: fs.readFileSync(path.join(FIXTURES, f), 'utf8') }));
  docs.push({ name: 'awkward keys', text: JSON.stringify({ '1st': 1, 'a b': [null, 1, { 'x/y': null, '': 'empty key' }], 'ü': 'ok', t: 'a & b < c "q"', c: 'tab\u0001ctrl' }) });
  const bad = await page.evaluate((list) => {
    const out = [];
    for (const d of list) {
      let json;
      try { json = JSON.parse(d.text); } catch { continue; }
      const xml = Structra.formatConversion.jsonToXml(json);
      const doc = new DOMParser().parseFromString(xml, 'application/xml');
      const err = doc.querySelector('parsererror');
      if (err) out.push(d.name + ': ' + err.textContent.split('\n')[0].slice(0, 120));
    }
    return out;
  }, docs);
  bad.forEach((b) => fail('XML is not well-formed for ' + b));

  // ---- Image export in every view, light and dark ----
  await uploadAndWait(page, path.join(FIXTURES, 'sp_getitems.json'));
  await page.evaluate(() => { window.__saved = []; const d = Structra.sharedHelpers.downloadFile; Structra.sharedHelpers.downloadFile = (blob, name) => { window.__saved.push({ name, size: blob.size, type: blob.type }); (window.__blobs = window.__blobs || []).push({ name, blob }); }; });
  // SHARD=0/2 or 1/2 (set by the parallel runner) takes only some of the modes, so the slow part is split across processes
  const [shard, shards] = (process.env.SHARD || '0/1').split('/').map(Number);
  for (const mode of ['light', 'dark'].filter((_, i) => i % shards === shard)) {
    await page.evaluate((m) => Structra.themeEngine && Structra.themeEngine.setMode ? Structra.themeEngine.setMode(m) : document.documentElement.setAttribute('data-theme', m), mode);
    for (const view of ['tree', 'table', 'graph', 'schema', 'overview']) {
      await page.evaluate((v) => Structra.setState('activeView', v), view);
      await page.waitForTimeout(500);
      const result = await page.evaluate(async (v) => {
        try {
          await Structra.imageCapture.png(document.querySelector('.view-panel.active'), 'test-' + v + '.png');
          return { ok: true };
        } catch (e) { return { error: e.message }; }
      }, view);
      if (result.error) fail(`image export failed in ${view} (${mode}): ${result.error}`);
    }
  }
  const saved = await page.evaluate(() => window.__saved);
  // an image that is only one colour is a blank page: every picture should hold several colours (text, borders, background)
  const colours = await page.evaluate(async () => {
    const out = [];
    for (const { name, blob } of window.__blobs || []) {
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement('canvas');
      canvas.width = 120; canvas.height = 80;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(bitmap, 0, 0, 120, 80);
      const data = context.getImageData(0, 0, 120, 80).data;
      const seen = new Set();
      for (let i = 0; i < data.length; i += 4) seen.add(data[i] + ',' + data[i + 1] + ',' + data[i + 2]);
      out.push({ name, type: blob.type, colours: seen.size });
    }
    return out;
  });
  for (const picture of colours) {
    if (picture.type !== 'image/png') fail('an exported image should be a PNG: ' + picture.name + ' is ' + picture.type);
    if (picture.colours < 4) fail('an exported image looks blank (' + picture.colours + ' colours): ' + picture.name);
  }
  if (saved.length && saved.some((s) => !(s.size > 2000))) fail('an exported image is empty or tiny: ' + saved.filter((s) => !(s.size > 2000)).map((s) => s.name).join(', '));
  // CSV export: a text cell a spreadsheet would run as a formula is protected, a real number is not, and a comma or quote survives
  await uploadAndWait(page, { name: 'csv.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify([{ name: '=HYPERLINK("http://x","y")', note: 'a, "b"', n: -5, tag: '@SUM(1)' }])) });
  const csv = await page.evaluate(() => Structra.dataEngine.exportData('csv'));
  const lines = String(csv).trim().split('\n');
  if (lines[0] !== 'name,note,n,tag') fail('CSV header should be name,note,n,tag: ' + lines[0]);
  if (!lines[1] || !lines[1].startsWith("\"'=HYPERLINK(\"\"http://x\"\",\"\"y\"\")\"")) fail('a formula in a cell should start with an apostrophe: ' + lines[1]);
  if (!lines[1] || !lines[1].endsWith(",-5,\"'@SUM(1)\"")) fail('-5 should stay a number and @SUM(1) should be protected: ' + lines[1]);
  if (!lines[1] || !lines[1].includes('"a, ""b"""')) fail('a comma and quotes should survive: ' + lines[1]);
}, { viewport: { width: 1360, height: 800 } });
