/* Structra.yamlIo is the one door to the yaml library: reading and writing. These are the cases people hit with real files:
   Kubernetes and CloudFormation (several documents, tags such as !Ref), Docker Compose (the << merge key), and errors with a place. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, eq, truthy } = require('./harness');

vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'libs', 'yaml', 'yaml.min.js'), 'utf8') + ';globalThis.YAML = YAML;');
global.self = global;
new Function(fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'yaml-io.js'), 'utf8')).call(global);
const io = Structra.yamlIo;

console.log('yaml io');

test('a plain mapping and list', () => {
  const result = io.parse('name: web\nports:\n  - 80\n  - 443\nenabled: true\nratio: 0.5\nnothing: null\n');
  eq(result.data, { name: 'web', ports: [80, 443], enabled: true, ratio: 0.5, nothing: null });
  eq([result.documents, result.tagsIgnored], [1, false]);
});

test('several documents come back as a list, one entry each (Kubernetes files)', () => {
  const result = io.parse('kind: Service\n---\nkind: Deployment\nspec:\n  replicas: 2\n---\nkind: Ingress\n');
  eq(result.documents, 3);
  eq(result.data.map((item) => item.kind), ['Service', 'Deployment', 'Ingress']);
});

test('tags the library does not know keep their values and are reported (CloudFormation)', () => {
  const result = io.parse('Bucket: !Ref MyBucket\nName: !Sub "${Env}-app"\nArn: !GetAtt Role.Arn\nList: !If [Cond, a, b]\n');
  eq(result.data, { Bucket: 'MyBucket', Name: '${Env}-app', Arn: 'Role.Arn', List: ['Cond', 'a', 'b'] });
  eq(result.tagsIgnored, true);
});

test('the << merge key copies a mapping in (Docker Compose, CI files)', () => {
  const result = io.parse('base: &base\n  image: node\n  restart: always\nweb:\n  <<: *base\n  ports: ["80:80"]\n');
  eq(result.data.web, { image: 'node', restart: 'always', ports: ['80:80'] });
});

test('an error says what and where', () => {
  let message = '';
  try { io.parse('a: 1\nb: [1, 2\nc: 3\n'); } catch (error) { message = error.message; }
  truthy(/line 3|line 2/.test(message) && /column \d+/.test(message), message);
  truthy(!message.includes('\n'), 'one line, no code frame');
});

test('an empty text has no documents', () => {
  const result = io.parse('');
  eq([result.data, result.documents], [null, 0]);
});

test('a document that names the same thing many times is refused, not expanded for ever (alias bomb)', () => {
  const bomb = 'a: &a [x,x,x,x,x,x,x,x,x,x]\nb: &b [*a,*a,*a,*a,*a,*a,*a,*a,*a,*a]\nc: &c [*b,*b,*b,*b,*b,*b,*b,*b,*b,*b]\nd: &d [*c,*c,*c,*c,*c,*c,*c,*c,*c,*c]\ne: &e [*d,*d,*d,*d,*d,*d,*d,*d,*d,*d]\nf: &f [*e,*e,*e,*e,*e,*e,*e,*e,*e,*e]\n';
  let message = '';
  try { io.parse(bomb); } catch (error) { message = error.message; }
  truthy(/alias/i.test(message), 'expected a refusal about aliases, got: ' + message);
});

test('writing: two spaces, lists indented, text that needs quotes is quoted, and it reads back the same', () => {
  const value = { name: 'web', tags: ['a', 'b'], nested: { yes: 'yes', empty: '', number: '12', multi: 'line1\nline2' }, date: '2026-10-28', n: null };
  const text = io.stringify(value);
  truthy(/^name: web$/m.test(text) && /^tags:\n {2}- a\n {2}- b$/m.test(text), text);
  eq(io.parse(text).data, value);
});

test('writing a value that appears twice does not make an alias', () => {
  const shared = { x: 1 };
  const text = io.stringify({ a: shared, b: shared });
  truthy(!/[&*]/.test(text), text);
});
