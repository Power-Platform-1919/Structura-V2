/* toml-test (https://github.com/toml-lang/toml-test, MIT), the cases for TOML 1.0.0: texts a parser must accept (valid, with the value
   it must give) and texts it must reject (invalid). Our real worker (src/workers/toml-parse-worker.js, which runs the vendored toml
   library) is run on each, as it is when a TOML file is opened.

   The library gives plain JavaScript values, so the comparison is loose where JavaScript cannot tell the difference: 1 and 1.0 are both a
   number, and a date with a time zone is compared by the moment it names. Dates and times without a zone are only checked to exist.
   The counts are written down. A change fails the test, so a difference is looked at. Run with SHOW_SUITE_FAILURES=1 for the list.
   The same file is how the planned upgrade to TOML 5 (task 21.2) is measured: the numbers for both versions are in the map, section 8.7. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, eq } = require('./harness');
const { runWorker } = require('./test-utils');

const suite = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'suites', 'toml-test', 'cases.json'), 'utf8'));
const LIBRARY = process.env.TOML_LIBRARY_FILE || path.join(__dirname, '..', '..', 'src', 'libs', 'toml.min.js');

/** Run the real worker file on one text and return what it posts back (the library file can be named by TOML_LIBRARY_FILE, to try another build) */
const parseWithWorker = (text) => runWorker('toml-parse-worker.js', { id: 1, text }, { libs: [LIBRARY] });

/** The suite writes every value as { type, value }; turn that into the plain value a JavaScript parser can give */
function untag(node) {
  if (Array.isArray(node)) return node.map(untag);
  if (node && typeof node === 'object') {
    const keys = Object.keys(node);
    if (keys.length === 2 && typeof node.type === 'string' && 'value' in node) {
      switch (node.type) {
        case 'string': return node.value;
        case 'integer': return Number(node.value);
        case 'float': return node.value === 'nan' || node.value === '+nan' || node.value === '-nan' ? NaN : node.value === 'inf' || node.value === '+inf' ? Infinity : node.value === '-inf' ? -Infinity : Number(node.value);
        case 'bool': return node.value === 'true';
        default: return { moment: node.value, kind: node.type };     // datetime, datetime-local, date-local, time-local
      }
    }
    return Object.fromEntries(keys.map((key) => [key, untag(node[key])]));
  }
  return node;
}

/** The first place where the two differ, or null */
function difference(actual, expected, where = '$') {
  if (expected && typeof expected === 'object' && 'moment' in expected && 'kind' in expected) {
    if (expected.kind !== 'datetime') return actual === undefined ? where + ' is missing' : null;     // no zone: only check that something is there
    const when = actual instanceof Date ? actual.getTime() : Date.parse(String(actual));
    return when === Date.parse(expected.moment) ? null : `${where}: moment ${actual} is not ${expected.moment}`;
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return where + ' should be a list';
    if (actual.length !== expected.length) return `${where}: ${actual.length} items, expected ${expected.length}`;
    for (let i = 0; i < expected.length; i++) { const found = difference(actual[i], expected[i], `${where}[${i}]`); if (found) return found; }
    return null;
  }
  if (expected && typeof expected === 'object') {
    if (!actual || typeof actual !== 'object' || Array.isArray(actual) || actual instanceof Date) return where + ' should be a table';
    const expectedKeys = Object.keys(expected);
    const actualKeys = Object.keys(actual);
    if (expectedKeys.length !== actualKeys.length) return `${where}: keys ${actualKeys.join(',')} instead of ${expectedKeys.join(',')}`;
    for (const key of expectedKeys) { if (!(key in actual)) return `${where}.${key} is missing`; const found = difference(actual[key], expected[key], `${where}.${key}`); if (found) return found; }
    return null;
  }
  if (typeof expected === 'number') return Object.is(actual, expected) || (Number.isNaN(actual) && Number.isNaN(expected)) || (actual === expected) ? null : `${where}: ${actual} is not ${expected}`;
  return actual === expected ? null : `${where}: ${JSON.stringify(actual)} is not ${JSON.stringify(expected)}`;
}

console.log('toml-test');

function run() {
  const result = { valid: 0, validAccepted: 0, validRight: 0, invalid: 0, invalidRejected: 0, wrongValue: [], rejectedButValid: [], acceptedButInvalid: [] };
  for (const item of suite.cases) {
    const text = Buffer.from(item.tomlBase64, 'base64').toString('utf8');
    const answer = parseWithWorker(text);
    if (item.kind === 'valid') {
      result.valid++;
      if (!answer.success) { result.rejectedButValid.push(item.name); continue; }
      result.validAccepted++;
      const found = difference(answer.data, untag(item.expected));
      if (found) result.wrongValue.push(`${item.name}: ${found}`); else result.validRight++;
    } else {
      result.invalid++;
      if (answer.success) result.acceptedButInvalid.push(item.name); else result.invalidRejected++;
    }
  }
  return result;
}

// Written down on 2026-10-28 for toml 4.1.1 (the vendored version). The upgrade to toml 5 is measured with TOML_LIBRARY_FILE (map, 8.7).
// What differs, and why (list them with SHOW_SUITE_FAILURES=1):
//   - empty text: our worker refuses an empty file on purpose ("No TOML input")
//   - 3 dates: the library drops fractional seconds (.123) and mis-places year 0001 with a time zone
//   - 15 invalid texts accepted: 8 are TOML 1.1 forms the library allows (times without seconds, line breaks and a trailing comma in an
//     inline table, byte escapes); 7 are invalid UTF-8, which cannot reach a parser as text (the file reader replaces the bytes first)
// Measured with the same cases: toml 5.0.1 accepts 206, right 203, rejects 494; smol-toml 1.9.1 (TOML 1.1) 206, 203, 488.
const EXPECTED = { valid: 208, validAccepted: 207, validRight: 204, invalid: 509, invalidRejected: 494 };

test('TOML 1.0.0 accept, reject and value counts are as recorded', () => {
  const result = run();
  const summary = { valid: result.valid, validAccepted: result.validAccepted, validRight: result.validRight, invalid: result.invalid, invalidRejected: result.invalidRejected };
  console.log('        ' + JSON.stringify(summary));
  if (process.env.SHOW_SUITE_FAILURES) {
    console.log('        rejected but valid (' + result.rejectedButValid.length + '):\n          ' + result.rejectedButValid.join('\n          '));
    console.log('        wrong value (' + result.wrongValue.length + '):\n          ' + result.wrongValue.join('\n          '));
    console.log('        accepted but invalid (' + result.acceptedButInvalid.length + '):\n          ' + result.acceptedButInvalid.join('\n          '));
  }
  eq(summary, EXPECTED);
});
