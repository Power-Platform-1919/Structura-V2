/* The line numbers in the Tree: the margin is as wide as the biggest number in the file (like the Editor's), so the text
   starts at the same place on every line, and a highlighted or bookmarked line does not move its text.

   Run:  node tests/smoke/tree-margin.js          (PW_CHANNEL=msedge uses the installed Edge)
*/
const { runAppTest } = require('../app-test');

async function openJson(page, name, value) {
  await page.evaluate(() => Structra.setState('activeView', 'overview'));
  await page.locator('#canvasEmpty input[type=file], structra-input-panel input[type=file]').first().setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) });
  await page.waitForTimeout(1200);
  await page.evaluate(() => Structra.setState('activeView', 'tree'));
  await page.waitForSelector('.json-view .j-line', { timeout: 20000 });
  await page.waitForTimeout(300);
}

runAppTest('tree-margin', async ({ page, fail }) => {
  // A small file gets a narrow margin, a file of 1,500 lines a wider one
  await openJson(page, 'small.json', { a: 1, b: 2 });
  const small = await page.evaluate(() => document.querySelector('.json-view').style.getPropertyValue('--ln-digits'));
  if (small !== '2') fail('a 4 line file should size its margin for 2 digits, got "' + small + '"');

  const big = {};
  for (let i = 0; i < 1500; i++) big['key' + i] = i;
  await openJson(page, 'wide.json', big);
  const digits = await page.evaluate(() => document.querySelector('.json-view').style.getPropertyValue('--ln-digits'));
  if (digits !== '4') fail('a 1,502 line file should size its margin for 4 digits, got "' + digits + '"');

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
    if (m.one === null || m.threeDigits === null || m.fourDigits === null) fail('lines 2, 500 and 1200 should all be in the page ' + label + ': ' + JSON.stringify(m));
    else if (m.one !== m.threeDigits || m.one !== m.fourDigits) fail('text should start at the same place on every line ' + label + ': ' + JSON.stringify(m));
    if (m.highlightShift !== 0 || m.bookmarkShift !== 0 || m.matchShift !== 0) fail('a highlighted, bookmarked or matching line must not move its text ' + label + ': ' + JSON.stringify(m));
  }
}, { viewport: { width: 1360, height: 900 } });
