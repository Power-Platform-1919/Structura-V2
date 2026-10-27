/* Builds @tanstack/virtual-core (MIT) into one ES module the app can load: src/libs/virtual-core/virtual-core.min.js.

   It does the arithmetic of a long list that draws only the rows on screen: which rows are visible, how tall the whole list is
   (so the scrollbar is true), where to scroll to reach row 480,000. The Table uses it (src/components/structra-table.js).
   The package is split into several small files; esbuild joins them into one.

   Run:  node tools/build-virtual-core.mjs <folder that holds node_modules/@tanstack/virtual-core>
   (for example a scratch folder where you ran: npm i @tanstack/virtual-core). The result is committed, so the app needs no build. */
import { buildSync } from 'esbuild';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const folder = resolve(process.argv[2] || '.');
const packageFolder = join(folder, 'node_modules', '@tanstack', 'virtual-core');
const { version } = JSON.parse(readFileSync(join(packageFolder, 'package.json'), 'utf8'));
const outFolder = join(root, 'src', 'libs', 'virtual-core');
mkdirSync(outFolder, { recursive: true });

buildSync({
  entryPoints: [join(packageFolder, 'dist', 'esm', 'index.js')],
  bundle: true,
  format: 'esm',
  minify: true,
  outfile: join(outFolder, 'virtual-core.min.js'),
  banner: { js: `/* @tanstack/virtual-core ${version} (MIT, Tanner Linsley), built with esbuild from dist/esm/index.js. See tools/build-virtual-core.mjs. */` },
});
copyFileSync(join(packageFolder, 'LICENSE'), join(outFolder, 'LICENSE'));
console.log('built @tanstack/virtual-core', version);
