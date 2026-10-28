/* The JSON Patch (RFC 6902) that Compare exports is written by our own code (Structra.jsonRepairAndValidation.patch). An independent
   implementation, fast-json-patch (MIT, a dev dependency), applies it: patching the left document must give exactly the right one.
   Documents: every valid text of JSONTestSuite (tests/suites/json-test-suite), taken in pairs, so lists, nested objects, empty keys, keys with
   ~ and /, numbers, unicode and null all meet each other. Also checked: the patch of two equal documents is empty, and patching does not
   change the left document the person still has on screen. */
const fs = require('fs');
const path = require('path');
const { load, test, eq, truthy } = require('./harness');
const { clone } = require('./test-utils');
const jsonpatch = require('fast-json-patch');

const { pathToFileURL } = require('url');
load(['shared-helpers', 'data-paths', 'json-repair-and-validation', 'json-diff']);
const patch = (from, to) => Structra.jsonRepairAndValidation.patch(from, to);

const suite = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'suites', 'json-test-suite', 'cases.json'), 'utf8'));
const documents = [];
for (const item of suite.cases) {
  if (item.kind === 'n') continue;
  try { documents.push({ name: item.name, value: JSON.parse(new TextDecoder('utf-8').decode(Buffer.from(item.base64, 'base64'))) }); } catch { /* not valid: not a document */ }
}

// Differences found in smart mode are listed here with their count; see the comment at the test
const KNOWN_SMART_WRONG = 0;
const KNOWN_SMART_REFUSED = 0;

console.log('json patch round trip');

test('there are enough documents to make the test mean something', () => {
  truthy(documents.length >= 120, 'found ' + documents.length);
});

test('patching the left with the exported patch gives the right, for every pair of documents', () => {
  const wrong = [];
  const refused = [];
  let pairs = 0;
  for (const left of documents) {
    for (const right of documents) {
      pairs++;
      const operations = patch(left.value, right.value);
      let result;
      try { result = jsonpatch.applyPatch(clone(left.value), clone(operations)).newDocument; }
      catch (error) { refused.push(`${left.name} -> ${right.name}: ${String(error.message).slice(0, 70)}`); continue; }
      if (JSON.stringify(result) !== JSON.stringify(right.value)) wrong.push(`${left.name} -> ${right.name}`);
    }
  }
  console.log(`        ${pairs} pairs, ${wrong.length} wrong, ${refused.length} refused by the other implementation`);
  if (process.env.SHOW_SUITE_FAILURES) console.log(wrong.concat(refused).slice(0, 40).map((line) => '          ' + line).join('\n'));
  eq([wrong.length, refused.length], [0, 0]);
});

test('equal documents give an empty patch, and the left document is not changed by making the patch', () => {
  for (const { value } of documents) {
    const before = JSON.stringify(value);
    eq(patch(value, structuredClone(value)), []);   // structuredClone keeps 1e400 (Infinity), which a JSON round trip would turn into null
    eq(JSON.stringify(value), before);
  }
});

test('keys with ~ and / are written the way the standard says (~0 and ~1)', () => {
  const operations = patch({}, { 'a/b': 1, 'c~d': 2 });
  eq(operations.map((operation) => operation.path).sort(), ['/a~1b', '/c~0d']);
});

// Compare's "smart" mode matches the items of a list (jsondiffpatch) and writes its changes as JSON Patch through the library's formatter.
// The same independent check on a sample of pairs: the neighbours in the list, and every 7th pair of documents.
test('Compare in smart mode: its JSON Patch also gives the right document when applied by another implementation', async () => {
  const lib = path.join(__dirname, '..', '..', 'src', 'libs', 'jsondiffpatch');
  Structra.jsonDiff.use(await import(pathToFileURL(path.join(lib, 'index.js')).href), await import(pathToFileURL(path.join(lib, 'formatters', 'jsonpatch.js')).href));
  const wrong = [];
  const refused = [];
  let pairs = 0;
  const check = async (left, right) => {
    pairs++;
    const result = await Structra.jsonDiff.compare(left.value, right.value);
    const operations = await Structra.jsonDiff.patchOps(result, left.value, right.value);
    let patched;
    try { patched = jsonpatch.applyPatch(clone(left.value), clone(operations)).newDocument; }
    catch (error) { refused.push(`${left.name} -> ${right.name} (${result.mode}): ${String(error.message).slice(0, 60)}`); return; }
    if (JSON.stringify(patched) !== JSON.stringify(right.value)) wrong.push(`${left.name} -> ${right.name} (${result.mode})`);
  };
  for (let i = 0; i < documents.length; i++) await check(documents[i], documents[(i + 1) % documents.length]);
  for (let i = 0; i < documents.length; i += 1) for (let j = (i % 7); j < documents.length; j += 7) if (i !== j) await check(documents[i], documents[j]);
  console.log(`        ${pairs} pairs, ${wrong.length} wrong, ${refused.length} refused by the other implementation`);
  if (process.env.SHOW_SUITE_FAILURES) console.log(wrong.concat(refused).slice(0, 40).map((line) => '          ' + line).join('\n'));
  eq([wrong.length, refused.length], [KNOWN_SMART_WRONG, KNOWN_SMART_REFUSED]);
});
