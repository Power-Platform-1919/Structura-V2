/* CSV export is written by PapaParse with formula protection always on. These tests check that awkward cells survive a round trip
   through PapaParse's own reader, and that a text cell a spreadsheet would run as a formula is neutralized while real numbers are not. */
const { load, test, eq, truthy } = require('./harness');

global.Papa = require('../../src/libs/papaparse.min.js');
load(['format-conversion']);
const { generateCsv } = Structra.formatConversion;

console.log('csv export');

const parseBack = (csv) => Papa.parse(csv, { skipEmptyLines: false }).data;

test('header row first, column order kept, a final line break', () => {
  const csv = generateCsv([{ b: 1, a: 'x' }], ['a', 'b']);
  eq(csv, 'a,b\nx,1\n');
});

test('awkward cells survive a round trip: commas, quotes, line breaks, carriage returns, spaces, unicode', () => {
  const cells = ['a,b', 'say "hi"', 'line\nbreak', 'cr\rhere', 'crlf\r\nhere', ' lead', 'trail ', '', 'é 日本語 😀', '"', ',', '\n', 'x'.repeat(10000)];
  const rows = cells.map((value, index) => ({ id: index, value }));
  const back = parseBack(generateCsv(rows, ['id', 'value'])).slice(1, -1);
  eq(back.length, cells.length, 'row count');
  cells.forEach((value, index) => eq(back[index][1], value, 'cell ' + JSON.stringify(value).slice(0, 30)));
});

test('null and undefined are empty cells; nested values are JSON text', () => {
  const back = parseBack(generateCsv([{ a: null, b: undefined, c: { x: [1, 2] }, d: [1, 'two'] }], ['a', 'b', 'c', 'd']));
  eq(back[1], ['', '', '{"x":[1,2]}', '[1,"two"]']);
});

test('text cells that start with = + - @ tab or carriage return are protected with an apostrophe', () => {
  for (const text of ['=SUM(A1:A9)', '+1+1', '-2+3', '@SUM(1)', '\t=1', '=HYPERLINK("http://x","y")']) {
    const back = parseBack(generateCsv([{ v: text }], ['v']))[1][0];
    truthy(back === "'" + text, `${JSON.stringify(text)} was written as ${JSON.stringify(back)}`);
  }
});

test('real numbers, booleans and ordinary text are not changed', () => {
  const back = parseBack(generateCsv([{ n: -5, p: 3.5, z: 0, t: true, f: false, s: 'plain', d: '2026-10-28', neg: '5-3' }], ['n', 'p', 'z', 't', 'f', 's', 'd', 'neg']))[1];
  eq(back, ['-5', '3.5', '0', 'true', 'false', 'plain', '2026-10-28', '5-3']);
});

test('a column name that looks like a formula is protected too', () => {
  const header = parseBack(generateCsv([{ '=cmd': 1 }], ['=cmd']))[0][0];
  eq(header, "'=cmd");
});

test('a number written as text is left alone, a calculation written as text is protected', () => {
  const back = parseBack(generateCsv([{ a: '-5.50', b: '+7', c: '1e5', d: '-2+3', e: '=1', f: '-' }], ['a', 'b', 'c', 'd', 'e', 'f']))[1];
  eq(back, ['-5.50', '+7', '1e5', "'-2+3", "'=1", "'-"]);
});

test('writeCsv is the one writer: the line break can be chosen (the Query panel uses a carriage return and a line feed)', () => {
  eq(Structra.formatConversion.writeCsv(['a', 'b'], [[1, 'x,y']], { newline: '\r\n' }), 'a,b\r\n1,"x,y"\r\n');
});
