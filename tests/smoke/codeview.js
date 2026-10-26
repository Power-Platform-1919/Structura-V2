/* The shared code boxes (Structra.codeView): colours for every language the app shows, read-only code that keeps its
   text, folding in the JSON editor, and the settings for large text.

   Run:  node tests/smoke/codeview.js          (PW_CHANNEL=msedge uses the installed Edge)
*/
const http = require('http');
const fs = require('fs');
const path = require('path');

let chromium;
try { ({ chromium } = require('playwright')); } catch {
  console.error('Playwright is not installed. Run: npm install --save-dev playwright && npx playwright install chromium');
  process.exit(2);
}

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

(async () => {
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}/index.html`;
  const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
  const page = await (await newCtx(browser, { viewport: { width: 1360, height: 900 } })).newPage();
  const failures = [];
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));

  try {
    await page.goto(base);
    await page.waitForSelector('#canvasEmpty input[type=file]', { state: 'attached', timeout: 10000 });
    await page.keyboard.press('Escape');
    const rows = [
      { id: 1, name: 'Ann', amount: 120.5, active: true, tags: ['a', 'b'] },
      { id: 2, name: 'Bo', amount: 80, active: false, tags: [] },
    ];
    await page.locator('#canvasEmpty input[type=file]').first().setInputFiles({ name: 'rows.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(rows)) });
    await page.waitForTimeout(1200);

    // ---- Generated code is coloured in every language, and still copies as the same text ----
    for (const lang of ['typescript', 'python', 'csharp', 'go', 'rust', 'java', 'powerfx', 'sql']) {
      await page.evaluate((l) => Structra.events.emit('typedef:open', { lang: l, name: 'Root' }), lang);
      await page.waitForFunction(() => document.querySelector('#typedefCode span[class^="tok-"]'), null, { timeout: 15000 }).catch(() => {});
      const r = await page.evaluate(() => {
        const el = document.querySelector('#typedefCode');
        const kinds = new Set([...el.querySelectorAll('span[class^="tok-"]')].map((s) => s.className));
        return { kinds: kinds.size, same: el.textContent === document.querySelector('structra-typedef')._code, len: el.textContent.length };
      });
      if (!r.len) failures.push(lang + ': no code was generated');
      else if (!r.same) failures.push(lang + ': the coloured text is not the same as the generated code');
      else if (r.kinds < 2) failures.push(lang + ': the code should have at least two kinds of colour, it has ' + r.kinds);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(100);
    }
    // Power Fx is a small mode written for this app: its functions are coloured
    const fx = await page.evaluate(async () => {
      const el = document.createElement('pre');
      document.body.appendChild(el);
      await Structra.codeView.colorize(el, 'ForAll(Items, Patch(Data, ThisRecord, { Name: "x", N: 1 })) // note', 'powerfx');
      const get = (c) => [...el.querySelectorAll('.' + c)].map((s) => s.textContent);
      const out = { builtin: get('tok-function'), keyword: get('tok-keyword'), string: get('tok-string'), number: get('tok-number'), comment: get('tok-comment') };
      el.remove();
      return out;
    });
    if (!fx.builtin.includes('ForAll') || !fx.builtin.includes('Patch')) failures.push('Power Fx functions should be coloured: ' + JSON.stringify(fx));
    if (!fx.string.includes('"x"') || !fx.number.includes('1') || !fx.comment.some((c) => c.includes('note'))) failures.push('Power Fx text, numbers and comments should be coloured: ' + JSON.stringify(fx));

    // ---- Every other language the app shows ----
    const langs = await page.evaluate(async () => {
      const samples = {
        xml: ['<root id="1"><item>text</item></root>', ['tok-keyword', 'tok-string']],
        yaml: ['name: Ann\nitems:\n  - 1\n  - true', ['tok-property', 'tok-punct']],
        toml: ['[server]\nport = 8080\nname = "x"', ['tok-number', 'tok-string']],
        powerautomate: ["concat('a', items('Apply_to_each')?['name'], 5)", ['tok-function', 'tok-string', 'tok-number']],
        python: ['def f(x):\n    return "a" + str(1)', ['tok-keyword', 'tok-string', 'tok-number']],
        csharp: ['public class A { int n = 5; string s = "x"; }', ['tok-keyword', 'tok-number', 'tok-string']],
        go: ['func main() { x := "a"; y := 1 }', ['tok-keyword', 'tok-string', 'tok-number']],
        rust: ['fn main() { let x = "a"; let y = 1; }', ['tok-keyword', 'tok-string', 'tok-number']],
        java: ['public class A { int n = 5; String s = "x"; }', ['tok-keyword', 'tok-number', 'tok-string']],
        typescript: ['const x: number = 1; // note', ['tok-keyword', 'tok-number', 'tok-comment']],
        json: ['{"a": [1, true, null, "x"]}', ['tok-property', 'tok-number', 'tok-bool', 'tok-null', 'tok-string']],
      };
      const out = {};
      for (const [mode, [text, want]] of Object.entries(samples)) {
        const el = document.createElement('pre');
        document.body.appendChild(el);
        await Structra.codeView.colorize(el, text, mode);
        out[mode] = want.filter((c) => !el.querySelector('.' + c));
        el.remove();
      }
      return out;
    });
    for (const [mode, missing] of Object.entries(langs)) if (missing.length) failures.push(mode + ' text should have these colours: ' + missing.join(', '));

    // ---- Schema and flow action snippets are coloured ----
    await page.evaluate(() => Structra.events.emit('drawer:show', 'schema-gen'));
    await page.waitForTimeout(800);
    const sg = await page.evaluate(() => { const o = document.querySelector('#sgOutput'); return { len: o ? o.textContent.length : 0, coloured: o ? o.querySelectorAll('span[class^="tok-"]').length : 0 }; });
    if (!sg.len || !sg.coloured) failures.push('the Parse JSON schema should be coloured: ' + JSON.stringify(sg));

    // ---- The Node panel colours the value that is selected ----
    await page.evaluate(() => Structra.events.emit('tree:node-selected', '$[0]'));
    await page.waitForTimeout(500);
    const node = await page.evaluate(() => { const v = document.querySelector('#ctxValue'); return { coloured: v.querySelectorAll('span[class^="tok-"]').length, text: v.textContent.length }; });
    if (!node.text || !node.coloured) failures.push('the Node panel should show the selected object in colour: ' + JSON.stringify(node));
    // The preview of a big value is cut short without turning the whole value into text first
    const preview = await page.evaluate(() => { const c = document.querySelector('structra-context'); const big = Array.from({ length: 2000000 }, (_, i) => ({ id: i })); const t0 = performance.now(); const text = c._previewJson(big); return { ms: Math.round(performance.now() - t0), len: text.length, more: /more/.test(text) }; });
    if (preview.ms > 200 || preview.len > 700 || !preview.more) failures.push('the preview of a huge list should be short and quick: ' + JSON.stringify(preview));

    // ---- The JSON editor: folding, error marking ----
    await page.evaluate(() => Structra.set('activeView', 'editor'));
    await page.waitForSelector('structra-editor .cm-editor', { timeout: 20000 });
    await page.waitForTimeout(500);
    const ed = await page.evaluate(() => {
      const box = document.querySelector('structra-editor .cv').codeView;
      return { lines: box.lineCount(), markers: document.querySelectorAll('structra-editor .cm-foldGutter .cm-gutterElement span').length };
    });
    if (ed.markers < 1) failures.push('a small JSON document should have fold markers: ' + JSON.stringify(ed));
    const keys = await page.evaluate(() => [...document.querySelectorAll('structra-editor .tok-property')].length);
    if (!keys) failures.push('JSON keys should be coloured as keys');
    // The fold arrow in the margin hides the block, as a person would click it
    await page.locator('structra-editor .cm-foldGutter .cm-gutterElement span').nth(1).click();
    await page.waitForTimeout(300);
    const folded = await page.evaluate(() => ({ placeholder: !!document.querySelector('structra-editor .cm-foldPlaceholder'), lines: document.querySelectorAll('structra-editor .cm-line').length }));
    if (!folded.placeholder) failures.push('clicking the fold arrow should fold the block: ' + JSON.stringify(folded));

    // ---- Large text: folding is left off, and the editor still works ----
    const big = await page.evaluate(async () => {
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:0;top:0;width:600px;height:300px;z-index:99999';       // a definite height: only the visible lines are drawn
      document.body.appendChild(host);
      const lines = [];
      for (let i = 0; i < 250000; i++) lines.push('  "key' + i + '": ' + i + ',');
      const text = '{\n' + lines.join('\n') + '\n  "end": 0\n}';
      const box = await Structra.codeView.create(host, { mode: 'json', value: text, label: 'big' });
      const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      await frame();
      box.setCursor(100000, 0);
      await frame();
      const t0 = performance.now();
      box.view.dispatch(box.view.state.replaceSelection('x'));
      await frame();
      const typed = performance.now() - t0;
      const out = { big: box.big, fold: !!host.querySelector('.cm-foldGutter'), lines: box.lineCount(), typedMs: Math.round(typed), megabytes: +(text.length / 1048576).toFixed(1) };
      box.destroy();
      host.remove();
      return out;
    });
    if (!big.big || big.fold) failures.push('a large text should open with folding off: ' + JSON.stringify(big));
    if (big.typedMs > 500) failures.push('typing in a large text should stay quick, it took ' + big.typedMs + ' ms');
  } catch (e) {
    failures.push('crashed: ' + e.message.split(/\r?\n/).slice(0, 4).join(' / '));
  }

  if (errors.length) failures.push('page errors: ' + [...new Set(errors)].join(' | '));
  await browser.close();
  server.close();
  if (failures.length) { console.log('codeview smoke test: FAILED\n - ' + failures.join('\n - ')); process.exit(1); }
  console.log('codeview smoke test: ok');
})();
