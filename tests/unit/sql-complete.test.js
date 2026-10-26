const { load, test, eq, truthy } = require('./harness');
load(['sql-complete']);
const S = Structra.sqlComplete;

console.log('sql-complete');

const columns = [
  { name: 'id', type: 'BIGINT' },
  { name: 'Full Name', type: 'VARCHAR' },
  { name: 'region', type: 'VARCHAR' },
  { name: 'amount', type: 'DOUBLE' },
];
const at = (text, extra = {}) => S.suggest(text, text.length, { columns, ...extra });
const labels = (r) => (r ? r.items.map((i) => i.label) : null);

test('a typed start offers matching columns, keywords and functions', () => {
  const r = at('SELECT re');
  eq(r.word, 're');
  truthy(labels(r).includes('region'), labels(r));
  truthy(labels(r).includes('REPLACE'), labels(r));
});

test('columns come before keywords after the first word, keywords come first at the start', () => {
  eq(labels(at('SELECT a'))[0], 'amount');
  eq(labels(at('sel'))[0], 'SELECT');
});

test('the range to replace is the word being typed', () => {
  const r = at('SELECT amo');
  eq(r.from, 7);
  eq(r.to, 10);
});

test('a column with a space or capital is quoted, a plain one is not', () => {
  eq(at('SELECT Fu').items[0].insert, '"Full Name"');
  eq(at('SELECT reg').items[0].insert, 'region');
});

test('a function is completed with an opening bracket', () => {
  const r = at('SELECT COU');
  eq(r.items[0].label, 'COUNT');
  eq(r.items[0].insert, 'COUNT(');
});

test('after FROM only the table is offered', () => {
  eq(labels(at('SELECT * FROM d')).join(','), 'data');
  eq(labels(at('SELECT * FROM ', { force: true })).join(','), 'data');
});

test('after data. only columns are offered', () => {
  const r = at('SELECT data.');
  eq(labels(r).join(','), 'id,Full Name,region,amount');
  eq(labels(at('SELECT data.re')).join(','), 'region');
});

test('inside a quoted name the columns are offered and the quotes are kept', () => {
  const r = at('SELECT "Fu');
  eq(r.items[0].insert, '"Full Name"');
  eq(r.from, 7);
  const closed = S.suggest('SELECT "Fu" FROM data', 10, { columns });
  eq(closed.to, 11, 'the closing quote is replaced too');
});

test('nothing is offered inside text, a comment, or before anything is typed', () => {
  eq(at("SELECT * FROM data WHERE region = 'No"), null);
  eq(at('SELECT 1 -- re'), null);
  eq(at('SELECT /* re'), null);
  eq(at('SELECT '), null);
  truthy(at('SELECT ', { force: true }), 'Ctrl+Space asks on purpose');
});

test('a text after a finished statement starts a new one', () => {
  eq(labels(at('SELECT 1; sel'))[0], 'SELECT');
});

test('a word that is already complete is not offered back to you', () => {
  eq(at('SELECT * FROM data'), null);
});

test('a middle-of-word match finds columns but not keywords', () => {
  const r = at('SELECT mou');
  eq(labels(r).join(','), 'amount');
});

test('no more than ten suggestions', () => {
  truthy(at('S').items.length <= 10);
});

test('works with no columns known yet', () => {
  const r = S.suggest('SELECT COU', 10, { columns: [] });
  eq(r.items[0].label, 'COUNT');
});
