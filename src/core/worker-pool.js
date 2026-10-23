/* ============================================================
   STRUCTRA V2 — Generic Worker Pool
   Lazy, scaling worker pool factory. Creates pool instances for
   offloading heavy parsing (JSON, CSV) from the main thread.
   ============================================================ */

/**
 * Create a worker pool with the given configuration.
 * @param {Object} config
 * @param {string} config.workerUrl - Path to worker script
 * @param {number} [config.maxWorkers=4] - Max concurrent workers
 * @param {number} [config.poolThreshold=4] - Queue depth that triggers scale-up
 * @param {number} [config.transferThreshold=0] - Byte threshold for Transferable ArrayBuffer (0 = disabled)
 * @returns {Object} pool with enqueue(text, options?) method
 */
Structra.createWorkerPool = function(config) {
  const pool = {
    name: config.name || 'Generic',
    workers: [],
    queue: [],
    maxWorkers: config.maxWorkers || 4,
    maxQueueSize: config.maxQueueSize || 64,
    maxTasksPerWorker: config.maxTasksPerWorker || 200,
    taskTimeout: config.taskTimeout || 30000,
    reqId: 0,
    poolThreshold: config.poolThreshold || 4,
    transferThreshold: config.transferThreshold || 0,
    idleTimeout: config.idleTimeout || 60000,     // ms before idle workers are terminated
    minWorkers: config.minWorkers || 0,           // keep at least this many alive
    workerUrl: config.workerUrl + '?v=' + Date.now(),
    workerCode: config.workerCode || null,       // inline source for Blob URL fallback
    _blobUrl: null,                              // cached Blob URL (created once)

    _createWorker() {
      var w;
      try {
        w = new Worker(this.workerUrl);
        Structra.log.info('WorkerPool', this.name + ' worker #' + (this.workers.length + 1) + ' created (URL)');
      } catch (urlErr) {
        // file:// origin blocks new Worker(url) — fall back to Blob URL
        if (!this.workerCode) {
          Structra.log.error('WorkerPool', this.name + ' — Worker URL blocked and no inline code: ' + urlErr.message);
          return null;
        }
        try {
          if (!this._blobUrl) {
            var blob = new Blob([this.workerCode], { type: 'text/javascript' });
            this._blobUrl = URL.createObjectURL(blob);
            Structra.log.info('WorkerPool', this.name + ' Blob URL created for file:// fallback');
          }
          w = new Worker(this._blobUrl);
          Structra.log.info('WorkerPool', this.name + ' worker #' + (this.workers.length + 1) + ' created (Blob URL)');
        } catch (blobErr) {
          Structra.log.error('WorkerPool', this.name + ' — Blob URL worker also failed: ' + blobErr.message);
          return null;
        }
      }
      try {
        const entry = { worker: w, busy: false, _cb: null, taskCount: 0, _idleTimer: null };
        w.addEventListener('message', (e) => {
          const msg = e.data;
          if (entry._cb && entry._cb.id === msg.id) {
            const cb = entry._cb;
            entry._cb = null;
            entry.busy = false;
            entry.taskCount++;
            if (cb._timer) { clearTimeout(cb._timer); cb._timer = null; }
            if (msg.success) {
              Structra.log.debug('WorkerPool', 'Task #' + msg.id + ' completed (worker tasks: ' + entry.taskCount + ')');
              cb.resolve(msg);
            } else {
              Structra.log.error('WorkerPool', 'Task #' + msg.id + ' failed: ' + msg.error);
              cb.reject(new Error(msg.error));
            }
            this._recycleIfNeeded(entry);
            this._startIdleTimer(entry);
            this._drain();
          }
        });
        w.addEventListener('error', (e) => {
          e.preventDefault();
          const msg = e.message || 'Worker crashed';
          Structra.log.error('WorkerPool', 'Worker error: ' + msg);
          if (entry._cb) {
            const cb = entry._cb;
            entry._cb = null;
            entry.busy = false;
            if (cb._timer) { clearTimeout(cb._timer); cb._timer = null; }
            cb.reject(new Error(msg));
          }
          const idx = this.workers.indexOf(entry);
          if (idx !== -1) this.workers.splice(idx, 1);
          try { w.terminate(); } catch (_) {}
          this._drain();
        });
        this.workers.push(entry);
        return entry;
      } catch (e) {
        Structra.log.error('WorkerPool', 'Failed to create worker: ' + e.message, e);
        return null;
      }
    },

    _drain() {
      if (this.queue.length === 0) return;
      const idle = this.workers.find(e => !e.busy);
      if (!idle) return;
      const req = this.queue.shift();
      this._dispatch(idle, req);
    },

    _dispatch(entry, req) {
      if (entry._idleTimer) { clearTimeout(entry._idleTimer); entry._idleTimer = null; }
      entry.busy = true;
      entry._cb = req;
      const payload = { id: req.id, text: req.text };
      if (req.options) payload.options = req.options;

      // Use Transferable ArrayBuffer for large strings if configured
      if (this.transferThreshold > 0 && req.text.length > this.transferThreshold) {
        Structra.log.debug('WorkerPool', 'Task #' + req.id + ' → Transferable (' + (req.text.length / 1048576).toFixed(1) + ' MB)');
        const buffer = new TextEncoder().encode(req.text).buffer;
        entry.worker.postMessage({ id: req.id, buffer, options: req.options }, [buffer]);
      } else {
        Structra.log.debug('WorkerPool', 'Task #' + req.id + ' → postMessage (' + (req.text.length / 1024).toFixed(1) + ' KB)');
        entry.worker.postMessage(payload);
      }
    },

    _scaleUp() {
      while (this.workers.length < this.maxWorkers && this.queue.length > 0) {
        const fresh = this._createWorker();
        if (!fresh) break;
        const req = this.queue.shift();
        this._dispatch(fresh, req);
      }
    },

    _startIdleTimer(entry) {
      if (this.idleTimeout <= 0 || entry.busy) return;
      entry._idleTimer = setTimeout(() => {
        // Don't scale below minWorkers
        if (this.workers.length <= this.minWorkers) return;
        // Don't kill if it picked up work in the meantime
        if (entry.busy) return;
        var idx = this.workers.indexOf(entry);
        if (idx !== -1) {
          this.workers.splice(idx, 1);
          try { entry.worker.terminate(); } catch (_) {}
          Structra.log.debug('WorkerPool', 'Idle worker terminated (pool: ' + this.workers.length + ')');
        }
      }, this.idleTimeout);
    },

    _recycleIfNeeded(entry) {
      if (this.maxTasksPerWorker > 0 && entry.taskCount >= this.maxTasksPerWorker) {
        const idx = this.workers.indexOf(entry);
        if (idx !== -1) this.workers.splice(idx, 1);
        try { entry.worker.terminate(); } catch (_) {}
        // If queued tasks exist but no workers remain, spawn a fresh one
        if (this.queue.length > 0 && this.workers.length === 0) {
          const fresh = this._createWorker();
          if (fresh) {
            const req = this.queue.shift();
            this._dispatch(fresh, req);
          }
        }
      }
    },

    terminate() {
      this.workers.forEach(e => {
        if (e._idleTimer) clearTimeout(e._idleTimer);
        try { e.worker.terminate(); } catch (_) {}
      });
      this.workers = [];
      this.queue.forEach(r => r.reject(new Error('Pool terminated')));
      this.queue = [];
    },

    stats() {
      return {
        totalWorkers: this.workers.length,
        busyWorkers: this.workers.filter(e => e.busy).length,
        idleWorkers: this.workers.filter(e => !e.busy).length,
        pendingTasks: this.queue.length,
        maxQueueSize: this.maxQueueSize
      };
    },

    enqueue(text, options) {
      const taskTimeout = pool.taskTimeout;
      return new Promise((resolve, reject) => {
        if (pool.queue.length >= pool.maxQueueSize) {
          Structra.log.error('WorkerPool', 'Queue full (' + pool.maxQueueSize + '), rejecting task');
          reject(new Error('Worker queue full (' + pool.maxQueueSize + ')'));
          return;
        }

        if (pool.workers.length === 0) {
          Structra.log.info('WorkerPool', 'No workers, creating first worker...');
          const entry = pool._createWorker();
          if (!entry) {
            Structra.log.error('WorkerPool', 'Worker failed to initialize');
            reject(new Error('Worker failed to initialize'));
            return;
          }
        }

        const req = { id: ++pool.reqId, text, options, resolve, reject, _timer: null };

        // Task timeout: reject and terminate worker if it takes too long
        if (taskTimeout > 0) {
          req._timer = setTimeout(() => {
            const victim = pool.workers.find(e => e._cb === req);
            if (victim) {
              victim._cb = null;
              victim.busy = false;
              const idx = pool.workers.indexOf(victim);
              if (idx !== -1) pool.workers.splice(idx, 1);
              try { victim.worker.terminate(); } catch (_) {}
            }
            // Also remove from queue if still queued
            const qi = pool.queue.indexOf(req);
            if (qi !== -1) pool.queue.splice(qi, 1);
            reject(new Error('Worker task timed out (' + taskTimeout + 'ms)'));
            pool._drain();
          }, taskTimeout);
        }

        const idle = pool.workers.find(e => !e.busy);
        if (idle) {
          pool._dispatch(idle, req);
          return;
        }

        pool.queue.push(req);
        if (pool.queue.length >= pool.poolThreshold) {
          pool._scaleUp();
        }
      });
    }
  };

  return pool;
};

