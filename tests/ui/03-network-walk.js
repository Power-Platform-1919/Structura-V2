/* Walk through the app the way a person does (rail, view tabs, toolbar, dialogs, palette) and watch the network.

   Findings: any request that leaves this computer (the app is meant to be local only), failed or 404 requests,
   requests made on load that are not needed, console errors, and clicks that change nothing.
   Run visibly:  PW_HEADED=1 PW_CHANNEL=msedge node tests/ui/03-network-walk.js
*/
const { newPage, open, view, shot, inject, main } = require('./helpers');

main('03-network-walk', async ({ browser, base, rep }) => {
  const page = await newPage(browser);
  const origin = new URL(base).origin;
  let step = 'load';
  const log = [];
  page.on('request', (r) => log.push({ step, url: r.url(), method: r.method(), type: r.resourceType() }));
  page.on('requestfailed', (r) => rep.add('network', 'medium', `request failed: ${r.url().slice(0, 100)} (${r.failure() && r.failure().errorText})`, step));
  page.on('response', (r) => { if (r.status() >= 400) rep.add('network', 'medium', `${r.status()} for ${r.url().slice(0, 100)}`, step); });

  await open(page, base);
  await inject(page);
  const stepTo = (s) => { step = s; };

  // 1. Everything loaded so far must come from this origin (data: and blob: are local)
  const external = () => log.filter((l) => !l.url.startsWith(origin) && !/^(data|blob):/.test(l.url));
  for (const l of external()) rep.add('privacy', 'high', `a request leaves this computer: ${l.method} ${l.url.slice(0, 100)}`, l.step);
  const onLoad = log.length;
  console.log(`load: ${onLoad} requests, ${external().length} external`);

  // 2. Click every view tab and rail button, noting new requests and whether anything changed
  const changed = async (fn) => {
    const before = await page.evaluate(() => document.body.innerText.length + '|' + Structra.state.activeView + '|' + document.querySelectorAll('.ov.show, .io-overlay.show').length + '|' + Structra.state.drawerState + '|' + ((document.querySelector('.drawer-tabs .tab.active') || {}).dataset || {}).tab + '|' + Structra.state.queryPanelOpen);
    await fn();
    await page.waitForTimeout(500);
    const after = await page.evaluate(() => document.body.innerText.length + '|' + Structra.state.activeView + '|' + document.querySelectorAll('.ov.show, .io-overlay.show').length + '|' + Structra.state.drawerState + '|' + ((document.querySelector('.drawer-tabs .tab.active') || {}).dataset || {}).tab + '|' + Structra.state.queryPanelOpen);
    return before !== after;
  };
  for (const v of ['Overview', 'Tree', 'Table', 'Graph', 'Schema', 'Editor']) {
    stepTo('view ' + v);
    const n = log.length;
    await page.locator('.view-tab', { hasText: new RegExp('^' + v + '$') }).click();
    await page.waitForTimeout(600);
    await shot(page, 'walk-view-' + v);
    if (log.length > n) rep.add('network', 'low', `opening ${v} made ${log.length - n} request(s): ${log.slice(n).map((l) => l.url.split('/').pop()).join(', ')}`, v);
  }
  for (const rail of ['explorer', 'query', 'transform', 'power', 'overview', 'settings']) {
    stepTo('rail ' + rail);
    const btn = page.locator(`[data-rail="${rail}"]`);
    if (!(await btn.count())) { rep.add('rail', 'low', `rail button "${rail}" not found`, 'structra-rail'); continue; }
    const did = await changed(() => btn.click());
    await shot(page, 'walk-rail-' + rail);
    if (!did) rep.add('relevance', 'medium', `the rail button "${rail}" changed nothing visible`, 'structra-rail');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  }

  // 3. Every enabled toolbar button in the canvas header: does it do something?
  await view(page, 'tree');
  const actions = await page.evaluate(() => [...document.querySelectorAll('structra-canvas-header .toolbar-btn[data-action]')].filter((b) => b.offsetParent && !b.disabled).map((b) => b.dataset.action));
  for (const a of actions) {
    stepTo('toolbar ' + a);
    const n = log.length;
    const did = await changed(() => page.locator(`structra-canvas-header [data-action="${a}"]`).first().click());
    if (!did && !['wrap', 'copy-json', 'depth-1', 'depth-2', 'depth-3', 'expand-all', 'collapse-all'].includes(a)) rep.add('relevance', 'low', `toolbar "${a}" changed nothing visible`, 'structra-canvas-header');
    if (log.length > n) rep.add('network', 'low', `toolbar "${a}" made requests: ${log.slice(n).map((l) => l.url.split('/').pop()).join(', ')}`, a);
    await page.keyboard.press('Escape');
  }
  await shot(page, 'walk-toolbar-done');

  // 4. Palette: run each command that opens something, watching for errors and requests
  stepTo('palette');
  const cmds = await page.evaluate(() => [...document.querySelectorAll('#cmdList .cmd-item')].map((i) => i.dataset.cmd));
  console.log('palette commands:', cmds.length);
  const safe = (c) => !/delete|clear|reset|close|undo|redo|download|export|save|share|image|replace|apply/i.test(c);
  for (const c of cmds.filter(safe)) {
    stepTo('command ' + c);
    const n = log.length;
    const errs = page.errors.length;
    await page.evaluate((id) => Structra.events.emit('command:run', id), c);
    await page.waitForTimeout(500);
    if (page.errors.length > errs) rep.add('errors', 'high', `command "${c}" raised: ${page.errors.slice(errs).join(' | ')}`, c);
    const ext = external().filter((l) => l.step === 'command ' + c);
    for (const l of ext) rep.add('privacy', 'high', `command "${c}" contacted ${l.url.slice(0, 100)}`, c);
    for (let i = 0; i < 3; i++) await page.keyboard.press('Escape');
    await page.evaluate(() => { Structra.set('findBarOpen', false); Structra.set('filterBarOpen', false); Structra.set('queryPanelOpen', false); });
    await page.waitForTimeout(150);
  }
  await view(page, 'tree');

  console.log('requests by type:', JSON.stringify(log.reduce((a, l) => { a[l.type] = (a[l.type] || 0) + 1; return a; }, {})));
  console.log('external requests:', external().length);
  for (const e of page.errors) rep.add('errors', 'high', 'page error: ' + e, 'walk');
  await page.context().close();
});
