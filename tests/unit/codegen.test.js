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

console.log('names that are not valid in the language');

const odata = { '@odata.context': 'x', 'first name': 'Ann', '1st': 1, type: 'a', value: [{ 'Id': 1, class: 'k' }] };
test('TypeScript quotes keys that are not plain names', () => {
  const ts = G.generate('typescript', odata);
  truthy(ts.includes("'@odata.context': string;") && ts.includes("'first name': string;") && ts.includes("'1st': number;"), ts);
});
test('C# gives every renamed property its JSON name and a valid name', () => {
  const cs = G.generate('csharp', odata);
  truthy(cs.includes('[JsonPropertyName("@odata.context")]') && cs.includes('OdataContext {'), cs);
  truthy(cs.includes('[JsonPropertyName("value")]') && cs.includes('Value {'), cs);
  truthy(!/public [^\n]*@odata/.test(cs), cs);
});
test('Go, Rust, Java and Python give valid names and keep the JSON key', () => {
  const go = G.generate('go', odata);
  truthy(go.includes('OdataContext string `json:"@odata.context"`'), go);
  const rs = G.generate('rust', odata);
  truthy(rs.includes('#[serde(rename = "@odata.context")]') && rs.includes('pub odata_context: String'), rs);
  truthy(rs.includes('pub type_: String'), rs);
  const java = G.generate('java', odata);
  truthy(java.includes('@JsonProperty("@odata.context")') && java.includes('private String odataContext;'), java);
  const py = G.generate('python', odata);
  truthy(py.includes('odata_context: str  # JSON key: "@odata.context"') && !/\n    @odata/.test(py), py);
});
