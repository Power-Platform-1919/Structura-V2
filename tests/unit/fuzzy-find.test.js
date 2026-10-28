/* Find > Fuzzy: values that hold the text, or a word spelled close to it (a letter left out, added, changed, two swapped), through the engine
   and the real uFuzzy file. The speed and the score on 50,000 values are measured by tests/perf/fuzzy-compare.js (map 8.10). */
const fs = require('fs');
const path = require('path');
const { load, test, eq, truthy } = require('./harness');

const box = {};
new Function('window', fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'libs', 'ufuzzy', 'uFuzzy.iife.min.js'), 'utf8') + '\nwindow.uFuzzy = uFuzzy;')(box);
global.uFuzzy = box.uFuzzy;
Structra.duckdbAdapter = undefined;
load(['shared-helpers', 'data-paths', 'data-engine']);
const E = Structra.dataEngine;

console.log('fuzzy find');

const document = {
  value: [
    { Title: 'Laptop refresh', Requester: 'Ann Lee', Cost: 1299.5, Approved: false, Note: null },
    { Title: 'Badge request', Requester: 'Bo Kim', Cost: 20, Approved: true, Note: 'lost at the main entrance' },
    { Title: 'Parking pass', Requester: 'Cy Ng', Cost: 45.25, Approved: true, Note: 'annual renewal' },
  ],
};

let tab = 0;
async function find(text, data = document) {
  tab++;
  await E.ingest(tab, data, { fileName: 't.json', fileSize: 10 });
  E.setActive(tab);
  const result = await E.fuzzySearch(text);
  return result.matchedPaths.slice().sort();
}

test('a letter left out, added, changed or two swapped still finds the value', async () => {
  eq(await find('laptp'), ['$.value[0].Title']);
  eq(await find('laptopp'), ['$.value[0].Title']);
  eq(await find('lapxop'), ['$.value[0].Title']);
  eq(await find('lpatop'), ['$.value[0].Title']);
  eq(await find('pakring'), ['$.value[2].Title']);
});

test('the exact text and a part of a word find the value too', async () => {
  eq(await find('badge request'), ['$.value[1].Title']);
  eq(await find('badge'), ['$.value[1].Title']);
  eq(await find('entranc'), ['$.value[1].Note']);
});

test('a word near another value does not find it', async () => {
  const found = await find('refresh');
  eq(found, ['$.value[0].Title']);
});

test('numbers are searched as text; true, false and null are not', async () => {
  eq(await find('1299'), ['$.value[0].Cost']);
  eq((await find('true')).length, 0);
  eq((await find('null')).length, 0);
});

test('nothing typed finds nothing, and a text that matches nothing finds nothing', async () => {
  eq((await find('')).length, 0);
  eq((await find('   ')).length, 0);
  eq((await find('qqqzzzxxx')).length, 0);
});

test('keys with odd names give paths that read back (the same writer as everywhere)', async () => {
  const found = await find('wonder', { 'a.b': ['wonder'], 'say "hi"': { x: 'wonder' } });
  eq(found, ['$["a.b"][0]', '$["say \\"hi\\""].x'].sort());
});

test('without the library the values that contain the text are still found', async () => {
  const saved = global.uFuzzy;
  const sandbox = { console, performance, setTimeout, clearTimeout };
  sandbox.window = sandbox;
  sandbox.Structra = { log: Structra.log, events: Structra.events, state: {} };
  // a second copy of the engine in a context that has no uFuzzy
  const vm = require('vm');
  vm.createContext(sandbox);
  for (const name of ['shared-helpers', 'data-paths', 'data-engine']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'core', name + '.js'), 'utf8'), sandbox);
  await sandbox.Structra.dataEngine.ingest(1, document, { fileName: 't.json', fileSize: 10 });
  sandbox.Structra.dataEngine.setActive(1);
  const result = await sandbox.Structra.dataEngine.fuzzySearch('badge');
  eq(result.matchedPaths.join(), '$.value[1].Title');
  truthy(saved === global.uFuzzy);
});
