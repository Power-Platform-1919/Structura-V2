/* Run every browser test in tests/smoke a few at a time and print one line each, with clock times and a table of how long each took.

   Run:  PW_CHANNEL=msedge node tests/run-smoke.js            (as many at a time as the machine suits)
         PW_CHANNEL=msedge node tests/run-smoke.js 6 find tabs   (6 at a time, only files whose name contains find or tabs)
         PW_CHANNEL=msedge node tests/run-smoke.js --changed     (only the tests that touch the components changed since the last commit)
         PW_CHANNEL=msedge node tests/run-smoke.js --own-browsers  (every test starts its own browser, as a single test does on its own)
         node tests/run-smoke.js --engine=firefox                  (the same tests in Firefox; --engine=webkit uses WebKit, the engine of Safari)

   Each test starts its own small web server on a free port, so they do not get in each other's way.

   Browsers are shared: one browser is started per slot (the number "at a time"), and each test in that slot connects to it
   (tests/launch-browser.js). A test still makes its own context, so it has its own storage and cookies. If a test crashes its
   browser, the next test in that slot gets a new one. This saves about a second per test over starting a browser each time. */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { closeSharedBrowser } = require('./launch-browser');

const dir = path.join(__dirname, 'smoke');
const argv = process.argv.slice(2);
const changedOnly = argv.includes('--changed');
// Firefox and WebKit are started by each test itself (tests/launch-browser.js), so a run in them uses no shared browsers
const engineArg = argv.find((a) => a.startsWith('--engine='));
if (engineArg) process.env.PW_BROWSER = engineArg.slice('--engine='.length);
const ownBrowsers = argv.includes('--own-browsers') || !!engineArg || !!process.env.PW_NO_SHARED || !!process.env.PW_HEADED;
const args = argv.filter((a) => a !== '--changed' && a !== '--own-browsers' && !a.startsWith('--engine='));
// Default: one test per core on a small machine (a CI runner has 4), about half the cores on a big one, and never more than 8. The
// tests mostly wait for the page, but past 8 at a time the browsers slow each other down (measured on a 22 core computer: 8 at a
// time took 97 s, 12 took 133 s).
const cores = require('os').cpus().length;
// (Firefox is heavier: past about 4 at a time its page loads start to time out on a busy computer.)
const widest = engineArg && /firefox/.test(engineArg) ? 4 : 8;
const width = /^\d+$/.test(args[0] || '') ? Number(args.shift()) : Math.max(2, Math.min(widest, cores <= 8 ? cores : cores >> 1));
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

// The slowest tests loop over many documents or modes: run them as several pieces at once
const SHARDS = { 'fixtures.js': 4, 'exports.js': 2 };
const jobs = [];
for (const f of files) for (let i = 0; i < (SHARDS[f] || 1); i++) jobs.push({ file: f, shard: `${i}/${SHARDS[f] || 1}` });

// No single test should run longer than this: a stuck page (or a computer that went to sleep mid-run) is stopped and reported
// instead of holding the whole run for hours. The slowest test normally takes about a minute.
const TEST_TIMEOUT_MS = Number(process.env.TEST_TIMEOUT_SECONDS || 300) * 1000;

const results = [];
let next = 0;
let running = 0;
let browsersStarted = 0;
const started = Date.now();
/** The time of day (24 hour) and the seconds since the run began, for example "14:03:27 +85s" */
const stamp = () => new Date().toTimeString().slice(0, 8) + ' +' + ((Date.now() - started) / 1000).toFixed(0) + 's';

/* ---------- the slots: each holds a browser that the tests run in it share ---------- */

const slots = [];

