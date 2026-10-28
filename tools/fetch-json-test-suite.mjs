/* Collects the JSONTestSuite parsing cases (https://github.com/nst/JSONTestSuite, MIT) into one file the tests can read:
   tests/suites/json-test-suite/cases.json. Run it once, or again to update the suite. The result is committed, so tests never download.

   Run:  node tools/fetch-json-test-suite.mjs <folder where the suite is cloned>
         (git clone https://github.com/nst/JSONTestSuite.git <folder>; the checkout may miss files whose names Windows cannot hold,
          so the cases are read from git itself, not from the folder's files)

   Each case: { name, kind, base64 }. kind is "y" (a parser must accept), "n" (a parser must reject) or "i" (either answer is allowed).
   The text is kept as bytes because some cases hold invalid UTF-8 on purpose. */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = process.argv[2];
if (!source) { console.error('Give the folder where JSONTestSuite is cloned'); process.exit(2); }
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'tests', 'suites', 'json-test-suite');
mkdirSync(out, { recursive: true });

const git = (...args) => execFileSync('git', ['-C', source, ...args], { maxBuffer: 1 << 28 });
const commit = git('rev-parse', 'HEAD').toString().trim();
const names = git('ls-tree', '-r', '--name-only', '-z', 'HEAD', 'test_parsing').toString('utf8').split('\0').filter(Boolean);
const cases = [];
for (const path of names) {
  const name = path.replace(/^test_parsing\//, '');
  if (!/^[yni]_/.test(name)) continue;
  cases.push({ name, kind: name[0], base64: git('cat-file', 'blob', `HEAD:${path}`).toString('base64') });
}
writeFileSync(join(out, 'cases.json'), JSON.stringify({ source: 'https://github.com/nst/JSONTestSuite', commit, cases }));
writeFileSync(join(out, 'LICENSE'), git('show', 'HEAD:LICENSE'));
console.log(`${cases.length} cases from commit ${commit}`);
