/* Runs every *.test.js in this folder, each in its own Node process, and prints when each one ran and how long it took.
   Usage:  node tests/unit/run.js */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { startClock, formatTable } = require('../timing');

const files = fs.readdirSync(__dirname).filter((f) => f.endsWith('.test.js')).sort();
const clock = startClock();
const rows = [];
let failed = 0;
for (const f of files) {
  const startedAt = clock.stamp();
  const began = clock.now();
  console.log(`\n${startedAt}  start ${f}`);
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { encoding: 'utf8' });
  process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.status !== 0) failed++;
  rows.push({ name: f, seconds: (clock.now() - began) / 1000, startedAt, endedAt: clock.stamp(), ok: r.status === 0 });
}
console.log(formatTable('Time per unit test file', rows));
console.log(failed ? `\n${failed} test file(s) failed` : `\nAll ${files.length} test files passed in ${clock.elapsedSeconds().toFixed(1)}s`);
process.exit(failed ? 1 : 0);