/* ---------- JSON (main thread) ----------
   A worker is slower for JSON here: the parsed result has to be copied back to the page
   (structured clone), which costs several times more than the parse itself
   (about 1.5 s against 0.33 s for a 37 MB file). */
/**
 * JSON numbers are read as 64-bit floats, which cannot hold every number: 12345678901234567890 becomes
 * 12345678901234567000 and 1e400 becomes Infinity. Such a number is kept as text instead, so no digit is
 * lost when the data is copied, exported or edited. Returns the text to parse and how many were protected.
 */
Structra.protectBigNumbers = function (src) {
  if (!/\d{16}|\d[eE][+-]?\d{3}/.test(src)) return { text: src, count: 0 };
  var out = [], last = 0, count = 0, i = 0, n = src.length;
  while (i < n) {
    var c = src.charCodeAt(i);
    if (c === 34) {                                   // a string: skip it, numbers inside are text already
      i++;
      while (i < n) { var d = src.charCodeAt(i); if (d === 92) i += 2; else if (d === 34) { i++; break; } else i++; }
      continue;
    }
    if (c === 45 || (c >= 48 && c <= 57)) {
      var j = i + 1;
      while (j < n) { var e = src.charCodeAt(j); if ((e >= 48 && e <= 57) || e === 46 || e === 101 || e === 69 || e === 43 || e === 45) j++; else break; }
      var tok = src.slice(i, j);
      if (tok.length >= 16 || /[eE]/.test(tok)) {
        var v = Number(tok), lossy = false;
        if (!isFinite(v)) lossy = true;
        else if (/^-?\d+$/.test(tok)) { try { lossy = BigInt(tok).toString() !== BigInt(v).toString(); } catch (err) { lossy = false; } }
        else lossy = tok.replace(/^-/, '').replace(/[eE].*$/, '').replace(/\./, '').replace(/^0+/, '').length > 17;
        if (lossy) { out.push(src.slice(last, i), '"' + tok + '"'); last = j; count++; }
      }
      i = j;
      continue;
    }
    i++;
  }
  if (!count) return { text: src, count: 0 };
  out.push(src.slice(last));
  return { text: out.join(''), count: count };
};

