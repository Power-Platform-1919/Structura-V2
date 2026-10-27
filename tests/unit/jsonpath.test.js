const path = require('path');
const { pathToFileURL } = require('url');
const { load, test, eq, truthy } = require('./harness');

// The engine (json-p3) is an ES module the page loads on first use; here the same file is imported
Structra.libraryLoader = { loadLibrary: () => import(pathToFileURL(path.join(__dirname, '..', '..', 'src', 'libs', 'json-p3', 'json-p3.min.js')).href) };
load(['shared-helpers', 'jsonpath-query']);
const J = Structra.jsonpathQuery;

console.log('jsonpath');

const sp = {
  value: [
    { Title: 'Laptop', Cost: 1299.5, Approved: false, Requester: { Email: 'ann@x.com' }, Tags: [{ Value: 'IT' }, { Value: 'HW' }] },
    { Title: 'Badge', Cost: 20, Approved: true, Requester: { Email: 'bo@x.com' }, Tags: [] },
    { Title: 'Parking', Cost: 45.25, Approved: true, Requester: { Email: null }, Tags: [{ Value: 'FAC' }] },
  ],
};
const values = async (expr, data = sp) => (await J.query(data, expr)).map((m) => m.value);
const paths = async (expr, data = sp) => (await J.query(data, expr)).map((m) => m.path);
const fails = async (expr, data = sp) => { try { await J.query(data, expr); } catch (e) { return e.message; } return ''; };

/* ---------- what the app always did ---------- */

test('a path with or without the leading $ finds the same values', async () => {
  eq(await values('$.value[*].Title'), ['Laptop', 'Badge', 'Parking']);
  eq(await values('value[*].Title'), ['Laptop', 'Badge', 'Parking']);
  eq(await values('[\'value\'][0].Title'), ['Laptop']);
  eq(await values('..Value'), ['IT', 'HW', 'FAC']);
});
test('a nested path through every item', async () => {
  eq(await values('value[*].Requester.Email'), ['ann@x.com', 'bo@x.com', null]);
});
test('matches carry the path that leads to them', async () => {
  eq((await paths('$.value[*].Requester.Email'))[1], '$.value[1].Requester.Email');
});
test('an index, a negative index and a range', async () => {
  eq(await values('value[0].Title'), ['Laptop']);
  eq(await values('value[-1].Title'), ['Parking']);
  eq(await values('value[0:2].Title'), ['Laptop', 'Badge']);
  eq(await values('value[1:].Title'), ['Badge', 'Parking']);
});
test('dot-number reads an item too (value.0.Title), and a key that is a number', async () => {
  eq(await values('value.0.Title'), ['Laptop']);
  eq(await values('value.1.Requester.Email'), ['bo@x.com']);
  eq(await values('1.name', { 1: { name: 'one' } }), ['one']);
});
test('a wildcard on an object reads every field', async () => {
  eq(await values('value[0].Requester.*'), ['ann@x.com']);
});
test('$..key finds the field at any depth', async () => {
  eq(await values('$..Value'), ['IT', 'HW', 'FAC']);
  eq(await values('$..Email'), ['ann@x.com', 'bo@x.com', null]);
});
test('a filter keeps the items that pass', async () => {
  eq(await values('$.value[?(@.Cost > 100)].Title'), ['Laptop']);
  eq(await values('$.value[?(@.Approved == true)].Title'), ['Badge', 'Parking']);
  eq(await values("$.value[?(@.Title == 'Badge')].Cost"), [20]);
});
test('filters can combine tests with && and ||', async () => {
  eq(await values('$.value[?(@.Approved == true && @.Cost < 30)].Title'), ['Badge']);
  eq(await values('$.value[?(@.Cost > 1000 || @.Cost < 30)].Title'), ['Laptop', 'Badge']);
});
test('quoted names and several names at once', async () => {
  eq(await values("$.value[0]['Title','Cost']"), ['Laptop', 1299.5]);
});
test('a path that does not exist finds nothing, without an error', async () => {
  eq(await values('value[*].Nope'), []);
  eq(await values('nothing.here'), []);
});
test('keys with odd characters get a bracket path', async () => {
  eq(await paths("['a b']", { 'a b': 1 }), ["$['a b']"]);
  eq(await paths("['it\\'s']", { "it's": 1 }), ["$['it\\'s']"]);
});
test('the whole document', async () => {
  eq(await values('$', [1, 2]), [[1, 2]]);
});

/* ---------- patterns: =~ with a real JavaScript pattern ---------- */

