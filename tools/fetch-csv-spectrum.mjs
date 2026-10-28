/* Collects the csv-spectrum cases (https://github.com/maxogden/csv-spectrum, BSD-2-Clause) into tests/suites/csv-spectrum/cases.json.
   Run once, or again to update. The result is committed.

   Run:  node tools/fetch-csv-spectrum.mjs <folder of the npm package>
         (in an empty scratch folder:  npm install csv-spectrum   and pass node_modules/csv-spectrum)

   Why the npm package and not the git repository: the files inside it have CRLF line breaks, and the line breaks are exactly what these
   cases test. The git repository stores them with the line breaks changed, so a clone gives different bytes (and a different phone number).

   Each case: { name, csvBase64, expected }. The CSV is kept as bytes; expected is the list of rows the authors say a parser must give,
   with every value as text. */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = process.argv[2];
if (!source) { console.error('Give the folder of the npm package csv-spectrum'); process.exit(2); }
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'tests', 'suites', 'csv-spectrum');
mkdirSync(out, { recursive: true });

const version = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8')).version;
const cases = readdirSync(join(source, 'csvs')).filter((file) => file.endsWith('.csv')).sort().map((file) => {
  const name = file.replace(/\.csv$/, '');
  return {
    name,
    csvBase64: readFileSync(join(source, 'csvs', file)).toString('base64'),
    expected: JSON.parse(readFileSync(join(source, 'json', name + '.json'), 'utf8')),
  };
});
writeFileSync(join(out, 'cases.json'), JSON.stringify({ source: 'npm package csv-spectrum ' + version + ' (https://github.com/maxogden/csv-spectrum)', license: 'BSD-2-Clause', cases }));
console.log(`${cases.length} cases from csv-spectrum ${version}`);
