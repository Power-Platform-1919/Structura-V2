/* Run every audit in tests/ui in turn and print where the findings were saved, with the time each audit took.
   Run:  PW_CHANNEL=msedge node tests/ui/run-all.js         (add PW_HEADED=1 to watch in a visible window)
   Then open .playwright-mcp/ui-audit/ to see the screenshots and findings.json. */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { startClock, formatTable } = require('../timing');
const OUT = path.join(__dirname, '..', '..', '.playwright-mcp', 'ui-audit');
try { fs.unlinkSync(path.join(OUT, 'findings.json')); } catch { /* none yet */ }
const scripts = fs.readdirSync(__dirname).filter((f) => /^\d\d-.*\.js$/.test(f)).sort();
const clock = startClock();
const rows = [];
for (const s of scripts) {
  const startedAt = clock.stamp();
  const began = clock.now();
  console.log(`\n${startedAt}  == ${s}`);
  const result = spawnSync(process.execPath, [path.join(__dirname, s)], { stdio: 'inherit', env: process.env });
  rows.push({ name: s, seconds: (clock.now() - began) / 1000, startedAt, endedAt: clock.stamp(), ok: result.status === 0 });
}
const all = JSON.parse(fs.readFileSync(path.join(OUT, 'findings.json'), 'utf8'));
const by = all.reduce((a, f) => { a[f.severity] = (a[f.severity] || 0) + 1; return a; }, {});
console.log(formatTable('Time per audit', rows));
console.log('\nTotal findings:', all.length, JSON.stringify(by), '\nSaved in', OUT, `\nFinished in ${clock.elapsedSeconds().toFixed(0)}s`);
