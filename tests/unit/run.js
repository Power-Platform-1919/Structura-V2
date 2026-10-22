/* Runs every *.test.js in this folder, each in its own Node process.
   Usage:  node tests/unit/run.js */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const files = fs.readdirSync(__dirname).filter((f) => f.endsWith('.test.js')).sort();
let failed = 0;
for (const f of files) {
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { encoding: 'utf8' });
  process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.status !== 0) failed++;
}
console.log(failed ? `\n${failed} test file(s) failed` : `\nAll ${files.length} test files passed`);
process.exit(failed ? 1 : 0);
