/* Run every audit in tests/ui in turn and print where the findings were saved.
   Run:  PW_CHANNEL=msedge node tests/ui/run-all.js         (add PW_HEADED=1 to watch in a visible window)
   Then open .playwright-mcp/ui-audit/ to see the screenshots and findings.json. */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '..', '..', '.playwright-mcp', 'ui-audit');
try { fs.unlinkSync(path.join(OUT, 'findings.json')); } catch { /* none yet */ }
const scripts = fs.readdirSync(__dirname).filter((f) => /^\d\d-.*\.js$/.test(f)).sort();
for (const s of scripts) {
  console.log('\n== ' + s);
  spawnSync(process.execPath, [path.join(__dirname, s)], { stdio: 'inherit', env: process.env });
}
const all = JSON.parse(fs.readFileSync(path.join(OUT, 'findings.json'), 'utf8'));
const by = all.reduce((a, f) => { a[f.severity] = (a[f.severity] || 0) + 1; return a; }, {});
console.log('\nTotal findings:', all.length, JSON.stringify(by), '\nSaved in', OUT);
