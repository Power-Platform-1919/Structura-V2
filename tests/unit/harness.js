/* Loads the pure logic modules of the app into Node, the way the browser does,
   so they can be tested without a browser.

   const { load, test, eq, run } = require('./harness');
   load(['shared-helpers', 'data-paths', 'power-platform-expressions']);
   test('name', () => { eq(actual, expected); });
*/
const fs = require('fs');
const path = require('path');

const CORE = path.join(__dirname, '..', '..', 'src', 'core');

global.window = global;
const memory = new Map();
global.localStorage = {
  getItem: (k) => (memory.has(k) ? memory.get(k) : null),
  setItem: (k, v) => { memory.set(k, String(v)); },
  removeItem: (k) => { memory.delete(k); },
};
global.Structra = {
  log: { debug() {}, info() {}, warn() {}, error() {}, perf() {} },
  events: { emit() {}, on() {} },
  state: { jsonData: null, duplicateKeys: [] },
};

function load(names) {
  for (const name of names) {
    new Function(fs.readFileSync(path.join(CORE, name + '.js'), 'utf8')).call(global);
  }
}

const results = { passed: 0, failed: 0 };
const queue = [];

/** Register a test. fn may be async; tests run one after another once the file has loaded. */
function test(name, fn) {
  queue.push({ name, fn });
}

async function runAll() {
  for (const { name, fn } of queue) {
    try {
      await fn();
      results.passed++;
      console.log('  ok    ' + name);
    } catch (err) {
      results.failed++;
      const detail = String(err.message).split('\n').join('\n        ');
      console.log('  FAIL  ' + name + '\n        ' + detail);
    }
  }
  console.log('  ' + results.passed + ' passed, ' + results.failed + ' failed\n');
  if (results.failed) process.exitCode = 1;
}

setImmediate(runAll);

function eq(actual, expected, note) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error((note ? note + '\n' : '') + 'got  ' + a + '\nwant ' + e);
}

function truthy(value, note) {
  if (!value) throw new Error(note || 'expected a truthy value, got ' + JSON.stringify(value));
}

module.exports = { load, test, eq, truthy, results };
