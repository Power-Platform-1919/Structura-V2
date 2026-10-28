/* Collects the standalone cases of the W3C XML Conformance Test Suite (xmltest, https://www.w3.org/XML/Test/) into
   tests/suites/xml-conformance/cases.json: the files in xmltest/valid/sa (a parser must accept them) and xmltest/not-wf/sa (a parser must
   reject them). "sa" means standalone: they need no other file. Run once, or again to update. The result is committed.

   Run:  node tools/fetch-xml-conformance.mjs <folder where xmlts20130923.zip was unpacked, the one that holds xmlconf/>
         (curl -o xmlts.zip https://www.w3.org/XML/Test/xmlts20130923.zip && unzip xmlts.zip)

   Each case: { name, kind, base64 }, kind "valid" or "notwf". The bytes are kept as they are (some files are in other encodings). */
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = process.argv[2];
if (!source) { console.error('Give the folder that holds xmlconf/'); process.exit(2); }
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'tests', 'suites', 'xml-conformance');
mkdirSync(out, { recursive: true });

const cases = [];
for (const [kind, folder] of [['valid', 'xmltest/valid/sa'], ['notwf', 'xmltest/not-wf/sa']]) {
  const directory = join(source, 'xmlconf', folder);
  for (const file of readdirSync(directory).filter((name) => name.endsWith('.xml') && statSync(join(directory, name)).isFile()).sort()) {
    cases.push({ name: `${folder}/${file}`, kind, base64: readFileSync(join(directory, file)).toString('base64') });
  }
}
writeFileSync(join(out, 'cases.json'), JSON.stringify({ source: 'https://www.w3.org/XML/Test/ (xmlts20130923, xmltest)', license: 'W3C Test Suite license: https://www.w3.org/copyright/software-notice/', cases }));
console.log(`${cases.length} cases (${cases.filter((c) => c.kind === 'valid').length} valid)`);
