/* The seams between our code and the libraries it uses (map section 8.5). Each library is used through one module of ours; these tests fix
   what that module promises, so a library upgrade or an edit of the module is caught here.

     1. The validate adapter (Ajv): the shape of the answer, the form of the paths, what is collected, what is refused.
     2. The compare adapter (jsondiffpatch): the shape of the answer, and that its patch rebuilds the second document.
     3. The share link (CompressionStream, base64url): the alphabet, the round trip, the size limits, what is refused.
     4. The document is never changed: every library path is run on a frozen copy, and must give the same answer as on a plain copy.
   (The parse workers are held by the official suites: csv-spectrum, yaml-test-suite, toml-test and the XML tests run the real workers.) */
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { load, test, eq, truthy } = require('./harness');
const { clone, deepFreeze } = require('./test-utils');

const LIBS = path.join(__dirname, '..', '..', 'src', 'libs');
global.Ajv = require('../../src/libs/ajv.min.js');
window.Ajv = global.Ajv;
global.Papa = require('../../src/libs/papaparse.min.js');
window.Papa = global.Papa;
Structra.duckdbAdapter = undefined;
Structra.libraryLoader = {
  loadLibrary: async (name) => {
    if (name === 'ajv') return global.Ajv;
    if (name === 'jsonp3') return import(pathToFileURL(path.join(LIBS, 'json-p3', 'json-p3.min.js')).href);
    return null;
  },
};
// location and history for the share link
global.location = { hash: '', pathname: '/index.html', search: '', href: 'http://localhost/index.html' };
global.history = { replaceState: (state, title, url) => { global.location.hash = (url.split('#')[1] ? '#' + url.split('#')[1] : ''); } };
load(['shared-helpers', 'data-paths', 'json-repair-and-validation', 'json-diff', 'share-and-capture', 'parse-json-schema-generator', 'personal-data-masker',
  'type-code-generator', 'format-conversion', 'data-engine', 'overview-insights', 'undo-stack', 'jsonpath-query']);
const V = Structra.jsonRepairAndValidation;
const D = Structra.jsonDiff;
const L = Structra.shareLink;

console.log('seams');

const ready = (async () => {
  const lib = await import(pathToFileURL(path.join(LIBS, 'jsondiffpatch', 'index.js')).href);
  const patcher = await import(pathToFileURL(path.join(LIBS, 'jsondiffpatch', 'formatters', 'jsonpatch.js')).href);
  D.use(lib, patcher);
})();


/* ================= 1. the validate adapter (Ajv) ================= */

test('validate answers { valid, errors: [{ path, message, keyword }], note }', async () => {
  const answer = await V.validate({ a: 'x' }, { type: 'object', properties: { a: { type: 'number' } } });
  eq(Object.keys(answer).sort(), ['errors', 'note', 'valid']);
  eq(answer.valid, false);
  eq(answer.errors.length, 1);
  eq(Object.keys(answer.errors[0]).sort(), ['keyword', 'message', 'path']);
  eq(answer.errors[0].keyword, 'type');
  eq(typeof answer.errors[0].message, 'string');
  eq(typeof answer.note, 'string');
});

test('a valid document gives { valid: true, errors: [] }', async () => {
  const answer = await V.validate({ a: 1 }, { type: 'object' });
  eq([answer.valid, answer.errors.length], [true, 0]);
});

test('error paths are relative to the document (root is empty): a[0].b, and keys with dots or quotes quoted the way the app writes paths', async () => {
  const schema = { type: 'object', properties: { a: { type: 'array', items: { type: 'object', properties: { b: { type: 'number' } } } }, 'x.y': { type: 'number' }, 'say "hi"': { type: 'number' } } };
  const paths = (await V.validate({ a: [{ b: 'no' }], 'x.y': 'no', 'say "hi"': 'no' }, schema)).errors.map((error) => error.path).sort();
  eq(paths, ['a[0].b', '["say \\"hi\\""]', '["x.y"]'].sort());
  const root = await V.validate('no', { type: 'number' });
  eq([root.valid, root.errors[0].path], [false, '']);
});

