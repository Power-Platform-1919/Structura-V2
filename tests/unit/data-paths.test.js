/* Structra.dataPaths.child() is the only writer of paths and tokenize() the only reader. For every hostile key the path written for a
   key must read back to exactly that key, resolve to the right value, and agree with json-p3 (RFC 9535), which is the independent check. */
const path = require('path');
const { pathToFileURL } = require('url');
const { load, test, eq, truthy } = require('./harness');
const { HOSTILE_KEYS } = require('../hostile-keys');

Structra.libraryLoader = { loadLibrary: () => import(pathToFileURL(path.join(__dirname, '..', '..', 'src', 'libs', 'json-p3', 'json-p3.min.js')).href) };
load(['shared-helpers', 'data-paths', 'jsonpath-query']);
const P = Structra.dataPaths;

console.log('data paths');

// JSON text, so that __proto__ becomes an ordinary own key, as it does in a file the user opens
const documentWith = (key, value) => JSON.parse('{' + JSON.stringify(key) + ':' + JSON.stringify(value) + '}');

test('child() writes the usual cases the way people read them', () => {
  eq(P.child('', 'name'), 'name');
  eq(P.child('$', 'name'), '$.name');
  eq(P.child('value[0]', 'Title'), 'value[0].Title');
  eq(P.child('value', 3), 'value[3]');
  eq(P.child('', 3), '[3]');
  eq(P.child('value[0]', '@odata.etag'), 'value[0]["@odata.etag"]');
  eq(P.child('', 'a b'), '["a b"]');
  eq(P.child('$', ''), '$[""]');
});

test('every hostile key reads back to exactly itself, at the start, after a key and after an index', () => {
  for (const key of HOSTILE_KEYS) {
    for (const start of ['', '$', 'a', 'a[2]', '$.a[2]']) {
      const written = P.child(start, key);
      const tokens = P.tokenize(written);
      const last = tokens[tokens.length - 1];
      truthy(last && last.type === 'key' && last.value === key, `key ${JSON.stringify(key).slice(0, 40)} after "${start}" was written ${JSON.stringify(written).slice(0, 60)} and read back as ${JSON.stringify(last).slice(0, 60)}`);
      eq(tokens.length, P.tokenize(start).length + 1, `${JSON.stringify(key).slice(0, 30)} must add exactly one step`);
    }
  }
});

test('every hostile key resolves to its own value, also two levels deep', () => {
  for (const key of HOSTILE_KEYS) {
    const flat = documentWith(key, 'v');
    eq(P.resolve(flat, P.child('', key)), 'v', 'flat ' + JSON.stringify(key).slice(0, 40));
    const deep = { list: [documentWith(key, documentWith(key, 'deep'))] };
    eq(P.resolve(deep, P.child(P.child(P.child('list', 0), key), key)), 'deep', 'deep ' + JSON.stringify(key).slice(0, 40));
  }
});

test('names every object inherits are not found unless the file has them', () => {
  for (const key of ['constructor', 'toString', 'hasOwnProperty', '__proto__', 'prototype']) {
    eq(P.resolve({ a: 1 }, P.child('', key)), undefined, key);
    eq(P.resolve([1, 2], P.child('', key)), undefined, key + ' on a list');
  }
});

test('strip() removes only the root dollar sign', () => {
  eq(P.strip('$'), '');
  eq(P.strip('$.a'), 'a');
  eq(P.strip('$[0].a'), '[0].a');
  eq(P.strip('$a'), '$a');
  eq(P.strip('$ref.b'), '$ref.b');
  eq(P.tokenize('$ref.b').map((t) => t.value), ['$ref', 'b']);
  eq(P.resolve({ $ref: { b: 7 } }, '$ref.b'), 7);
  eq(P.resolve({ $ref: { b: 7 } }, '$.$ref.b'), 7, 'the full form with the root dollar sign also works');
});

test('old paths still read: single quotes, unescaped quotes inside, plain dotted keys', () => {
  eq(P.tokenize("['a.b'].c").map((t) => t.value), ['a.b', 'c']);
  eq(P.tokenize('["a.b"].c').map((t) => t.value), ['a.b', 'c']);
  eq(P.tokenize("value[0]['@odata.etag']").map((t) => t.value), ['value', 0, '@odata.etag']);
  eq(P.tokenize('$.value[0].Title').map((t) => t.value), ['value', 0, 'Title']);
  eq(P.tokenize('a[*].b').map((t) => t.type), ['key', 'wildcard', 'key']);
  eq(P.tokenize('["it\'s"]').map((t) => t.value), ["it's"]);
});

test('json-p3 (RFC 9535) reads what child() writes: same value, and the normalized path points to the same place', async () => {
  for (const key of HOSTILE_KEYS) {
    if (key.length > 1000) continue;
    const document = { list: [documentWith(key, 'target')] };
    const written = P.child(P.child('list', 0), key);
    const hits = await Structra.jsonpathQuery.query(document, P.canonical(written));
    eq(hits.length, 1, 'json-p3 found ' + hits.length + ' for ' + JSON.stringify(key).slice(0, 40) + ' written ' + JSON.stringify(written).slice(0, 60));
    eq(hits[0].value, 'target');
    // and the normalized path json-p3 writes reads back through our reader to the same value
    eq(P.resolve(document, hits[0].path), 'target', 'normalized path ' + JSON.stringify(hits[0].path).slice(0, 60));
  }
});

test('expressions for Power Automate and Power Fx keep every key', () => {
  for (const key of ['@odata.etag', "it's", 'a b', '']) {
    const written = P.child('value[0]', key);
    truthy(P.powerAutomate(written).endsWith("?['" + key.replace(/'/g, "''") + "']"), 'Power Automate ' + key);
    truthy(P.powerFx(written).length > 0);
  }
});

test('splitAtItem keeps odd keys in the list path', () => {
  const at = P.splitAtItem(P.child(P.child('d', '@odata.list'), 0) + '.x');
  eq(at.listPath, 'd["@odata.list"]');
  eq(P.tokenize(at.listPath).map((t) => t.value), ['d', '@odata.list']);
});
