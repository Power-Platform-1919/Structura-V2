/* Builds jsonc-parser (MIT, Microsoft) into one file the app can load: src/libs/jsonc-parser.min.js, a global named JSONC.

   Used to say where JSON is broken and why. The browsers' own JSON.parse messages differ (Chrome gives "at position 12", Firefox
   "at line 1 column 12", Safari gives no position), so the app cannot read the place from them. This parser reports the same
   offset and error code everywhere.

   Run:  node tools/build-jsonc-parser.mjs <folder that holds node_modules/jsonc-parser>
   (for example a scratch folder where you ran: npm i jsonc-parser). The result is committed, so the app needs no build. */
import { buildSync } from 'esbuild';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const folder = resolve(process.argv[2] || '.');
const packageFolder = join(folder, 'node_modules', 'jsonc-parser');
const { version } = JSON.parse(readFileSync(join(packageFolder, 'package.json'), 'utf8'));

buildSync({
  entryPoints: [join(packageFolder, 'lib', 'esm', 'main.js')],
  bundle: true,
  format: 'iife',
  globalName: 'JSONC',
  minify: true,
  outfile: join(root, 'src', 'libs', 'jsonc-parser.min.js'),
  banner: { js: `/* jsonc-parser ${version} (MIT, Microsoft Corporation), built with esbuild from lib/esm/main.js as the global JSONC. See tools/build-jsonc-parser.mjs. */` },
});
console.log('built jsonc-parser', version);
