/* Collects the toml-test cases for TOML 1.0.0 (https://github.com/toml-lang/toml-test, MIT) into tests/suites/toml-test/cases.json.
   Run once, or again to update. The result is committed.

   Run:  node tools/fetch-toml-test.mjs <folder where it is cloned>          (git clone --depth 1 https://github.com/toml-lang/toml-test.git <folder>)

   Each case: { name, kind, tomlBase64, expected }. kind is "valid" (a parser must accept it and give "expected", written in the suite's tagged
   form: {"type": "integer", "value": "1"}) or "invalid" (a parser must reject it). Only the files listed for TOML 1.0.0 are taken.
   The bytes come from git itself, so line breaks are exact. */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = process.argv[2];
if (!source) { console.error('Give the folder where toml-test is cloned'); process.exit(2); }
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'tests', 'suites', 'toml-test');
mkdirSync(out, { recursive: true });

const git = (...args) => execFileSync('git', ['-C', source, ...args], { maxBuffer: 1 << 26 });
const commit = git('rev-parse', 'HEAD').toString().trim();
const listed = git('cat-file', 'blob', 'HEAD:tests/files-toml-1.0.0').toString('utf8').split(/\r?\n/).map((line) => line.trim()).filter((line) => line.endsWith('.toml'));
const cases = [];
for (const file of listed) {
  const kind = file.startsWith('valid/') ? 'valid' : 'invalid';
  const entry = { name: file.replace(/\.toml$/, ''), kind, tomlBase64: git('cat-file', 'blob', `HEAD:tests/${file}`).toString('base64') };
  if (kind === 'valid') entry.expected = JSON.parse(git('cat-file', 'blob', `HEAD:tests/${file.replace(/\.toml$/, '.json')}`).toString('utf8'));
  cases.push(entry);
}
writeFileSync(join(out, 'cases.json'), JSON.stringify({ source: 'https://github.com/toml-lang/toml-test', commit, version: 'TOML 1.0.0', cases }));
writeFileSync(join(out, 'LICENSE'), git('cat-file', 'blob', 'HEAD:LICENSE').toString('utf8'));
console.log(`${cases.length} cases (${cases.filter((c) => c.kind === 'valid').length} valid) from commit ${commit}`);
