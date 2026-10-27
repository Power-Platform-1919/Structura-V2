/* How much of the official JSONPath standard (RFC 9535) our JSONPath engine passes.

   Get the suite:  curl -L -o cts.json https://raw.githubusercontent.com/jsonpath-standard/jsonpath-compliance-test-suite/main/cts.json
   Run:            node tests/perf/jsonpath-compliance.js cts.json

   Each test runs in its own process with a time limit, so a selector that makes the engine loop is reported as a hang, not fatal.
   First measured 2026-10-27: 32 percent, with 3 hangs (negative step slices, fixed since, 34 percent). See docs/mature-libraries-plan.md. */
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const ctsFile = path.resolve(process.env.CTS_FILE || (process.argv[2] && /\.json$/.test(process.argv[2]) ? process.argv[2] : 'cts.json'));
const cts = JSON.parse(fs.readFileSync(ctsFile, 'utf8'));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* ---- child mode: run one test, print the outcome ---- */
if (/^\d+$/.test(process.argv[2] || '')) {
  const { load } = require(path.join(ROOT, 'tests', 'unit', 'harness.js'));
  load(['jsonpath-query']);
  const test = cts.tests[Number(process.argv[2])];
  try {
    const found = Structra.jsonpathQuery.query(test.document, test.selector).map((match) => match.value);
    if (test.invalid_selector) console.log('accepted-invalid');
    else console.log((test.result ? same(found, test.result) : test.results.some((option) => same(found, option))) ? 'ok' : 'wrong ' + JSON.stringify(found).slice(0, 70));
  } catch (error) {
    console.log(test.invalid_selector ? 'ok' : 'throws ' + String(error.message).slice(0, 50));
  }
  process.exit(0);
}

/* ---- main: every test in its own process ---- */
const groups = {};
const bad = [];
let passed = 0;
cts.tests.forEach((test, index) => {
  const group = test.name.split(',')[0].trim();
  groups[group] = groups[group] || { pass: 0, fail: 0 };
  const run = spawnSync(process.execPath, [__filename, String(index)], { env: { ...process.env, CTS_FILE: ctsFile }, encoding: 'utf8', timeout: 4000 });
  const outcome = run.error && run.error.code === 'ETIMEDOUT' ? 'HANG' : (run.stdout || '').trim() || 'crash ' + (run.stderr || '').slice(0, 60);
  if (outcome === 'ok') { passed++; groups[group].pass++; } else { groups[group].fail++; bad.push({ name: test.name, selector: test.selector, outcome }); }
});

console.log('passed', passed, 'of', cts.tests.length, '=', Math.round(passed / cts.tests.length * 100) + '%');
console.log('hangs:', bad.filter((b) => b.outcome === 'HANG').length,
  ' accepted-invalid:', bad.filter((b) => b.outcome === 'accepted-invalid').length,
  ' wrong result:', bad.filter((b) => b.outcome.startsWith('wrong')).length,
  ' threw on valid:', bad.filter((b) => b.outcome.startsWith('throws')).length);
console.log('\nby group (fail/total):');
for (const [group, counts] of Object.entries(groups).filter(([, c]) => c.fail).sort((a, b) => b[1].fail - a[1].fail)) console.log(' ', group.padEnd(30), counts.fail + '/' + (counts.pass + counts.fail));
console.log('\nfirst failures:');
for (const b of bad.slice(0, 14)) console.log('  ', b.outcome.padEnd(18), b.name, '|', JSON.stringify(b.selector));
process.exit(bad.some((b) => b.outcome === 'HANG') ? 1 : 0);
