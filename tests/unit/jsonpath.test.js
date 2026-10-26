const { load, test, eq, truthy } = require('./harness');
load(['jsonpath-query']);
const J = Structra.jsonpathQuery;

console.log('jsonpath');

const sp = {
  value: [
    { Title: 'Laptop', Cost: 1299.5, Approved: false, Requester: { Email: 'ann@x.com' }, Tags: [{ Value: 'IT' }, { Value: 'HW' }] },
    { Title: 'Badge', Cost: 20, Approved: true, Requester: { Email: 'bo@x.com' }, Tags: [] },
    { Title: 'Parking', Cost: 45.25, Approved: true, Requester: { Email: null }, Tags: [{ Value: 'FAC' }] },
  ],
};
const values = (expr, data = sp) => J.query(data, expr).map((m) => m.value);
const paths = (expr, data = sp) => J.query(data, expr).map((m) => m.path);

test('a path with or without the leading $ finds the same values', () => {
  eq(values('$.value[*].Title'), ['Laptop', 'Badge', 'Parking']);
  eq(values('value[*].Title'), ['Laptop', 'Badge', 'Parking']);
});
test('a nested path through every item', () => {
  eq(values('value[*].Requester.Email'), ['ann@x.com', 'bo@x.com', null]);
});
test('matches carry the path that leads to them', () => {
  eq(paths('$.value[*].Requester.Email')[1], '$.value[1].Requester.Email');
});
test('an index, a negative index and a range', () => {
  eq(values('value[0].Title'), ['Laptop']);
  eq(values('value[-1].Title'), ['Parking']);
  eq(values('value[0:2].Title'), ['Laptop', 'Badge']);
  eq(values('value[1:].Title'), ['Badge', 'Parking']);
});
test('dot-number reads an item too (value.0.Title)', () => {
  eq(values('value.0.Title'), ['Laptop']);
});
test('a wildcard on an object reads every field', () => {
  eq(values('value[0].Requester.*'), ['ann@x.com']);
});
test('$..key finds the field at any depth', () => {
  eq(values('$..Value'), ['IT', 'HW', 'FAC']);
  eq(values('$..Email'), ['ann@x.com', 'bo@x.com', null]);
});
test('a filter keeps the items that pass', () => {
  eq(values('$.value[?(@.Cost > 100)].Title'), ['Laptop']);
  eq(values('$.value[?(@.Approved == true)].Title'), ['Badge', 'Parking']);
  eq(values("$.value[?(@.Title == 'Badge')].Cost"), [20]);
});
test('filters can combine tests with && and ||', () => {
  eq(values('$.value[?(@.Approved == true && @.Cost < 30)].Title'), ['Badge']);
  eq(values('$.value[?(@.Cost > 1000 || @.Cost < 30)].Title'), ['Laptop', 'Badge']);
});
test('a filter can look inside a nested field and use a pattern', () => {
  eq(values('$.value[?(@.Requester.Email =~ /^ann/)].Title'), ['Laptop']);
});
test('a filter on existence', () => {
  eq(values('$.value[?(@.Requester.Email)].Title'), ['Laptop', 'Badge']);
});
test('quoted names and several names at once', () => {
  eq(values("$.value[0]['Title','Cost']"), ['Laptop', 1299.5]);
});
test('a path that does not exist finds nothing, without an error', () => {
  eq(values('value[*].Nope'), []);
  eq(values('nothing.here'), []);
});
test('keys with odd characters get a bracket path', () => {
  eq(paths("['a b']", { 'a b': 1 }), ["$['a b']"]);
});
test('the whole document', () => {
  eq(values('$', [1, 2]), [[1, 2]]);
});
test('a broken expression says where', () => {
  let message = '';
  try { J.query(sp, '$.value[?(@.Cost >)]'); } catch (e) { message = e.message; }
  truthy(message.length > 0, 'no error was raised');
  message = '';
  try { J.query(sp, '$.value['); } catch (e) { message = e.message; }
  truthy(/character/.test(message), message);
});
