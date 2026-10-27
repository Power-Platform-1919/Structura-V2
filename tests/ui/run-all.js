/* Run every audit in tests/ui and print where the findings were saved, with the time each audit took.
   Run:  PW_CHANNEL=msedge node tests/ui/run-all.js         (add PW_HEADED=1 to watch in a visible window; it then runs one at a time)
         AUDITS_AT_A_TIME=2 node tests/ui/run-all.js         (how many audits run at the same time; default from the cores, 2 to 5)
   Then open .playwright-mcp/ui-audit/ to see the screenshots and findings.json.

   The audits are independent (each serves the app on its own port and keeps its own findings file), so they run side by side
   in one shared browser, slowest first. The random-clicking audit also tries its documents side by side. */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { startClock, formatTable } = require('../timing');
const { closeSharedBrowser } = require('../launch-browser');
const { mergeFindings, OUT } = require('./helpers');

const headed = !!process.env.PW_HEADED;
// Default: a quarter of the cores, at least 2 and at most 5 (there are 5 audits): 2 on a CI runner, all 5 on a big computer
const width = headed ? 1 : Math.max(1, Number(process.env.AUDITS_AT_A_TIME || Math.max(2, Math.min(5, require('os').cpus().length >> 2))));
for (const name of fs.readdirSync(OUT)) if (/^findings.*\.json$/.test(name)) { try { fs.unlinkSync(path.join(OUT, name)); } catch { /* none yet */ } }

// The slowest first, so it is not the only one left running at the end
const SLOW_FIRST = ['05-monkey.js'];
const scripts = fs.readdirSync(__dirname).filter((f) => /^\d\d-.*\.js$/.test(f)).sort((a, b) => SLOW_FIRST.indexOf(b) - SLOW_FIRST.indexOf(a) || a.localeCompare(b));
const clock = startClock();
const rows = [];

async function startSharedBrowser() {
  if (headed) return null;
  try {
    const { chromium } = require('playwright');
    return await chromium.launchServer(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
  } catch (error) {
    console.log('Could not start a shared browser (' + String(error.message).split('\n')[0] + '): each audit starts its own.');
    return null;
  }
}

function runScript(script, env) {
  return new Promise((resolve) => {
    const startedAt = clock.stamp();
    const began = clock.now();
    console.log(`${startedAt}  == ${script}`);
    // The output of each audit is collected and printed when it finishes, so the lines of different audits do not mix
    const child = spawn(process.execPath, [path.join(__dirname, script)], { env });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('close', (code) => {
      console.log(`\n${clock.stamp()}  == ${script} finished\n${out.trim()}`);
      rows.push({ name: script, seconds: (clock.now() - began) / 1000, startedAt, endedAt: clock.stamp(), ok: code === 0 });
      resolve();
    });
  });
}

(async () => {
  const server = await startSharedBrowser();
  const env = { ...process.env };
  if (server) env.PW_SHARED_WS = server.wsEndpoint();
  const queue = [...scripts];
  await Promise.all(Array.from({ length: Math.min(width, queue.length) }, async () => {
    while (queue.length) await runScript(queue.shift(), env);
  }));
  await closeSharedBrowser(server);
  const all = mergeFindings();
  const by = all.reduce((a, f) => { a[f.severity] = (a[f.severity] || 0) + 1; return a; }, {});
  console.log(formatTable('Time per audit', rows));
  console.log('\nTotal findings:', all.length, JSON.stringify(by), '\nSaved in', OUT, `\nFinished in ${clock.elapsedSeconds().toFixed(0)}s (${Math.min(width, scripts.length)} at a time)`);
})();
