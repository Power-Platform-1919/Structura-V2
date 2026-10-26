const { load, test, eq, truthy } = require('./harness');
load(['shared-helpers', 'data-paths', 'power-platform-expressions']);
const E = Structra.powerPlatformExpressions;

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
  eq(Structra.dataPaths.powerAutomate('$.a[2].b'), "body('Parse_JSON')?['a']?[2]?['b']");
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
  eq(Structra.dataPaths.powerFx('$.a[0].b', { variable: 'jsonText' }), 'Index(ParseJSON(jsonText).a, 1).b');
});
test('Power Fx quotes names that are not plain identifiers', () => {
  eq(Structra.dataPaths.powerFx('$.child-field', { variable: 'v' }), "ParseJSON(v).'child-field'");
});
test('Power Fx variable is configurable', () => {
  E.setSource({ fxVar: 'respText' });
  eq(E.powerFx('$.body.value', rows)[0].code, 'ParseJSON(respText).body.value');
  E.setSource({ fxVar: 'jsonText' });
});
test('Power Fx typed table converts each column by its type', () => {
  const t = code(E.powerFx('$.body.value', rows), 'Typed table (chosen columns)');
  truthy(t.includes('id: Value(ThisRecord.id)'), t);
  truthy(t.includes('name: Text(ThisRecord.name)'), t);
  truthy(t.includes('active: Boolean(ThisRecord.active)'), t);
  truthy(t.includes('created: DateTimeValue(ThisRecord.created)'), t);
  truthy(t.includes('due: DateValue(ThisRecord.due)'), t);
});
test('Power Fx typed table leaves nested lists out', () => {
  const t = code(E.powerFx('$.body.value', rows), 'Typed table (chosen columns)');
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

/* ---- a SharePoint "Get items" style list: Choice and Person fields are nested objects ---- */
const sp = {
  value: [
    { '@odata.etag': '"3"', ItemInternalId: '1', ID: 1, Title: 'Laptop', Status: { '@odata.type': 'x', Id: 0, Value: 'Open' },
      Requester: { '@odata.type': 'y', DisplayName: 'Ann', Email: 'ann@x.com', Department: null }, Due: '2025-03-14T00:00:00Z', Tags: [{ Value: 'IT' }] },
    { '@odata.etag': '"1"', ItemInternalId: '2', ID: 2, Title: 'Badge', Status: { '@odata.type': 'x', Id: 1, Value: 'Closed' },
      Requester: { '@odata.type': 'y', DisplayName: 'Bo', Email: 'bo@x.com', Department: 'HR' }, Due: null, Tags: [] },
  ],
};

function useSource(over) { Structra.state.jsonData = sp; E.setSource({ kind: 'action', name: 'Get_items', fullOutput: false, loopName: 'Apply_to_each', ...over }); }

test('inside a list item the first rows are the loop-relative expressions', () => {
  useSource({});
  const rows = E.powerAutomate('value[0].Requester.Email', 'ann@x.com');
  eq(rows[0].code, "items('Apply_to_each')?['Requester']?['Email']");
  eq(rows[1].code, "item()?['Requester']?['Email']");
  truthy(rows.some((r) => r.code === "body('Get_items')?['value']?[0]?['Requester']?['Email']"), 'the full path should still be offered');
});
test('the loop name comes from the source', () => {
  useSource({ loopName: 'Apply_to_each_2' });
  eq(E.powerAutomate('value[1].Title', 'Badge')[0].code, "items('Apply_to_each_2')?['Title']");
});
test('a value outside any list has no loop expressions', () => {
  useSource({});
  eq(E.powerAutomate('value', sp.value)[0].label, 'Access value');
});
test('the first rows do not repeat the same expression for a plain value', () => {
  useSource({});
  const rows = E.powerAutomate('value[0].Title', 'Laptop');
  const codes = rows.map((r) => r.code);
  eq(new Set(codes).size, codes.length, 'every row should be different');
});
test('Power Fx inside a record reads ThisRecord', () => {
  eq(Structra.dataPaths.powerFxInRecord('value[0].Requester.Email').expr, 'ThisRecord.Requester.Email');
  eq(Structra.dataPaths.powerFxInRecord('value[0].Title', 'ThisItem').expr, 'ThisItem.Title');
  eq(Structra.dataPaths.powerFxInRecord('value'), null);
});
test('the quick set gives Power Automate and Power Fx for the Node panel', () => {
  useSource({});
  const q = E.quick('value[0].Due', '2025-03-14T00:00:00Z');
  eq(q.filter((x) => x.app === 'Power Automate').length, 3);
  eq(q.find((x) => x.label.startsWith('Inside ForAll')).code, 'DateTimeValue(ThisRecord.Due)');
});

test('columns flatten Choice and Person fields and leave the OData plumbing off', () => {
  useSource({});
  const cols = E.pickedColumns('value', sp.value);
  const on = cols.filter((c) => c.on).map((c) => c.id);
  truthy(on.includes('Status.Value') && on.includes('Requester.Email') && on.includes('Title'), on.join());
  truthy(!on.includes('@odata.etag') && !on.includes('ItemInternalId'), 'noise should be off by default: ' + on.join());
  truthy(!cols.some((c) => c.id.startsWith('Tags')), 'lists of objects are not offered as columns');
  truthy(!cols.some((c) => c.id.includes('@odata.type')), 'type markers inside objects are not columns');
});
test('a flattened column is read from its nested path and converted by type', () => {
  useSource({});
  const t = code(E.powerFx('value', sp.value), 'Typed table (chosen columns)');
  truthy(t.includes('Status_Value: Text(ThisRecord.Status.Value)'), t);
  truthy(t.includes('Requester_Email: Text(ThisRecord.Requester.Email)'), t);
  truthy(t.includes('ID: Value(ThisRecord.ID)'), t);
  truthy(!t.includes('@odata.etag'), t);
});
test('switching a column off removes it from the typed table and the Select action', () => {
  useSource({});
  E.setColumn('value', sp.value, 'Title', false);
  const t = code(E.powerFx('value', sp.value), 'Typed table (chosen columns)');
  truthy(!t.includes('Title:'), t);
  const select = JSON.parse(E.flowActions('value', sp.value).find((a) => a.label.startsWith('Select')).code).Select;
  truthy(!('Title' in select.inputs.select));
  eq(select.inputs.select.Status_Value, "@item()?['Status']?['Value']");
  E.setColumn('value', sp.value, 'Title', true);
});
test('switching one column on keeps the other defaults', () => {
  useSource({});
  E.setColumn('value', sp.value, '@odata.etag', true);
  const on = E.pickedColumns('value', sp.value).filter((c) => c.on).map((c) => c.id);
  truthy(on.includes('@odata.etag') && on.includes('Title') && !on.includes('ItemInternalId'), on.join());
  E.setColumn('value', sp.value, '@odata.etag', false);
});

/* ---- inside a list item, nested loops, and helpers that use the real names ---- */
const spNested = {
  value: [
    { Title: 'Laptop', Requester: { Email: 'ann@x.com' }, Tags: [{ Id: 0, Value: 'IT' }] },
    { Title: 'Badge', Requester: { Email: 'bo@x.com' }, Tags: [] },
  ],
};

test('Power Fx offers ThisRecord and ThisItem for a value inside a list item', () => {
  useSource({});
  const rows = E.powerFx('value[0].Requester.Email', 'ann@x.com');
  truthy(rows.some((r) => r.code === 'ThisRecord.Requester.Email'), rows.map((r) => r.code).join(' / '));
  truthy(rows.some((r) => r.code === 'ThisItem.Requester.Email'));
});
test('a value outside any list has no ThisRecord rows', () => {
  useSource({});
  truthy(!E.powerFx('value', sp.value).some((r) => /^Inside ForAll|^In a gallery or data table/.test(r.label)));
});
test('flow actions for a field of a list item include Apply to each, Filter array and a variable', () => {
  useSource({});
  const labels = E.flowActions('value[0].Title', 'Laptop').map((a) => a.label);
  truthy(labels.some((l) => l.startsWith('Apply to each')), labels.join(' | '));
  truthy(labels.some((l) => l.startsWith('Filter array')), labels.join(' | '));
  truthy(labels.some((l) => l.startsWith('Initialize variable')), labels.join(' | '));
  const apply = JSON.parse(E.flowActions('value[0].Title', 'Laptop').find((a) => a.label.startsWith('Apply to each')).code).Apply_to_each;
  eq(apply.actions.Compose_field.inputs, "@items('Apply_to_each')?['Title']");
});
test('helpers: a list inside a list uses the second loop name', () => {
  useSource({});
  Structra.dataEngine = { findAllArrays: () => [{ path: 'value' }, { path: 'value[*].Tags' }] };
  const sections = E.helpers(spNested);
  const rows = sections.find((s) => s.title.startsWith('Apply to each')).rows;
  const codes = rows.map((r) => r.code);
  truthy(codes.includes("items('Apply_to_each')?['Tags']"), codes.join(' / '));
  truthy(codes.includes("items('Apply_to_each_2')?['Value']"), codes.join(' / '));
  truthy(!codes.some((c) => c.includes("items('Apply_to_each')?['Value']")), 'the inner field must not use the outer loop');
});
test('helpers use real keys from the document, not placeholder names', () => {
  useSource({});
  Structra.dataEngine = { findAllArrays: () => [] };
  const all = E.helpers({ name: 'Ann', items: [1, 2], age: 3 }).flatMap((s) => s.rows).map((r) => r.code).join('\n');
  truthy(all.includes("?['name']") && all.includes("?['items']"), all.slice(0, 300));
  truthy(!all.includes("?['keyName']") && !all.includes("?['arrayName']"), 'placeholder names are still there');
});
