/* Collects the official JSON Schema Test Suite (https://github.com/json-schema-org/JSON-Schema-Test-Suite, MIT) for drafts 4, 6 and 7 into
   tests/suites/json-schema-test-suite/draft4.json, draft6.json and draft7.json. Run once, or again to update. The result is committed.

   Run:  node tools/fetch-json-schema-test-suite.mjs <folder where the suite is cloned>
         (git clone --depth 1 https://github.com/json-schema-org/JSON-Schema-Test-Suite.git <folder>)

   Left out: the optional folder (formats, big numbers, unicode details), and refRemote.json, which needs a server that serves the
   suite's remote schemas. Each draft file is { source, commit, draft, files: { "allOf.json": [ { description, schema, tests: [...] } ] } }. */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = process.argv[2];
if (!source) { console.error('Give the folder where the suite is cloned'); process.exit(2); }
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'tests', 'suites', 'json-schema-test-suite');
mkdirSync(out, { recursive: true });
const commit = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD']).toString().trim();

for (const draft of ['draft4', 'draft6', 'draft7']) {
  const folder = join(source, 'tests', draft);
  const files = {};
  let tests = 0;
  for (const name of readdirSync(folder).filter((file) => file.endsWith('.json') && file !== 'refRemote.json').sort()) {
    const groups = JSON.parse(readFileSync(join(folder, name), 'utf8'));
    files[name] = groups;
    tests += groups.reduce((total, group) => total + group.tests.length, 0);
  }
  writeFileSync(join(out, draft + '.json'), JSON.stringify({ source: 'https://github.com/json-schema-org/JSON-Schema-Test-Suite', commit, draft, files }));
  console.log(`${draft}: ${Object.keys(files).length} files, ${tests} tests`);
}
writeFileSync(join(out, 'LICENSE'), readFileSync(join(source, 'LICENSE'), 'utf8'));