test('a filter can use a pattern, with \\d, flags and groups', async () => {
  eq(await values('$.value[?(@.Requester.Email =~ /^ann/)].Title'), ['Laptop']);
  eq(await values('$.value[?(@.Title =~ /^LAP/i)].Cost'), [1299.5]);
  eq(await values('$.value[?(@.Title =~ /^LAP/)].Cost'), []);
  eq(await values('$.value[?(@.Cost =~ /\\d/)].Cost'), []);           // a number is not text: no match
  eq(await values('$.items[?(@.code =~ /^\\d{3}-\\d{4}$/)].code', { items: [{ code: '555-1234' }, { code: 'x' }] }), ['555-1234']);
  eq(await values('$.items[?(@.name =~ /^(a|b)/ && @.n > 1)].name', { items: [{ name: 'ab', n: 2 }, { name: 'ab', n: 1 }, { name: 'c', n: 5 }] }), ['ab']);
});
test('a pattern with a slash or a quote inside', async () => {
  eq(await values("$.items[?(@.u =~ /^a\\/b'c$/)].u", { items: [{ u: "a/b'c" }, { u: 'abc' }] }), ["a/b'c"]);
});
test('a pattern that could freeze the page is refused, not run', async () => {
  truthy((await fails('$.items[?(@.u =~ /(a+)+$/)]', { items: [{ u: 'aaaaaaaaaaaaaaaaaaaaaaaa!' }] })).length > 0, 'it ran');
});
test('the standard match() and search() work too', async () => {
  eq(await values('$.value[?search(@.Title, "^Lap")].Cost'), [1299.5]);
  eq(await values('$.value[?match(@.Title, "Badge")].Cost'), [20]);
});

/* ---------- where the standard decides (it differs from the old engine on purpose) ---------- */

test('existence: a field that is null still exists; != null skips it', async () => {
  eq(await values('$.value[?(@.Requester.Email)].Title'), ['Laptop', 'Badge', 'Parking']);
  eq(await values('$.value[?(@.Requester.Email != null)].Title'), ['Laptop', 'Badge']);
  eq(await values('$.value[?(!@.Requester.Email)].Title'), []);
});
test('the filter without parentheses, from the standard', async () => {
  eq(await values('$.value[?@.Cost > 100].Title'), ['Laptop']);
  eq(await values("$.value[?@.Title=='Badge'].Cost"), [20]);
});
test('== does not convert: the text "5" is not the number 5', async () => {
  eq(await values('$.i[?(@.id == 5)].id', { i: [{ id: 5 }, { id: '5' }] }), [5]);
});
test('a wildcard inside a union', async () => {
  eq(await values('$[*,1]', [10, 20]), [10, 20, 20]);
});

/* ---------- slices (RFC 9535); a negative step used to loop forever ---------- */

test('slice steps: forwards, backwards, and zero', async () => {
  const list = [0, 1, 2, 3, 4];
  const take = (expr) => values(expr, list);
  eq(await take('$[::2]'), [0, 2, 4]);
  eq(await take('$[::-1]'), [4, 3, 2, 1, 0]);
  eq(await take('$[2::-1]'), [2, 1, 0]);
  eq(await take('$[::-2]'), [4, 2, 0]);
  eq(await take('$[3:0:-1]'), [3, 2, 1]);
  eq(await take('$[-1:-4:-1]'), [4, 3, 2]);
  eq(await take('$[::0]'), []);
  eq(await take('$[7::-1]'), [4, 3, 2, 1, 0]);
});

/* ---------- mistakes say what and where ---------- */

test('a broken expression says where', async () => {
  truthy((await fails('$.value[?(@.Cost >)]')).length > 0, 'no error was raised');
  const message = await fails('$.value[');
  truthy(/character/.test(message), message);
  truthy(/\$\.value\[/.test(message), message);
});
test('an unbalanced filter and an unknown function are errors, not silence', async () => {
  truthy((await fails('$.value[?(@.Cost > 1')).length > 0);
  truthy((await fails('$.value[?nothing(@.Cost)]')).length > 0);
});

/* ---------- safety and size ---------- */

test('a deep document and a long list do not break it', async () => {
  let deep = { v: 1 };
  for (let i = 0; i < 200; i++) deep = { n: deep };
  eq((await values('$..v', deep)).length, 1);
  const big = { rows: Array.from({ length: 50000 }, (x, i) => ({ id: i, even: i % 2 === 0 })) };
  eq((await values('$.rows[?(@.even == true)].id', big)).length, 25000);
});
test('keys that look like script or prototype names are plain keys', async () => {
  eq(await values('$.__proto__', { a: 1 }), []);
  eq(await values("$['constructor']", { constructor: 5 }), [5]);
});
test('the standard only, without the conveniences (queryStrict)', async () => {
  eq((await J.queryStrict(sp, '$.value[*].Title')).length, 3);
  truthy((await J.queryStrict(sp, 'value[*].Title').then(() => '', (e) => e.message)).length > 0, 'a path without $ should be refused');
});
