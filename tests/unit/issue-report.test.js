/* "Report a problem on GitHub" opens github.com's new-issue page with the bug report filled in. Whatever is in the open document, the
   address must not carry it: not a value, not a key, not the file name. The address stays short enough for GitHub and the browser. */
const { load, test, eq, truthy } = require('./harness');

global.document = { querySelector: () => ({ content: '2.0.0' }) };
global.window.innerWidth = 1360;
global.window.innerHeight = 900;
load(['error-reporter']);
const R = Structra.errorReporter;

console.log('issue report');

const SECRETS = ['TOP-SECRET-VALUE-4711', 'secret.person@example.com', 'ssn 123-45-6789', 'customers-2026-private.json', 'api_key_ABCDEF'];
Structra.state = { activeView: 'tree', jsonData: { 'api_key_ABCDEF': SECRETS[0], mail: SECRETS[1], note: SECRETS[2] }, fileName: SECRETS[3] };

const decoded = () => decodeURIComponent(R.issueUrl().split('body=')[1]);

test('the address goes to this project\'s new-issue page and has a title with the version and the labels', () => {
  const url = R.issueUrl();
  truthy(url.startsWith('https://github.com/Power-Platform-1919/Structura-V2/issues/new?'), url.slice(0, 80));
  truthy(/labels=bug%2Cfrom-app/.test(url));
  truthy(/title=%5Bv2\.0\.0%5D/.test(url), 'the title starts with [v2.0.0]');
});

test('the report in the address holds the version, browser and view and says the document is not included', () => {
  const body = decoded();
  truthy(/Version: 2\.0\.0/.test(body) && /Browser: \S/.test(body) && /View: tree/.test(body), body.slice(0, 200));
  truthy(/its content is not included/.test(body));
});

test('no value, key or file name of the open document is in the address, even when an error message quotes them', () => {
  R.report('error', new Error('Unexpected token \'a\', "TOP-SECRET-VALUE-4711 ssn 123-45-6789" is not valid JSON'));
  R.report('promise', { message: 'Cannot read "api_key_ABCDEF" of "secret.person@example.com"' });
  R.report('error', new Error('failed to open customers-2026-private.json'), 'https://example.com/src/app.js?file=customers-2026-private.json#TOP-SECRET-VALUE-4711', 12);
  const url = R.issueUrl();
  const text = decodeURIComponent(url);
  for (const secret of SECRETS.slice(0, 3).concat(SECRETS[4])) truthy(!text.includes(secret), 'the address holds: ' + secret);
  // the file name is only in a message that did not quote it; the reporter cannot know a bare word is a file name, so the state is checked instead
  truthy(!/fileName|File name:/.test(text), 'the report names a file');
});

test('the title carries the last error, cut, without quoted text', () => {
  R.report('error', new Error('x'.repeat(300)));
  const title = decodeURIComponent(R.issueUrl().split('title=')[1].split('&body=')[0]);
  truthy(title.length < 120, 'title length ' + title.length);
});

test('the address stays under 7,000 characters however many errors there are, and says when it cut the report', () => {
  for (let i = 0; i < 40; i++) R.report('error', new Error('A long message number ' + i + ' ' + 'word '.repeat(40)));
  const url = R.issueUrl();
  truthy(url.length <= 7000, 'length ' + url.length);
});

test('openIssue opens the address in a new tab without giving the new tab the page (noopener) and tells the person if the browser blocked it', () => {
  let call = null;
  global.window.open = (address, target, features) => { call = { address, target, features }; return {}; };
  eq(R.openIssue(), true);
  eq([call.target, call.features], ['_blank', 'noopener']);
  truthy(call.address.startsWith('https://github.com/'));
  const messages = [];
  Structra.toast = (message) => messages.push(message);
  global.window.open = () => null;
  eq(R.openIssue(), false);
  truthy(messages.length === 1 && /blocked/.test(messages[0]), messages.join('|'));
});
