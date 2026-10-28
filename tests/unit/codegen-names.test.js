/* What the real compilers showed about the type definitions (tests/compile/type-compile.js runs them; these checks need no compiler):
   names that meet, odd keys, lists of lists, numbers, and the way each language wants its code. */
const { load, test, eq, truthy } = require('./harness');
load(['shared-helpers', 'type-code-generator']);
const G = Structra.typeCodeGenerator;

console.log('type definitions: names, keys and numbers');

test('two keys that become the same name get _2, _3 in every language', () => {
  const rows = [{ 'a b': 1, a_b: 2, 'a-b': 3 }];
  const py = G.generate('python', rows);
  truthy(py.includes('a_b: int') && py.includes('a_b_2: int') && py.includes('a_b_3: int'), py);
  const cs = G.generate('csharp', rows);
  truthy(cs.includes(' AB ') && cs.includes(' AB_2 ') && cs.includes(' AB_3 '), cs);
  const go = G.generate('go', rows);
  truthy(go.includes('\tAB int') && go.includes('\tAB_2 int') && go.includes('\tAB_3 int'), go);
  const ts = G.generate('typescript', rows);
  truthy(ts.includes("'a b': number") && ts.includes('a_b: number') && ts.includes("'a-b': number"), ts);   // TypeScript keeps the keys themselves
});

test('a class name is never used twice: the same key at two depths, or a key like the class itself', () => {
  const rows = [{ owner: { owner: { x: 1 } }, Owner: { y: 'z' }, Root: 1 }];
  for (const lang of ['typescript', 'python', 'csharp', 'go', 'rust', 'java']) {
    const out = G.generate(lang, rows);
    const names = [...out.matchAll(/(?:interface|class|struct|type) (\w+)/g)].map((match) => match[1]).filter((name) => name !== 'struct');
    eq(new Set(names).size, names.length, lang + ': ' + names.join(','));
  }
});

test('a name the language already uses for a type is not taken by a class (Option, List, String)', () => {
  const rows = [{ Option: { a: 1 }, List: { a: 1 }, String: { a: 1 }, Vec: { a: 1 } }];
  const rust = G.generate('rust', rows);
  truthy(!/struct (Option|Vec|String) \{/.test(rust), rust);
  const java = G.generate('java', rows);
  truthy(!/class (List|String)\b/.test(java), java);
  truthy(!/^class List\b/m.test(G.generate('python', rows)));
  truthy(!/class List\b/.test(G.generate('csharp', rows)));
});

test('a key with a line break, a quote or a backslash is written as a legal string in each language', () => {
  const rows = [{ ['line\nbreak "q" \\ tab\t']: 1 }];
  for (const lang of ['typescript', 'csharp', 'java', 'rust', 'go', 'python']) {
    const out = G.generate(lang, rows);
    truthy(!out.includes('line\nbreak'), lang + ' kept a raw line break:\n' + out);
  }
  truthy(G.generate('rust', rows).includes('line\\nbreak'));
});

test('a key with a backtick is a legal Go tag', () => {
  const go = G.generate('go', [{ 'a`b': 1 }]);
  truthy(go.includes('"json:\\"a`b\\""'), go);
});

test('Rust writes a control character as a braced escape, not as the four-digit form', () => {
  const rust = G.generate('rust', [{ ['a' + String.fromCharCode(1) + 'b']: 1 }]);
  truthy(rust.includes(String.fromCharCode(92) + 'u{1}'), rust);
});

test('a list of lists, a class with no fields and a record with no keys all produce code', () => {
  truthy(G.generate('typescript', [{ m: [[1, 2], [3]] }]).includes('m: number[][];'));
  truthy(G.generate('python', [{ m: [[1, 2], [3]] }]).includes('m: List[List[int]]'));
  truthy(G.generate('go', [{ m: [[1, 2], [3]] }]).includes('[][]int'));
  truthy(G.generate('python', [{}, {}]).includes('    pass'));
  truthy(G.generate('rust', [{}, {}]).includes('pub struct RootItem {}'));
  truthy(G.generate('go', [{}, {}]).includes('type RootItem struct{}'));
});

test('Go fields start with a capital letter, so the JSON reader sees them (1st becomes X1st, not _1st)', () => {
  const go = G.generate('go', [{ '1st': 1, _hidden: 2 }]);
  truthy(go.includes('\tX1st int') && !/\t_/.test(go), go);
});

test('a field that can be empty is a boxed type in Java (Integer, not int)', () => {
  truthy(G.generate('java', [{ qty: 3 }, { qty: null }]).includes('private Integer qty;'));
  truthy(G.generate('java', [{ qty: 3 }]).includes('private int qty;'));
});

test('Java has the key on every field and no public class, so the text compiles as one file', () => {
  const java = G.generate('java', [{ name: 'a', owner: { id: 1 } }]);
  truthy(java.includes('@JsonProperty("name")') && !/public class/.test(java), java);
});

test('Python can name a class that comes later: from __future__ import annotations is first', () => {
  truthy(G.generate('python', [{ owner: { id: 1 } }]).startsWith('from __future__ import annotations'));
});

test('C# has its usings and #nullable, and every property names its JSON key', () => {
  const cs = G.generate('csharp', [{ id: 1, Name: 'x' }]);
  truthy(cs.includes('using System.Collections.Generic;') && cs.includes('#nullable enable'), cs);
  truthy(cs.includes('[JsonPropertyName("id")]') && cs.includes('[JsonPropertyName("Name")]'), cs);
});

test('numbers: 3 then 1.5 is a decimal, 3000000000 is a wide integer, a small integer stays an int', () => {
  const rows = [{ a: 3, b: 5, c: 1 }, { a: 1.5, b: 3000000000, c: 2 }];
  const cs = G.generate('csharp', rows);
  truthy(cs.includes('double A') && cs.includes('long B') && cs.includes('int C'), cs);
  const go = G.generate('go', rows);
  truthy(go.includes('A float64') && go.includes('B int64') && go.includes('C int '), go);
  truthy(G.generate('rust', rows).includes('pub a: f64'));
});

test('a C# member is not named like its class or like a method every object has', () => {
  const cs = G.generate('csharp', [{ Root: 1, RootItem: 2, ToString: 3, Equals: 4 }]);
  truthy(!/ RootItem \{ get/.test(cs) && !/ ToString \{ get/.test(cs) && !/ Equals \{ get/.test(cs), cs);
});
