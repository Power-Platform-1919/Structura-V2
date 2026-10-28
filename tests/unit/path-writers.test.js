/* Paths are written in one place only: Structra.dataPaths.child(). A path built by hand (`${path}.${key}`, `${path}["${key}"]`,
   path + '.' + key) breaks for keys such as "@odata.etag", so this test fails when a new one appears in src. Array positions
   (`${path}[${index}]`) are safe and allowed. A line that is not a data path can say so with the comment `path-ok`. Expression text for Power Automate and Power Fx is not a data path and is not checked here. */
const fs = require('fs');
const path = require('path');
const { test, truthy } = require('./harness');

const SRC = path.join(__dirname, '..', '..', 'src');
const SKIP = [path.join('src', 'libs'), path.join('src', 'workers', 'engine-worker.js'), path.join('src', 'core', 'data-paths.js'), path.join('src', 'core', 'power-platform-expressions.js'), path.join('src', 'core', 'overview-insights.js')];

const PATTERNS = [
  { name: 'path then dot then key', regex: /[pP]ath\}?\.\$\{/ },
  { name: 'a quoted key written into a path', regex: /\[\\?["']\$\{/ },
  { name: 'path plus a dot plus a key', regex: /[pP]ath\s*\+\s*['"]\.['"]\s*\+/ },
  { name: 'a root-dollar path written with a key', regex: /`\$\.\$\{[a-zA-Z]*[kK]ey\}`/ },
];

function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return files(full);
    return full.endsWith('.js') ? [full] : [];
  });
}

console.log('path writers');

test('no source file writes a data path by hand', () => {
  const found = [];
  for (const file of files(SRC)) {
    const relative = path.relative(path.join(SRC, '..'), file);
    if (SKIP.some((skipped) => relative.startsWith(skipped))) continue;
    fs.readFileSync(file, 'utf8').split('\n').forEach((line, number) => {
      if (line.includes('path-ok')) return;
      for (const { name, regex } of PATTERNS) if (regex.test(line)) found.push(`${relative}:${number + 1} (${name}): ${line.trim().slice(0, 110)}`);
    });
  }
  truthy(!found.length, 'use Structra.dataPaths.child(path, key) instead:\n        ' + found.join('\n        '));
});
