/* The official JSON Schema Test Suite (https://github.com/json-schema-org/JSON-Schema-Test-Suite, MIT, commit in the cases files) run through
   OUR validation (Structra.jsonRepairAndValidation.validate, which wraps Ajv 6.12.6 with allErrors and jsonPointers).
   The tests are the cases nobody thinks of: dependencies, $ref in odd places, unicode lengths, big numbers, bad schemas.

   What the adapter supports is what it was written for: draft-07 and draft-06 (Ajv 6 knows both), no draft-04 (the Parse JSON schemas
   of Power Automate use none of it, see the map, section 8.6). The numbers of passing tests are written below. A change fails the
   test, so a difference is looked at: fixed in the adapter, or recorded here with the reason. The cases that fail are listed by name.
   Left out of the suite files: optional formats and refRemote.json (see tools/fetch-json-schema-test-suite.mjs). */
const fs = require('fs');
const path = require('path');
const { load, test, eq, truthy } = require('./harness');

global.Ajv = require('../../src/libs/ajv.min.js');
window.Ajv = global.Ajv;
Structra.libraryLoader = { loadLibrary: async () => {} };
load(['data-paths', 'json-repair-and-validation']);
const validate = (data, schema) => Structra.jsonRepairAndValidation.validate(data, schema);

console.log('JSON Schema Test Suite');

const read = (draft) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'suites', 'json-schema-test-suite', draft + '.json'), 'utf8'));

async function runDraft(draft) {
  const suite = read(draft);
  const result = { total: 0, passed: 0, failed: [], uncompilable: [] };
  for (const [file, groups] of Object.entries(suite.files)) {
    for (const group of groups) {
      let compiled = true;
      try { await validate(undefined, group.schema); } catch { compiled = false; }
      for (const one of group.tests) {
        result.total++;
        const label = `${file} / ${group.description} / ${one.description}`;
        if (!compiled) { result.uncompilable.push(label); continue; }
        let valid;
        try { valid = (await validate(one.data, group.schema)).valid; } catch { result.uncompilable.push(label); continue; }
        if (valid === one.valid) result.passed++; else result.failed.push(label);
      }
    }
  }
  return result;
}

// Written down on 2026-10-28 with Ajv 6.12.6, after the adapter was fixed (before: draft-07 873 of 906). Draft 4 is recorded to show what is
// not supported, not to be fixed. What still differs in draft 7 and 6 are limits of Ajv 6. Checked: Ajv 8.20 (strict off, formats off) passes
// 898 of the same 906 draft-07 tests, fewer than our adapter on Ajv 6 (901), and does not fix the property-name cases, so upgrading would not help (task 22.1):
//   - a $ref next to an $id (the sibling is meant to be ignored) and empty tokens in a $ref pointer (2 tests each)
//   - a property named __proto__ in a schema (1 test)
//   - draft 6 only: a schema that names the draft-06 meta-schema (6 tests)
// Run with SHOW_SUITE_FAILURES=1 to list every test that differs.
const EXPECTED = {
  draft7: { total: 906, passed: 901, failed: 3, uncompilable: 2 },
  draft6: { total: 818, passed: 809, failed: 3, uncompilable: 6 },
  draft4: { total: 601, passed: 572, failed: 1, uncompilable: 28 },
};

for (const draft of ['draft7', 'draft6', 'draft4']) {
  test(`${draft}: pass counts are as recorded`, async () => {
    const result = await runDraft(draft);
    const summary = { total: result.total, passed: result.passed, failed: result.failed.length, uncompilable: result.uncompilable.length };
    console.log(`        ${draft}: ${JSON.stringify(summary)}`);
    if (process.env.SHOW_SUITE_FAILURES) console.log(result.failed.concat(result.uncompilable).map((name) => '          ' + name).join('\n'));
    eq(summary, EXPECTED[draft]);
  });
}

test('the suite files are the ones recorded', () => {
  for (const draft of ['draft7', 'draft6', 'draft4']) truthy(read(draft).commit.length === 40, draft);
});

test('a format Ajv does not know is ignored, not an error (OpenAPI formats such as int32)', async () => {
  const result = await validate({ n: 5 }, { type: 'object', properties: { n: { type: 'integer', format: 'int32' } } });
  eq(result.valid, true);
  eq((await validate({ n: 'x' }, { type: 'object', properties: { n: { type: 'integer', format: 'int32' } } })).valid, false);
});

test('a schema that names draft-04 is checked as draft-07, and the person is told', async () => {
  const result = await validate([1, 2], { $schema: 'http://json-schema.org/draft-04/schema#', type: 'array', items: { type: 'integer' } });
  eq(result.valid, true);
  truthy(/draft-04/.test(result.note) && /draft-07/.test(result.note), result.note);
  eq((await validate([1], { type: 'array' })).note, '');
});

test('property names every object inherits are only found when the document has them', async () => {
  const schema = { required: ['constructor', 'toString'] };
  eq((await validate({}, schema)).valid, false);
  eq((await validate(JSON.parse('{"constructor":1,"toString":2}'), schema)).valid, true);
});
