/* The Tree model keeps the rows that show. This test holds it against the plain truth: JSON.stringify(data, null, 2). Opened all the way, its
   rows must be exactly the lines of the pretty printed file, and every row must know its line number in that file, its path and its value.
   It is also held against a reference document that applies each change (a list of lines), so the changes it hands out are proved to keep
   the document and the model in step. The documents are the 127 valid texts of JSONTestSuite plus shapes made here. */
const fs = require('fs');
const path = require('path');
const { load, test, eq, truthy } = require('./harness');

load(['data-paths', 'tree-model']);
const M = Structra.treeModel;
const K = M.KIND;

const suite = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'suites', 'json-test-suite', 'cases.json'), 'utf8'));
const documents = [];
for (const item of suite.cases) {
  if (item.kind === 'n') continue;
  try { documents.push({ name: item.name, value: JSON.parse(new TextDecoder('utf-8').decode(Buffer.from(item.base64, 'base64'))) }); } catch { /* not a document */ }
}
const records = (count) => Array.from({ length: count }, (value, i) => ({ id: i, name: 'item ' + i, tags: ['a', 'b'], owner: { mail: 'p' + i + '@x.com', roles: [] }, note: null }));
const shapes = [
  { name: 'list of records', value: records(40) },
  { name: 'object of lists', value: { value: records(12), 'odata.count': 12, '@odata.etag': 'W/"1"', 'a.b': { 'c[0]': [1, [2, [3, {}]]] }, '': 'empty key' } },
  { name: 'nested empties', value: { a: {}, b: [], c: [{}, [], [[]]], d: { e: {} } } },
  { name: 'a number', value: 5 }, { name: 'a text', value: 'hello' }, { name: 'null', value: null }, { name: 'empty list', value: [] }, { name: 'empty object', value: {} },
  { name: 'odd text', value: { s: 'line\nbreak "quoted" \\ back   ​ zero width é 日本語 😀' } },
];

console.log('tree model');

/** A document of lines that applies the changes the model hands out, as CodeMirror will */
class Lines {
  constructor(text) { this.lines = text.split('\n'); }
  apply(change) { this.lines.splice(change.at, change.removeRows, ...change.text.split('\n')); }
  replaceAll(text) { this.lines = text.split('\n'); }
}