Structra.parseJsonAsync = async function (text) {
  var t0 = performance.now();
  await Structra.util.nextTick();   // let the loading message paint first
  var src = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
  var protectedText = Structra.protectBigNumbers(src);
  Structra.parseNotes = { bigNumbers: protectedText.count };
  src = protectedText.text;
  try {
    var data = JSON.parse(src);
    Structra.log.perf('Parse', 'JSON.parse (' + (text.length / 1024).toFixed(0) + ' KB)', performance.now() - t0);
    return data;
  } catch (err) {
    var size = text.length > 1024 ? Math.round(text.length / 1024) + 'KB' : text.length + 'B';
    throw new Error(err instanceof SyntaxError ? 'JSON parse error (' + size + '): ' + err.message : err.message);
  }
};

/* ---------- CSV Worker Pool ---------- */
Structra._csvWorkerPool = Structra.createWorkerPool({
  name: 'CSV',
  workerUrl: 'src/workers/csv-parse-worker.js',
  workerCode: null,
  maxWorkers: 4,
  poolThreshold: 4,
  taskTimeout: 60000,
  transferThreshold: 0
});

Structra.parseCsvAsync = function(text, options) {
  Structra.log.info('WorkerPool', 'parseCsvAsync (' + (text.length / 1024).toFixed(1) + ' KB)');
  var t0 = performance.now();
  return Structra._csvWorkerPool.enqueue(text, options).then(function(msg) {
    Structra.log.perf('WorkerPool', 'CSV parse (' + (msg.data ? msg.data.length : 0) + ' rows)', performance.now() - t0);
    return { data: msg.data, meta: msg.meta, errors: msg.errors || [] };
  }).catch(function(err) {
    if (typeof Papa !== 'undefined' && err.message && err.message.indexOf('Worker failed') !== -1) {
      Structra.log.info('WorkerPool', 'CSV sync fallback');
      var config = Object.assign({ header: true, skipEmptyLines: true, dynamicTyping: false }, options || {});
      var result = Papa.parse(text, config);
      var typed = csvRetype(result.data, result.meta.fields);
      result.meta.decimals = typed.decimals; result.meta.mixed = typed.mixed;
      Structra.log.perf('WorkerPool', 'CSV parse sync (' + result.data.length + ' rows)', performance.now() - t0);
      return { data: result.data, meta: result.meta, errors: result.errors || [] };
    }
    throw err;
  });
};

