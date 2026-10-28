/* ============================================================
   STRUCTRA V2 - Sandbox service
   Structra.sandbox - the one place the person's own code and patterns run: JavaScript in the Query panel, a filter expression,
   a pattern (regular expression) over the whole document. Written once; every feature calls it and none starts its own worker.

   Why a worker: a loop that never ends or a pattern that backtracks for hours freezes the page if it runs on it. In a worker the
   page stays usable and ends the worker when the time limit passes. The worker has no access to the page or its storage, and the
   network functions are removed before any of the person's code runs (src/workers/sandbox-worker.js). This is a safeguard against
   accidents and the usual ways code leaks data, not a wall against a determined attacker.

   The document is copied into the worker once (about a tenth of a second for 25 MB) and kept; it is sent again only after the
   document changed. Jobs run one after the other.

   API (all return a promise):
     Structra.sandbox.evaluate(data, code, { locate, milliseconds })      → { value } or { items: [{ path, index, value }] }
     Structra.sandbox.filterRows(data, rowsPath, expression, options)     → the positions of the rows that pass
     Structra.sandbox.findPattern(data, pattern, { primitives, flags })   → { matches: [{ path, value }], truncated }
     Structra.sandbox.transform(data, steps, options)                     → { value }  the Transform steps ( .value | filter(x => x.a > 1) )
     Structra.sandbox.probePattern(pattern, flags, samples, options)      → { tried, matched }; fails with timedOut when the pattern is too slow on a sample.
                                                                            For code that must test a pattern once per value on the page (JSONPath, the Table
                                                                            filter): probe it on a few of the real values first, then run it.
     Structra.sandbox.stop()                                              → end the worker now (a running job fails with { stopped: true })
   A job that runs longer than `milliseconds` (default 5000) is ended and fails with an error whose timedOut is true.
   ============================================================ */
'use strict';

window.Structra = window.Structra || {};