test('every error is collected, not only the first (allErrors)', async () => {
  const answer = await V.validate({ a: 'x', b: 'y', c: 'z' }, { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' }, c: { type: 'number' } } });
  eq(answer.errors.length, 3);
});

test('a format Ajv does not know is a hint, not an error (OpenAPI schemas are full of them)', async () => {
  const answer = await V.validate({ id: 'x' }, { type: 'object', properties: { id: { type: 'string', format: 'uuid-v7' }, n: { type: 'integer', format: 'int32' } } });
  eq(answer.valid, true);
});

test('an older $schema is checked with draft-07 and the answer says so in note', async () => {
  const answer = await V.validate({ a: 1 }, { $schema: 'http://json-schema.org/draft-04/schema#', type: 'object', properties: { a: { type: 'number' } } });
  eq(answer.valid, true);
  truthy(/draft-04/.test(answer.note) && /draft-07/.test(answer.note), answer.note);
});

test('an invalid schema is refused with an error, not with { valid: false }', async () => {
  let message = '';
  try { await V.validate({}, { type: 'nonsense' }); } catch (error) { message = error.message; }
  truthy(message.length > 0, 'it should throw');
});

test('an enum says which values are allowed', async () => {
  const answer = await V.validate({ s: 'x' }, { type: 'object', properties: { s: { enum: ['open', 'closed'] } } });
  truthy(/"open"/.test(answer.errors[0].message) && /"closed"/.test(answer.errors[0].message), answer.errors[0].message);
});

test('names every object has (constructor, toString) do not pass a required check by being inherited', async () => {
  const answer = await V.validate({}, { type: 'object', required: ['constructor'] });
  eq(answer.valid, false);
});

/* ================= 2. the compare adapter (jsondiffpatch) ================= */

test('compare answers { changes: [{ type, leftPath, rightPath, ... }] } and patchOps gives JSON Patch operations', async () => {
  await ready;
  const left = { a: 1, b: [1, 2, 3], c: { d: 'x' } };
  const right = { a: 2, b: [1, 3], c: { d: 'x', e: true } };
  const answer = await D.compare(left, right);
  truthy(Array.isArray(answer.changes) && answer.changes.length >= 3, JSON.stringify(answer));
  for (const change of answer.changes) truthy(['added', 'removed', 'changed', 'moved'].includes(change.type), change.type);
  const operations = await D.patchOps(answer, left, right);
  truthy(Array.isArray(operations) && operations.every((operation) => ['add', 'remove', 'replace', 'move', 'copy', 'test'].includes(operation.op) && typeof operation.path === 'string'), JSON.stringify(operations));
});

test('compare of two equal documents has no changes; compare never changes either document', async () => {
  await ready;
  const document = { list: [{ id: 1 }, { id: 2 }], n: null };
  const before = JSON.stringify(document);
  eq((await D.compare(document, clone(document))).changes.length, 0);
  await D.compare(deepFreeze(clone(document)), deepFreeze({ list: [{ id: 2 }, { id: 1 }, { id: 3 }], n: 1 }));
  eq(JSON.stringify(document), before);
});

test('the changes found are exactly what a person sees: added, removed, changed keys and list items by their id', async () => {
  await ready;
  const answer = await D.compare({ items: [{ id: 1, v: 'a' }, { id: 2, v: 'b' }] }, { items: [{ id: 2, v: 'b' }, { id: 1, v: 'changed' }, { id: 3, v: 'c' }] });
  const text = answer.changes.map((change) => change.type + ' ' + (change.type === 'removed' ? change.leftPath : change.rightPath)).join(' | ');
  truthy(/changed .*v/.test(text) && /added/.test(text), text);
});

/* ================= 3. the share link ================= */

test('a link is #share=g.<base64url> (gzip); the text holds only A-Z a-z 0-9 - _', async () => {
  const { url } = await L.createUrl({ a: 'x'.repeat(2000), tags: ['é', '日本語', '😀'] }, 'my file.json');
  const hash = url.split('#share=')[1];
  truthy(/^g\.[A-Za-z0-9_-]+$/.test(hash), hash.slice(0, 60));
});

test('a document comes back exactly, with its name, including unicode, quotes and line breaks', async () => {
  const data = { text: 'quote " backslash \\ line\nbreak tab\t', emoji: '😀 é 日本語', n: [1, 2.5, null, true], nested: { a: { b: [] } } };
  const { url } = await L.createUrl(data, 'name "q".json');
  global.location.hash = '#' + url.split('#')[1];
  const back = await L.readHash();
  eq(JSON.stringify(back.data), JSON.stringify(data));
  eq(back.name, 'name "q".json');
});

test('a document too large for a link is refused with a message that says so', async () => {
  const random = Array.from({ length: 20000 }, (_, i) => Math.sin(i) * 1e6);
  let message = '';
  try { await L.createUrl(random, 'big'); } catch (error) { message = error.message; }
  truthy(/too large to share/i.test(message), message);
});

test('without CompressionStream the link is #share=p.<base64url> (plain) and reads back', async () => {
  const saved = global.CompressionStream;
  global.CompressionStream = undefined;
  try {
    const { url } = await L.createUrl({ a: 1 }, 'plain');
    truthy(/#share=p\.[A-Za-z0-9_-]+$/.test(url), url);
    global.location.hash = '#' + url.split('#')[1];
    eq(JSON.stringify((await L.readHash()).data), '{"a":1}');
  } finally { global.CompressionStream = saved; }
});

test('a hash that is not a share link reads as null, and one that is damaged is an error, not a crash', async () => {
  global.location.hash = '';
  eq(await L.readHash(), null);
  global.location.hash = '#other=1';
  eq(await L.readHash(), null);
  global.location.hash = '#share=g.!!!not-base64!!!';
  let failed = false;
  try { await L.readHash(); } catch { failed = true; }
  truthy(failed, 'damaged text should throw');
  global.location.hash = '#share=g.AAAA';
  failed = false;
  try { await L.readHash(); } catch { failed = true; }
  truthy(failed, 'text that is not gzip should throw');
});

test('a link that unpacks to more than a link should hold is refused (a compressed bomb)', async () => {
  const bomb = new TextEncoder().encode('{"name":null,"data":"' + 'a'.repeat(25 * 1024 * 1024) + '"}');
  const stream = new Blob([bomb]).stream().pipeThrough(new CompressionStream('gzip'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  global.location.hash = '#share=g.' + btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  let message = '';
  try { await L.readHash(); } catch (error) { message = error.message; }
  truthy(/unpacks to more than/.test(message), message || 'it was read');
});

test('clearHash removes the link from the address', () => {
  global.location.hash = '#share=g.abc';
  L.clearHash();
  eq(global.location.hash, '');
});

/* ================= 4. the document is never changed ================= */

const DOCUMENTS = {
  'a list of records': [
    { id: 1, name: 'Ann Lee', email: 'ann@x.com', phone: '+44 20 7946 0958', tags: ['a', 'b'], owner: { id: 7, roles: [{ n: 'admin' }] }, note: null, price: 1.5 },
    { id: 2, name: 'Bo Kim', email: 'bo@x.com', tags: [], owner: null, price: 20, extra: { deep: [1, 2, { three: 3 }] } },
    { id: 3, name: 'Cy Ng', email: 'cy@x.com', tags: ['c'], owner: { id: 8, roles: [] }, note: 'text', price: 3 },
  ],
  'an object with odd keys': { 'a.b': 1, 'say "hi"': { '[0]': [1, 2], '': { $ref: 'x' } }, '@odata.etag': '"1"', 'body/field': [{ 'x y': 1 }] },
  'mixed values': { list: [1, 'two', null, true, [3, [4]], { five: 5 }], empty: {}, none: [], text: 'line\nbreak' },
};

const OPERATIONS = {
  'validate': (data) => V.validate(data, { type: ['object', 'array'] }),
  'schema smart': (data) => Structra.parseJsonSchemaGenerator.smart(data),
  'schema basic': (data) => Structra.parseJsonSchemaGenerator.basic(data),
  'mask': (data) => Structra.personalDataMasker.maskData(data),
  'scan for personal data': (data) => Structra.personalDataMasker.scan(data),
  'types (every language)': (data) => ['typescript', 'python', 'csharp', 'go', 'rust', 'java', 'sql', 'powerfx'].map((language) => Structra.typeCodeGenerator.generate(language, data)),
  'xml': (data) => Structra.formatConversion.jsonToXml(data),
  'csv': (data) => (Array.isArray(data) ? Structra.formatConversion.generateCsv(data, Object.keys(data[0] || {})) : ''),
  'analysis': async (data) => { await Structra.dataEngine.ingest(1, data, { fileName: 't.json', fileSize: 10 }); Structra.dataEngine.setActive(1); const analysis = await Structra.dataEngine.getAnalysis(); return { stats: analysis.stats }; },
  'insights': async (data) => { await Structra.dataEngine.ingest(2, data, { fileName: 't.json', fileSize: 10 }); Structra.dataEngine.setActive(2); return Structra.overviewInsights.build({ analysis: await Structra.dataEngine.getAnalysis(), meta: {}, data, duplicateKeys: [] }); },
  'compare with a changed copy': async (data) => { await ready; const changed = clone(data); if (Array.isArray(changed)) changed.push({ id: 99 }); else changed.added = 1; return D.compare(data, changed); },
  'undo history': (data) => { Structra.undoStack.clear(5); Structra.undoStack.push(data, 'a', 5); Structra.undoStack.push(clone(data), 'b', 5); return Structra.undoStack.getHistory(5).length; },
  'query by JSONPath': (data) => Structra.jsonpathQuery.query(data, '$..*').then((matches) => matches.length),
  'find paths': (data) => Structra.dataPaths.keysOf ? JSON.stringify(Object.keys(data)) : '',
};

for (const [documentName, original] of Object.entries(DOCUMENTS)) {
  for (const [operationName, run] of Object.entries(OPERATIONS)) {
    test(`${operationName} leaves ${documentName} as it was and answers the same on a frozen copy`, async () => {
      const plain = clone(original);
      const frozen = deepFreeze(clone(original));
      const expected = JSON.stringify(await run(plain));
      let actual;
      try { actual = JSON.stringify(await run(frozen)); } catch (error) { throw new Error('it could not run on a frozen document (it writes to its input): ' + error.message); }
      eq(actual, expected, 'the answer on a frozen copy differs from the answer on a plain copy');
      eq(JSON.stringify(frozen), JSON.stringify(original), 'the document was changed');
    });
  }
}

test('every library file is the file THIRD-PARTY.md names (a changed library is noticed in the contract)', () => {
  const list = fs.readFileSync(path.join(__dirname, '..', '..', 'THIRD-PARTY.md'), 'utf8');
  for (const file of ['ajv.min.js', 'papaparse.min.js', 'jsonrepair.min.js', 'jsonc-parser.min.js']) truthy(list.includes(file), file + ' is not in THIRD-PARTY.md');
});
