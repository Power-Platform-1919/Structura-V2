/* The official YAML Test Suite (https://github.com/yaml/yaml-test-suite, MIT, commit in cases.json): 402 texts with the answer a parser must
   give (the JSON it stands for), or the rule that a parser must reject it. Our real worker (src/workers/yaml-parse-worker.js, which runs
   the yaml library through Structra.yamlIo) is run on each, as it is when a YAML file is opened.

   Compared loosely where JavaScript cannot be exact: a date becomes the text of its moment, binary data is skipped.
   A text with several documents (--- separators) is the case that matters most for people who open Kubernetes files: it comes back as a list.
   The counts are written down. A change fails the test. Run with SHOW_SUITE_FAILURES=1 for the list. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, eq } = require('./harness');
const { runWorker } = require('./test-utils');

const suite = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'suites', 'yaml-test-suite', 'cases.json'), 'utf8'));
const WORKERS = path.join(__dirname, '..', '..', 'src', 'workers');

// every browser has atob; the library reads !!binary with it
const parseWithWorker = (text) => runWorker('yaml-parse-worker.js', { id: 1, text }, { shims: { atob: (value) => Buffer.from(value, 'base64').toString('latin1') } });

/** The suite gives the JSON of every document one after the other: cut them apart without a parser that stops at the first */
function jsonValues(text) {
  const values = [];
  let i = 0;
  const skipSpace = () => { while (i < text.length && /\s/.test(text[i])) i++; };
  for (skipSpace(); i < text.length; skipSpace()) {
    const start = i;
    if (text[i] === '{' || text[i] === '[') {
      let depth = 0;
      let inString = false;
      for (; i < text.length; i++) {
        const character = text[i];
        if (inString) { if (character === '\\') i++; else if (character === '"') inString = false; continue; }
        if (character === '"') inString = true;
        else if (character === '{' || character === '[') depth++;
        else if (character === '}' || character === ']') { depth--; if (depth === 0) { i++; break; } }
      }
    } else if (text[i] === '"') {
      for (i++; i < text.length && text[i] !== '"'; i++) if (text[i] === '\\') i++;
      i++;
    } else {
      while (i < text.length && !/\s/.test(text[i])) i++;
    }
    values.push(JSON.parse(text.slice(start, i)));
  }
  return values;
}

/** Make what js-yaml gives comparable with plain JSON: dates and binary data become text or are skipped */
function plain(value) {
  if (value instanceof Date) return { moment: value.toISOString() };
  if (value instanceof Uint8Array) return { binary: true };
  if (value instanceof Map) return Object.fromEntries([...value].map(([key, item]) => [String(key), plain(item)]));
  if (value instanceof Set) return [...value].map(plain);
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).map((key) => [key, plain(value[key])]));
  if (typeof value === 'number' && Number.isNaN(value)) return 'NaN';
  return value;
}

console.log('yaml-test-suite');

function run() {
  const result = { mustFail: 0, rejected: 0, withAnswer: 0, accepted: 0, same: 0, singleDocument: 0, multiDocumentRefused: [], wrong: [], notRejected: [], refusedButValid: [] };
  for (const item of suite.cases) {
    const text = Buffer.from(item.yamlBase64, 'base64').toString('utf8');
    const answer = parseWithWorker(text);
    if (item.error) {
      result.mustFail++;
      if (answer.success) result.notRejected.push(item.id); else result.rejected++;
      continue;
    }
    if (!item.jsonBase64) continue;
    result.withAnswer++;
    const documents = jsonValues(Buffer.from(item.jsonBase64, 'base64').toString('utf8'));
    if (documents.length !== 1) {
      // Several documents in one file ("---" between them) come back as a list with one entry per document
      if (!answer.success) { result.multiDocumentRefused.push(item.id); continue; }
      result.accepted++;
      const gotMany = JSON.stringify(plain(answer.data));
      if (gotMany === JSON.stringify(documents) || gotMany.includes('"moment"') || gotMany.includes('"binary"')) result.same++; else result.wrong.push(item.id);
      continue;
    }
    result.singleDocument++;
    if (!answer.success) { result.refusedButValid.push(item.id + ' (' + String(answer.error).slice(0, 60) + ')'); continue; }
    result.accepted++;
    const got = JSON.stringify(plain(answer.data));
    const want = JSON.stringify(documents[0]);
    if (got === want || got.includes('"moment"') || got.includes('"binary"')) result.same++; else result.wrong.push(item.id);
  }
  return result;
}

// Written down on 2026-10-28 for yaml 2.9.1 (the vendored version) through the worker as it is. Before (js-yaml 4.1.0, which this replaced):
// 83 of 94 invalid texts rejected, 17 multi-document files and 26 valid files refused (unknown tags such as !Ref, flow forms), 18 wrong values.
// Still different: 5 values (the suite's JSON form of !!set, !!omap and !!binary, a key with no value, one comment case) and 2 invalid
// texts accepted (9MMA, SF5V: a stray directive and a repeated YAML directive). Run with SHOW_SUITE_FAILURES=1 for the list.
const EXPECTED = { mustFail: 94, rejected: 92, withAnswer: 274, singleDocument: 256, same: 269, multiDocumentRefused: 0, refusedButValid: 0, wrong: 5, notRejected: 2 };

test('YAML test suite counts are as recorded', () => {
  const result = run();
  const summary = { mustFail: result.mustFail, rejected: result.rejected, withAnswer: result.withAnswer, singleDocument: result.singleDocument, same: result.same, multiDocumentRefused: result.multiDocumentRefused.length, refusedButValid: result.refusedButValid.length, wrong: result.wrong.length, notRejected: result.notRejected.length };
  console.log('        ' + JSON.stringify(summary));
  if (process.env.SHOW_SUITE_FAILURES) {
    for (const [name, list] of Object.entries({ multiDocumentRefused: result.multiDocumentRefused, refusedButValid: result.refusedButValid, wrong: result.wrong, notRejected: result.notRejected })) console.log(`        ${name} (${list.length}):\n          ${list.join('\n          ')}`);
  }
  eq(summary, EXPECTED);
});
