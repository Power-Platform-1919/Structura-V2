/* The analysis behind the Overview (counts, field profile, quality score, insights) on documents that are awkward for it: nothing, empty
   things, all-null columns, mixed types, a single record, odd keys, very large lists, deep nesting. Whatever the document, the numbers
   must be real numbers in range and the insights must be text. */
const { load, test, eq, truthy } = require('./harness');
Structra.duckdbAdapter = undefined;                 // no SQL engine here: the JavaScript path is the one under test
load(['shared-helpers', 'data-paths', 'data-engine', 'overview-insights']);
const E = Structra.dataEngine;

console.log('analysis edge cases');

let tab = 100;
async function analyse(data) {
  tab++;
  await E.ingest(tab, data, { fileName: 't.json', fileSize: 10 });
  E.setActive(tab);
  return E.getAnalysis();
}

const inRange = (number, low, high, what) => truthy(typeof number === 'number' && Number.isFinite(number) && number >= low && number <= high, `${what} should be a number from ${low} to ${high}, it is ${number}`);

function checkQuality(quality, what) {
  inRange(quality.overall, 0, 100, what + ' overall');
  inRange(quality.completeness, 0, 100, what + ' completeness');
  inRange(quality.consistency, 0, 100, what + ' consistency');
  inRange(quality.uniqueness, 0, 100, what + ' uniqueness');
  truthy(Array.isArray(quality.issues), what + ' issues');
  for (const issue of quality.issues) truthy(typeof issue.msg === 'string' && !/NaN|undefined|Infinity/.test(issue.msg), what + ' issue text: ' + issue.msg);
}

function checkInsights(analysis, data, what) {
  const result = Structra.overviewInsights.build({ analysis, meta: {}, data, duplicateKeys: [] });
  truthy(result && typeof result === 'object', what + ' insights');
  const texts = [result.headline, ...(result.findings || []).map((finding) => finding.text || finding.title || ''), ...(result.facts || [])].filter((value) => typeof value === 'string');
  for (const text of texts) truthy(!/NaN|undefined|Infinity|\[object/.test(text), what + ' text: ' + text);
  return result;
}

const CASES = {
  'an empty list': [],
  'an empty object': {},
  'a list of empty objects': [{}, {}, {}],
  'a list of nulls': [null, null],
  'a list of numbers': [1, 2, 3.5, -4],
  'a list of lists': [[1, 2], [3], []],
  'a single record': [{ id: 1, name: 'Ann' }],
  'a single value': 42,
  'a single string': 'text',
  'a null document': null,
  'an all-null column': [{ id: 1, note: null }, { id: 2, note: null }, { id: 3, note: null }],
  'a mixed-type column': [{ v: 1 }, { v: 'one' }, { v: true }, { v: null }, { v: [1] }, { v: { a: 1 } }],
  'a column in one record only': [{ id: 1 }, { id: 2 }, { id: 3, rare: 'x' }],
  'odd keys': [{ '': 1, 'a.b': 2, 'a b': 3, '$x': 4, '[0]': 5, 'é日本': 6, '__proto__x': 7 }],
  'ids that all repeat': Array.from({ length: 20 }, () => ({ id: 1, userId: 'a', name: 'same' })),
  'ids that are all different': Array.from({ length: 20 }, (_, i) => ({ id: i, userId: 'u' + i })),
  'numbers as text': [{ n: '1' }, { n: '2.5' }, { n: 'x' }],
  'negative and huge numbers': [{ n: -1e308 }, { n: 1e308 }, { n: 0 }, { n: -0 }, { n: 1.7976931348623157e308 }],
  'dates': [{ d: '2024-01-01T00:00:00Z' }, { d: '2024-13-45' }, { d: '' }],
  'deep nesting': (() => { let value = 'x'; for (let i = 0; i < 300; i++) value = { a: value }; return value; })(),
  'a very wide record': [Object.fromEntries(Array.from({ length: 3000 }, (_, i) => ['key' + i, i]))],
  'long strings': [{ t: 'x'.repeat(200000) }, { t: '' }],
  'a list nested in records': [{ items: [] }, { items: [1, 2] }, { items: null }],
};

for (const [name, data] of Object.entries(CASES)) {
  test('the analysis of ' + name + ' gives real numbers and plain text', async () => {
    const analysis = await analyse(data);
    // a document that is only null cannot be opened (the app says so, tests/smoke/fixtures.js edge_null), so there are no numbers to check
    if (data === null) return;
    truthy(analysis && analysis.stats, 'analysis');
    for (const key of ['keys', 'depth', 'arrays', 'objects', 'strings', 'numbers', 'booleans', 'nulls', 'totalNodes']) inRange(analysis.stats[key], 0, Number.MAX_SAFE_INTEGER, 'stats.' + key);
    if (analysis.profile) {
      checkQuality(analysis.profile.quality, name);
      for (const field of analysis.profile.fields || []) {
        inRange(parseFloat(field.nullPct), 0, 100, name + ' nullPct of ' + field.key);
        inRange(parseFloat(field.uniquePct), 0, 100, name + ' uniquePct of ' + field.key);
        inRange(parseFloat(field.coverage), 0, 100, name + ' coverage of ' + field.key);
      }
    }
    checkInsights(analysis, data, name);
  });
}

test('an all-null column costs completeness and is reported', async () => {
  const analysis = await analyse(CASES['an all-null column']);
  const quality = analysis.profile.quality;
  truthy(quality.completeness < 100, 'completeness ' + quality.completeness);
  truthy(quality.issues.some((issue) => issue.field === 'note' && /null/.test(issue.msg)), JSON.stringify(quality.issues));
});

test('a mixed-type column costs consistency and is reported with its types', async () => {
  const analysis = await analyse(CASES['a mixed-type column']);
  const quality = analysis.profile.quality;
  truthy(quality.consistency < 100, 'consistency ' + quality.consistency);
  truthy(quality.issues.some((issue) => issue.field === 'v' && /mixed types/.test(issue.msg)), JSON.stringify(quality.issues));
});

test('ids that all repeat are reported; ids that are all different are not', async () => {
  const repeated = (await analyse(CASES['ids that all repeat'])).profile.quality;
  truthy(repeated.issues.some((issue) => /repeats/.test(issue.msg)), JSON.stringify(repeated.issues));
  const different = (await analyse(CASES['ids that are all different'])).profile.quality;
  truthy(!different.issues.some((issue) => /repeats/.test(issue.msg)), JSON.stringify(different.issues));
  eq(different.uniqueness, 100);
});

test('a clean list scores 100', async () => {
  const analysis = await analyse([{ id: 1, name: 'A' }, { id: 2, name: 'B' }, { id: 3, name: 'C' }]);
  eq(analysis.profile.quality.overall, 100);
});

test('a list of 200,000 records is analysed in a reasonable time and the profile reads a sample or all of it', async () => {
  const data = Array.from({ length: 200000 }, (_, i) => ({ id: i, name: 'item ' + i, group: i % 7, price: (i % 100) / 4, tag: i % 5 ? 'a' : null }));
  const started = Date.now();
  const analysis = await analyse(data);
  const seconds = (Date.now() - started) / 1000;
  truthy(seconds < 15, 'took ' + seconds + ' s');
  checkQuality(analysis.profile.quality, 'large list');
  eq(analysis.profile.rowCount > 0, true);
});
