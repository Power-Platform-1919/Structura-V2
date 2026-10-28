/* The command palette ranks exact matches first and then close ones (a typo, words in another order). Uses the real list of commands
   (read from the component's source) and the real uFuzzy file. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const sandbox = { window: {}, console };
sandbox.window = sandbox;
sandbox.Structra = {};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'src', 'libs', 'ufuzzy', 'uFuzzy.iife.min.js'), 'utf8') + '\nthis.uFuzzy = uFuzzy;', sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'src', 'core', 'command-match.js'), 'utf8'), sandbox);
const { rank } = sandbox.Structra.commandMatch;

// the commands as the palette lists them: id, label, cat, keys
const source = fs.readFileSync(path.join(ROOT, 'src', 'components', 'structra-command.js'), 'utf8');
const commands = [];
for (const match of source.matchAll(/\{ id: '([^']+)',\s*label: '([^']+)'[^}]*?cat: '([^']+)'(?:[^}]*?keys: '([^']*)')?/g)) commands.push({ id: match[1], label: match[2], cat: match[3], keys: match[4] || '' });
const labels = (query) => rank(commands, query).map((command) => command.label);

test('the real command list is read', () => {
  assert.ok(commands.length > 40, 'only ' + commands.length + ' commands were read');
});

test('an empty search shows every command in the list order', () => {
  assert.strictEqual(rank(commands, '').map((command) => command.id).join(), commands.map((command) => command.id).join());
  assert.strictEqual(rank(commands, '   ').length, commands.length);
});

test('a label that starts with the text comes first, before one that only contains it', () => {
  const result = labels('export');
  assert.ok(/^export/i.test(result[0]), result[0]);
  const startsAll = result.filter((label) => /^export/i.test(label)).length;
  assert.ok(result.slice(0, startsAll).every((label) => /^export/i.test(label)), 'labels starting with the text should be together at the front');
});

test('exact matches stay in front of close matches', () => {
  const result = rank(commands, 'sort');
  const exactEnd = result.findIndex((command) => !(command.label + command.id + (command.cat || '') + (command.keys || '')).toLowerCase().includes('sort'));
  const exactCount = exactEnd === -1 ? result.length : exactEnd;
  assert.ok(exactCount >= 1, 'sort should have at least one exact match');
  assert.ok(result.slice(exactCount).every((command) => !(command.label + command.id + (command.cat || '') + (command.keys || '')).toLowerCase().includes('sort')));
});

test('a typo still finds the command', () => {
  assert.match(labels('exprt').slice(0, 5).join('|').toLowerCase(), /export as csv/, 'exprt → ' + labels('exprt').slice(0, 5).join(' | '));
  assert.match(labels('flaten').join('|').toLowerCase(), /flatten/);
  assert.match(labels('tabel').join('|').toLowerCase(), /table/);
  assert.match(labels('shema').join('|').toLowerCase(), /schema/);
});

test('words in another order find it too', () => {
  assert.match(labels('view table').join('|').toLowerCase(), /table view/);
  assert.match(labels('csv export').join('|').toLowerCase(), /export as csv/);
});

test('a short text gets exact matches only: "sort" does not offer Keyboard Shortcuts', () => {
  assert.ok(!labels('sort').some((label) => /Keyboard Shortcuts/.test(label)), labels('sort').join(' | '));
  assert.strictEqual(labels('xyz').length, 0);
});

test('a text that matches nothing gives nothing', () => {
  assert.strictEqual(JSON.stringify(labels('qqqzzzxxx')), '[]');
});

test('without uFuzzy the exact matches still work', () => {
  const plain = { window: {}, console };
  plain.window = plain;
  plain.Structra = {};
  vm.createContext(plain);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'src', 'core', 'command-match.js'), 'utf8'), plain);
  const result = plain.Structra.commandMatch.rank(commands, 'export').map((command) => command.label);
  assert.ok(result.length > 0 && /^export/i.test(result[0]));
  assert.strictEqual(plain.Structra.commandMatch.rank(commands, 'exprt').length, 0);
});
