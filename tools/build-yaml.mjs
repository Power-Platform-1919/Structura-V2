/* Builds the yaml package (ISC, Eemeli Aro) into one file the app can load: src/libs/yaml/yaml.min.js, a global named YAML with the two
   functions the app uses: parseAllDocuments and stringify. Only the code those two need is included.

   It replaced js-yaml (task 31.5): on the official YAML Test Suite it accepts all 274 valid texts (js-yaml: 231, it reads one document only
   and refuses unknown tags such as CloudFormation's !Ref) and rejects 92 of 94 invalid ones (js-yaml: 83).

   Run:  node tools/build-yaml.mjs <folder that holds node_modules/yaml>
   (for example a scratch folder where you ran: npm i yaml). The result is committed, so the app needs no build. */
import { buildSync } from 'esbuild';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const folder = resolve(process.argv[2] || '.');
const packageFolder = join(folder, 'node_modules', 'yaml');
const { version } = JSON.parse(readFileSync(join(packageFolder, 'package.json'), 'utf8'));
const outFolder = join(root, 'src', 'libs', 'yaml');
mkdirSync(outFolder, { recursive: true });

buildSync({
  stdin: { contents: "export { parseAllDocuments, stringify } from 'yaml';", resolveDir: folder, loader: 'js' },
  bundle: true,
  format: 'iife',
  globalName: 'YAML',
  platform: 'browser',
  minify: true,
  outfile: join(outFolder, 'yaml.min.js'),
  banner: { js: `/* yaml ${version} (ISC, Eemeli Aro), built with esbuild as the global YAML (parseAllDocuments, stringify). See tools/build-yaml.mjs. */` },
});
copyFileSync(join(packageFolder, 'LICENSE'), join(outFolder, 'LICENSE'));
console.log('built yaml', version);
