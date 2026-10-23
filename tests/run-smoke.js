/* Run every browser test in tests/smoke at the same time (a few at a time) and print one line each.

   Run:  PW_CHANNEL=msedge node tests/run-smoke.js            (4 at a time)
         PW_CHANNEL=msedge node tests/run-smoke.js 6 find tabs   (6 at a time, only files whose name contains find or tabs)

   Each test starts its own small web server on a free port, so they do not get in each other's way. */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'smoke');
const args = process.argv.slice(2);
const width = /^\d+$/.test(args[0] || '') ? Number(args.shift()) : 4;
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js') && !f.startsWith('_') && (!args.length || args.some((a) => f.includes(a)))).sort();

const results = [];
let next = 0;
let running = 0;
const started = Date.now();

function launch() {
  while (running < width && next < files.length) {
    const file = files[next++];
    running++;
    const t0 = Date.now();
    const child = spawn(process.execPath, [path.join(dir, file)], { env: process.env });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('close', (code) => {
      running--;
      const secs = ((Date.now() - t0) / 1000).toFixed(0);
      const ok = code === 0;
      results.push({ file, ok, secs, out });
      console.log(`${ok ? 'ok  ' : 'FAIL'} ${file} (${secs}s)`);
      if (!ok) console.log(out.trim().split('\n').slice(-12).map((l) => '     ' + l).join('\n'));
      if (next >= files.length && running === 0) finish();
      else launch();
    });
  }
}

function finish() {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length} of ${results.length} passed in ${((Date.now() - started) / 1000).toFixed(0)}s`);
  process.exit(failed.length ? 1 : 0);
}

if (!files.length) { console.log('No test files match.'); process.exit(0); }
launch();
