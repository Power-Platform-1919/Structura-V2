/* Run every browser test in tests/smoke at the same time (a few at a time) and print one line each.

   Run:  PW_CHANNEL=msedge node tests/run-smoke.js            (4 at a time)
         PW_CHANNEL=msedge node tests/run-smoke.js 6 find tabs   (6 at a time, only files whose name contains find or tabs)
         PW_CHANNEL=msedge node tests/run-smoke.js --changed     (only the tests that touch the components changed since the last commit)

   Each test starts its own small web server on a free port, so they do not get in each other's way. */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'smoke');
const argv = process.argv.slice(2);
const changedOnly = argv.includes('--changed');
const args = argv.filter((a) => a !== '--changed');
// Default: as many at a time as the machine has cores for, up to 6 (each test drives its own browser)
const width = /^\d+$/.test(args[0] || '') ? Number(args.shift()) : Math.max(2, Math.min(6, require('os').cpus().length >> 1));
let files = fs.readdirSync(dir).filter((f) => f.endsWith('.js') && !f.startsWith('_') && (!args.length || args.some((a) => f.includes(a)))).sort();

/* --changed: a changed component picks the tests that mention it; a change to shared code (core, css, index, app) runs everything */
if (changedOnly) {
  let changed = [];
  try {
    changed = require('child_process').execSync('git status --porcelain', { cwd: path.join(__dirname, '..') }).toString().split(/\r?\n/).map((l) => l.slice(3).trim().split(path.sep).join('/')).filter(Boolean);
  } catch { /* not a git checkout: run everything */ }
  const shared = changed.some((f) => /^(src\/(core|css|app\.js|libs|vendor)|index\.html)/.test(f) && !/^src\/core\/(code-gen|data-mask|share)/.test(f));
  const parts = changed.filter((f) => /^src\/components\/structra-.*\.js$/.test(f)).map((f) => path.basename(f, '.js'));
  const touched = changed.filter((f) => /^tests\/smoke\/.*\.js$/.test(f)).map((f) => path.basename(f));
  if (!shared) {
    files = files.filter((f) => touched.includes(f) || parts.some((p) => fs.readFileSync(path.join(dir, f), 'utf8').includes(p) || fs.readFileSync(path.join(dir, f), 'utf8').includes(p.replace('structra-', ''))));
    console.log(`Changed since the last commit: ${parts.join(', ') || 'no components'}. Running ${files.length} test file(s).`);
  }
}

// Slowest first: the long ones start at once instead of being the last thing left running
const timesFile = path.join(__dirname, '.smoke-times.json');
let times = {};
try { times = JSON.parse(fs.readFileSync(timesFile, 'utf8')); } catch { /* first run */ }
files.sort((a, b) => (times[b] || 0) - (times[a] || 0) || a.localeCompare(b));

// The two slowest tests loop over many documents or modes: run them as several pieces at once
const SHARDS = { 'fixtures.js': 4, 'exports.js': 2 };
const jobs = [];
for (const f of files) for (let i = 0; i < (SHARDS[f] || 1); i++) jobs.push({ file: f, shard: `${i}/${SHARDS[f] || 1}` });

const results = [];
let next = 0;
let running = 0;
const started = Date.now();

function launch() {
  while (running < width && next < jobs.length) {
    const job = jobs[next++];
    const file = job.file;
    running++;
    const t0 = Date.now();
    const child = spawn(process.execPath, [path.join(dir, file)], { env: { ...process.env, SHARD: job.shard } });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('close', (code) => {
      running--;
      const secs = ((Date.now() - t0) / 1000).toFixed(0);
      const ok = code === 0;
      results.push({ file, ok, secs, out });
      if (ok) times[file] = Math.max(times[file] || 0, Number(secs) * (SHARDS[file] || 1));
      console.log(`${ok ? 'ok  ' : 'FAIL'} ${file}${job.shard === '0/1' ? '' : ' [' + job.shard + ']'} (${secs}s)`);
      if (!ok) console.log(out.trim().split('\n').slice(-12).map((l) => '     ' + l).join('\n'));
      if (next >= jobs.length && running === 0) finish();
      else launch();
    });
  }
}

function finish() {
  try { fs.writeFileSync(timesFile, JSON.stringify(times, null, 1)); } catch { /* read-only checkout */ }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length} of ${results.length} passed in ${((Date.now() - started) / 1000).toFixed(0)}s`);
  process.exit(failed.length ? 1 : 0);
}

if (!files.length) { console.log('No test files match.'); process.exit(0); }
launch();
