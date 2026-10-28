/* Awkward situations a real person runs into: JSON Lines and semicolon CSV, a Flatten that would lose data, Undo and the
   changed mark, Mask, Editor text that is not applied yet, tab names, Escape, stale panel results, several files at once,
   huge share links and a browser that blocks saving. Nothing may throw, lose work or fail silently.

   Run:  node tests/smoke/robust.js          (PW_CHANNEL=msedge uses the installed Edge)
*/
const { runAppTest } = require('../app-test');
const { loadText, closeExtraTabs } = require('../page-helpers');

runAppTest('robust', async ({ page, fail }) => {
  const load = (name, text) => loadText(page, name, text);
  const closeAll = () => closeExtraTabs(page);
  const toastText = () => page.evaluate(() => document.querySelector('structra-toast #toastMsg').textContent);



  // ---- formats: JSON Lines and semicolon CSV open as lists ----
  await load('events.ndjson', '{"id":1,"v":"a"}\n{"id":2,"v":"b"}\n{"id":3,"v":"c"}\n');
  let doc = await page.evaluate(() => Structra.state.jsonData);
  if (!Array.isArray(doc) || doc.length !== 3 || doc[2].v !== 'c') fail('JSON Lines should open as a list of 3: ' + JSON.stringify(doc));
  await closeAll();
  await load('export.csv', 'Region;Rep;Units\nNorth;Ann;10\nSouth;Bo;5\n');
  doc = await page.evaluate(() => Structra.state.jsonData);
  if (!Array.isArray(doc) || doc.length !== 2 || doc[0].Units !== 10) fail('semicolon CSV should open as rows: ' + JSON.stringify(doc));
  await page.evaluate(() => document.querySelector('structra-input-panel')._loadText('{"a":1}\n{"a": oops}\n', 'bad.ndjson'));
  await page.waitForTimeout(400);
  const lineErr = await page.evaluate(() => (document.querySelector('[data-role="error"] .io-error-detail') || {}).textContent || '');
  if (!/line 2/.test(lineErr)) fail('a bad line in JSON Lines should be named: ' + lineErr);

  // ---- undo returns the tab to unchanged; flatten never loses data ----
  await closeAll();
  await load('flat.json', JSON.stringify({ 'a.b': 1, a: { b: 2 }, z: 1, y: 2 }));
  await page.evaluate(() => Structra.events.emit('command:run', 'flatten'));
  await page.waitForTimeout(500);
  // The key "a.b" and the path a then b used to give the same name and Flatten refused. Each is now written as its own path (["a.b"] and a.b),
  // so nothing is lost, and Unflatten rebuilds the original exactly.
  const flattened = await page.evaluate(() => JSON.stringify(Structra.state.jsonData));
  if (flattened !== JSON.stringify({ '["a.b"]': 1, 'a.b': 2, z: 1, y: 2 })) fail('Flatten should keep both "a.b" and a.b under different names: ' + flattened);
  const roundTrip = await page.evaluate(() => { const command = document.querySelector('structra-command'); const rebuilt = command._unflattenObj(Structra.state.jsonData); return JSON.stringify(rebuilt.data || rebuilt); });
  if (roundTrip !== JSON.stringify({ 'a.b': 1, a: { b: 2 }, z: 1, y: 2 })) fail('Unflatten should rebuild the original: ' + roundTrip);
  await page.evaluate(() => Structra.events.emit('command:run', 'undo'));
  await page.waitForTimeout(500);
  if (await page.evaluate(() => Object.keys(Structra.state.jsonData).join()) !== 'a.b,a,z,y') fail('Undo after Flatten should bring the original back');
  await page.evaluate(() => Structra.events.emit('command:run', 'sort'));
  await page.waitForTimeout(500);
  if (!(await page.evaluate(() => Structra.tabs.list.find((t) => t.id === Structra.tabs.activeId).modified))) fail('a change should mark the tab as changed');
  await page.evaluate(() => Structra.events.emit('command:run', 'undo'));
  await page.waitForTimeout(500);
  if (await page.evaluate(() => Structra.tabs.list.find((t) => t.id === Structra.tabs.activeId).modified)) fail('after Undo back to the original the tab should not show as changed');

  // ---- mask covers emails inside text and names, without hinting at length ----
  await closeAll();
  await load('people.json', JSON.stringify({ DisplayName: 'Ann Lee', Claims: 'i:0#.f|membership|ann@contoso.com', Email: 'ann@contoso.com', Title: 'Laptop' }));
  await page.evaluate(() => Structra.events.emit('command:run', 'mask'));
  await page.waitForTimeout(600);
  const masked = await page.evaluate(() => Structra.state.jsonData);
  if (/ann@contoso/.test(JSON.stringify(masked))) fail('Mask left an email in the data: ' + JSON.stringify(masked));
  if (masked.Email !== 'a***@***.com' || masked.DisplayName !== 'A*** L***' || masked.Title !== 'Laptop') fail('Mask output is not as expected: ' + JSON.stringify(masked));
  if (!(await page.evaluate(() => document.querySelector('#toastAction') && !document.querySelector('#toastAction').hidden))) fail('the Mask message should offer an Undo button');

  // ---- editor: text typed but not applied survives a tab switch ----
  await closeAll();
  await load('draft-A.json', '{"keep":"original"}');
  await load('draft-B.json', '{"other":1}');
  const ids = await page.evaluate(() => Structra.tabs.list.slice(-2).map((t) => t.id));
  await page.evaluate((id) => document.querySelector('structra-tabs')._switchTab(id), ids[0]);
  await page.waitForTimeout(500);
  await page.evaluate(() => Structra.setState('activeView', 'editor'));
  await page.waitForTimeout(500);
  await page.evaluate(() => { document.querySelector('structra-editor .cv').codeView.replaceAll('{"keep": "TYPED, not applied"}'); });
  await page.waitForTimeout(300);
  await page.evaluate((id) => document.querySelector('structra-tabs')._switchTab(id), ids[1]);
  await page.waitForTimeout(700);
  await page.evaluate((id) => document.querySelector('structra-tabs')._switchTab(id), ids[0]);
  await page.waitForTimeout(700);
  if (!/TYPED, not applied/.test(await page.evaluate(() => document.querySelector('structra-editor .cv').codeView.getValue()))) fail('text typed in the Editor was lost when switching tabs');
  if (!(await page.evaluate(() => Structra.tabs.list.find((t) => t.id === Structra.tabs.activeId).draft))) fail('a tab with typed, unapplied text should show a dot');
  await page.locator('structra-editor [data-action="apply"]').click();
  await page.waitForTimeout(500);
  if (await page.evaluate(() => Structra.tabs.list.find((t) => t.id === Structra.tabs.activeId).draft)) fail('applying the text should clear the dot');
  await page.evaluate(() => Structra.setState('activeView', 'tree'));

  // ---- tab names: the lowest free Untitled number ----
  await closeAll();
  for (let i = 0; i < 3; i++) { await page.evaluate(() => Structra.events.emit('tabs:add')); await page.waitForTimeout(150); }
  const names = await page.evaluate(() => Structra.tabs.list.map((t) => t.label));
  if (!names.includes('Untitled 2') || !names.includes('Untitled 3') && names.length > 2 || names.some((n) => /Untitled (9|1\d)/.test(n))) fail('Untitled tabs should use the lowest free number: ' + names.join(', '));

  // ---- Escape closes one thing at a time; one dialog at a time ----
  await closeAll();
  await load('esc.json', '{"a":[1,2,3]}');
  await page.evaluate(() => { Structra.events.emit('shortcuts:open'); });
  await page.waitForTimeout(250);
  await page.evaluate(() => { Structra.events.emit('settings:open'); });
  await page.waitForTimeout(250);
  const open2 = await page.evaluate(() => [...document.querySelectorAll('.ov.show')].map((o) => o.parentElement.tagName.toLowerCase()));
  if (open2.join() !== 'structra-settings') fail('opening a dialog should close the one before it: ' + open2.join());
  await page.evaluate(() => { Structra.events.emit('overlay:close'); Structra.setState('findBarOpen', true); });
  await page.waitForTimeout(250);
  await page.evaluate(() => { Structra.events.emit('settings:open'); });
  await page.waitForTimeout(350);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  let st = await page.evaluate(() => ({ dialogs: document.querySelectorAll('.ov.show').length, find: Structra.state.findBarOpen }));
  if (st.dialogs !== 0 || !st.find) fail('the first Escape should close only the dialog: ' + JSON.stringify(st));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  st = await page.evaluate(() => ({ find: Structra.state.findBarOpen }));
  if (st.find) fail('the second Escape should close the Find bar');

  // ---- the Query panel forgets results when the document changes; the path bar shows its hint ----
  await page.evaluate(() => Structra.setState('queryPanelOpen', true));
  await page.waitForTimeout(300);
  await page.locator('#queryInput').fill('a[*]');
  await page.locator('#queryInput').press('Enter');
  await page.waitForFunction(() => document.querySelectorAll('#queryResults .qp-result').length > 0, null, { timeout: 15000 }).catch(() => {});
  if (!(await page.evaluate(() => document.querySelectorAll('#queryResults .qp-result').length))) fail('the query should find matches');
  await load('other.json', '{"z":1}');
  if (await page.evaluate(() => document.querySelectorAll('#queryResults .qp-result').length)) fail('query results from the closed document are still showing');
  await page.evaluate(() => Structra.setState('queryPanelOpen', false));
  if ((await page.evaluate(() => document.querySelector('#pathInput').value)) !== '') fail('with nothing selected the path bar should be empty to show its hint');

  // ---- several files at once ----
  await closeAll();
  await page.evaluate(() => Structra.events.emit('tabs:add'));
  await page.waitForTimeout(200);
  await page.evaluate(() => Structra.events.emit('input:show-tab', 'file'));
  await page.locator('structra-input-panel [data-role="file-input"]').first().setInputFiles([
    { name: 'one.json', mimeType: 'application/json', buffer: Buffer.from('{"n":1}') },
    { name: 'two.json', mimeType: 'application/json', buffer: Buffer.from('{"n":2}') },
    { name: 'three.csv', mimeType: 'text/csv', buffer: Buffer.from('a,b\n1,2') },
  ]);
  await page.waitForTimeout(2500);
  const multi = await page.evaluate(() => Structra.tabs.list.map((t) => t.label).join('|'));
  if (!/one\.json/.test(multi) || !/two\.json/.test(multi) || !/three\.csv/.test(multi)) fail('three files chosen together should open in three tabs: ' + multi);

  // ---- a share link that unpacks to too much is refused ----
  const refused = await page.evaluate(async () => {
    const zeros = new Uint8Array(24 * 1024 * 1024);
    const gz = await new Response(new Blob([zeros]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
    let bin = ''; const b = new Uint8Array(gz); for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000));
    const enc = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    history.replaceState(null, '', '#share=g.' + enc);
    try { await Structra.shareLink.readHash(); return 'opened'; } catch (e) { return e.message; } finally { history.replaceState(null, '', location.pathname); }
  });
  if (!/more than 20 MB/.test(refused)) fail('a share link unpacking to 24 MB should be refused: ' + refused);

  // ---- Find understands key:name and $.path; editing a value in the Tree can be undone; XML writes empty lists as one tag ----
  await closeAll();
  await load('edit.json', JSON.stringify({ rows: [{ Title: 'a', n: 1 }, { Title: 'b', n: 2 }], n: 5 }));
  const byKey = await page.evaluate(async () => (await Structra.dataEngine.findInDb('key:Title')).total);
  const byPath = await page.evaluate(async () => (await Structra.dataEngine.findInDb('$.rows[*].n')).total);
  if (byKey !== 2 || byPath !== 2) fail('Find key:Title and $.rows[*].n should each find 2: ' + byKey + ', ' + byPath);
  await page.evaluate(() => Structra.events.emit('tree:inline-edit', { path: 'n', value: 9 }));
  await page.waitForTimeout(600);
  if (await page.evaluate(() => Structra.state.jsonData.n) !== 9 || !(await page.evaluate(() => Structra.tabs.list.find((t) => t.id === Structra.tabs.activeId).modified))) fail('editing a value in the Tree should change the data and mark the tab');
  await page.evaluate(() => Structra.events.emit('command:run', 'undo'));
  await page.waitForTimeout(500);
  if (await page.evaluate(() => Structra.state.jsonData.n) !== 5) fail('editing a value in the Tree should be undoable');
  const xmlOut = await page.evaluate(() => Structra.formatConversion.jsonToXml({ a: [], b: {}, c: [{}] }));
  if (!/<a\/>/.test(xmlOut) || !/<b\/>/.test(xmlOut) || !/<item\/>/.test(xmlOut)) fail('XML should write empty lists and records as one tag: ' + xmlOut);
}, { viewport: { width: 1360, height: 800 } });
