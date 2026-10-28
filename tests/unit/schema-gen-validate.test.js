/* The Parse JSON schema generator, checked by the validator itself: a schema made from some records must be a valid JSON Schema, and every
   one of those records must pass it. Documents: the first list of each test fixture, the hostile keys, odd shapes (lists of lists, mixed
   types, nulls everywhere, deep nesting, empty things). Options: smart and basic, integers on and off, required on and off, Power
   Automate style.

   Compared with genson (https://pypi.org/project/genson/, the usual library for this, Python): its documentation shows a key that holds different
   types written as a type list (['integer', 'string']), as here, and it keeps "required" to the keys every object has. Its handling of a key that
   is sometimes null was not in what we could read; ours is a type list with "null" (["string", "null"]), which is what the Parse JSON action needs. */
const fs = require('fs');
const path = require('path');
const { load, test, eq, truthy } = require('./harness');
const { fixtureLists } = require('./test-utils');

global.Ajv = require('../../src/libs/ajv.min.js');
window.Ajv = global.Ajv;
load(['shared-helpers', 'parse-json-schema-generator']);
const S = Structra.parseJsonSchemaGenerator;
const { HOSTILE_KEYS } = require('../hostile-keys');

console.log('schema generator against the validator');

const ajv = new global.Ajv({ allErrors: true, schemaId: 'auto' });


const documents = fixtureLists().map(({ name, rows }) => ({ name, rows }));
const hostile = {};
HOSTILE_KEYS.filter((key) => !key.includes('\u0000')).forEach((key, i) => { hostile[key] = i % 3 ? 'text' : i; });
documents.push({ name: 'hostile keys', rows: [hostile, { ...hostile, '': null }] });
documents.push({ name: 'nulls everywhere', rows: [{ a: null, b: null, c: { d: null } }, { a: 1, b: 'x', c: null }, { c: { d: [null] } }] });
documents.push({ name: 'mixed types', rows: [{ v: 1 }, { v: 'one' }, { v: true }, { v: [1, 'a'] }, { v: { a: 1 } }, { v: null }] });
documents.push({ name: 'lists of lists', rows: [{ m: [[1, 2], [3]] }, { m: [] }, { m: [[]] }] });
documents.push({ name: 'empty things', rows: [{}, { a: [] }, { a: {} }, { a: '' }] });
documents.push({ name: 'numbers', rows: [{ n: 1 }, { n: 2.5 }, { n: -1e308 }, { n: 0 }, { n: Number.MAX_SAFE_INTEGER * 4 }] });
documents.push({ name: 'deep', rows: [(() => { let value = 1; for (let i = 0; i < 40; i++) value = { child: value }; return value; })()] });
documents.push({ name: 'optional keys', rows: Array.from({ length: 20 }, (_, i) => ({ id: i, ...(i % 2 ? { odd: true } : {}), ...(i % 3 ? { three: 'x' } : { three: null }) })) });

const OPTIONS = [{}, { integers: true }, { required: false }, { integers: true, required: false }];

for (const document of documents) {
  test(`${document.name}: the schema is valid and every record passes it (smart and basic, all options)`, () => {
    for (const mode of ['smart', 'basic']) {
      for (const options of OPTIONS) {
        const schema = S[mode](document.rows, options);
        const text = `${mode} ${JSON.stringify(options)}`;
        truthy(ajv.validateSchema(schema), `${text}: the schema is not valid: ${ajv.errorsText(ajv.errors)}`);
        const validate = ajv.compile(schema);
        // the schema describes the whole list; basic reads the first record only, so only that record is held to it
        const list = mode === 'basic' ? [document.rows[0]] : document.rows;
        truthy(validate(list), `${text}: the list fails its own schema: ${ajv.errorsText(validate.errors).slice(0, 300)}`);
        list.forEach((row, i) => truthy(ajv.validate(schema.items || {}, row), `${text}: record ${i} fails the schema of one record: ${ajv.errorsText(ajv.errors).slice(0, 200)}`));
      }
    }
  });
}

test('a record with a key the others lack still passes, and a record that lacks a required key fails', () => {
  const rows = [{ id: 1, name: 'a' }, { id: 2, name: 'b', extra: 1 }];
  const schema = S.smart(rows);
  const validate = ajv.compile(schema.items);
  truthy(validate({ id: 3, name: 'c' }));
  truthy(validate({ id: 3, name: 'c', anything: 1 }), 'extra keys are allowed');
  eq(validate({ name: 'c' }), false);
  eq(validate({ id: 'x', name: 'c' }), false);
});

test('Power Automate: a key that is sometimes null accepts null, and every key that is in every record is required', () => {
  const rows = [{ a: 'x', b: null }, { a: 'y', b: 'z' }];
  const schema = S.smart(rows);
  const validate = ajv.compile(schema.items);
  truthy(validate({ a: 'q', b: null }) && validate({ a: 'q', b: 'r' }));
  truthy(schema.items.required.includes('a') && schema.items.required.includes('b'));
});

test('two runs on the same records write the same schema (the order of keys follows the first record)', () => {
  const rows = [{ b: 1, a: 2 }, { c: 3, a: 1 }];
  eq(JSON.stringify(S.smart(rows)), JSON.stringify(S.smart(rows)));
  eq(Object.keys(S.smart(rows).items.properties).join(), 'b,a,c');
});
