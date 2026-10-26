/* Builds the code editor library (CodeMirror 6) into src/libs/codemirror6/.

   Run:  npm run build:editor

   Why a build step exists at all: CodeMirror 6 is published as many small ES modules that import each other by package name,
   which a browser cannot load on its own. esbuild joins them into a few files. The result is committed to the repository, so
   nothing else in the project needs a build: only whoever upgrades the library or changes tools/editor/entry.js runs this.

   Output:
     src/libs/codemirror6/editor.js        the core pieces (loaded the first time any code box is made)
     src/libs/codemirror6/chunks/*.js      one file per language and shared parts (loaded when needed)
     src/libs/codemirror6/NOTICE.txt       the packages inside, their versions and licences
*/
import { build } from 'esbuild';
import { rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outdir = join(root, 'src', 'libs', 'codemirror6');

rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });

const result = await build({
  entryPoints: { editor: join(root, 'tools', 'editor', 'entry.js') },
  outdir,
  bundle: true,
  splitting: true,
  format: 'esm',
  target: 'es2020',
  minify: true,
  legalComments: 'none',
  chunkNames: 'chunks/[name]-[hash]',
  metafile: true,
  logLevel: 'info',
});

// Which packages ended up inside, with their versions and licence text
const packages = new Map();
for (const file of Object.keys(result.metafile.inputs)) {
  const m = /node_modules[\\/]((?:@[^\\/]+[\\/])?[^\\/]+)/.exec(file);
  if (m) packages.set(m[1].replace('\\', '/'), true);
}
const lines = [
  'Code editor library: CodeMirror 6, built by tools/build-editor.mjs from tools/editor/entry.js.',
  'The files in this folder contain the packages below. Each is open source under the licence shown.',
  '',
];
const texts = new Map();            // licence text -> packages that use it
for (const name of [...packages.keys()].sort()) {
  const dir = join(root, 'node_modules', name);
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  lines.push(`${name} ${pkg.version}  (${pkg.license || 'licence not stated'})`);
  const licenceFile = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'license'].map((f) => join(dir, f)).find((f) => existsSync(f));
  const text = licenceFile ? readFileSync(licenceFile, 'utf8').trim() : `${pkg.license || 'MIT'} (no licence file in the package)`;
  if (!texts.has(text)) texts.set(text, []);
  texts.get(text).push(name);
}
lines.push('', '='.repeat(78), '');
for (const [text, names] of texts) {
  lines.push(`Licence text for: ${names.join(', ')}`, '', text, '', '-'.repeat(78), '');
}
writeFileSync(join(outdir, 'NOTICE.txt'), lines.join('\n'));
console.log(`Wrote ${packages.size} packages to ${outdir}`);
