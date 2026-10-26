const { load, test, eq } = require('./harness');
load(['shared-helpers', 'parse-json-schema-generator']);
const S = Structra.parseJsonSchemaGenerator;

console.log('schema-gen');

const rows = [
  { id: 1, name: 'A', score: 1, note: null, tags: ['x'], owner: { n: 'p' } },
  { id: 2, name: 'B', score: 1.5, note: 'hi', tags: [], owner: null, extra: true },
];

test('a list of objects becomes an array of object', () => {
  const s = S.smart(rows);
  eq([s.type, s.items.type], ['array', 'object']);
});
test('required lists only the keys present in every row', () => {
  eq(S.smart(rows).items.required, ['id', 'name', 'score', 'note', 'tags', 'owner']);
});
test('numbers are "number" by default', () => {
  eq(S.smart(rows).items.properties.id, { type: 'number' });
});
test('a sometimes-null string is a type list', () => {
  eq(S.smart(rows).items.properties.note, { type: ['string', 'null'] });
});
test('a sometimes-null object keeps its shape', () => {
  const owner = S.smart(rows).items.properties.owner;
  eq(owner.type, ['object', 'null']);
  eq(owner.properties.n, { type: 'string' });
});
test('lists inside rows are merged', () => {
  eq(S.smart(rows).items.properties.tags, { type: 'array', items: { type: 'string' } });
});
test('integers option keeps whole numbers as integer', () => {
  eq(S.smart([{ a: 1 }, { a: 2 }], { integers: true }).items.properties.a, { type: 'integer' });
});
test('integers option falls back to number when a decimal appears', () => {
  eq(S.smart([{ a: 1 }, { a: 2.5 }], { integers: true }).items.properties.a, { type: 'number' });
});
test('required: false writes no required list', () => {
  eq('required' in S.smart(rows, { required: false }).items, false);
});
test('different scalar types become a type list', () => {
  eq(S.smart([{ v: 1 }, { v: 'x' }]).items.properties.v, { type: ['string', 'number'] });
});
test('a key that is only ever null accepts anything', () => {
  eq(S.smart([{ v: null }]).items.properties.v, {});
});
test('an empty list has no items', () => {
  eq(S.smart({ list: [] }).properties.list, { type: 'array' });
});
test('basic reads the first row only', () => {
  eq('extra' in S.basic(rows).items.properties, false);
});
