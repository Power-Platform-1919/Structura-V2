const { load, test, eq, truthy } = require('./harness');
load(['transform-step-operations']);
const T = Structra.transformStepOperations;

console.log('transform steps');

const sp = {
  value: [
    { Title: 'Laptop', Cost: 1299.5, Approved: false, Tags: ['IT'] },
    { Title: 'Badge', Cost: 20, Approved: true, Tags: [] },
    { Title: 'Parking', Cost: 45.25, Approved: true, Tags: ['Facilities'] },
  ],
};

test('steps are split on | outside brackets and quotes', () => {
  eq(T.splitSteps('.value | filter(x => x.a || x.b) | length'), ['.value', 'filter(x => x.a || x.b)', 'length']);
  eq(T.splitSteps(".value | map(x => x.t == 'a | b')"), ['.value', "map(x => x.t == 'a | b')"]);
});
test('a field is read with .field and the data with .', () => {
  eq(T.evaluate('.value | length', sp), 3);
  eq(T.evaluate('.', [1, 2]), [1, 2]);
});
test('pick keeps only the named fields of every item', () => {
  eq(T.evaluate('.value | pick(Title, Cost) | [0]', sp), { Title: 'Laptop', Cost: 1299.5 });
});
test('sortBy sorts ascending, and descending with a minus', () => {
  eq(T.evaluate('.value | sortBy(Title) | map(x => x.Title)', sp), ['Badge', 'Laptop', 'Parking']);
  eq(T.evaluate('.value | sortBy(-Cost) | map(x => x.Title)', sp), ['Laptop', 'Parking', 'Badge']);
});
test('sortBy puts empty values last', () => {
  eq(T.evaluate('sortBy(a) | map(x => x.id)', [{ id: 1 }, { id: 2, a: 'b' }, { id: 3, a: 'a' }]), [3, 2, 1]);
});
test('filter, sum and group run as steps', () => {
  eq(T.evaluate('.value | filter(x => x.Approved == true) | length', sp), 2);
  eq(T.evaluate('.value | sum(x => x.Cost)', sp), 1364.75);
  eq(Object.keys(T.evaluate('.value | groupBy(x => x.Approved)', sp)).sort(), ['false', 'true']);
});
test('unique works after map', () => {
  eq(T.evaluate('map(x => x.a) | unique()', [{ a: 1 }, { a: 1 }, { a: 2 }]), [1, 2]);
});
test('an unknown step says what is available', () => {
  let message = '';
  try { T.evaluate('.value | explode()', sp); } catch (e) { message = e.message; }
  truthy(message.includes('Unknown step: explode()') && message.includes('pick('), message);
});
test('blocked words are refused inside steps', () => {
  let message = '';
  try { T.evaluate('.value | map(x => fetch(x))', sp); } catch (e) { message = e.message; }
  truthy(/not allowed/i.test(message), message);
});
test('a missing field gives undefined, not an error', () => {
  eq(T.evaluate('.nothing.here', sp), undefined);
});
