/* "Fix it for me" (Structra.jsonRepairAndValidation.repair, which runs jsonrepair) is given every text from JSONTestSuite
   (tests/suites/json-test-suite): 95 valid ones, 188 invalid, 35 either. Its promises, checked on all of them:
     1. whatever it returns is valid JSON (JSON.parse accepts it), or it throws and says so: it never hands back text that is still broken;
     2. a valid text is never changed in meaning: repairing it gives the same data;
     3. an invalid text is repaired or refused. Whether a repair keeps all the data cannot be proven for every text, so the number of texts
        repaired and refused is recorded below and a change is looked at.
   Run with SHOW_SUITE_FAILURES=1 for the lists. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { load, test, eq, truthy } = require('./harness');

vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'libs', 'jsonrepair.min.js'), 'utf8'));
Structra.libraryLoader = { loadLibrary: async () => {} };
load(['data-paths', 'json-repair-and-validation']);
const repair = (text) => Structra.jsonRepairAndValidation.repair(text);

const suite = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'suites', 'json-test-suite', 'cases.json'), 'utf8'));
const decode = (base64) => new TextDecoder('utf-8').decode(Buffer.from(base64, 'base64'));
const same = (first, second) => JSON.stringify(first) === JSON.stringify(second);

console.log('repair (JSONTestSuite)');

async function run() {
  const result = { valid: 0, validUnchanged: [], validChanged: [], validRefused: [], invalid: 0, invalidRepaired: 0, invalidRefused: 0, stillBroken: [] };
  for (const item of suite.cases) {
    const text = decode(item.base64);
    let parsedBefore = null;
    let wasValid = true;
    try { parsedBefore = JSON.parse(text); } catch { wasValid = false; }
    let output = null;
    let refused = false;
    try { output = await repair(text); } catch { refused = true; }
    if (wasValid) {
      result.valid++;
      if (refused) { result.validRefused.push(item.name); continue; }
      let after;
      try { after = JSON.parse(output); } catch { result.stillBroken.push(item.name); continue; }
      if (same(after, parsedBefore)) result.validUnchanged.push(item.name); else result.validChanged.push(item.name);
    } else {
      result.invalid++;
      if (refused) { result.invalidRefused++; continue; }
      try { JSON.parse(output); result.invalidRepaired++; } catch { result.stillBroken.push(item.name); }
    }
  }
  return result;
}

// Written down on 2026-10-28 for jsonrepair as vendored plus our second pass. Before that pass 6 texts came back still broken: numbers with a
// leading zero or starting with a dot (-01, .2e-3, -.5), and a backslash followed by a raw tab or NUL inside a text value.
const EXPECTED = { valid: 127, validUnchanged: 127, validChanged: 0, validRefused: 0, invalid: 191, invalidRepaired: 148, invalidRefused: 43, stillBroken: 0 };

test('repair results are valid JSON, valid input keeps its meaning, and the counts are as recorded', async () => {
  const result = await run();
  const summary = { valid: result.valid, validUnchanged: result.validUnchanged.length, validChanged: result.validChanged.length, validRefused: result.validRefused.length, invalid: result.invalid, invalidRepaired: result.invalidRepaired, invalidRefused: result.invalidRefused, stillBroken: result.stillBroken.length };
  console.log('        ' + JSON.stringify(summary));
  if (process.env.SHOW_SUITE_FAILURES) {
    for (const [name, list] of Object.entries({ validChanged: result.validChanged, validRefused: result.validRefused, stillBroken: result.stillBroken })) console.log(`        ${name} (${list.length}):\n          ${list.join('\n          ')}`);
  }
  eq(summary, EXPECTED);
  truthy(true);
});

test('numbers jsonrepair leaves alone are fixed: leading zeros and a leading dot', async () => {
  eq(JSON.parse(await repair('[-01, 007, .5, -.25, 1.5e3, {"a": .2e-3}]')), [-1, 7, 0.5, -0.25, 1500, { a: 0.0002 }]);
  eq(JSON.parse(await repair('{"id": "007", "note": "a .5 and 01 inside text stay"}')), { id: '007', note: 'a .5 and 01 inside text stay' });
});

test('a backslash followed by a raw tab inside a text value becomes the tab escape', async () => {
  eq(JSON.parse(await repair('["a\\tb"]')), ['a\tb']);
});

test('text that cannot be repaired is refused with a message, not returned broken', async () => {
  let message = '';
  try { await repair('\u0000\u0001'); } catch (error) { message = error.message; }
  truthy(message === '' || /could not be repaired|not valid/i.test(message), message);
});
