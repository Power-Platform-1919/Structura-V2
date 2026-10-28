/* The sandbox worker is where the person's own code and patterns run (Structra.sandbox). This test checks the things it exists for:
     - a loop that never ends, and a pattern that backtracks for ever, are stopped and the page stays responsive meanwhile,
     - the next job works after a stop (the worker is started again and the document sent again),
     - Stop ends a running job,
     - the code cannot reach the network (a server counts every request), storage or the page,
     - after the document changes, the next job sees the new document,
     - errors come back in words, and results that hold a function do not crash anything.

   Run:  node tests/smoke/sandbox.js          (PW_CHANNEL=msedge uses the installed Edge; PW_BROWSER=firefox or webkit) */
const { runAppTest } = require('../app-test');
const { uploadAndWait } = require('../page-helpers');

const leaked = [];

runAppTest('sandbox', async ({ page, fail, origin }) => {
// Run something in the page and bring back either its value or the error
  const inPage = (fn, arg) => page.evaluate(async ({ source, argument }) => {
    try { return { value: await (new Function('argument', 'return (' + source + ')(argument)'))(argument) }; }
    catch (error) { return { error: String(error.message), timedOut: !!error.timedOut, stopped: !!error.stopped }; }
  }, { source: fn.toString(), argument: arg });


  await uploadAndWait(page, { name: 'people.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ value: [{ Title: 'Ann', Cost: 40, tags: ['a'] }, { Title: 'Bo', Cost: 150 }, { Title: 'Cy', Cost: 220 }] })) });

  /* ---------- ordinary jobs ---------- */
  let r = await inPage(async () => Structra.sandbox.evaluate(Structra.state.jsonData, 'data.value.map(x => x.Title)'));
  if (r.error || JSON.stringify(r.value.value) !== '["Ann","Bo","Cy"]') fail('evaluate should return the titles: ' + JSON.stringify(r));

  r = await inPage(async () => Structra.sandbox.evaluate(Structra.state.jsonData, '=data.value.filter(x => x.Cost > 100)', { locate: true }));
  if (r.error || !r.value.items || r.value.items.map((i) => i.path).join() !== '$.value[1],$.value[2]') fail('evaluate with locate should give the real paths: ' + JSON.stringify(r));

  r = await inPage(async () => Structra.sandbox.evaluate(Structra.state.jsonData, 'data.value.map(x => x.Cost * 2)', { locate: true }));
  if (r.error || r.value.items.map((i) => i.path).join() !== 'null,null,null' && !r.value.items.every((i) => i.path === null)) fail('numbers have no place in the document: ' + JSON.stringify(r));

  r = await inPage(async () => Structra.sandbox.evaluate(Structra.state.jsonData, 'data.value.map('));
  if (!r.error || !/Unexpected|expected|end of input|token/i.test(r.error)) fail('a syntax error should come back in words: ' + JSON.stringify(r));

  r = await inPage(async () => Structra.sandbox.evaluate(Structra.state.jsonData, 'data.value.map(x => () => 1)'));
  if (!r.error || !/function/i.test(r.error)) fail('a result that holds a function should be explained: ' + JSON.stringify(r));

  r = await inPage(async () => Structra.sandbox.filterRows(Structra.state.jsonData, '$.value', 'row.Cost > 100'));
  if (r.error || r.value.join() !== '1,2') fail('filterRows should keep rows 1 and 2: ' + JSON.stringify(r));

  r = await inPage(async () => (await Structra.sandbox.findPattern(Structra.state.jsonData, '^b', { primitives: false })).matches.map((m) => m.path));
  if (r.error || r.value.join() !== '$.value[1].Title') fail('findPattern should find Bo: ' + JSON.stringify(r));

  r = await inPage(async () => (await Structra.sandbox.findPattern(Structra.state.jsonData, '^150$', { primitives: true })).matches.map((m) => m.path));
  if (r.error || r.value.join() !== '$.value[1].Cost') fail('findPattern with numbers should find 150: ' + JSON.stringify(r));

  /* ---------- stopped, and the page stays usable ---------- */
  const loop = await page.evaluate(async () => {
    let ticks = 0;
    const timer = setInterval(() => { ticks++; }, 50);
    const started = performance.now();
    let outcome;
    try { await Structra.sandbox.evaluate(Structra.state.jsonData, '(() => { while (true) {} })()', { milliseconds: 1500 }); outcome = 'finished'; }
    catch (error) { outcome = error.timedOut ? 'timedOut' : 'error: ' + error.message; }
    clearInterval(timer);
    return { outcome, ticks, elapsed: Math.round(performance.now() - started) };
  });
  if (loop.outcome !== 'timedOut') fail('a loop that never ends should be stopped by the time limit: ' + JSON.stringify(loop));
  if (loop.ticks < 15) fail('the page should stay responsive while the loop runs (50 ms ticks in 1.5 s): ' + JSON.stringify(loop));
  if (loop.elapsed > 4000) fail('the loop should be stopped near the limit: ' + JSON.stringify(loop));

  r = await inPage(async () => Structra.sandbox.evaluate(Structra.state.jsonData, 'data.value.length'));
  if (r.error || r.value.value !== 3) fail('a job after a stop should work (worker restarted, document sent again): ' + JSON.stringify(r));

  // Some engines (Safari's) have their own protection and finish these quickly: that is fine. What must never happen is a pattern
  // that runs on past the limit without being stopped.
  const regexStopped = await page.evaluate(async () => {
    const results = [];
    for (const [pattern, text] of [['(a|aa)+$', 'a'.repeat(40) + 'b'], ['(a+)+$', 'a'.repeat(40) + 'b'], ['(x+x+)+y', 'x'.repeat(45)]]) {
      const started = performance.now();
      try { await Structra.sandbox.findPattern({ text }, pattern, { milliseconds: 1500 }); results.push({ pattern, outcome: 'finished', elapsed: Math.round(performance.now() - started) }); }
      catch (error) { results.push({ pattern, outcome: error.timedOut ? 'timedOut' : 'error: ' + error.message, elapsed: Math.round(performance.now() - started) }); }
    }
    return results;
  });
  for (const one of regexStopped) {
    const ok = (one.outcome === 'timedOut' && one.elapsed < 4000) || (one.outcome === 'finished' && one.elapsed < 1400);
    if (!ok) fail('a pattern that backtracks should be stopped at the limit or finish quickly: ' + JSON.stringify(one));
  }
  if (!regexStopped.some((one) => one.outcome === 'timedOut') && !regexStopped.every((one) => one.outcome === 'finished')) fail('unexpected outcomes: ' + JSON.stringify(regexStopped));

  const fast = await page.evaluate(async () => {
    const rows = Array.from({ length: 20000 }, (v, i) => ({ id: i, name: 'person' + i, mail: 'p' + i + '@example.com' }));
    const started = performance.now();
    const result = await Structra.sandbox.findPattern(rows, '^p1\\d*@example', { primitives: false });
    return { count: result.matches.length, elapsed: Math.round(performance.now() - started) };
  });
  if (fast.count !== 11111 || fast.elapsed > 3000) fail('an ordinary pattern over 20,000 rows should be right and quick: ' + JSON.stringify(fast));

  const stopNow = await page.evaluate(async () => {
    const running = Structra.sandbox.evaluate(Structra.state.jsonData, '(() => { while (true) {} })()', { milliseconds: 20000 }).then(() => 'finished', (error) => (error.stopped ? 'stopped' : 'error: ' + error.message));
    await new Promise((resolve) => setTimeout(resolve, 300));
    Structra.sandbox.stop();
    return Promise.race([running, new Promise((resolve) => setTimeout(() => resolve('still running'), 3000))]);
  });
  if (stopNow !== 'stopped') fail('Stop should end a running job: ' + stopNow);

  /* ---------- the code cannot reach outside ---------- */
  const probes = ['typeof fetch', 'typeof XMLHttpRequest', 'typeof WebSocket', 'typeof importScripts', 'typeof indexedDB', 'typeof caches', 'typeof navigator', 'typeof document', 'typeof window', 'typeof localStorage', 'typeof self.fetch', "(function () { return typeof this.fetch; })()", "(function () {}).constructor('return typeof fetch')()", 'typeof globalThis.fetch', 'typeof Worker', 'typeof postMessage'];
  for (const probe of probes) {
    r = await inPage(async (code) => Structra.sandbox.evaluate(Structra.state.jsonData, code), probe);
    if (r.error || r.value.value !== 'undefined') fail(`"${probe}" should be undefined inside the sandbox: ${JSON.stringify(r)}`);
  }
  r = await inPage(async (url) => Structra.sandbox.evaluate(Structra.state.jsonData, `fetch('${url}/leak?data=' + JSON.stringify(data))`), origin);
  if (!r.error) fail('fetch inside the sandbox should fail: ' + JSON.stringify(r));
  r = await inPage(async (url) => Structra.sandbox.evaluate(Structra.state.jsonData, `import('${url}/leak-import.js')`), origin);
  if (!r.error || !/import/.test(r.error)) fail('import() should be refused: ' + JSON.stringify(r));
  await page.waitForTimeout(500);
  if (leaked.length) fail('the sandbox reached the network: ' + leaked.join(' '));

  /* ---------- the document changes ---------- */
  r = await inPage(async () => Structra.sandbox.evaluate(Structra.state.jsonData, 'data.value.length'));
  const before = r.value && r.value.value;
  r = await inPage(async () => {
    Structra.state.jsonData.value.push({ Title: 'Di', Cost: 5 });          // an edit in place, announced the way the app announces it
    Structra.events.emit('state:jsonData', { value: Structra.state.jsonData });
    return Structra.sandbox.evaluate(Structra.state.jsonData, 'data.value.length');
  });
  if (before !== 3 || r.error || r.value.value !== 4) fail(`after the document changed the next job should see it: before ${before}, after ${JSON.stringify(r)}`);

  /* ---------- Transform steps ---------- */
  r = await inPage(async () => Structra.sandbox.transform(Structra.state.jsonData, '.value | filter(x => x.Cost > 100) | pick(Title) | sortBy(-Title)'));
  if (r.error || JSON.stringify(r.value.value) !== '[{"Title":"Cy"},{"Title":"Bo"}]') fail('Transform steps should run in the sandbox: ' + JSON.stringify(r));
  r = await inPage(async () => Structra.sandbox.transform(Structra.state.jsonData, '.value | explode()'));
  if (!r.error || !/Unknown step/.test(r.error)) fail('an unknown step should be explained: ' + JSON.stringify(r));
  r = await inPage(async (url) => Structra.sandbox.transform(Structra.state.jsonData, `.value | map(x => fetch('${url}/leak-step'))`), origin);
  if (!r.error || !/fetch/.test(r.error)) fail('a step that tries the network should fail with a message about fetch: ' + JSON.stringify(r));
  r = await inPage(async () => Structra.sandbox.transform(Structra.state.jsonData, '.value | map(x => { while (true) {} })', { milliseconds: 1200 }));
  await page.waitForTimeout(300);
  if (leaked.some((entry) => entry.includes('leak-step'))) fail('a Transform step reached the network: ' + leaked.join(' '));
  const stuckStep = await inPage(async () => Structra.sandbox.transform(Structra.state.jsonData, '.value | filter(x => (() => { while (true) {} })())', { milliseconds: 1200 }));
  if (!stuckStep.timedOut) fail('a step that never ends should be stopped: ' + JSON.stringify(stuckStep));

  /* ---------- the Query panel uses it ---------- */
  const panel = await page.evaluate(async () => {
    const query = document.querySelector('structra-query');
    const matches = await query._queryJs(Structra.state.jsonData, 'data.value.filter(x => x.Cost > 100)');
    return matches.map((m) => m.path);
  });
  if (panel.join() !== '$.value[1],$.value[2]') fail('the Query panel JavaScript mode should give real paths: ' + JSON.stringify(panel));
  const panelRegex = await page.evaluate(async () => {
    const query = document.querySelector('structra-query');
    try { return (await query._queryRegex(Structra.state.jsonData, '^Cy$')).map((m) => m.path); } catch (error) { return 'error: ' + error.message; }
  });
  if (JSON.stringify(panelRegex) !== '["$.value[2].Title"]') fail('the Query panel pattern mode should find Cy: ' + JSON.stringify(panelRegex));
  const badPattern = await page.evaluate(async () => { try { await document.querySelector('structra-query')._queryRegex(Structra.state.jsonData, '('); return 'no error'; } catch (error) { return error.message; } });
  if (!/not a valid pattern/.test(badPattern)) fail('an invalid pattern should be explained: ' + badPattern);
  /* ---------- Find in Pattern mode: a slow pattern the quick check misses is stopped and explained ---------- */
  // (a|aa)+$ is not caught by the quick check. Some engines (Safari's) finish it fast on their own, which is fine.
  await uploadAndWait(page, { name: 'slow.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ text: 'a'.repeat(45) + 'b' })) });
  const slow = await page.evaluate(async () => {
    const started = performance.now();
    let ticks = 0;
    const timer = setInterval(() => { ticks++; }, 50);
    let outcome;
    try { await Structra.dataEngine.regexSearch('(a|aa)+$'); outcome = 'finished'; } catch (error) { outcome = error.message === Structra.sharedHelpers.RISKY_REGEX_MESSAGE ? 'stopped with the message' : 'error: ' + error.message; }
    clearInterval(timer);
    return { outcome, elapsed: Math.round(performance.now() - started), ticks };
  });
  if (slow.outcome !== 'stopped with the message' && slow.outcome !== 'finished') fail('a slow pattern in Find should be stopped with the plain message: ' + JSON.stringify(slow));
  if (slow.outcome === 'stopped with the message' && (slow.elapsed > 9000 || slow.ticks < 20)) fail('the page must stay responsive while the pattern runs and it must stop near 5 seconds: ' + JSON.stringify(slow));

  /* ---------- patterns that run once per value on the page are tried in the sandbox first ---------- */
  await uploadAndWait(page, { name: 'cells.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ items: [{ text: 'ann' }, { text: 'bob' }, { text: 'a'.repeat(45) + 'b' }] })) });
  const ordinary = await page.evaluate(async () => (await Structra.jsonpathQuery.query(Structra.state.jsonData, '$.items[?(@.text =~ /^b/i)]')).map((m) => m.path));
  if (ordinary.join() !== '$.items[1]') fail('an ordinary =~ pattern should still work: ' + JSON.stringify(ordinary));
  const slowPath = await page.evaluate(async () => {
    const started = performance.now();
    try { const found = await Structra.jsonpathQuery.query(Structra.state.jsonData, '$.items[?(@.text =~ /(a|aa)+$/)]'); return { outcome: 'finished', count: found.length, elapsed: Math.round(performance.now() - started) }; }
    catch (error) { return { outcome: error.message === Structra.sharedHelpers.RISKY_REGEX_MESSAGE ? 'refused with the message' : 'error: ' + error.message, elapsed: Math.round(performance.now() - started) }; }
  });
  if (slowPath.outcome !== 'refused with the message' && slowPath.outcome !== 'finished') fail('a slow =~ pattern should be refused with the plain message: ' + JSON.stringify(slowPath));
  // Safari's engine finishes this pattern quickly by itself; in the others the probe must refuse it
  const ownsBacktracking = (process.env.PW_BROWSER || 'chromium') === 'webkit';
  if (!ownsBacktracking && slowPath.outcome !== 'refused with the message') fail('the probe should refuse (a|aa)+$ in JSONPath in this engine: ' + JSON.stringify(slowPath));
  if (slowPath.outcome === 'refused with the message' && slowPath.elapsed > 4000) fail('the probe should stop a slow pattern quickly: ' + JSON.stringify(slowPath));

  await page.evaluate(() => Structra.setState('activeView', 'table'));
  await page.waitForSelector('#tableBody tr', { timeout: 10000 }).catch(() => {});
  const slowCell = await page.evaluate(async () => {
    const table = document.querySelector('structra-table');
    const rows = Array.from({ length: 30 }, (v, i) => ({ text: i === 7 ? 'a'.repeat(45) + 'b' : 'row ' + i }));
    table._resolveData = () => ({ allRows: rows });
    const ordinaryPattern = await table._patternIsTooSlow('text', [{ op: 'regex', val: '^row 1' }, { op: 'wildcard', val: 'row*' }]);
    const slowPattern = await table._patternIsTooSlow('text', [{ op: 'regex', val: '(a|aa)+$' }]);
    const notPatterns = await table._patternIsTooSlow('text', [{ op: 'contains', val: 'x' }]);
    return { ordinaryPattern, slowPattern, notPatterns };
  });
  if (slowCell.ordinaryPattern || slowCell.notPatterns) fail('ordinary conditions must not be refused: ' + JSON.stringify(slowCell));
  if (!ownsBacktracking && slowCell.slowPattern !== true) fail('the Table probe should refuse (a|aa)+$ in this engine: ' + JSON.stringify(slowCell));
  if (ownsBacktracking && slowCell.slowPattern !== false) fail('Safari finishes it fast, so it is not refused: ' + JSON.stringify(slowCell));

  /* ---------- Find: a search that finishes late must not overwrite a newer one ---------- */
  // Pattern searches wait for the sandbox; an invalid pattern fails at once. If the slow one finishes last it used to put "1 found"
  // over "Not a valid pattern" (and make its matches the active result).
  const race = await page.evaluate(async () => {
    Structra.setState('findBarOpen', true);
    await new Promise((resolve) => setTimeout(resolve, 200));
    const find = document.querySelector('structra-find');
    find._mode = 'regex';
    const older = find._doFind('^a');
    const newer = find._doFind('(');
    const [olderResult, newerResult] = await Promise.all([older, newer]);
    await new Promise((resolve) => setTimeout(resolve, 400));
    return { text: document.querySelector('#findCount').textContent, olderResult, newerResult };
  });
  if (race.text !== 'Not a valid pattern' || race.olderResult !== false || race.newerResult !== false) fail('the older search must not overwrite the newer one: ' + JSON.stringify(race));
}, { viewport: { width: 1360, height: 900 } });
