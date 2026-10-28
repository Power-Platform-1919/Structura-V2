/* Builds the icons the app uses out of the Lucide package (ISC) into one small file: src/libs/lucide/lucide-icons.js, a global named lucide
   with the same shape as Lucide's own build ({ icons: { PascalName: ['svg', attributes, children] } }), so src/core/icons.js did not change.

   The old way was the whole library (about 358 KB, every one of 1,600 icons) as a script that blocks the page. Now only the names that appear
   as text in the source are included (the names are written in the code as strings such as 'search', so a name that is built from
   pieces would be missed: the test tests/unit/icons.test.js and the smoke tests catch that).

   Run:  node tools/build-lucide.mjs <folder that holds node_modules/lucide>
   (for example a scratch folder where you ran: npm i lucide). The result is committed, so the app needs no build. */
import { copyFileSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const folder = resolve(process.argv[2] || '.');
const packageFolder = join(folder, 'node_modules', 'lucide');
const { version } = JSON.parse(readFileSync(join(packageFolder, 'package.json'), 'utf8'));
const { icons } = await import(pathToFileURL(join(packageFolder, 'dist', 'esm', 'lucide.mjs')).href);
// Lucide 1.x keeps only the drawing parts of an icon and the shared svg attributes apart; the app's icon module reads the 0.x shape
const { default: defaultAttributes } = await import(pathToFileURL(join(packageFolder, 'dist', 'esm', 'defaultAttributes.mjs')).href);

const pascal = (name) => name.replace(/(^|-)([a-z0-9])/g, (_, __, letter) => letter.toUpperCase());

function sourceFiles(folderPath) {
  const found = [];
  for (const entry of readdirSync(folderPath)) {
    const full = join(folderPath, entry);
    if (statSync(full).isDirectory()) found.push(...sourceFiles(full));
    else if (/\.(js|html)$/.test(entry)) found.push(full);
  }
  return found;
}

const files = [join(root, 'index.html'), ...sourceFiles(join(root, 'src')).filter((file) => !/[\\/]src[\\/](libs|vendor)[\\/]/.test(file))];
const candidates = new Set();
const asked = new Set();      // names used as an icon in a place where it is certain they are icon names
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(/['"`]([a-z][a-z0-9]*(?:-[a-z0-9]+)*)['"`]/g)) candidates.add(match[1]);
  if (file.endsWith('icons.js') && file.includes('core')) continue;      // its comments show the call as an example
  for (const match of text.matchAll(/(?:icons\.(?:svg|has)\(|icon: ?|data-icon=)['"]([a-z][a-z0-9-]*)['"]/g)) asked.add(match[1]);
}

const chosen = {};
for (const name of [...candidates].sort()) if (icons[pascal(name)]) chosen[pascal(name)] = icons[pascal(name)];
const missing = [...asked].filter((name) => !icons[pascal(name)]);
if (missing.length) {
  console.error('These icon names are used in the code but are not in Lucide ' + version + ': ' + missing.join(', '));
  process.exit(1);
}

const outFolder = join(root, 'src', 'libs', 'lucide');
mkdirSync(outFolder, { recursive: true });
const banner = `/* lucide ${version} (ISC), only the icons the app uses (${Object.keys(chosen).length}), built by tools/build-lucide.mjs. Same shape as Lucide's own build: lucide.icons.PascalName = ['svg', attributes, children]. */\n`;
// the shared svg attributes are written once and every icon points at them
const body = Object.entries(chosen).map(([name, parts]) => JSON.stringify(name) + ': ["svg", attributes, ' + JSON.stringify(parts) + ']').join(',\n');
writeFileSync(join(outFolder, 'lucide-icons.js'), banner + '(function () {\nconst attributes = ' + JSON.stringify(defaultAttributes) + ';\nwindow.lucide = { icons: {\n' + body + '\n} };\n})();\n');
copyFileSync(join(packageFolder, 'LICENSE'), join(outFolder, 'LICENSE'));
console.log('built lucide ' + version + ': ' + Object.keys(chosen).length + ' icons, ' + asked.size + ' named in icon calls');
