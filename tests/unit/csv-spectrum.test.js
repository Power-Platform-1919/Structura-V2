/* csv-spectrum (https://github.com/maxogden/csv-spectrum, BSD-2-Clause): the awkward CSV files every parser gets wrong somewhere:
   commas and quotes inside quotes, line breaks inside quotes, CRLF, an empty file, JSON in a cell, UTF-8.
   The real worker (src/workers/csv-parse-worker.js) runs on each file, as it does when a file is opened, and its rows are compared with
   the rows the authors say a parser must give. Our worker also types the cells (a number becomes a number, an empty cell becomes null,
   decimals are remembered), so each cell is compared as text the way a person would read it.
   Then the rows are written back with Structra.formatConversion.generateCsv and read again: nothing may change (round trip). */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { load, test, eq, truthy } = require('./harness');

global.Papa = require('../../src/libs/papaparse.min.js');
load(['format-conversion']);

const suite = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'suites', 'csv-spectrum', 'cases.json'), 'utf8'));
const LIBS = path.join(__dirname, '..', '..', 'src', 'libs');

/** Run the real worker file on one text and return what it posts back */
function parseWithWorker(text) {
  let handler = null;
  let posted = null;
  const context = {
    console: { log() {}, warn() {}, error() {} },
    performance: { now: () => Date.now() },
    postMessage: (message) => { posted = message; },
    importScripts: (...files) => { for (const file of files) vm.runInContext(fs.readFileSync(path.join(LIBS, path.basename(file)), 'utf8'), context); },
  };
  context.self = context;
  context.addEventListener = (type, fn) => { if (type === 'message') handler = fn; };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'workers', 'csv-parse-worker.js'), 'utf8'), context);
  handler({ data: { id: 1, text } });
  return posted;
}

// A cell as a person reads it: empty for null, the decimals kept for a number that had them
function cellText(value, field, decimals) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' && decimals && decimals[field] !== undefined) return value.toFixed(decimals[field]);
  return String(value);
}

// The suite disagrees with itself in one place: location_coordinates.csv has the phone number 2095257564 and its json file says 1234567890.
// The CSV is the input, so the parser is right to give 2095257564; the expected rows are corrected here and nowhere else.
const UPSTREAM_FIX = { location_coordinates: (rows) => rows.map((row) => ({ ...row, 'Contact Phone Number': '2095257564' })) };
const expectedOf = (item) => (UPSTREAM_FIX[item.name] ? UPSTREAM_FIX[item.name]([].concat(item.expected)) : [].concat(item.expected));

console.log('csv-spectrum');

const results = suite.cases.map((item) => {
  const text = Buffer.from(item.csvBase64, 'base64').toString('utf8');
  const answer = parseWithWorker(text);
  return { item, text, answer };
});

for (const { item, text, answer } of results) {
  test(`${item.name}: the rows are the ones the authors expect`, () => {
    truthy(answer && answer.success, 'the worker failed: ' + JSON.stringify(answer));
    const decimals = answer.meta && answer.meta.decimals;
    const got = answer.data.map((row) => Object.fromEntries(Object.keys(row).map((field) => [field, cellText(row[field], field, decimals)])));
    eq(got, expectedOf(item));
  });

  test(`${item.name}: written back and read again, nothing changes`, () => {
    const decimals = answer.meta && answer.meta.decimals;
    const fields = answer.meta.fields;
    const written = Structra.formatConversion.generateCsv(answer.data.map((row) => Object.fromEntries(fields.map((field) => [field, row[field] === null || typeof row[field] === 'number' ? cellText(row[field], field, decimals) : row[field]]))), fields);
    const again = Papa.parse(written, { header: true, skipEmptyLines: true }).data;
    eq(again, expectedOf(item));
    truthy(text.length > 0);
  });
}
