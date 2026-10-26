const { load, test, eq, truthy } = require('./harness');
const path = require('path');
const { pathToFileURL } = require('url');

load(['util', 'json-tools', 'json-diff']);
const D = Structra.jsonDiff;
console.log('json-diff');

// The library is plain ES modules; the browser loads it on demand, here it is loaded straight from its folder
const LIB = path.join(__dirname, '..', '..', 'src', 'libs', 'jsondiffpatch');
const ready = (async () => {
  const lib = await import(pathToFileURL(path.join(LIB, 'index.js')).href);
  const patcher = await import(pathToFileURL(path.join(LIB, 'formatters', 'jsonpatch.js')).href);
  D.use(lib, patcher);
  return patcher;
})();

const kinds = (r) => r.changes.map((c) => c.type + ' ' + (c.type === 'removed' ? c.leftPath : c.rightPath)).sort();
const clone = (x) => JSON.parse(JSON.stringify(x));

// Apply JSON Patch operations to a copy of a document. The library's own apply works in place and refuses an operation on the
// whole document (path ""), so the document is placed inside a wrapper and every path starts with /root.
function applyOps(patcher, doc, ops) {
  const wrapper = { root: clone(doc) };
  const under = (p) => '/root' + p;
  patcher.patch(wrapper, ops.map((o) => ({ ...o, path: under(o.path), ...(o.from !== undefined ? { from: under(o.from) } : {}) })));
  return wrapper.root;
}

