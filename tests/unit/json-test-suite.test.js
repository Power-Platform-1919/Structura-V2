/* JSONTestSuite (https://github.com/nst/JSONTestSuite, MIT, commit in tests/suites/json-test-suite/cases.json): 318 texts that parsers
   must accept (y_), must reject (n_) or may do either with (i_). They are the cases nobody thinks of: lone surrogates, deep nesting,
   odd numbers, bad escapes, byte order marks, invalid UTF-8.

   Two things of ours run on every case, as the app runs them:
     1. the parse path (Structra.parseJsonAsync): a text it accepts must be one the standard accepts, and the other way round;
     2. the error place (Structra.jsonRepairAndValidation.explainParseError, made with jsonc-parser): a text that is rejected must get a
        place and a reason, and a text that is accepted must get none.
   The counts below are written down; a change fails the test, so a difference is looked at and either fixed or explained. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { load, test, eq, truthy } = require('./harness');

vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'libs', 'jsonc-parser.min.js'), 'utf8') + ';globalThis.JSONC = JSONC;');
Structra.libraryLoader = { loadLibrary: async () => {} };
Structra.sharedHelpers = { waitForNextTick: async () => {} };
global.performance = global.performance || { now: () => Date.now() };
// worker-pool.js defines parseJsonAsync; it needs the pool factory only when a pool is created, so load just the two functions it uses
const poolSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'worker-pool.js'), 'utf8');
const start = poolSource.indexOf('Structra.protectBigNumbers = function');
const end = poolSource.indexOf('/* ---------- CSV Worker Pool');
new Function(poolSource.slice(start, end)).call(global);
load(['data-paths', 'json-repair-and-validation']);

const suite = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'suites', 'json-test-suite', 'cases.json'), 'utf8'));
const decode = (base64) => new TextDecoder('utf-8').decode(Buffer.from(base64, 'base64'));   // the way the app reads a file's text

console.log('JSONTestSuite');

async function run() {
  const rows = [];
  for (const item of suite.cases) {
    const text = decode(item.base64);
    let parsed = true;
    try { await Structra.parseJsonAsync(text); } catch { parsed = false; }
    let place = null;
    let explainError = null;
    try { place = await Structra.jsonRepairAndValidation.explainParseError(text); } catch (error) { explainError = error.message; }
    rows.push({ name: item.name, kind: item.kind, parsed, place, explainError });
  }
  return rows;
}

// Differences that are understood. Each entry says why. A new difference is not allowed to appear without being added here.
const KNOWN = {
  // the parse path
  parseAcceptsButMustReject: [],
  parseRejectsButMustAccept: [],
  // the error place
  noPlaceForRejectedText: [],
  placeForAcceptedText: [],
};

test('the parse path accepts every text the standard says must be accepted', async () => {
  const rows = await run();
  const wrong = rows.filter((row) => row.kind === 'y' && !row.parsed).map((row) => row.name);
  eq(wrong, KNOWN.parseRejectsButMustAccept);
});

test('the parse path rejects every text the standard says must be rejected', async () => {
  const rows = await run();
  const wrong = rows.filter((row) => row.kind === 'n' && row.parsed).map((row) => row.name);
  eq(wrong, KNOWN.parseAcceptsButMustReject);
});

test('every rejected text gets a place and a reason', async () => {
  const rows = await run();
  const wrong = rows.filter((row) => !row.parsed && !row.place).map((row) => row.name + (row.explainError ? ' (error: ' + row.explainError + ')' : ''));
  eq(wrong, KNOWN.noPlaceForRejectedText);
});

test('an accepted text never gets an error place', async () => {
  const rows = await run();
  const wrong = rows.filter((row) => row.parsed && row.place).map((row) => row.name);
  eq(wrong, KNOWN.placeForAcceptedText);
});

test('the counts are as recorded', async () => {
  const rows = await run();
  const count = (kind, parsed) => rows.filter((row) => row.kind === kind && row.parsed === parsed).length;
  console.log(`        y accepted ${count('y', true)}/${rows.filter((r) => r.kind === 'y').length}, n rejected ${count('n', false)}/${rows.filter((r) => r.kind === 'n').length}, i accepted ${count('i', true)} rejected ${count('i', false)}`);
  truthy(rows.length === 318, 'expected 318 cases, found ' + rows.length);
});
