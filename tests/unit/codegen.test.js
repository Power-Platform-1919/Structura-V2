const { load, test, eq, truthy } = require('./harness');
load(['util', 'code-gen']);
const G = Structra.codeGen;

console.log('type definitions');

const rows = [
  { name: 'Pen', qty: 3, price: 1.5, dept: null, tags: ['a'] },
  { name: 'Ink', qty: null, price: 9.25, dept: 'HR', tags: [] },
  { name: 'Pad', qty: 12, price: null, dept: 'IT', extra: true },
];

test('TypeScript marks a field that is empty in some records as T | null', () => {
  const ts = G.generate('typescript', rows);
  truthy(ts.includes('qty: number | null;'), ts);
  truthy(ts.includes('price: number | null;'), ts);
  truthy(ts.includes('name: string;'), ts);
});
test('a field that is empty in the first record takes its type from the others', () => {
  const ts = G.generate('typescript', rows);
  truthy(ts.includes('dept: string | null;'), ts);
});
test('a field missing from some records is nullable too', () => {
  const ts = G.generate('typescript', rows);
  truthy(ts.includes('extra: boolean | null;'), ts);
});
test('a field that is only ever null is not "null | null"', () => {
  const ts = G.generate('typescript', [{ a: null }, { a: null }]);
  truthy(ts.includes('a: null;') && !ts.includes('null | null'), ts);
});
test('Python, C#, Go and Rust agree on which fields can be empty', () => {
  truthy(G.generate('python', rows).includes('qty: Optional[int]'), G.generate('python', rows));
  truthy(G.generate('csharp', rows).includes('int? Qty'), G.generate('csharp', rows));
  truthy(G.generate('go', rows).includes('Qty *int') || G.generate('go', rows).includes('Qty *float64'), G.generate('go', rows));
  truthy(G.generate('rust', rows).includes('Option<'), G.generate('rust', rows));
});
test('nested lists of records are merged the same way', () => {
  const ts = G.generate('typescript', { rows: [{ owner: { name: 'A', phone: null } }, { owner: { name: 'B', phone: '1' } }] });
  truthy(ts.includes('phone: string | null;'), ts);
});
test('every language still produces output for the same list', () => {
  for (const lang of ['typescript', 'python', 'csharp', 'go', 'rust', 'java', 'powerfx', 'sql']) {
    truthy(G.generate(lang, rows).length > 20, lang + ' produced nothing');
  }
});