/* ---------- XML Worker Pool ---------- */
Structra._xmlWorkerPool = Structra.createWorkerPool({
  name: 'XML',
  workerUrl: 'src/workers/xml-parse-worker.js',
  workerCode: Structra._xmlWorkerSource,
  maxWorkers: 2,
  poolThreshold: 2,
  taskTimeout: 60000,
  transferThreshold: 0
});

/**
 * XML is read on the page itself: DOMParser does not exist inside a Web Worker, so the worker above can
 * never read XML. The tree walk below is the same one the worker file contains.
 */
Structra.parseXmlAsync = function(text) {
  Structra.log.info('WorkerPool', 'parseXmlAsync (' + (text.length / 1024).toFixed(1) + ' KB)');
  var t0 = performance.now();
  return new Promise(function(resolve, reject) {
    if (!text || typeof text !== 'string') { reject(new Error('No XML input')); return; }
    var doc = new DOMParser().parseFromString(text, 'application/xml');
    var bad = doc.querySelector('parsererror');
    if (bad) { reject(new Error('XML parse error: ' + bad.textContent.replace(/\s+/g, ' ').trim().substring(0, 200))); return; }
    var domToObj = function(node) {
      if (node.nodeType === 3) return node.textContent.trim() || null;
      if (node.nodeType !== 1) return null;
      var obj = {};
      if (node.attributes && node.attributes.length > 0) {
        obj['@attributes'] = {};
        for (var i = 0; i < node.attributes.length; i++) obj['@attributes'][node.attributes[i].name] = node.attributes[i].value;
      }
      var hasElements = false;
      for (var c = 0; c < node.childNodes.length; c++) {
        var child = node.childNodes[c];
        if (child.nodeType !== 1) continue;
        hasElements = true;
        var tag = child.nodeName;
        var val = domToObj(child);
        if (Object.prototype.hasOwnProperty.call(obj, tag)) {
          if (!Array.isArray(obj[tag])) obj[tag] = [obj[tag]];
          obj[tag].push(val);
        } else {
          obj[tag] = val;
        }
      }
      if (!hasElements) {
        var text2 = node.textContent.trim();
        if (obj['@attributes']) { if (text2) obj['#text'] = text2; } else { return text2 || null; }
      }
      return obj;
    };
    var result = {};
    result[doc.documentElement.nodeName] = domToObj(doc.documentElement);
    Structra.log.perf('WorkerPool', 'XML parse', performance.now() - t0);
    resolve(result);
  });
};

/* ---------- YAML Worker Pool ---------- */
Structra._yamlWorkerPool = Structra.createWorkerPool({
  name: 'YAML',
  workerUrl: 'src/workers/yaml-parse-worker.js',
  workerCode: null,  // needs js-yaml lib — sync fallback on file://
  maxWorkers: 2,
  poolThreshold: 2,
  taskTimeout: 60000,
  transferThreshold: 0
});

Structra.parseYamlAsync = function(text) {
  Structra.log.info('WorkerPool', 'parseYamlAsync (' + (text.length / 1024).toFixed(1) + ' KB)');
  var t0 = performance.now();
  return Structra._yamlWorkerPool.enqueue(text).then(function(msg) {
    Structra.log.perf('WorkerPool', 'YAML parse', performance.now() - t0);
    return msg.data;
  }).catch(function(err) {
    if (typeof jsyaml !== 'undefined' && err.message && err.message.indexOf('Worker failed') !== -1) {
      Structra.log.info('WorkerPool', 'YAML sync fallback');
      var data = jsyaml.load(text);
      Structra.log.perf('WorkerPool', 'YAML parse sync', performance.now() - t0);
      return data;
    }
    throw err;
  });
};

/* ---------- TOML Worker Pool ---------- */
Structra._tomlWorkerPool = Structra.createWorkerPool({
  name: 'TOML',
  workerUrl: 'src/workers/toml-parse-worker.js',
  workerCode: null,  // needs toml lib — sync fallback on file://
  maxWorkers: 2,
  poolThreshold: 2,
  taskTimeout: 60000,
  transferThreshold: 0
});

Structra.parseTomlAsync = function(text) {
  Structra.log.info('WorkerPool', 'parseTomlAsync (' + (text.length / 1024).toFixed(1) + ' KB)');
  var t0 = performance.now();
  return Structra._tomlWorkerPool.enqueue(text).then(function(msg) {
    Structra.log.perf('WorkerPool', 'TOML parse', performance.now() - t0);
    return msg.data;
  }).catch(function(err) {
    if (typeof TOML !== 'undefined' && err.message && err.message.indexOf('Worker failed') !== -1) {
      Structra.log.info('WorkerPool', 'TOML sync fallback');
      var data = TOML.parse(text);
      Structra.log.perf('WorkerPool', 'TOML parse sync', performance.now() - t0);
      return data;
    }
    throw err;
  });
};
