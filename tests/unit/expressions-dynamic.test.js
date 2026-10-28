/* The expression a person gets "as the designer writes it" for a value picked from dynamic content:
   outputs('Get_item')?['body/Title'] and triggerOutputs()?['body/Author/DisplayName'] (the form Microsoft's own error reference uses:
   https://learn.microsoft.com/power-automate/error-reference). A slash can only step into an object, so a list position ends the one text. */
const { load, test, eq, truthy } = require('./harness');
load(['shared-helpers', 'data-paths', 'power-platform-expressions']);
const P = Structra.dataPaths;
const E = Structra.powerPlatformExpressions;

console.log('dynamic content expressions');

const action = { call: "outputs('Get_item')" };
const trigger = { call: 'triggerOutputs()' };

test('keys under body go in one text with slashes', () => {
  eq(P.powerAutomateDynamic('$.Title', action), "outputs('Get_item')?['body/Title']");
  eq(P.powerAutomateDynamic('$.Author.DisplayName', trigger), "triggerOutputs()?['body/Author/DisplayName']");
});

test('a list position ends the text and the rest is null-safe steps', () => {
  eq(P.powerAutomateDynamic('$.value[0].Title', action), "outputs('Get_item')?['body/value']?[0]?['Title']");
  eq(P.powerAutomateDynamic('$.value[*].Requester.Email', action), "outputs('Get_item')?['body/value']?[0]?['Requester']?['Email']");
});

test('a key that holds a slash is its own step, so a slash always means one level in', () => {
  eq(P.powerAutomateDynamic('$["a/b"].c', action), "outputs('Get_item')?['body']?['a/b']?['c']");
});

test('a quote in a key is doubled', () => {
  truthy(P.powerAutomateDynamic('$["it\'s"].x', action).includes("it''s"));
});

test('a whole output ({ statusCode, headers, body }) starts at body, so that key is not repeated', () => {
  eq(P.powerAutomateDynamic('$.body.Title', { ...trigger, dropBody: true }), "triggerOutputs()?['body/Title']");
  eq(P.powerAutomateDynamic('$.body.Title', trigger), "triggerOutputs()?['body/body/Title']");
});

test('the whole body, and an empty path', () => {
  eq(P.powerAutomateDynamic('$', action), "outputs('Get_item')?['body']");
});

test('the expressions panel offers it for an action or a trigger, and not for the current item of a loop', () => {
  const sample = { Title: 'x', Author: { DisplayName: 'y' } };
  E.setSource({ kind: 'action', name: 'Get_item', fullOutput: false });
  let rows = E.powerAutomate('$.Author.DisplayName', 'y');
  const dynamic = rows.find((entry) => /dynamic content/.test(entry.label));
  eq(dynamic.code, "outputs('Get_item')?['body/Author/DisplayName']");
  E.setSource({ kind: 'trigger' });
  rows = E.powerAutomate('$.Title', sample.Title);
  eq(rows.find((entry) => /dynamic content/.test(entry.label)).code, "triggerOutputs()?['body/Title']");
  E.setSource({ kind: 'item', name: 'Apply_to_each' });
  rows = E.powerAutomate('$.Title', sample.Title);
  truthy(!rows.some((entry) => /dynamic content/.test(entry.label)));
  E.setSource({ kind: 'action', name: 'Parse_JSON', fullOutput: 'auto' });
});

test('the name of an action is written the way the designer writes it: spaces become underscores, a quote is doubled', () => {
  E.setSource({ kind: 'action', name: 'Get items', fullOutput: false });
  eq(E.powerAutomate('$.Title', 'x')[0].code, "body('Get_items')?['Title']");
  E.setSource({ kind: 'action', name: "Get 'x'", fullOutput: false });
  eq(E.powerAutomate('$.Title', 'x')[0].code, "body('Get_''x''')?['Title']");
  E.setSource({ kind: 'item', name: 'Apply to each 2' });
  eq(E.powerAutomate('$.Title', 'x')[0].code, "items('Apply_to_each_2')?['Title']");
  E.setSource({ kind: 'action', name: 'Parse_JSON', fullOutput: 'auto' });
});

test('a key with a quote is doubled in every expression that names it (sort, remove property, Select, Filter array)', () => {
  const rows = E.powerAutomate('$', [{ "it's": 1, b: 2 }]);
  for (const entry of rows) truthy(!/[^']'s'/.test(entry.code.replace(/''/g, '')), entry.label + ': ' + entry.code);
  truthy(rows.some((entry) => entry.code.includes("'it''s'")));
});
