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

/* ---------- JSON Worker Pool ---------- */
Structra._workerPool = Structra.createWorkerPool({
  name: 'JSON',
  workerUrl: 'src/workers/json-parse-worker.js',
  workerCode: Structra._jsonWorkerSource,
  maxWorkers: 4,
  poolThreshold: 4,
  taskTimeout: 60000,
  transferThreshold: 10485760
});

Structra.parseJsonAsync = function(text) {
  Structra.log.info('WorkerPool', 'parseJsonAsync (' + (text.length / 1024).toFixed(1) + ' KB)');
  var t0 = performance.now();
  return Structra._workerPool.enqueue(text).then(function(msg) {
    Structra.log.perf('WorkerPool', 'JSON parse', performance.now() - t0);
    return msg.data;
  });
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
      var config = Object.assign({ header: true, skipEmptyLines: true, dynamicTyping: true }, options || {});
      var result = Papa.parse(text, config);
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

Structra.parseXmlAsync = function(text) {
  Structra.log.info('WorkerPool', 'parseXmlAsync (' + (text.length / 1024).toFixed(1) + ' KB)');
  var t0 = performance.now();
  return Structra._xmlWorkerPool.enqueue(text).then(function(msg) {
    Structra.log.perf('WorkerPool', 'XML parse', performance.now() - t0);
    return msg.data;
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
