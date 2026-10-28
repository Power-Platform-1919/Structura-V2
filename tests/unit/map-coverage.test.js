/* docs/feature-technology-map.md is the map of what the app is built with and what we plan to change. It only helps if it is
   complete, so this test fails when something exists in the code that the map never mentions: a new component, a core module,
   a worker, a CSS file, a vendored library, a workflow or a build tool. Add a row to the map and the test passes again. */
const fs = require('fs');
const path = require('path');
const { test, truthy } = require('./harness');

const ROOT = path.join(__dirname, '..', '..');
const doc = fs.readFileSync(path.join(ROOT, 'docs', 'feature-technology-map.md'), 'utf8').toLowerCase();
const mentions = (needle) => doc.includes(needle.toLowerCase());
const names = (dir, filter = () => true) => (fs.existsSync(path.join(ROOT, dir)) ? fs.readdirSync(path.join(ROOT, dir)).filter(filter) : []);

console.log('feature and technology map');

test('every UI component is in the map', () => {
  const missing = names('src/components', (f) => f.endsWith('.js')).map((f) => f.replace('.js', '')).filter((tag) => !mentions(tag));
  truthy(!missing.length, 'not in docs/feature-technology-map.md: ' + missing.join(', '));
});

test('every core module is in the map (by file name or by its Structra name)', () => {
  const missing = [];
  for (const f of names('src/core', (x) => x.endsWith('.js'))) {
    const source = fs.readFileSync(path.join(ROOT, 'src/core', f), 'utf8');
    const defined = [...source.matchAll(/^Structra\.([a-zA-Z]+)\s*=/gm)].map((m) => m[1]);
    if (!mentions(f.replace('.js', '')) && !defined.some(mentions)) missing.push(f);
  }
  truthy(!missing.length, 'not in the map: ' + missing.join(', '));
});

test('every worker, CSS file and vendored library is in the map', () => {
  const missing = [];
  for (const f of names('src/workers')) if (!mentions(f.replace('.js', '')) && !mentions(f.replace('-parse-worker.js', ''))) missing.push('src/workers/' + f);
  for (const f of names('src/css')) if (!mentions(f)) missing.push('src/css/' + f);
  for (const dir of ['src/libs', 'src/vendor']) {
    for (const f of names(dir)) {
      const base = f.replace(/\.min\.js$|\.js$/, '');
      // CodeMirror is documented by its product name, DuckDB by its own folder
      if (!mentions(base) && !(base === 'codemirror6' && mentions('codemirror'))) missing.push(dir + '/' + f);
    }
  }
  truthy(!missing.length, 'not in the map: ' + missing.join(', '));
});

test('every workflow and build tool is in the map', () => {
  const missing = [];
  for (const f of names('.github/workflows')) if (!mentions(f)) missing.push('.github/workflows/' + f);
  // the build tools are described by the library they build
  const byLibrary = { 'build-editor.mjs': 'codemirror', 'build-jsonc-parser.mjs': 'jsonc-parser', 'build-virtual-core.mjs': 'virtual-core', 'build-yaml.mjs': 'yamlIo' };
  for (const f of names('tools', (x) => x.endsWith('.mjs'))) if (!mentions(f) && !(byLibrary[f] && mentions(byLibrary[f]))) missing.push('tools/' + f);
  truthy(!missing.length, 'not in the map: ' + missing.join(', '));
});

test('every task the map names exists in todo.json', () => {
  const ids = new Set();
  const walk = (item) => { ids.add(item.id); (item.subtasks || []).forEach(walk); };
  JSON.parse(fs.readFileSync(path.join(ROOT, 'todo.json'), 'utf8')).tasks.forEach(walk);
  const text = fs.readFileSync(path.join(ROOT, 'docs', 'feature-technology-map.md'), 'utf8');
  const named = new Set();
  // "task 18.1", "tasks 21.8 and 21.9", "tasks 18 and 19"
  for (const m of text.matchAll(/tasks?\s+(\d+(?:\.\d+)*(?:(?:,\s*|\s+and\s+)\d+(?:\.\d+)*)*)/gi)) for (const id of m[1].match(/\d+(?:\.\d+)*/g)) named.add(id);
  // the "Task" column of the decisions table in section 7
  for (const row of text.split('\n').filter((line) => /^\| \d+ \| /.test(line))) {
    const cell = row.split('|')[3] || '';
    for (const id of cell.replace(/task/gi, '').match(/\d+(?:\.\d+)*/g) || []) named.add(id);
  }
  const unknown = [...named].filter((id) => !ids.has(id));
  truthy(!unknown.length, 'the map names tasks that todo.json does not have: ' + unknown.join(', '));
});
