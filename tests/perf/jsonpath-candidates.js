/* Compare JSONPath libraries with the official RFC 9535 suite, with the expressions our own users write, and for speed.
   It runs code from the packages you install, so install them in a scratch folder, not in this repo:

     mkdir scratch && cd scratch && npm init -y && npm i json-p3 jsonpath-plus jsonpath-rfc9535
     curl -L -o cts.json https://raw.githubusercontent.com/jsonpath-standard/jsonpath-compliance-test-suite/main/cts.json
     node ../tests/perf/jsonpath-candidates.js . cts.json

   arguments: the scratch folder that holds node_modules, and the suite file. */
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const folder = path.resolve(process.argv[2] || '.');
const cts = JSON.parse(fs.readFileSync(path.resolve(process.argv[3] || 'cts.json'), 'utf8'));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const load = (relative) => import(pathToFileURL(path.join(folder, 'node_modules', relative)).href);

(async () => {
  const rfc = await load('jsonpath-rfc9535/dist/esm/index.js');
  const p3 = await load('json-p3/dist/json-p3.esm.js');
  const plus = await load('jsonpath-plus/dist/index-node-esm.js');
  const libraries = {
    'jsonpath-rfc9535': (selector, document) => rfc.query(document, selector),
    'json-p3': (selector, document) => Array.from(p3.jsonpath.query(selector, document).values(), (node) => node.value),
    'jsonpath-plus': (selector, document) => plus.JSONPath({ path: selector, json: document, wrap: true, eval: 'safe' }) || [],
  };

  console.log('Official suite (a library that throws on an invalid selector passes that test):');
  for (const [name, run] of Object.entries(libraries)) {
    let passed = 0;
    for (const test of cts.tests) {
      let ok = false;
      try {
        const found = run(test.selector, test.document);
        ok = !test.invalid_selector && (test.result ? same(found, test.result) : test.results.some((option) => same(found, option)));
      } catch { ok = !!test.invalid_selector; }
      if (ok) passed++;
    }
    console.log('  ', name.padEnd(18), passed + '/' + cts.tests.length, Math.round(passed / cts.tests.length * 100) + '%');
  }

  // The expressions our own unit tests use (tests/unit/jsonpath.test.js), plus the RFC forms of the same filters
  const sample = { value: [
    { Title: 'Laptop', Cost: 1299.5, Approved: false, Requester: { Email: 'ann@x.com' }, Tags: [{ Value: 'IT' }, { Value: 'HW' }] },
    { Title: 'Badge', Cost: 20, Approved: true, Requester: { Email: 'bo@x.com' }, Tags: [] },
    { Title: 'Parking', Cost: 45.25, Approved: true, Requester: { Email: null }, Tags: [{ Value: 'FAC' }] },
  ] };
  const ours = ['$.value[*].Title', '$.value[-1].Title', '$.value[0:2].Title', '$..Value', '$..Email', '$.value[?(@.Cost > 100)].Title',
    "$.value[?(@.Title == 'Badge')].Cost", '$.value[?(@.Approved == true && @.Cost < 30)].Title', '$.value[?(@.Requester.Email =~ /^ann/)].Title',
    '$.value[?(@.Requester.Email)].Title', "$.value[0]['Title','Cost']", '$.value[::-1].Title', '$.value[?@.Cost > 100].Title'];
  console.log('\nOur own expressions:');
  for (const expression of ours) {
    const cells = [];
    for (const [name, run] of Object.entries(libraries)) {
      let shown;
      try { shown = JSON.stringify(run(expression, sample)).slice(0, 34); } catch { shown = 'ERR'; }
      cells.push(name.split('-').pop().slice(0, 5) + ':' + shown);
    }
    console.log('  ', expression.padEnd(52), cells.join('  '));
  }

  console.log('\nSpeed, a filter over 200,000 records:');
  const big = { rows: Array.from({ length: 200000 }, (value, index) => ({ id: index, name: 'n' + index, cost: index % 500 })) };
  for (const [name, run] of Object.entries(libraries)) {
    const began = performance.now();
    let count;
    try { count = run('$.rows[?(@.cost > 490)].id', big).length; } catch (error) { count = 'ERR ' + error.message.slice(0, 30); }
    console.log('  ', name.padEnd(18), Math.round(performance.now() - began) + ' ms', count);
  }
})();