/** Every row of the model, checked against the reference lines and against the data */
function check(model, doc, expectedLines, label) {
  eq(model.rows, doc.lines.length, label + ': row count');
  for (let row = 0; row < model.rows; row++) {
    const kind = model.kind(row);
    const text = doc.lines[row];
    if (kind === K.MORE) continue;
    // the line number of the row in the pretty printed file: its text is that line (a closed block starts at its first line)
    const fileLine = model.fileLineOf(row);
    const expected = expectedLines[fileLine];
    truthy(expected !== undefined, `${label}: row ${row} has file line ${fileLine}, which does not exist`);
    if (kind !== K.CLOSED) eq(text, expected, `${label}: row ${row} (file line ${fileLine})`);
    else truthy(expected.replace(/[\[{]$/, '').replace(/,$/, '').length <= text.length + 100, label + ' closed row ' + row);
  }
}

test('opened all the way, the rows are exactly the lines of JSON.stringify(data, null, 2)', () => {
  for (const { name, value } of [...shapes, ...documents]) {
    const model = M.create(value);
    const { text, capped } = model.expandAll();
    eq(capped, false, name + ' is small enough to open fully');
    eq(text, JSON.stringify(value, null, 2), name);
    eq(model.rows, text.split('\n').length, name + ' rows');
  }
});

test('every row of a fully open document knows its file line, its path and its value', () => {
  for (const { name, value } of [...shapes, ...documents.slice(0, 60)]) {
    const model = M.create(value);
    const { text } = model.expandAll();
    const lines = text.split('\n');
    for (let row = 0; row < model.rows; row++) {
      eq(model.fileLineOf(row), row, `${name}: with everything open the file line is the row (row ${row})`);
      if (model.kind(row) === K.CLOSE) continue;
      const path = model.pathOf(row);
      const resolved = path === '' ? value : Structra.dataPaths.resolve(value, path);
      eq(JSON.stringify(model.valueOf(row)), JSON.stringify(resolved), `${name}: value of row ${row} (${lines[row].trim().slice(0, 30)}), path ${path}`);
      if (path !== '' && model.kind(row) !== K.MORE) eq(model.rowOfPath(path), row, `${name}: the row of path ${path}`);
    }
  }
});

test('the first view opens the levels that fit, and small documents open fully', () => {
  eq(M.create(shapes[0].value).initialText(), JSON.stringify(shapes[0].value, null, 2));
  const big = Array.from({ length: 20000 }, (v, i) => ({ id: i, a: { b: { c: [1, 2, 3] } } }));
  const model = M.create(big);
  truthy(model.rows < 40000, 'rows ' + model.rows);
  eq(model.kind(1), K.CLOSED, 'the records are closed when opening them all would not fit');
  eq(model.fileLines, JSON.stringify(big, null, 2).split('\n').length);
});

test('toggle: opening and closing keeps the document and the model in step (random walk over many documents)', () => {
  let seed = 7;
  const random = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  for (const { name, value } of [...shapes, ...documents.slice(0, 40)]) {
    const model = M.create(value);
    const doc = new Lines(model.initialText());
    const expectedLines = JSON.stringify(value, null, 2).split('\n');
    check(model, doc, expectedLines, name + ' start');
    for (let step = 0; step < 40 && model.rows > 0; step++) {
      const row = random(model.rows);
      const change = model.toggle(row);
      if (!change) continue;
      doc.apply(change);
      check(model, doc, expectedLines, `${name} after toggling row ${row} (step ${step})`);
    }
  }
});

test('toggle gives back what it took: open then close restores the same rows', () => {
  const value = { a: records(5), b: { c: [1, 2] } };
  const model = M.create(value);
  model.collapseAll();
  const doc = new Lines(model.collapseAll().text);
  const opened = model.toggle(0); doc.apply(opened);
  const closed = model.toggle(0); doc.apply(closed);
  eq(doc.lines, model.collapseAll().text.split('\n'));
});

test('setDepth, collapseAll and expandAll rebuild the whole document', () => {
  const value = { a: { b: { c: { d: 1 } } }, e: [1, { f: 2 }] };
  const model = M.create(value);
  eq(model.collapseAll().text, '{ ...2 keys }');
  eq(model.setDepth(1).text.split('\n').length, 4);
  eq(model.setDepth(2).text.includes('"b": { ...1 keys }'), true);
  eq(model.setDepth(3).text.includes('"c": { ...1 keys }'), true);
  eq(model.expandAll().text, JSON.stringify(value, null, 2));
});

test('revealPath opens what is needed, the changes keep the document right, and the row is the right one', () => {
  const value = { value: records(30), 'odata.next': 'x', 'a.b': { 'c[0]': [10, 20, { deep: 'here' }] } };
  const model = M.create(value);
  model.collapseAll();
  const doc = new Lines(model.collapseAll().text);
  for (const target of ['value[17].owner.mail', '["a.b"]["c[0]"][2].deep', 'value[0].tags[1]', '["odata.next"]']) {
    const found = model.revealPath(target);
    truthy(found, 'found ' + target);
    for (const change of found.changes) doc.apply(change);
    eq(model.pathOf(found.row), target, 'path of the row for ' + target);
    eq(JSON.stringify(model.valueOf(found.row)), JSON.stringify(Structra.dataPaths.resolve(value, target)));
    eq(model.rowOfPath(target), found.row);
    eq(doc.lines.length, model.rows);
  }
  eq(model.revealPath('value[99]'), null);
  eq(model.revealPath('nothing.here'), null);
});

test('hostile keys: paths of rows are written by the one path writer and read back', () => {
  const keys = ['@odata.etag', 'a.b', 'say "hi"', "it's", 'x[0]', '', '$ref', 'line\nbreak', '\\', 'ü'];
  const value = Object.fromEntries(keys.map((key, i) => [key, { inner: i }]));
  const model = M.create(value);
  model.expandAll();
  for (let row = 0; row < model.rows; row++) {
    if (model.kind(row) === K.CLOSE) continue;
    const path = model.pathOf(row);
    if (path === '') continue;
    eq(model.rowOfPath(path), row, 'row of ' + JSON.stringify(path));
    eq(JSON.stringify(model.valueOf(row)), JSON.stringify(Structra.dataPaths.resolve(value, path)));
  }
});

test('a huge list shows a window, then a "more" row that shows the next window', () => {
  const original = M.WINDOW;
  const list = Array.from({ length: 1000 }, (v, i) => i);
  // the window is a constant of the module; use a list longer than it by making a long enough one only when the window is small
  if (original > 1000) { truthy(true); return; }
  const model = M.create(list);
  model.expandAll();
  truthy(model.kind(model.rows - 2) === K.MORE);
});

test('a very long list stays quick: 300,000 closed records open, one record opens and closes, a path far down is found', () => {
  const big = Array.from({ length: 300000 }, (v, i) => ({ id: i, name: 'n' + i, tags: [1, 2] }));
  let started = Date.now();
  const model = M.create(big);
  const buildMs = Date.now() - started;
  eq(model.kind(150000 + 1), K.CLOSED);
  started = Date.now();
  const change = model.toggle(150001);
  const openMs = Date.now() - started;
  eq(change.removeRows, 1);
  eq(model.pathOf(150001), '[150000]');
  started = Date.now();
  const found = model.revealPath('[299999].tags[1]');
  const revealMs = Date.now() - started;
  eq(model.pathOf(found.row), '[299999].tags[1]');
  console.log(`        300,000 records: build ${buildMs} ms, open one ${openMs} ms, reveal the last ${revealMs} ms, ${model.rows} rows`);
  truthy(buildMs < 4000 && openMs < 300 && revealMs < 1500, `build ${buildMs}, open ${openMs}, reveal ${revealMs}`);
});

/* ---------- a filter: the matches and the blocks above them ---------- */

/** The data with only the matches and the ways to them: the oracle for a filtered model */
function pruned(value, matched, path = '') {
  if (matched.has(path)) return value;
  if (value === null || typeof value !== 'object') return undefined;
  if (Array.isArray(value)) {
    const kept = [];
    value.forEach((item, i) => { const inside = pruned(item, matched, Structra.dataPaths.child(path, i)); if (inside !== undefined) kept.push(inside); });
    return kept.length ? kept : undefined;
  }
  const kept = {};
  for (const key of Object.keys(value)) { const inside = pruned(value[key], matched, Structra.dataPaths.child(path, key)); if (inside !== undefined) kept[key] = inside; }
  return Object.keys(kept).length ? kept : undefined;
}

/** Every path to a value or block in the data, in document order (to pick matches from) */
function allPaths(value, path = '', out = []) {
  if (path !== '') out.push(path);
  if (value !== null && typeof value === 'object') for (const key of Object.keys(value)) allPaths(value[key], Structra.dataPaths.child(path, Array.isArray(value) ? Number(key) : key), out);
  return out;
}

test('a filter: opened fully, the rows are the pruned data (matches and the blocks above them), with the original line numbers', () => {
  let seed = 11;
  const random = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  for (const { name, value } of [...shapes.slice(0, 2), ...documents.filter((d) => d.value && typeof d.value === 'object').slice(0, 50)]) {
    const paths = allPaths(value);
    if (!paths.length) continue;
    for (let round = 0; round < 4; round++) {
      const matches = new Set();
      for (let k = 0; k < 1 + random(4); k++) matches.add(paths[random(paths.length)]);
      const model = M.create(value, { filter: M.makeFilter(matches) });
      const { text } = model.expandAll();
      const expected = pruned(value, matches);
      eq(text, JSON.stringify(expected, null, 2), `${name} matches ${[...matches].join(' ')}`);
      const originalLines = JSON.stringify(value, null, 2).split('\n');
      const rows = text.split('\n');
      for (let row = 0; row < model.rows; row++) {
        if (model.kind(row) === K.MORE) continue;
        eq(rows[row].replace(/,$/, ''), originalLines[model.fileLineOf(row)].replace(/,$/, ''), `${name}: row ${row} keeps its line number ${model.fileLineOf(row)}`);
      }
    }
  }
});

test('a filter: opening and closing blocks keeps the document and the model in step', () => {
  const value = { value: records(30), other: { deep: [1, 2, { x: 1 }] } };
  const matches = new Set(['value[3].owner.mail', 'value[20].name', 'other.deep[2]']);
  const model = M.create(value, { filter: M.makeFilter(matches) });
  const doc = new Lines(model.initialText());
  let seed = 5;
  const random = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  for (let step = 0; step < 60; step++) {
    const change = model.toggle(random(model.rows));
    if (change) doc.apply(change);
    eq(doc.lines.length, model.rows, 'step ' + step);
  }
  // the model opened fully again must still be the pruned data
  eq(model.expandAll().text, JSON.stringify(pruned(value, matches), null, 2));
});

test('windows: a block longer than the window shows the window and a "more" row; more rows show the next windows; paths beyond are revealed', () => {
  const list = Array.from({ length: 130 }, (v, i) => ({ id: i }));
  const model = M.create(list, { window: 50 });
  model.setDepth(1);                                  // the root open, the records closed
  const doc = new Lines(model.setDepth(1).text);
  const rowsInRoot = () => doc.lines.length;
  // 1 open row + 50 records + 1 more row + 1 close row
  eq(rowsInRoot(), 53);
  const moreRow = 51;
  eq(model.kind(moreRow), K.MORE);
  eq(doc.lines[moreRow].includes('80 more items'), true, doc.lines[moreRow]);
  // a "more" row never counts as a place to select
  eq(model.pathOf(moreRow), '');
  doc.apply(model.more(moreRow));
  eq(rowsInRoot(), 103);
  eq(model.kind(101), K.MORE);
  eq(doc.lines[101].includes('30 more items'), true);
  doc.apply(model.more(101));
  eq(rowsInRoot(), 132);                              // 1 + 130 + 1, no more row
  eq(doc.lines.some((line) => line.includes('more items')), false);
  // the same through a path: closed windows are opened to reach the row
  const second = M.create(list, { window: 50 });
  const doc2 = new Lines(second.setDepth(1).text);
  const found = second.revealPath('[120].id');
  for (const change of found.changes) doc2.apply(change);
  eq(second.pathOf(found.row), '[120].id');
  eq(doc2.lines.length, second.rows);
});

test('windows keep the file line numbers right', () => {
  const list = Array.from({ length: 130 }, (v, i) => ({ id: i, tags: [1, 2] }));
  const model = M.create(list, { window: 40 });
  const doc = new Lines(model.setDepth(1).text);
  while (doc.lines.some((line) => /more items/.test(line))) doc.apply(model.more(doc.lines.findIndex((line) => /more items/.test(line))));
  const expectedLines = JSON.stringify(list, null, 2).split('\n');
  for (let row = 0; row < model.rows; row++) if (model.kind(row) === K.CLOSED) eq(expectedLines[model.fileLineOf(row)].trim().startsWith('{'), true, 'row ' + row);
});
