/* Collects the official YAML Test Suite (https://github.com/yaml/yaml-test-suite, MIT) into tests/suites/yaml-test-suite/cases.json.
   Run once, or again to update. The result is committed.

   Run:  node tools/fetch-yaml-test-suite.mjs <folder where the data branch is cloned>
         (git clone --depth 1 --branch data-2022-01-17 https://github.com/yaml/yaml-test-suite.git <folder>)

   Each case: { id, name, yamlBase64, jsonBase64, error }. jsonBase64 is the JSON the reference parser gives (one or several JSON values,
   one per YAML document) and is missing when the suite does not give one; error is true when a parser must reject the text.
   The licence text (MIT) is not on the data branch; it is saved by hand in tests/suites/yaml-test-suite/LICENSE from the main branch.
   The bytes come from git itself, so line breaks and odd characters are exact. */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = process.argv[2];
if (!source) { console.error('Give the folder where the yaml-test-suite data branch is cloned'); process.exit(2); }
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'tests', 'suites', 'yaml-test-suite');
mkdirSync(out, { recursive: true });

const git = (...args) => execFileSync('git', ['-C', source, ...args], { maxBuffer: 1 << 26 });
const commit = git('rev-parse', 'HEAD').toString().trim();
const files = git('ls-tree', '-r', '--name-only', '-z', 'HEAD').toString('utf8').split('\0').filter(Boolean);
const folders = new Map();
for (const file of files) {
  const match = /^(.+)\/(in\.yaml|in\.json|error|===)$/.exec(file);
  if (!match) continue;
  if (!folders.has(match[1])) folders.set(match[1], new Set());
  folders.get(match[1]).add(match[2]);
}
const blob = (path) => git('cat-file', 'blob', `HEAD:${path}`);
const cases = [];
for (const [folder, names] of [...folders].sort((a, b) => a[0].localeCompare(b[0]))) {
  if (!names.has('in.yaml')) continue;
  const topLevel = folder.split('/')[0];
  // The title of a test is in the "===" file of its folder, or of the folder above for tests numbered 00, 01 ...
  const titleFile = names.has('===') ? `${folder}/===` : (folders.get(topLevel) && folders.get(topLevel).has('===') ? `${topLevel}/===` : null);
  cases.push({
    id: folder,
    name: titleFile ? blob(titleFile).toString('utf8').trim() : '',
    yamlBase64: blob(`${folder}/in.yaml`).toString('base64'),
    jsonBase64: names.has('in.json') ? blob(`${folder}/in.json`).toString('base64') : null,
    error: names.has('error'),
  });
}
writeFileSync(join(out, 'cases.json'), JSON.stringify({ source: 'https://github.com/yaml/yaml-test-suite', commit, cases }));
console.log(`${cases.length} cases (${cases.filter((c) => c.error).length} must fail, ${cases.filter((c) => c.jsonBase64).length} with a JSON answer) from commit ${commit}`);