test('two equal values have no changes', async () => {
  await ready;
  eq((await D.compare({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).changes.length, 0);
});

test('a changed, an added and a removed value in an object', async () => {
  await ready;
  const r = await D.compare({ a: 1, b: 2, c: { d: 3 } }, { a: 1, b: 5, c: { d: 3, e: 4 }, f: 6 });
  eq(kinds(r), ['added $.c.e', 'added $.f', 'changed $.b']);
  const b = r.changes.find((c) => c.path === '$.b');
  eq([b.left, b.right], [2, 5]);
});

test('one item added at the start of a list is one change, not a change to every item', async () => {
  await ready;
  const r = await D.compare([1, 2, 3, 4], [0, 1, 2, 3, 4]);
  eq(kinds(r), ['added $[0]']);
});

test('one record added at the start of a list of records is one change', async () => {
  await ready;
  const rows = [{ id: 1, n: 'a' }, { id: 2, n: 'b' }, { id: 3, n: 'c' }];
  const r = await D.compare(rows, [{ id: 0, n: 'z' }, ...rows]);
  eq(kinds(r), ['added $[0]']);
});

test('a record that changed after another was added keeps the right place on each side', async () => {
  await ready;
  const left = [{ id: 1, n: 'a' }, { id: 2, n: 'b' }, { id: 3, n: 'c' }];
  const right = [{ id: 0, n: 'z' }, { id: 1, n: 'a' }, { id: 2, n: 'B' }, { id: 3, n: 'c' }];
  const r = await D.compare(left, right);
  eq(kinds(r), ['added $[0]', 'changed $[2].n']);
  const c = r.changes.find((x) => x.type === 'changed');
  eq([c.leftPath, c.rightPath], ['$[1].n', '$[2].n']);
  eq([c.left, c.right], ['b', 'B']);
});

test('a removed record is found by its place on the left', async () => {
  await ready;
  const left = [{ id: 1 }, { id: 2 }, { id: 3 }];
  const r = await D.compare(left, [{ id: 1 }, { id: 3 }]);
  eq(kinds(r), ['removed $[1]']);
});

test('records without an id are matched by their content', async () => {
  await ready;
  const left = [{ a: 1 }, { a: 2 }, { a: 3 }];
  const r = await D.compare(left, [{ a: 0 }, { a: 1 }, { a: 2 }, { a: 3 }]);
  eq(kinds(r), ['added $[0]']);
});

test('an item that moved is reported as moved', async () => {
  await ready;
  const r = await D.compare([1, 2, 3, 4, 5], [1, 5, 2, 3, 4]);
  truthy(r.changes.some((c) => c.type === 'moved'), JSON.stringify(r.changes));
  eq(r.changes.length, 1);
});

test('a value that changes type is one change', async () => {
  await ready;
  const r = await D.compare({ a: [1, 2] }, { a: { x: 1 } });
  eq(kinds(r), ['changed $.a']);
});

test('the whole document can change', async () => {
  await ready;
  eq(kinds(await D.compare(1, 2)), ['changed $']);
  eq(kinds(await D.compare([1], { a: 1 })), ['changed $']);
});

test('null and missing are different', async () => {
  await ready;
  eq(kinds(await D.compare({ a: null }, {})), ['removed $.a']);
  eq(kinds(await D.compare({}, { a: null })), ['added $.a']);
});

test('keys that look like list marks are still keys', async () => {
  await ready;
  eq(kinds(await D.compare({ _t: 1, _x: 2 }, { _t: 1, _x: 3 })).length, 1);
});

test('the changes can be turned into a JSON Patch that gives the right side back', async () => {
  const patcher = await ready;
  const cases = [
    [{ a: 1, b: [1, 2, 3] }, { a: 2, b: [0, 1, 2, 3], c: { d: 1 } }],
    [[{ id: 1, n: 'a' }, { id: 2, n: 'b' }], [{ id: 2, n: 'b' }, { id: 1, n: 'A' }, { id: 3, n: 'c' }]],
    [{ list: [1, 2, 3, 4, 5, 6] }, { list: [6, 1, 2, 3, 4, 5] }],
    [{ x: { y: { z: [1, { k: 1 }] } } }, { x: { y: { z: [1, { k: 2 }, 9] } } }],
  ];
  for (const [left, right] of cases) {
    const result = await D.compare(left, right);
    const ops = await D.patchOps(result, left, right);
    eq(applyOps(patcher, left, ops), right, JSON.stringify({ left, right, ops }).slice(0, 400));
  }
});

test('no differences give no operations', async () => {
  await ready;
  const r = await D.compare({ a: 1 }, { a: 1 });
  eq(await D.patchOps(r, { a: 1 }, { a: 1 }), []);
});

test('random documents: the Patch always rebuilds the right side, and equal documents have no changes', async () => {
  const patcher = await ready;
  let seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const value = (depth) => {
    const t = rnd();
    if (depth > 3 || t < 0.35) return [1, 2, 3, 'a', 'b', null, true, 4.5][Math.floor(rnd() * 8)];
    if (t < 0.65) return Array.from({ length: Math.floor(rnd() * 5) }, () => value(depth + 1));
    const o = {};
    const n = Math.floor(rnd() * 4);
    for (let i = 0; i < n; i++) o['k' + Math.floor(rnd() * 5)] = value(depth + 1);
    if (rnd() < 0.3) o.id = Math.floor(rnd() * 6);
    return o;
  };
  for (let n = 0; n < 150; n++) {
    const left = value(0);
    const right = rnd() < 0.5 ? clone(left) : value(0);
    const result = await D.compare(left, right);
    const ops = await D.patchOps(result, left, right);
    eq(applyOps(patcher, left, ops), right, JSON.stringify({ left, right, ops }).slice(0, 400));
    if (JSON.stringify(left) === JSON.stringify(right)) eq(result.changes.length, 0);
  }
});

test('long lists are compared by position, quickly, with a note', async () => {
  await ready;
  const n = 300000;
  const left = { list: Array.from({ length: n }, (_, i) => i) };
  const right = { list: Array.from({ length: n }, (_, i) => i + 1) };
  const t0 = Date.now();
  const r = await D.compare(left, right);
  eq(r.mode, 'position');
  eq(r.changes.length, n);
  truthy(/compared by position/.test(r.note), r.note);
  truthy(Date.now() - t0 < 5000, 'took ' + (Date.now() - t0) + ' ms');
});

test('position mode: one list item added at the end, one removed from the end', async () => {
  await ready;
  const big = Array.from({ length: 2000 }, (_, i) => i);
  eq(kinds(await D.compare(big, big.concat([9999]))), ['added $[2000]']);
  eq(kinds(await D.compare(big, big.slice(0, -1))), ['removed $[1999]']);
});

test('position mode gives a JSON Patch that rebuilds the right side', async () => {
  const patcher = await ready;
  const left = Array.from({ length: 2000 }, (_, i) => ({ id: i }));
  const right = left.slice(0, 1999).concat([{ id: 5000 }, { id: 5001 }]);
  const r = await D.compare(left, right);
  eq(r.mode, 'position');
  const ops = await D.patchOps(r, left, right);
  eq(applyOps(patcher, left, ops), right);
});

test('deeply nested data does not crash', async () => {
  await ready;
  let a = { v: 1 };
  let b = { v: 2 };
  for (let i = 0; i < 400; i++) { a = { child: a }; b = { child: b }; }
  eq((await D.compare(a, b)).changes.length, 1);
});
