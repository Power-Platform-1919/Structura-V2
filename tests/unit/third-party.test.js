/* THIRD-PARTY.md lists every library the app ships. This fails when a file or folder in src/libs or src/vendor is not named there, so a
   new library cannot arrive without its version, licence and source being written down. */
const fs = require('fs');
const path = require('path');
const { test, truthy } = require('./harness');

const ROOT = path.join(__dirname, '..', '..');
const document = fs.readFileSync(path.join(ROOT, 'THIRD-PARTY.md'), 'utf8');

// Our own code that sits in src/libs because it is loaded the same way
const OWN_CODE = new Set(['csv-typing.js']);

console.log('third-party list');

test('every file and folder in src/libs and src/vendor is in THIRD-PARTY.md', () => {
  const missing = [];
  for (const directory of ['src/libs', 'src/vendor']) {
    for (const name of fs.readdirSync(path.join(ROOT, directory))) {
      if (OWN_CODE.has(name)) continue;
      const stored = `${directory}/${name}`;
      if (!document.includes(stored) && !document.includes(stored.replace(/\/$/, '') + '/')) missing.push(stored);
    }
  }
  truthy(!missing.length, 'not in THIRD-PARTY.md: ' + missing.join(', '));
});

test('every library row has a version, a licence and a source link', () => {
  const rows = document.split('\n').filter((line) => /^\| (?!Library|---)/.test(line));
  const bad = rows.filter((row) => {
    const cells = row.split('|').map((cell) => cell.trim());
    return !(cells[2] && cells[3] && /^https?:\/\//.test(cells[4].split(',')[0].trim()));
  });
  truthy(rows.length >= 14, 'expected at least 14 libraries, found ' + rows.length);
  truthy(!bad.length, 'incomplete rows: ' + bad.map((row) => row.slice(0, 40)).join(' || '));
});
