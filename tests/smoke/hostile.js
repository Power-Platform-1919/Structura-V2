/* Hostile and odd input: names, keys and values that are really markup, columns named like built-in properties, XML,
   every Filter tab and the palette commands. Nothing may run, throw or fail silently.

   Run:  node tests/smoke/hostile.js          (PW_CHANNEL=msedge uses the installed Edge)
*/
const { runAppTest } = require('../app-test');
const { loadText, closeExtraTabs } = require('../page-helpers');

runAppTest('hostile', async ({ page, fail, base, context }) => {
  const load = (name, text) => loadText(page, name, text);
  const closeAll = () => closeExtraTabs(page);
  const fresh = async () => {
    await page.goto(base);
    await page.waitForSelector('#canvasEmpty input[type=file]', { state: 'attached', timeout: 10000 });
    await page.keyboard.press('Escape');
    await page.evaluate(() => { window.__xss = []; });
  };


  await fresh();

  // ---- markup in names, keys and values never runs, in any view or dialog ----
  const mk = (n) => `<img src=x onerror="window.__xss.push('${n}')">`;
  const hostile = [{ id: 1, [mk('key')]: 'v', name: mk('value'), tags: [mk('array')], status: 'Open' }, { id: 2, name: mk('value2'), status: mk('status') }];
  await load(mk('tab') + '.json', JSON.stringify(hostile));
  for (const v of ['overview', 'tree', 'table', 'graph', 'schema', 'editor']) { await page.evaluate((x) => Structra.setState('activeView', x), v); await page.waitForTimeout(500); }
  await page.evaluate(() => { Structra.setState('activeView', 'table'); Structra.setState('filterBarOpen', true); Structra.setState('findBarOpen', true); });
  await page.waitForTimeout(400);
  for (const ev of ['pivot:open', 'nullfinder:open', 'charts:open', 'typedef:open', 'diff:open', 'settings:open', 'snippets:open', 'workspace:open']) {
    await page.evaluate((e) => Structra.events.emit(e), ev);
    await page.waitForTimeout(350);
    await page.evaluate(() => Structra.events.emit('overlay:close'));
  }
  const ran = await page.evaluate(() => window.__xss.slice());
  if (ran.length) fail('markup in a name, key or value ran as script: ' + ran.join(', '));

  // ---- markup that breaks out of an attribute, a title or a script block, in every place values and keys are shown ----
  // (the check is the page itself: nothing runs, and no element gets a handler, a script, a frame or a javascript: link from the data)
  await closeAll();
  const attr = (n) => `x" onmouseover="window.__xss.push('${n}')" data-y="`;
  const svg = (n) => `'><svg onload=window.__xss.push('${n}')>`;
  const script = (n) => `</script><script>window.__xss.push('${n}')</script>`;
  const jsLink = (n) => `javascript:window.__xss.push('${n}')`;
  const breakers = [
    { id: 1, [attr('key-attr')]: 'v', [svg('key-svg')]: 'v', name: attr('name-attr'), note: svg('note-svg'), code: script('code-script'), url: jsLink('url-js'), status: 'Open', amount: 5 },
    { id: 2, name: svg('name2'), note: script('note2'), url: jsLink('url-js2'), status: attr('status-attr'), amount: 7 },
  ];
  await load(attr('tab-attr') + '.json', JSON.stringify(breakers));
  await page.evaluate(() => { window.__xss = []; });
  for (const v of ['overview', 'tree', 'table', 'graph', 'schema', 'editor']) { await page.evaluate((x) => Structra.setState('activeView', x), v); await page.waitForTimeout(450); }
  // the Node panel and the path bar on a hostile key and value
  await page.evaluate(() => { Structra.setState('activeView', 'tree'); Structra.setState('contextPanelOpen', true); });
  await page.waitForTimeout(300);
  for (const target of ['$[0].name', '$[0].url', '$[1].status']) {
    await page.evaluate((p) => { Structra.setState('currentPath', p); Structra.events.emit('tree:node-selected', p); }, target);
    await page.waitForTimeout(250);
  }
  // the Query panel (JSONPath and SQL results), Find and Pivot
  await page.evaluate(() => Structra.setState('queryPanelOpen', true));
  await page.waitForTimeout(300);
  await page.evaluate(() => { const box = document.querySelector('#queryInput'); if (box) { box.value = '$[*].name'; box.dispatchEvent(new Event('input', { bubbles: true })); } });
  await page.waitForTimeout(400);
  const sqlButton = page.locator('.seg-btn[data-mode="sql"]');
  if (await sqlButton.count()) {
    await sqlButton.click();
    await page.waitForSelector('#sqlColumns .qp-sql-col', { state: 'attached', timeout: 60000 }).catch(() => {});
    await page.evaluate(() => { const host = document.querySelector('.qp-sql-host'); if (host && host.codeView) { host.codeView.setValue('SELECT * FROM data'); host.codeView.focus(); } });
    await page.keyboard.press('Control+Enter');
    await page.waitForTimeout(1500);
  }
  await page.evaluate(() => { Structra.setState('findBarOpen', true); });
  await page.waitForTimeout(200);
  await page.evaluate(() => { const input = document.querySelector('#findInput'); if (input) { input.value = 'onmouseover'; input.dispatchEvent(new Event('input', { bubbles: true })); } });
  await page.waitForTimeout(500);
  for (const ev of ['pivot:open', 'nullfinder:open', 'charts:open', 'typedef:open', 'diff:open', 'validate:open', 'snippets:open']) {
    await page.evaluate((e) => Structra.events.emit(e, e === 'typedef:open' ? { lang: 'typescript', name: 'Root' } : {}), ev);
    await page.waitForTimeout(350);
    if (ev === 'pivot:open') await page.evaluate(() => { const pivot = document.querySelector('structra-pivot'); pivot._rows = ['name']; pivot._runPivot(); });
    await page.waitForTimeout(250);
    await page.evaluate(() => Structra.events.emit('overlay:close'));
  }
  // the Power Platform expressions for a hostile path, and Compare of two hostile documents
  await page.evaluate(() => { Structra.setState('contextPanelOpen', true); Structra.setState('drawerState', 'half'); });
  await page.evaluate((p) => { Structra.setState('currentPath', p); Structra.events.emit('tree:node-selected', p); }, '$[0].name');
  await page.waitForTimeout(500);
  const injected = await page.evaluate(() => {
    const own = new Set([...document.querySelectorAll('script[src]')].map((element) => element));
    const found = [];
    for (const element of document.querySelectorAll('*')) {
      for (const attribute of element.attributes) {
        if (/^on/i.test(attribute.name)) found.push(`${element.tagName.toLowerCase()} has ${attribute.name}`);
        if (/^(href|src|action|formaction|xlink:href)$/i.test(attribute.name) && /^\s*(javascript|data:text\/html|vbscript):/i.test(attribute.value)) found.push(`${element.tagName.toLowerCase()} ${attribute.name}=${attribute.value.slice(0, 40)}`);
      }
      // (the page has one inline script of its own, in index.html, which is not about the data: only one that carries the payload counts)
      if (/^(iframe|object|embed)$/i.test(element.tagName)) found.push('a <' + element.tagName.toLowerCase() + '> exists');
      if (element.tagName.toLowerCase() === 'script' && !own.has(element) && !element.hasAttribute('src') && /__xss/.test(element.textContent)) found.push('an inline <script> carries the payload');
      if (element.tagName.toLowerCase() === 'svg' && element.hasAttribute('onload')) found.push('svg onload');
    }
    return [...new Set(found)].slice(0, 8);
  });
  if (injected.length) fail('data created a handler, script or link in the page: ' + injected.join(' | '));
  const ranAttr = await page.evaluate(() => window.__xss.slice());
  if (ranAttr.length) fail('markup that breaks out of an attribute or a script block ran: ' + ranAttr.join(', '));
  // moving the pointer over everything is what an onmouseover payload waits for
  for (const selector of ['structra-tree .j-line', 'structra-table td', '.cmd-item', 'structra-context *']) {
    const first = page.locator(selector).first();
    if (await first.count()) await first.hover({ timeout: 2000 }).catch(() => {});
  }
  const ranAfterHover = await page.evaluate(() => window.__xss.slice());
  if (ranAfterHover.length) fail('a payload ran when the pointer moved over it: ' + ranAfterHover.join(', '));
  await closeAll();

  // a share link carrying a hostile name
  const link = await page.evaluate(async () => (await Structra.shareLink.createUrl({ a: 1 }, '<img src=x onerror="window.__xss.push(\'share\')">')).url);
  await page.goto('about:blank');
  await page.goto(link);
  await page.waitForTimeout(2500);
  if ((await page.evaluate(() => (window.__xss || []).slice())).length) fail('a share link name ran as script');
  await fresh();

  // a workspace file with a hostile tab label
  await page.evaluate(() => Structra.events.emit('workspace:open'));
  await page.waitForTimeout(300);
  const ws = JSON.stringify({ type: 'structra-workspace', tabs: [{ label: '<img src=x onerror="window.__xss.push(\'ws\')">', data: { a: 1 } }] });
  await page.locator('#wsImportFile').setInputFiles({ name: 'w.structra', mimeType: 'application/json', buffer: Buffer.from(ws) });
  await page.locator('structra-workspace [data-action="import"]').click();
  await page.waitForTimeout(1500);
  if ((await page.evaluate(() => window.__xss.slice())).length) fail('a workspace tab label ran as script');

  // ---- columns named like built-in properties load and show ----
  await closeAll();
  for (const key of ['constructor', 'toString', 'valueOf', 'hasOwnProperty', 'length', 'name']) {
    await load('k-' + key, JSON.stringify([{ [key]: 1, id: 1 }, { [key]: 2, id: 2 }]));
    const ok = await page.evaluate((k) => Structra.state.jsonData && Structra.state.jsonData.length === 2 && Object.prototype.hasOwnProperty.call(Structra.state.jsonData[0], k), key);
    if (!ok) fail('a document with a column named ' + key + ' did not open');
    await page.evaluate(() => Structra.setState('activeView', 'table'));
    await page.waitForTimeout(400);
    await closeAll();
  }
  await load('proto.json', '{"__proto__": {"x": 1}, "a": 1}');
  if (!(await page.evaluate(() => !!Structra.state.jsonData))) fail('a document with a __proto__ key did not open');
  if (await page.evaluate(() => ({}).x !== undefined)) fail('a __proto__ key changed Object.prototype');

  // ---- XML opens ----
  await closeAll();
  await load('orders.xml', '<orders><order id="1"><customer>Ann</customer><total>10.5</total></order><order id="2"><customer>Bo</customer><total>7</total></order></orders>');
  const xml = await page.evaluate(() => JSON.stringify(Structra.state.jsonData || null).slice(0, 200));
  if (!/Ann/.test(xml) || !/orders/.test(xml)) fail('valid XML did not open: ' + xml);

  // ---- every Filter tab works ----
  await closeAll();
  await load('rows.json', JSON.stringify(Array.from({ length: 50 }, (_, i) => ({ id: i, v: i % 5, name: 'n' + i }))));
  await page.evaluate(() => { Structra.setState('activeView', 'table'); Structra.setState('filterBarOpen', true); });
  await page.waitForTimeout(400);
  const tryTab = async (label, text) => {
    await page.locator('structra-filter button', { hasText: new RegExp('^' + label + '$') }).first().click();
    await page.waitForTimeout(250);
    await page.locator('#filterExprInput').fill(text);
    await page.locator('structra-filter [data-action="apply"]').click();
    await page.waitForTimeout(700);
    return page.evaluate(() => ({ count: document.querySelector('#filterCount').textContent, toast: document.querySelector('structra-toast #toastMsg').textContent }));
  };
  let r = await tryTab('JSONPath', '$[?(@.v==2)]');
  if (r.count !== '10 rows match') fail('the JSONPath filter should find 10 rows: ' + JSON.stringify(r));
  r = await tryTab('Formula', 'row.v === 3 && row.id > 10');
  if (!/^\d+ rows? match$/.test(r.count) || r.count === '50 rows match') fail('the Expression filter did not filter: ' + JSON.stringify(r));
  r = await tryTab('Formula', 'row.v ===');
  if (!/could not be read/.test(r.toast)) fail('a broken expression should say it could not be read: ' + r.toast);
  await page.evaluate(() => Structra.setState('filterBarOpen', false));

  // ---- palette Find and Filter open their bars ----
  await page.evaluate(() => { Structra.setState('findBarOpen', false); Structra.setState('filterBarOpen', false); Structra.events.emit('command:run', 'find'); });
  await page.waitForTimeout(300);
  if (!(await page.evaluate(() => Structra.state.findBarOpen))) fail('the palette command Find in JSON did not open the Find bar');
  await page.evaluate(() => { Structra.setState('findBarOpen', false); Structra.events.emit('command:run', 'filter'); });
  await page.waitForTimeout(300);
  if (!(await page.evaluate(() => Structra.state.filterBarOpen))) fail('the palette command Filter Data did not open the Filter bar');

  // ---- CSV export writes rows for a list that is not at the top ----
  await closeAll();
  await load('orders.json', JSON.stringify({ orders: [{ id: 1, customer: 'Ann', status: { Value: 'Open' }, items: [{ sku: 'A' }] }, { id: 2, customer: 'Bo', status: { Value: 'Closed' }, items: [] }] }));
  const csv = await page.evaluate(() => Structra.dataEngine.exportData('csv'));
  const head = (csv || '').split('\n')[0];
  if (head !== 'id,customer,status.Value,items' || !/^1,Ann,Open,/.test((csv || '').split('\n')[1] || '')) fail('Export as CSV should write the rows of the list, got: ' + JSON.stringify((csv || '').slice(0, 120)));

  // ---- a binary file is refused, with a way forward ----
  await closeAll();
  await page.evaluate(() => Structra.events.emit('tabs:add'));
  await page.waitForTimeout(250);
  const before = await page.evaluate(() => Structra.state.fileName);
  await page.evaluate(() => document.querySelector('structra-input-panel')._loadText('PK\u0003\u0004\u0014\u0000\u0006\u0000binary', 'report.xlsx'));
  await page.waitForTimeout(500);
  const bin = await page.evaluate(() => ({ file: Structra.state.fileName, title: (document.querySelector('[data-role="error"] .io-error-title') || {}).textContent || '', detail: (document.querySelector('[data-role="error"] .io-error-detail') || {}).textContent || '' }));
  if (bin.file !== before || !/Excel/.test(bin.title) || !/CSV/.test(bin.detail)) fail('an Excel file should be refused with advice to save as CSV: ' + JSON.stringify(bin));

  // ---- Snippet Load opens a new tab and leaves the document alone ----
  await closeAll();
  await load('keep-me.json', '{"keep": true}');
  await page.evaluate(() => { localStorage.setItem('structra_snippets', JSON.stringify([{ name: 'snip', content: '{"from":"snippet"}', size: 18 }])); const s = document.querySelector('structra-snippets'); s._snippets = s._load(); s._renderList(); });
  const tabsBefore = await page.evaluate(() => Structra.tabs.list.length);
  await page.evaluate(() => document.querySelector('structra-snippets')._useSnippet(0));
  await page.waitForTimeout(900);
  const sn = await page.evaluate(() => ({ tabs: Structra.tabs.list.map((t) => t.label), file: Structra.state.fileName }));
  if (sn.tabs.length !== tabsBefore + 1 || !sn.tabs.includes('keep-me.json') || sn.file !== 'snip') fail('loading a snippet should open a new tab and keep the open document: ' + JSON.stringify(sn));
  await page.evaluate(() => { localStorage.setItem('structra_snippets', JSON.stringify('not-a-list')); const s = document.querySelector('structra-snippets'); s._snippets = s._load(); s._renderList(); });
  if (!(await page.evaluate(() => Array.isArray(document.querySelector('structra-snippets')._snippets)))) fail('a damaged saved snippet list should read as empty');
  await page.evaluate(() => localStorage.removeItem('structra_snippets'));

  // ---- a damaged workspace file is refused and writes nothing ----
  await page.evaluate(() => Structra.events.emit('workspace:open'));
  await page.waitForTimeout(300);
  const bad = JSON.stringify({ type: 'structra-workspace', tabs: 'oops', snippets: 'not-a-list' });
  await page.locator('#wsImportFile').setInputFiles({ name: 'bad.structra', mimeType: 'application/json', buffer: Buffer.from(bad) });
  await page.locator('structra-workspace [data-action="import"]').click();
  await page.waitForTimeout(800);
  const toast = await page.evaluate(() => document.querySelector('structra-toast #toastMsg').textContent);
  if (!/damaged/.test(toast)) fail('a workspace with tabs that are not a list should say it is damaged: ' + toast);
  if (await page.evaluate(() => localStorage.getItem('structra_snippets'))) fail('a damaged workspace wrote its snippets into saved data');

  // ---- large numbers keep every digit ----
  await closeAll();
  await load('ids.json', '{"id": 12345678901234567890, "small": 42, "money": 1.10, "ratio": 0.1000000000000000055, "huge": 1e400, "safe": 9007199254740991, "list": [9007199254740993], "text": "12345678901234567890"}');
  const num = await page.evaluate(() => Structra.state.jsonData);
  if (!num || num.id !== '12345678901234567890' || num.list[0] !== '9007199254740993' || num.huge !== '1e400' || num.ratio !== '0.1000000000000000055') fail('large numbers should be kept as text with every digit: ' + JSON.stringify(num));
  if (!num || num.small !== 42 || num.money !== 1.1 || num.safe !== 9007199254740991) fail('ordinary numbers should stay numbers: ' + JSON.stringify(num));
  const toastBig = await page.evaluate(() => document.querySelector('structra-toast #toastMsg').textContent);
  if (!/very large number/.test(toastBig)) fail('opening a file with large numbers should say they were kept as text: ' + toastBig);

  // ---- a message without a button shows no button ----
  await page.evaluate(() => Structra.toast('A plain message'));
  await page.waitForTimeout(300);
  if (await page.evaluate(() => { const b = document.querySelector('#toastAction'); return !b.hidden && b.offsetParent !== null; })) fail('a message that has no action should not show an action button');
});
