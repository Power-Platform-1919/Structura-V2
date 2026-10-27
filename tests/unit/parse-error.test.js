/* Where and why JSON is broken: the answer must be the same whatever browser it runs in, so it comes from jsonc-parser,
   not from the browser's own JSON.parse message (Chrome, Firefox and Safari each word it, and place it, differently). */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { load, test, eq, truthy } = require('./harness');

// The library is a script that sets a global named JSONC, as it does in the page
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'libs', 'jsonc-parser.min.js'), 'utf8') + ';globalThis.JSONC = JSONC;');
Structra.libraryLoader = { loadLibrary: async () => {} };
load(['json-repair-and-validation']);
const explain = (text) => Structra.jsonRepairAndValidation.explainParseError(text);

console.log('parse errors');

test('valid text has no error', async () => {
  eq(await explain('{"a":[1,2,{"b":null}]}'), null);
  eq(await explain('  [] '), null);
});

test('a trailing comma says where and what', async () => {
  const found = await explain('{"a":1,}');
  eq(found.offset, 7);
  eq([found.line, found.column], [1, 8]);
  truthy(/key|value|comma/.test(found.reason), found.reason);
});

test('single quotes: keys and values are told apart', async () => {
  eq((await explain("{'a':1}")).reason, 'keys need double quotes, not single quotes');
  eq((await explain("{\"a\":'x'}")).reason, 'text needs double quotes ("like this"), not single quotes');
});

test('text without quotes', async () => {
  eq((await explain('{"a":hello}')).reason, 'text needs double quotes ("like this"), unless it is true, false or null');
});

test('missing comma and colon', async () => {
  eq((await explain('[1 2]')).reason, 'a comma is missing between two items');
  eq((await explain('{"a" 1}')).reason, 'a colon is missing after the key');
});

test('the text ends too early', async () => {
  eq((await explain('[1,2')).reason, 'the text ends too early: a closing bracket or quote is missing');
  eq((await explain('{"a":"x')).reason, 'the text ends too early: a closing bracket or quote is missing');
  eq((await explain('')).reason, 'the text ends too early: a closing bracket or quote is missing');
});

test('extra text after the end', async () => {
  const found = await explain('{"a":1} x');
  eq(found.reason, 'there is extra text after the end of the JSON');
  eq(found.offset, 8);
});

test('line and column count from 1 across lines', async () => {
  const found = await explain('{\n  "a": 1,\n  "b" 2\n}');
  eq([found.line, found.column], [3, 7]);
});

test('numbers and comments', async () => {
  truthy(/number/.test((await explain('1.')).reason));
  truthy(/comments/.test((await explain('// hi\n{}')).reason));
});
