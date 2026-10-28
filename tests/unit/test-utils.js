/* Small helpers that more than one test needs, written once.

     const { seededRandom, clone, deepFreeze, firstList, fixtureLists, runWorker, sameJson } = require('./test-utils');

   seededRandom(seed)       a repeatable random generator: () => number from 0 to 1 (the same numbers for the same seed)
   clone(value)             a deep copy through JSON
   deepFreeze(value)        freezes the value and everything inside it, and returns it (a code path that writes to its input then fails)
   firstList(value)         the first list of objects inside a document (the document itself if it is one), or null
   fixtureLists(options)    [{ name, rows }] the first list of each file in tests/fixtures (options.max: rows kept, default 300)
   runWorker(file, message, options)
                            runs a real worker file from src/workers the way the browser does and returns what it posts back:
                            options.libs    the files importScripts loads, found by name in src/libs or src/workers or src/core
                            options.shims   more names for the worker's global scope (atob, ...)
   sameJson(actual, expected, message)
                            fails with both values written out when they are not equal as JSON (objects from another context compare by text) */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('node:assert');

const ROOT = path.join(__dirname, '..', '..');

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; };
}

const clone = (value) => JSON.parse(JSON.stringify(value));

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); Object.values(value).forEach(deepFreeze); }
  return value;
}

function firstList(value) {
  if (Array.isArray(value) && value.length && value.every((item) => item && typeof item === 'object' && !Array.isArray(item))) return value;
  if (value && typeof value === 'object') for (const child of Object.values(value)) { const found = firstList(child); if (found) return found; }
  return null;
}

function fixtureLists(options = {}) {
  const folder = path.join(ROOT, 'tests', 'fixtures');
  const lists = [];
  for (const file of fs.readdirSync(folder).filter((name) => name.endsWith('.json')).sort()) {
    try {
      const rows = firstList(JSON.parse(fs.readFileSync(path.join(folder, file), 'utf8')));
      if (rows) lists.push({ name: file, rows: rows.slice(0, options.max || 300) });
    } catch { /* not JSON a list can be taken from */ }
  }
  return lists;
}

/** Run the real worker file on one message ({ id, text, ... }) and return what it posts back */
function runWorker(file, message, options = {}) {
  let handler = null;
  let posted = null;
  const folders = [path.join(ROOT, 'src', 'libs'), path.join(ROOT, 'src', 'workers'), path.join(ROOT, 'src', 'core')];
  const context = {
    console: { log() {}, warn() {}, error() {} },
    performance: { now: () => Date.now() },
    postMessage: (value) => { posted = value; },
    ...(options.shims || {}),
  };
  // the files a worker names with importScripts: the ones asked for here, or the ones it names, found by their file name
  const find = (name) => {
    const base = path.basename(name);
    for (const folder of [...folders, ...fs.readdirSync(path.join(ROOT, 'src', 'libs'), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => path.join(ROOT, 'src', 'libs', entry.name))]) {
      const candidate = path.join(folder, base);
      if (fs.existsSync(candidate)) return candidate;
    }
    throw new Error('importScripts: ' + name + ' was not found');
  };
  context.importScripts = (...names) => { for (const name of options.libs || names) vm.runInContext(fs.readFileSync(path.isAbsolute(name) ? name : find(name), 'utf8'), context); };
  context.self = context;
  context.addEventListener = (type, fn) => { if (type === 'message') handler = fn; };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'src', 'workers', file), 'utf8'), context);
  handler({ data: message });
  return posted;
}

function sameJson(actual, expected, message) {
  assert.strictEqual(JSON.stringify(actual), JSON.stringify(expected), message);
}

module.exports = { seededRandom, clone, deepFreeze, firstList, fixtureLists, runWorker, sameJson, ROOT };