async function startBrowser() {
  const { chromium } = require('playwright');
  const server = await chromium.launchServer(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
  browsersStarted++;
  return server;
}

/** A slot whose browser has died (a test crashed it) gets a new one before the next test starts */
async function ensureBrowser(slot) {
  if (ownBrowsers) return;
  const alive = slot.server && slot.server.process().exitCode === null && !slot.server.process().killed;
  if (alive) return;
  slot.server = await startBrowser();
  slot.ws = slot.server.wsEndpoint();
}

async function closeBrowsers() {
  await Promise.all(slots.map((slot) => closeSharedBrowser(slot.server)));
}

/* ---------- running the tests ---------- */

function pump() {
  while (next < jobs.length) {
    const slot = slots.find((s) => !s.busy);
    if (!slot) return;
    slot.busy = true;
    running++;
    runJob(jobs[next++], slot);
  }
}

async function runJob(job, slot) {
  const file = job.file;
  const startedAt = stamp();
  const t0 = Date.now();
  try { await ensureBrowser(slot); } catch (error) { console.log('Could not start a shared browser (' + String(error.message).split('\n')[0] + '): this test starts its own.'); slot.ws = null; }
  const env = { ...process.env, SHARD: job.shard };
  if (slot.ws && !ownBrowsers) env.PW_SHARED_WS = slot.ws; else delete env.PW_SHARED_WS;
  const child = spawn(process.execPath, [path.join(dir, file)], { env });
  let out = '';
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; out += '\nStopped after ' + TEST_TIMEOUT_MS / 1000 + ' s (TEST_TIMEOUT_SECONDS changes this limit)\n'; child.kill(); }, TEST_TIMEOUT_MS);
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  child.on('close', (code) => {
    clearTimeout(timer);
    slot.busy = false;
    running--;
    const secs = ((Date.now() - t0) / 1000).toFixed(0);
    const ok = code === 0 && !timedOut;
    results.push({ file, shard: job.shard, ok, secs, out, startedAt, endedAt: stamp() });
    if (ok) times[file] = Math.max(times[file] || 0, Number(secs) * (SHARDS[file] || 1));
    console.log(`${stamp()}  ${ok ? 'ok  ' : 'FAIL'} ${file}${job.shard === '0/1' ? '' : ' [' + job.shard + ']'} (${secs}s, started ${startedAt})`);
    if (!ok) console.log(out.trim().split('\n').slice(-12).map((l) => '     ' + l).join('\n'));
    if (next >= jobs.length && running === 0) finish();
    else pump();
  });
}

async function finish() {
  const lastTestEnded = stamp();
  const closingStarted = Date.now();
  await closeBrowsers();
  const closeSeconds = ((Date.now() - closingStarted) / 1000).toFixed(1);
  try { fs.writeFileSync(timesFile, JSON.stringify(times, null, 1)); } catch { /* read-only checkout */ }
  const failed = results.filter((r) => !r.ok);
  // Where the time went: every test, slowest first, with when it started and ended
  console.log('\nTime per test, slowest first (clock time +seconds since the run began):');
  for (const r of [...results].sort((a, b) => Number(b.secs) - Number(a.secs))) {
    const name = r.file + (r.shard === '0/1' ? '' : ' [' + r.shard + ']');
    console.log(`  ${String(r.secs).padStart(4)}s  ${name.padEnd(26)} ${r.startedAt}  to  ${r.endedAt}`);
  }
  const total = results.reduce((sum, r) => sum + Number(r.secs), 0);
  console.log('Started ' + new Date(started).toTimeString().slice(0, 8) + ', ' + slots.length + ' at a time, ' + (ownBrowsers ? 'each test in its own browser' : browsersStarted + ' browsers shared by ' + results.length + ' test runs') + `. Test time added up: ${total}s.`);
  console.log(`Last test ended ${lastTestEnded}; closing the browsers took ${closeSeconds}s.`);
  console.log(`\n${results.length - failed.length} of ${results.length} passed in ${((Date.now() - started) / 1000).toFixed(0)}s`);
  process.exit(failed.length ? 1 : 0);
}

(async () => {
  if (!files.length) { console.log('No test files match.'); process.exit(0); }
  const count = Math.max(1, Math.min(width, jobs.length));
  for (let i = 0; i < count; i++) slots.push({ busy: false, server: null, ws: null });
  if (!ownBrowsers) {
    // Start every slot's browser at the same time, before the first test
    try { await Promise.all(slots.map((slot) => ensureBrowser(slot))); } catch (error) { console.log('Could not start shared browsers (' + String(error.message).split('\n')[0] + '): each test starts its own.'); slots.forEach((slot) => { slot.ws = null; }); }
  }
  pump();
})();
