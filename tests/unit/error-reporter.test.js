/* The error reporter keeps a bug report free of the document: quoted text is removed, long text is cut, addresses lose their query and
   fragment. It also keeps the version in index.html equal to package.json, because the bug report prints it. */
const fs = require('fs');
const path = require('path');
const { load, test, eq, truthy } = require('./harness');

load(['error-reporter']);
const R = Structra.errorReporter;

console.log('error reporter');

test('text inside double quotes is removed from a message (the browser quotes a piece of the document)', () => {
  eq(R.cleanMessage('Unexpected token \'a\', "abc, secret..." is not valid JSON'), 'Unexpected token \'a\', "..." is not valid JSON');
  eq(R.cleanMessage('Cannot read properties of undefined (reading \'name\')'), 'Cannot read properties of undefined (reading \'name\')');
});

test('a message is cut to 160 characters and line breaks become spaces', () => {
  const cleaned = R.cleanMessage('x'.repeat(500));
  truthy(cleaned.length <= 163, 'length ' + cleaned.length);
  eq(R.cleanMessage('a\nb\r\nc'), 'a b c');
});

test('an address loses its host, query and fragment; a blob address is only "blob"', () => {
  eq(R.cleanAddress('https://example.com/src/core/x.js?v=3#frag'), '/src/core/x.js');
  eq(R.cleanAddress('blob:https://example.com/1234-abcd'), 'blob');
  eq(R.cleanAddress('http://127.0.0.1:8080/#data=SECRETPAYLOAD'), '/');
});

test('the report holds the last 20 errors, newest last, and no quoted text', () => {
  for (let i = 0; i < 25; i++) R.report('error', new Error('failure ' + i + ' "private value ' + i + '"'));
  const list = R.list();
  eq(list.length, 20);
  eq(list[0].message, 'failure 5 "..."');
  eq(list[19].message, 'failure 24 "..."');
  const text = R.buildReport();
  truthy(!text.includes('private value'), 'the report must not contain quoted data');
  truthy(text.includes('Version:') && text.includes('Browser:'), 'version and browser lines');
  truthy(text.includes('Steps to repeat the problem'), 'a place for the steps');
});

test('layout notifications from the browser are not recorded', () => {
  const before = R.list().length;
  R.report('error', new Error('ResizeObserver loop completed with undelivered notifications.'));
  eq(R.list().length, before);
});

test('the version in index.html equals the version in package.json', () => {
  const root = path.join(__dirname, '..', '..');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  truthy(version, 'package.json needs a version');
  truthy(html.includes(`<meta name="structra-version" content="${version}">`), 'index.html meta structra-version must be ' + version);
});
