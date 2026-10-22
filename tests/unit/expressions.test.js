const { load, test, eq, truthy } = require('./harness');
load(['util', 'paths', 'expressions']);
const E = Structra.expressions;

console.log('expressions and paths');

const fullOutput = {
  statusCode: 200, headers: {},
  body: { value: [
    { id: 1, name: 'A', active: true, created: '2024-05-01T10:00:00Z', due: '2024-06-01', tags: ['x'], note: null },
    { id: 2, name: 'B', active: false, created: '2024-05-02T10:00:00Z', due: '2024-06-02', tags: [], note: null },
  ] },
};
const rows = fullOutput.body.value;
const code = (list, label) => (list.find((r) => r.label === label) || {}).code;

test('Power Automate path is null-safe at every step', () => {
  Structra.state.jsonData = null;
  E.setSource({ kind: 'action', name: 'Parse_JSON', fullOutput: 'auto' });
  eq(Structra.paths.powerAutomate('$.a[2].b'), "body('Parse_JSON')?['a']?[2]?['b']");
});
test('a whole action output does not repeat body', () => {
  Structra.state.jsonData = fullOutput;
  E.setSource({ kind: 'action', name: 'HTTP', fullOutput: 'auto' });
  eq(E.powerAutomate('$.body.value', rows)[0].code, "body('HTTP')?['value']");
});
test('"No" keeps body when the document only looks like an output', () => {
  Structra.state.jsonData = fullOutput;
  E.setSource({ kind: 'action', name: 'HTTP', fullOutput: false });
  eq(E.powerAutomate('$.body.value', rows)[0].code, "body('HTTP')?['body']?['value']");
});
test('the trigger body is a valid root', () => {
  E.setSource({ kind: 'trigger', fullOutput: false });
  eq(E.powerAutomate('$.x', 1)[0].code, "triggerBody()?['x']");
});
test('the loop item is a valid root', () => {
  E.setSource({ kind: 'item', name: 'Apply_to_each', fullOutput: false });
  eq(E.powerAutomate('$.x', 1)[0].code, "items('Apply_to_each')?['x']");
});
test('a custom expression is used as the root', () => {
  E.setSource({ kind: 'custom', name: "outputs('Get_items')?['body']", fullOutput: false });
  eq(E.powerAutomate('$.value', 1)[0].code, "outputs('Get_items')?['body']?['value']");
});
test('the source can be read back', () => {
  truthy(typeof E.getSource().kind === 'string');
});

test('list rows use null-safe indexes', () => {
  Structra.state.jsonData = fullOutput;
  E.setSource({ kind: 'action', name: 'HTTP', fullOutput: 'auto' });
  eq(code(E.powerAutomate('$.body.value', rows), '[0].id'), "body('HTTP')?['value']?[0]?['id']");
});

test('Power Fx reads from the variable and counts rows from 1', () => {
  E.setSource({ fxVar: 'jsonText' });
  eq(Structra.paths.powerFx('$.a[0].b', { variable: 'jsonText' }), 'Index(ParseJSON(jsonText).a, 1).b');
});
test('Power Fx quotes names that are not plain identifiers', () => {
  eq(Structra.paths.powerFx('$.child-field', { variable: 'v' }), "ParseJSON(v).'child-field'");
});
test('Power Fx variable is configurable', () => {
  E.setSource({ fxVar: 'respText' });
  eq(E.powerFx('$.body.value', rows)[0].code, 'ParseJSON(respText).body.value');
  E.setSource({ fxVar: 'jsonText' });
});
test('Power Fx typed table converts each column by its type', () => {
  const t = code(E.powerFx('$.body.value', rows), 'Typed table (all columns)');
  truthy(t.includes('id: Value(ThisRecord.id)'), t);
  truthy(t.includes('name: Text(ThisRecord.name)'), t);
  truthy(t.includes('active: Boolean(ThisRecord.active)'), t);
  truthy(t.includes('created: DateTimeValue(ThisRecord.created)'), t);
  truthy(t.includes('due: DateValue(ThisRecord.due)'), t);
});
test('Power Fx typed table leaves nested lists out', () => {
  const t = code(E.powerFx('$.body.value', rows), 'Typed table (all columns)');
  truthy(!t.includes('tags:'), t);
});

test('flow actions are valid JSON with an @ expression', () => {
  Structra.state.jsonData = fullOutput;
  E.setSource({ kind: 'action', name: 'HTTP', fullOutput: 'auto' });
  const actions = E.flowActions('$.body.value', rows);
  truthy(actions.length >= 4);
  for (const a of actions) {
    const parsed = JSON.parse(a.code);
    const name = Object.keys(parsed)[0];
    truthy(typeof parsed[name].type === 'string', a.label);
    truthy(a.code.includes('@'), a.label);
  }
});
test('flow action Select maps columns with item()', () => {
  const select = JSON.parse(E.flowActions('$.body.value', rows).find((a) => a.label.startsWith('Select')).code).Select;
  eq(select.inputs.from, "@body('HTTP')?['value']");
  eq(select.inputs.select.id, "@item()?['id']");
});
test('flow action Filter array checks numbers against null, not empty()', () => {
  const q = JSON.parse(E.flowActions('$.body.value', rows).find((a) => a.label.startsWith('Filter')).code).Filter_array;
  eq(q.type, 'Query');
  eq(q.inputs.where, "@not(equals(item()?['id'], null))");
});