Structra.sandbox = (() => {
  const DEFAULT_MILLISECONDS = 5000;
  const WORKER_URL = 'src/workers/sandbox-worker.js';

  let worker = null;
  let loadedData;            // the document the worker holds a copy of
  let hasLoaded = false;
  let nextId = 1;
  let queue = Promise.resolve();
  let current = null;        // the job that is running: { id, reject, timer }

  function forget() { hasLoaded = false; loadedData = undefined; }

  function endWorker() {
    if (worker) { try { worker.terminate(); } catch (_) { /* already gone */ } }
    worker = null;
    forget();
  }

  function failCurrent(error) {
    if (!current) return;
    const job = current;
    current = null;
    clearTimeout(job.timer);
    job.reject(error);
  }

  function startWorker() {
    if (worker) return worker;
    try {
      worker = new Worker(WORKER_URL);
    } catch (error) {
      worker = null;
      throw new Error('Your own code and patterns need the app to be opened from a web address, not from a file on disk.');
    }
    worker.addEventListener('message', (event) => {
      const message = event.data;
      if (!current || current.id !== message.id) return;
      const job = current;
      current = null;
      clearTimeout(job.timer);
      if (message.ok) job.resolve(message.result); else job.reject(new Error(message.error));
    });
    worker.addEventListener('error', (event) => {
      event.preventDefault();
      const message = event.message || 'The worker stopped unexpectedly';
      endWorker();
      failCurrent(new Error(message));
    });
    return worker;
  }

  /** Send one job and wait for its answer, ending the worker when the time is up */
  function send(op, params, milliseconds) {
    return new Promise((resolve, reject) => {
      let target;
      try { target = startWorker(); } catch (error) { reject(error); return; }
      const id = nextId++;
      const seconds = milliseconds / 1000;
      const timer = setTimeout(() => {
        endWorker();
        const error = new Error(`It ran for more than ${seconds} second${seconds === 1 ? '' : 's'} and was stopped.`);
        error.timedOut = true;
        failCurrent(error);
      }, milliseconds);
      current = { id, resolve, reject, timer };
      try { target.postMessage({ id, op, params }); } catch (error) {
        clearTimeout(timer);
        current = null;
        reject(new Error('The document could not be copied to the worker: ' + error.message));
      }
    });
  }

  /** Run jobs one after the other; a failed job does not stop the next one */
  function enqueue(task) {
    const result = queue.then(task, task);
    queue = result.catch(() => {});
    return result;
  }

  async function ensureLoaded(data, milliseconds) {
    if (hasLoaded && loadedData === data) return;
    await send('load', { data }, Math.max(milliseconds, 30000));    // copying a very large document may take a moment
    loadedData = data;
    hasLoaded = true;
  }

  function run(data, op, params, options = {}) {
    const milliseconds = options.milliseconds || DEFAULT_MILLISECONDS;
    return enqueue(async () => {
      if (!options.noDocument) await ensureLoaded(data, milliseconds);
      return send(op, params, milliseconds);
    });
  }

  /** The text path of a list of keys, written by the one path writer */
  function pathOfKeys(keys, root = '$') {
    return keys.reduce((path, key) => Structra.dataPaths.child(path, key), root);
  }

  async function evaluate(data, code, options = {}) {
    const source = String(code).replace(/^=/, '');
    if (/\bimport\s*\(/.test(source)) throw new Error('import() is not allowed here.');
    const result = await run(data, 'evaluate', { code: source, locate: !!options.locate }, options);
    if (!result.items) return result;
    return { items: result.items.map((item) => ({ path: item.keys ? pathOfKeys(item.keys) : null, index: item.index, value: item.value })) };
  }

  async function filterRows(data, rowsPath, expression, options = {}) {
    if (/\bimport\s*\(/.test(expression)) throw new Error('import() is not allowed here.');
    const rowsKeys = Structra.dataPaths.tokenize(rowsPath).map((token) => token.value);
    const result = await run(data, 'filter', { expression, rowsKeys }, options);
    return result.indexes;
  }

  async function findPattern(data, pattern, options = {}) {
    let result;
    try { result = await run(data, 'regex', { pattern, flags: options.flags || 'i', primitives: !!options.primitives, limit: options.limit }, options); }
    catch (error) {
      // Some engines (Firefox) give up on a runaway pattern with an error of their own instead of running to the time limit: same meaning
      if (/too much recursion|Maximum call stack|stack overflow|regexp too big/i.test(error.message)) error.timedOut = true;
      throw error;
    }
    return { matches: result.matches.map((match) => ({ path: pathOfKeys(match.keys), value: match.value })), truncated: result.truncated };
  }

  /** The longest few texts are the ones a slow pattern chokes on: pick them as the samples */
  function pickSamples(texts, count = 40) {
    return texts.filter((text) => typeof text === 'string').sort((first, second) => second.length - first.length).slice(0, count);
  }

  async function probePattern(pattern, flags, samples, options = {}) {
    try {
      return await run(undefined, 'probe', { pattern, flags: flags || 'i', samples }, { milliseconds: 1500, ...options, noDocument: true });
    } catch (error) {
      if (/too much recursion|Maximum call stack|stack overflow/i.test(error.message)) error.timedOut = true;
      throw error;
    }
  }

  async function transform(data, steps, options = {}) {
    if (/\bimport\s*\(/.test(steps)) throw new Error('import() is not allowed here.');
    return run(data, 'transform', { input: steps }, options);
  }

  function stop() {
    if (current) { const error = new Error('Stopped.'); error.stopped = true; endWorker(); failCurrent(error); } else endWorker();
  }

  // The worker holds a copy of the document: when the document changes, the copy is dropped and sent again at the next job
  if (Structra.events) {
    for (const name of ['state:jsonData', 'engine:data-modified', 'engine:active', 'engine:ingested', 'tabs:changed']) Structra.events.on(name, forget);
  }

  return { evaluate, filterRows, findPattern, transform, probePattern, pickSamples, stop, pathOfKeys, forget };
})();
