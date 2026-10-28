/* Every Power Automate expression the app writes must be well formed in the workflow expression language, and call only functions that
   exist. The functions are the 135 names Microsoft lists in its reference (tests/suites/wdl-functions/functions.json, taken from
   https://learn.microsoft.com/azure/logic-apps/expression-functions-reference once; the file records where and when). The grammar checked
   is the part the app writes: a call name(args), a text 'a' (a quote inside is doubled), a number, null/true/false, and ?[...] or [...]
   after a value. Run on every path of the sample documents, the hostile keys and every source kind. */
const fs = require('fs');
const path = require('path');
const { load, test, eq, truthy } = require('./harness');
const { HOSTILE_KEYS } = require('../hostile-keys');
load(['shared-helpers', 'data-paths', 'power-platform-expressions']);
const E = Structra.powerPlatformExpressions;
const P = Structra.dataPaths;

console.log('expression syntax');

const FUNCTIONS = new Set(JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'suites', 'wdl-functions', 'functions.json'), 'utf8')).functions);

/** Parses one expression; returns { ok, error, functions } */
function parse(text) {
  let at = 0;
  const functions = [];
  const fail = (message) => { throw new Error(`${message} at ${at} in ${text.slice(0, 120)}`); };
  const space = () => { while (/\s/.test(text[at] || '')) at++; };
  function string() {
    at++;
    for (;;) {
      if (at >= text.length) fail('a text is not closed');
      if (text[at] === "'") { if (text[at + 1] === "'") { at += 2; continue; } at++; return; }
      at++;
    }
  }
  function primary() {
    space();
    const character = text[at];
    if (character === "'") { string(); return; }
    if (/[0-9-]/.test(character || '')) { const match = /^-?\d+(\.\d+)?/.exec(text.slice(at)); if (!match) fail('a number is wrong'); at += match[0].length; return; }
    const word = /^[A-Za-z_][A-Za-z0-9_]*/.exec(text.slice(at));
    if (!word) fail('a value was expected');
    at += word[0].length;
    space();
    if (text[at] === '(') {
      functions.push(word[0]);
      at++;
      space();
      if (text[at] === ')') { at++; return; }
      for (;;) {
        expression();
        space();
        if (text[at] === ',') { at++; continue; }
        if (text[at] === ')') { at++; return; }
        fail('a , or ) was expected');
      }
    }
    if (!['null', 'true', 'false'].includes(word[0])) fail(`the word ${word[0]} is not a call, a text or a literal`);
  }
  function expression() {
    primary();
    for (;;) {
      space();
      if (text[at] === '?' && text[at + 1] === '[') at++;
      if (text[at] !== '[') return;
      at++;
      space();
      if (text[at] === "'") string(); else if (/[0-9]/.test(text[at] || '')) { const match = /^\d+/.exec(text.slice(at)); at += match[0].length; } else fail('a text or a number was expected in []');
      space();
      if (text[at] !== ']') fail('a ] was expected');
      at++;
    }
  }
  try {
    expression();
    space();
    if (at < text.length) fail('something is left after the expression');
    return { ok: true, functions };
  } catch (error) { return { ok: false, error: error.message, functions }; }
}

test('the parser itself: what is well formed and what is not', () => {
  truthy(parse("body('Parse_JSON')?['value']?[0]?['it''s']").ok);
  truthy(parse("coalesce(outputs('Get_item')?['body/title'], 'Untitled')").ok);
  truthy(parse("if(empty(triggerBody()?['value']), 'default', triggerBody()?['value'])").ok);
  truthy(!parse("body('Parse_JSON'?['a']").ok);
  truthy(!parse("body('Parse_JSON')?['a'").ok);
  truthy(!parse("body('it's')").ok);
  truthy(!parse("body('x') extra").ok);
  truthy(!parse('body("x")').ok);
  eq(parse("add(1, mul(2, 3))").functions, ['add', 'mul']);
});

test('the list of functions is the one from Microsoft: 130 or more names, with the ones the app uses', () => {
  truthy(FUNCTIONS.size >= 130, String(FUNCTIONS.size));
  for (const name of ['body', 'outputs', 'items', 'item', 'triggerOutputs', 'triggerBody', 'first', 'last', 'length', 'coalesce', 'if', 'empty', 'string', 'join']) truthy(FUNCTIONS.has(name), name);
});

// documents and their paths
const sp = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'sp_getitems.json'), 'utf8'));
const hostile = {};
HOSTILE_KEYS.filter((key) => !key.includes('\u0000')).forEach((key, i) => { hostile[key] = i % 4 === 0 ? [{ [key]: i }] : i % 3 ? 'text' : { [key]: [1, 2] }; });
const DOCUMENTS = { 'sharepoint list': sp, 'hostile keys': hostile, 'a list of records': [{ id: 1, 'first name': 'a', tags: ['x'] }, { id: 2 }] };

function pathsOf(value, current = '$', out = []) {
  out.push({ path: current, value });
  if (out.length > 400) return out;
  if (Array.isArray(value)) { if (value.length) pathsOf(value[0], P.child(current, 0), out); } else if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) pathsOf(child, P.child(current, key), out);
  return out;
}

const SOURCES = [{ kind: 'action', name: 'Parse_JSON' }, { kind: 'action', name: "Get items 'x'", fullOutput: true }, { kind: 'trigger' }, { kind: 'item', name: 'Apply_to_each' }, { kind: 'custom', name: "variables('data')" }];

for (const [name, data] of Object.entries(DOCUMENTS)) {
  test(`every expression for the paths of ${name} is well formed and calls only functions Microsoft lists`, () => {
    Structra.state.jsonData = data;
    const unknown = new Set();
    let checked = 0;
    for (const source of SOURCES) {
      E.setSource({ fullOutput: 'auto', ...source });
      for (const { path: at, value } of pathsOf(data)) {
        for (const entry of E.powerAutomate(at, value)) {
          const result = parse(entry.code);
          checked++;
          // the rows whose code is a sample with a placeholder of ours (searchValue, otherArray) are still expressions
          truthy(result.ok, `${source.kind} ${at} "${entry.label}": ${result.error}`);
          for (const fn of result.functions) if (!FUNCTIONS.has(fn)) unknown.add(fn);
        }
      }
    }
    truthy(checked > 100, 'too few expressions were checked: ' + checked);
    eq([...unknown], [], 'functions that are not in the Microsoft list');
    E.setSource({ kind: 'action', name: 'Parse_JSON', fullOutput: 'auto' });
  });
}
