const { load, test, eq, truthy } = require('./harness');
Structra.duckdb = undefined;                 // no SQL engine here: the JavaScript path is the one under test
load(['util', 'paths', 'engine']);
const E = Structra.engine;

console.log('engine analysis');

const sample = { items: [{ id: 1, name: 'A', note: null }, { id: 2, name: 'B' }], meta: { n: 1 } };
const rows = {
  items: [
    { id: 1, name: 'A', note: null, d: '2024-01-01' },
    { id: 2, name: 'A', tags: ['x'] },
    { id: 3.5, name: 'C', note: 'n' },
  ],
};

const analyse = async (tab, data) => {
  await E.ingest(tab, data, { fileName: 't.json', fileSize: 10 });
  E.setActive(tab);                          // the analysis is read from the active dataset
  return E.getAnalysis();
};

test('counts values by type, keys, lists and depth', async () => {
  const a = await analyse(1, sample);
  eq([a.stats.objects, a.stats.arrays, a.stats.strings, a.stats.numbers, a.stats.nulls], [4, 1, 2, 3, 1]);
  eq([a.stats.keys, a.stats.totalNodes, a.stats.depth], [8, 11, 3]);
  eq(a.stats.arraysDetail, [{ path: 'items', count: 2, sample: 'object' }]);
});

test('finds the first list of objects', async () => {
  const a = await analyse(2, sample);
  eq(a.firstArr.path, '$.items');
  eq(a.firstArr.rows.length, 2);
});

test('profiles each field: type, null share, coverage and range', async () => {
  const a = await analyse(3, rows);
  const f = Object.fromEntries(a.profile.fields.map((x) => [x.key, x]));
  eq([f.id.primaryType, f.id.min, f.id.max], ['number', 1, 3.5]);
  eq([f.note.nullPct, f.note.coverage], ['33', '67']);
  eq(f.note.types, { string: 1, null: 1 });
  eq([f.tags.primaryType, f.tags.coverage], ['array', '33']);
  eq(a.profile.rowCount, 3);
  eq(a.profile.fieldCount, 5);
});

test('a field that is often null is reported as an issue', async () => {
  const a = await analyse(4, rows);
  const issue = a.profile.quality.issues.find((i) => i.field === 'note');
  truthy(issue, 'expected an issue for note');
  eq(issue.severity, 'med');
});

test('coverage lists how many rows have each key', async () => {
  const a = await analyse(5, rows);
  const id = a.profile.coverage.find((c) => c.key === 'id');
  eq([id.present, id.missing, id.pct], [3, 0, 100]);
});

test('finding the first list of objects never fails on null values', () => {
  eq(E.findFirstObjectArray({ a: null }), null);
  eq(E.findFirstObjectArray({ a: null, b: { c: [{ x: 1 }] } }).path, '$.b.c');
});

test('every list is found with its path and length', () => {
  eq(E.findAllArrays({ a: [1], b: { c: [] } }, '').map((x) => [x.path, x.count]), [['a', 1], ['b.c', 0]]);
});

test('a list of plain values has no list of objects', async () => {
  const a = await analyse(6, { tags: ['a', 'b'] });
  eq(a.firstArr, null);
  eq(a.profile, null);
});
