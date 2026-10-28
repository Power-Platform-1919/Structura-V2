/* The icon file holds only the icons the code names (tools/build-lucide.mjs). This fails when the code asks for an icon the file does not hold,
   for example a new name added without running the build, and when the file grows back to the whole library. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const iconFile = fs.readFileSync(path.join(ROOT, 'src', 'libs', 'lucide', 'lucide-icons.js'), 'utf8');
const holder = {};
new Function('window', iconFile)(holder);
const held = holder.lucide.icons;
const pascal = (name) => name.replace(/(^|-)([a-z0-9])/g, (_, __, letter) => letter.toUpperCase());

function sourceFiles(folder) {
  const found = [];
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    const full = path.join(folder, entry.name);
    if (entry.isDirectory()) { if (!['libs', 'vendor'].includes(entry.name)) found.push(...sourceFiles(full)); } else if (/\.js$/.test(entry.name)) found.push(full);
  }
  return found;
}

test('every icon the code names is in the icon file', () => {
  const missing = [];
  for (const file of [path.join(ROOT, 'index.html'), ...sourceFiles(path.join(ROOT, 'src'))]) {
    if (file.endsWith(path.join('core', 'icons.js'))) continue;
    const text = fs.readFileSync(file, 'utf8');
    for (const match of text.matchAll(/(?:icons\.(?:svg|has)\(|icon: ?|data-icon=)['"]([a-z][a-z0-9-]*)['"]/g)) {
      if (!held[pascal(match[1])]) missing.push(match[1] + ' (' + path.relative(ROOT, file) + ')');
    }
  }
  assert.deepStrictEqual(missing, [], 'run node tools/build-lucide.mjs <folder with node_modules/lucide> to add: ' + missing.join(', '));
});

test('the icon file is a subset, not the whole library, and every icon has drawing parts', () => {
  const names = Object.keys(held);
  assert.ok(names.length > 40 && names.length < 400, 'expected a subset, there are ' + names.length + ' icons');
  assert.ok(iconFile.length < 100000, 'the icon file is ' + iconFile.length + ' bytes');
  for (const name of names) {
    const [tag, attributes, children] = held[name];
    assert.strictEqual(tag, 'svg', name);
    assert.ok(attributes && Array.isArray(children) && children.length > 0, name + ' has no drawing parts');
  }
});
