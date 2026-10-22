const { load, test, eq, truthy } = require('./harness');
load(['util', 'insights']);
const I = Structra.insights;

console.log('insights');

const analysisFor = (over = {}) => ({
  stats: {
    keys: 20, depth: 3, arrays: 2, objects: 5, strings: 30, numbers: 10, booleans: 2, nulls: 4, totalNodes: 60,
    longestArray: 12, arraysDetail: [
      { path: '$.items', count: 12, sample: 'object' },
      { path: '$.items[0].tags', count: 2, sample: 'string' },
      { path: '$.items[1].tags', count: 3, sample: 'string' },
      { path: '$.empty', count: 0, sample: 'empty' },
    ],
    ...over.stats,
  },
  firstArr: { path: '$.items', rows: new Array(12).fill({}) },
  profile: { fieldCount: 5, quality: { issues: [{ field: 'note', msg: '70% null', severity: 'high' }] }, ...over.profile },
});

test('headline names the main list and its size', () => {
  const r = I.build({ analysis: analysisFor(), meta: { fileSize: 2048 }, data: { items: [] } });
  eq(r.headline, 'An object whose main list is items: 12 records with 5 fields each.');
});
test('a top-level list reads as a list of records', () => {
  const rows = [{ a: 1 }, { a: 2 }];
  eq(I.describe(rows, { path: '$', rows }, { fieldCount: 1 }), 'A list of 2 records, each an object with 1 field.');
});
test('empty documents get plain wording', () => {
  eq(I.describe([], null, null), 'An empty list.');
  eq(I.describe({}, null, null), 'An empty object.');
});
test('quality issues become findings with a jump to the table', () => {
  const f = I.build({ analysis: analysisFor(), data: {} }).findings.find((x) => x.title.startsWith('note'));
  eq(f.severity, 'high');
  eq(f.go, { view: 'table', column: 'note' });
});
test('repeated keys are the top finding', () => {
  const r = I.build({ analysis: analysisFor(), data: {}, duplicateKeys: [{ key: 'a', path: '$.a' }] });
  eq(r.findings[0].severity, 'high');
  truthy(r.findings[0].title.includes('repeated key'));
});
test('empty lists are counted', () => {
  const r = I.build({ analysis: analysisFor(), data: {} });
  truthy(r.findings.some((f) => f.title === '1 empty list'));
});
test('lists that repeat inside records are one line', () => {
  const r = I.build({ analysis: analysisFor(), data: {} });
  const tags = r.arrays.find((a) => a.pattern === '$.items[].tags');
  eq([tags.lists, tags.items, tags.path], [2, 5, '$.items[1].tags']);
});
test('a connector-shaped payload offers the Power Platform tools', () => {
  const r = I.build({ analysis: analysisFor(), data: { body: { value: [] } } });
  eq(r.findings.find((f) => f.go && f.go.drawer).go, { drawer: 'expressions' });
});
test('deep nesting is flagged', () => {
  const r = I.build({ analysis: analysisFor({ stats: { depth: 12 } }), data: {} });
  truthy(r.findings.some((f) => f.title.startsWith('Nested 12 levels')));
});
test('findings are ordered most important first', () => {
  const r = I.build({ analysis: analysisFor(), data: { body: {} }, duplicateKeys: [{ key: 'a', path: '$.a' }] });
  const order = { high: 0, med: 1, info: 2 };
  const sev = r.findings.map((f) => order[f.severity]);
  eq(sev, [...sev].sort((a, b) => a - b));
});
