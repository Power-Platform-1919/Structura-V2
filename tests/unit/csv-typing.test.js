const { test, eq, truthy } = require('./harness');
const fs = require('fs');
const path = require('path');
new Function(fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'libs', 'csv-typing.js'), 'utf8')).call(global);

console.log('csv typing');

const run = (rows) => { const out = rows.map((r) => ({ ...r })); const info = csvRetype(out); return { out, info }; };

test('numbers, booleans and empty cells are typed', () => {
  const { out } = run([{ a: '12', b: 'true', c: '', d: 'text', e: '-3.5' }]);
  eq(out[0], { a: 12, b: true, c: null, d: 'text', e: -3.5 });
});
test('thousands separators are read: 1,200.00 is 1200', () => {
  const { out } = run([{ Price: '10.00' }, { Price: '1,200.00' }, { Price: '2.50' }]);
  eq(out.map((r) => r.Price), [10, 1200, 2.5]);
});
test('a column written with decimals remembers how many', () => {
  const { info } = run([{ Price: '10.00' }, { Price: '1,200.00' }, { Price: '2.5' }, { Count: '4' }]);
  eq(info.decimals, { Price: 2 });
});
test('text among numbers is reported with its row', () => {
  const { info } = run([{ P: '1' }, { P: '2' }, { P: 'N/A' }]);
  eq(info.mixed.P, { value: 'N/A', row: 3 });
});
test('an id with a leading zero stays text; a number too long to be exact stays text', () => {
  const { out } = run([{ id: '007', big: '12345678901234567890' }]);
  eq(out[0], { id: '007', big: '12345678901234567890' });
});
