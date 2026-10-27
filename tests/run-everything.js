/* Runs every check in order (lint, unit tests, browser tests, UI audit) and prints a clock time at each step
   and a table of how long each stage took, so it is clear where the time goes.

   Run:  PW_CHANNEL=msedge node tests/run-everything.js          (stops at the first stage that fails)
         PW_CHANNEL=msedge node tests/run-everything.js --keep-going   (runs every stage, then reports) */
const { spawnSync } = require('child_process');
const path = require('path');
const { startClock, formatTable } = require('./timing');

const root = path.join(__dirname, '..');
const keepGoing = process.argv.includes('--keep-going');
const node = process.execPath;
const STAGES = [
  { name: 'lint', command: [node, path.join(root, 'node_modules', 'eslint', 'bin', 'eslint.js'), '.'] },
  { name: 'unit tests', command: [node, path.join(__dirname, 'unit', 'run.js')] },
  { name: 'browser tests', command: [node, path.join(__dirname, 'run-smoke.js')] },
  { name: 'UI audit', command: [node, path.join(__dirname, 'ui', 'run-all.js')] },
];
const clock = startClock();
const rows = [];
let failed = false;
for (const stage of STAGES) {
  const startedAt = clock.stamp();
  const began = clock.now();
  console.log(`\n${startedAt}  ===== ${stage.name} =====`);
  const result = spawnSync(stage.command[0], stage.command.slice(1), { stdio: 'inherit', cwd: root, env: process.env });
  const ok = result.status === 0;
  rows.push({ name: stage.name, seconds: (clock.now() - began) / 1000, startedAt, endedAt: clock.stamp(), ok });
  console.log(`${clock.stamp()}  ${ok ? 'ok  ' : 'FAIL'} ${stage.name}`);
  if (!ok) { failed = true; if (!keepGoing) break; }
}
console.log(formatTable('Time per stage', rows));
console.log(`\n${failed ? 'FAILED' : 'All stages passed'} in ${clock.elapsedSeconds().toFixed(0)}s (started ${clock.startedAtText()})`);
process.exit(failed ? 1 : 0);
