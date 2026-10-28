/* How long does it take to hand a big document to a worker (structured clone), and what does it cost in memory?
   This decides how the shared sandbox worker holds data: load once and reuse, or send it for every run.

   Usage:  PW_CHANNEL=msedge node tests/perf/worker-copy.js <path to a .json file>        (PW_BROWSER=firefox or webkit) */
const fs = require('fs');
const { chromium, firefox, webkit } = require('playwright');

const file = process.argv[2];
if (!file) { console.log('Give the path of a JSON file'); process.exit(2); }
const engine = { chromium, firefox, webkit }[process.env.PW_BROWSER || 'chromium'];

(async () => {
  const browser = await engine.launch({ channel: process.env.PW_CHANNEL || undefined });
  const page = await browser.newPage();
  const text = fs.readFileSync(file, 'utf8');
  await page.setContent('<html><body></body></html>');
  const result = await page.evaluate(async (jsonText) => {
    const parseStart = performance.now();
    const data = JSON.parse(jsonText);
    const parseMs = performance.now() - parseStart;
    const code = 'self.onmessage = (e) => { const t = performance.now(); if (e.data.data) { self.stored = e.data.data; self.postMessage({ stored: true, receiveMs: 0 }); } else { self.postMessage({ ok: true }); } };';
    const worker = new Worker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
    const waitMessage = () => new Promise((resolve) => { worker.onmessage = (event) => resolve(event.data); });
    // a tiny message first, so the worker is started and ready
    worker.postMessage({ ping: 1 });
    await waitMessage();
    const sendStart = performance.now();
    const reply = waitMessage();
    worker.postMessage({ data });
    const postMs = performance.now() - sendStart;       // the serialize cost on this side
    await reply;
    const roundMs = performance.now() - sendStart;      // until the worker has stored it
    // a second small job once the data is in the worker: this is what every later run costs
    const smallStart = performance.now();
    const small = waitMessage();
    worker.postMessage({ ping: 2 });
    await small;
    const smallMs = performance.now() - smallStart;
    worker.terminate();
    return { parseMs, postMs, roundMs, smallMs, heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null };
  }, text);
  console.log(JSON.stringify({ file: file.split(/[\\/]/).pop(), sizeMB: Math.round(text.length / 1048576), engine: process.env.PW_BROWSER || 'chromium', ...Object.fromEntries(Object.entries(result).map(([key, value]) => [key, typeof value === 'number' ? Math.round(value) : value])) }, null, 2));
  await browser.close();
})();
