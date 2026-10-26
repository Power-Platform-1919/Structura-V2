/* ============================================================
   STRUCTRA V2 - Generic Worker Pool
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
      var worker;
      try {
        worker = new Worker(this.workerUrl);
        Structra.log.info('WorkerPool', this.name + ' worker #' + (this.workers.length + 1) + ' created (URL)');
      } catch (urlError) {
        // file:// origin blocks new Worker(url) - fall back to Blob URL
        if (!this.workerCode) {
          Structra.log.error('WorkerPool', this.name + ' - Worker URL blocked and no inline code: ' + urlError.message);
          return null;
        }
        try {
          if (!this._blobUrl) {
            var blob = new Blob([this.workerCode], { type: 'text/javascript' });
            this._blobUrl = URL.createObjectURL(blob);
            Structra.log.info('WorkerPool', this.name + ' Blob URL created for file:// fallback');
          }
          worker = new Worker(this._blobUrl);
          Structra.log.info('WorkerPool', this.name + ' worker #' + (this.workers.length + 1) + ' created (Blob URL)');
        } catch (blobError) {
          Structra.log.error('WorkerPool', this.name + ' - Blob URL worker also failed: ' + blobError.message);
          return null;
        }
      }
      try {
        const entry = { worker: worker, busy: false, _cb: null, taskCount: 0, _idleTimer: null };
        worker.addEventListener('message', (event) => {
          const message = event.data;
          if (entry._cb && entry._cb.id === message.id) {
            const callback = entry._cb;
            entry._cb = null;
            entry.busy = false;
            entry.taskCount++;
            if (callback._timer) { clearTimeout(callback._timer); callback._timer = null; }
            if (message.success) {
              Structra.log.debug('WorkerPool', 'Task #' + message.id + ' completed (worker tasks: ' + entry.taskCount + ')');
              callback.resolve(message);
            } else {
              Structra.log.error('WorkerPool', 'Task #' + message.id + ' failed: ' + message.error);
              callback.reject(new Error(message.error));
            }
            this._recycleIfNeeded(entry);
            this._startIdleTimer(entry);
            this._drain();
          }
        });
        worker.addEventListener('error', (event) => {
          event.preventDefault();
          const message = event.message || 'Worker crashed';
          Structra.log.error('WorkerPool', 'Worker error: ' + message);
          if (entry._cb) {
            const callback = entry._cb;
            entry._cb = null;
            entry.busy = false;
            if (callback._timer) { clearTimeout(callback._timer); callback._timer = null; }
            callback.reject(new Error(message));
          }
          const index = this.workers.indexOf(entry);
          if (index !== -1) this.workers.splice(index, 1);
          try { worker.terminate(); } catch (_) {}
          this._drain();
        });
        this.workers.push(entry);
        return entry;
      } catch (error) {
        Structra.log.error('WorkerPool', 'Failed to create worker: ' + error.message, error);
        return null;
      }
    },

    _drain() {
      if (this.queue.length === 0) return;
      const idle = this.workers.find(entry => !entry.busy);
      if (!idle) return;
      const request = this.queue.shift();
      this._dispatch(idle, request);
    },

    _dispatch(entry, request) {
      if (entry._idleTimer) { clearTimeout(entry._idleTimer); entry._idleTimer = null; }
      entry.busy = true;
      entry._cb = request;
      const payload = { id: request.id, text: request.text };
      if (request.options) payload.options = request.options;

      // Use Transferable ArrayBuffer for large strings if configured
      if (this.transferThreshold > 0 && request.text.length > this.transferThreshold) {
        Structra.log.debug('WorkerPool', 'Task #' + request.id + ' → Transferable (' + (request.text.length / 1048576).toFixed(1) + ' MB)');
        const buffer = new TextEncoder().encode(request.text).buffer;
        entry.worker.postMessage({ id: request.id, buffer, options: request.options }, [buffer]);
      } else {
        Structra.log.debug('WorkerPool', 'Task #' + request.id + ' → postMessage (' + (request.text.length / 1024).toFixed(1) + ' KB)');
        entry.worker.postMessage(payload);
      }
    },

    _scaleUp() {
      while (this.workers.length < this.maxWorkers && this.queue.length > 0) {
        const fresh = this._createWorker();
        if (!fresh) break;
        const request = this.queue.shift();
        this._dispatch(fresh, request);
      }
    },

    _startIdleTimer(entry) {
      if (this.idleTimeout <= 0 || entry.busy) return;
      entry._idleTimer = setTimeout(() => {
        // Don't scale below minWorkers
        if (this.workers.length <= this.minWorkers) return;
        // Don't kill if it picked up work in the meantime
        if (entry.busy) return;
        var index = this.workers.indexOf(entry);
        if (index !== -1) {
          this.workers.splice(index, 1);
          try { entry.worker.terminate(); } catch (_) {}
          Structra.log.debug('WorkerPool', 'Idle worker terminated (pool: ' + this.workers.length + ')');
        }
      }, this.idleTimeout);
    },

    _recycleIfNeeded(entry) {
      if (this.maxTasksPerWorker > 0 && entry.taskCount >= this.maxTasksPerWorker) {
        const index = this.workers.indexOf(entry);
        if (index !== -1) this.workers.splice(index, 1);
        try { entry.worker.terminate(); } catch (_) {}
        // If queued tasks exist but no workers remain, spawn a fresh one
        if (this.queue.length > 0 && this.workers.length === 0) {
          const fresh = this._createWorker();
          if (fresh) {
            const request = this.queue.shift();
            this._dispatch(fresh, request);
          }
        }
      }
    },

    terminate() {
      this.workers.forEach(entry => {
        if (entry._idleTimer) clearTimeout(entry._idleTimer);
        try { entry.worker.terminate(); } catch (_) {}
      });
      this.workers = [];
      this.queue.forEach(request => request.reject(new Error('Pool terminated')));
      this.queue = [];
    },

    stats() {
      return {
        totalWorkers: this.workers.length,
        busyWorkers: this.workers.filter(entry => entry.busy).length,
        idleWorkers: this.workers.filter(entry => !entry.busy).length,
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

        const request = { id: ++pool.reqId, text, options, resolve, reject, _timer: null };

        // Task timeout: reject and terminate worker if it takes too long
        if (taskTimeout > 0) {
          request._timer = setTimeout(() => {
            const victim = pool.workers.find(entry => entry._cb === request);
            if (victim) {
              victim._cb = null;
              victim.busy = false;
              const index = pool.workers.indexOf(victim);
              if (index !== -1) pool.workers.splice(index, 1);
              try { victim.worker.terminate(); } catch (_) {}
            }
            // Also remove from queue if still queued
            const queueIndex = pool.queue.indexOf(request);
            if (queueIndex !== -1) pool.queue.splice(queueIndex, 1);
            reject(new Error('Worker task timed out (' + taskTimeout + 'ms)'));
            pool._drain();
          }, taskTimeout);
        }

        const idle = pool.workers.find(entry => !entry.busy);
        if (idle) {
          pool._dispatch(idle, request);
          return;
        }

        pool.queue.push(request);
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
Structra.protectBigNumbers = function (source) {
  if (!/\d{16}|\d[eE][+-]?\d{3}/.test(source)) return { text: source, count: 0 };
  var out = [], last = 0, count = 0, i = 0, length = source.length;
  while (i < length) {
    var code = source.charCodeAt(i);
    if (code === 34) {                                   // a string: skip it, numbers inside are text already
      i++;
      while (i < length) { var nextCode = source.charCodeAt(i); if (nextCode === 92) i += 2; else if (nextCode === 34) { i++; break; } else i++; }
      continue;
    }
    if (code === 45 || (code >= 48 && code <= 57)) {
      var j = i + 1;
      while (j < length) { var digitCode = source.charCodeAt(j); if ((digitCode >= 48 && digitCode <= 57) || digitCode === 46 || digitCode === 101 || digitCode === 69 || digitCode === 43 || digitCode === 45) j++; else break; }
      var token = source.slice(i, j);
      if (token.length >= 16 || /[eE]/.test(token)) {
        var number = Number(token), lossy = false;
        if (!isFinite(number)) lossy = true;
        else if (/^-?\d+$/.test(token)) { try { lossy = BigInt(token).toString() !== BigInt(number).toString(); } catch (error) { lossy = false; } }
        else lossy = token.replace(/^-/, '').replace(/[eE].*$/, '').replace(/\./, '').replace(/^0+/, '').length > 17;
        if (lossy) { out.push(source.slice(last, i), '"' + token + '"'); last = j; count++; }
      }
      i = j;
      continue;
    }
    i++;
  }
  if (!count) return { text: source, count: 0 };
  out.push(source.slice(last));
  return { text: out.join(''), count: count };
};

Structra.parseJsonAsync = async function (text) {
  var startTime = performance.now();
  await Structra.sharedHelpers.waitForNextTick();   // let the loading message paint first
  var source = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
  var protectedText = Structra.protectBigNumbers(source);
  Structra.parseNotes = { bigNumbers: protectedText.count };
  source = protectedText.text;
  try {
    var data = JSON.parse(source);
    Structra.log.perf('Parse', 'JSON.parse (' + (text.length / 1024).toFixed(0) + ' KB)', performance.now() - startTime);
    return data;
  } catch (error) {
    var size = text.length > 1024 ? Math.round(text.length / 1024) + 'KB' : text.length + 'B';
    throw new Error(error instanceof SyntaxError ? 'JSON parse error (' + size + '): ' + error.message : error.message);
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
  var startTime = performance.now();
  return Structra._csvWorkerPool.enqueue(text, options).then(function(result) {
    Structra.log.perf('WorkerPool', 'CSV parse (' + (result.data ? result.data.length : 0) + ' rows)', performance.now() - startTime);
    return { data: result.data, meta: result.meta, errors: result.errors || [] };
  }).catch(function(error) {
    if (typeof Papa !== 'undefined' && error.message && error.message.indexOf('Worker failed') !== -1) {
      Structra.log.info('WorkerPool', 'CSV sync fallback');
      var config = Object.assign({ header: true, skipEmptyLines: true, dynamicTyping: false }, options || {});
      var result = Papa.parse(text, config);
      var typed = csvRetype(result.data, result.meta.fields);
      result.meta.decimals = typed.decimals; result.meta.mixed = typed.mixed;
      Structra.log.perf('WorkerPool', 'CSV parse sync (' + result.data.length + ' rows)', performance.now() - startTime);
      return { data: result.data, meta: result.meta, errors: result.errors || [] };
    }
    throw error;
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
  var startTime = performance.now();
  return new Promise(function(resolve, reject) {
    if (!text || typeof text !== 'string') { reject(new Error('No XML input')); return; }
    var xmlDocument = new DOMParser().parseFromString(text, 'application/xml');
    var parserError = xmlDocument.querySelector('parsererror');
    if (parserError) { reject(new Error('XML parse error: ' + parserError.textContent.replace(/\s+/g, ' ').trim().substring(0, 200))); return; }
    var domToObject = function(node) {
      if (node.nodeType === 3) return node.textContent.trim() || null;
      if (node.nodeType !== 1) return null;
      var object = {};
      if (node.attributes && node.attributes.length > 0) {
        object['@attributes'] = {};
        for (var i = 0; i < node.attributes.length; i++) object['@attributes'][node.attributes[i].name] = node.attributes[i].value;
      }
      var hasElements = false;
      for (var index = 0; index < node.childNodes.length; index++) {
        var child = node.childNodes[index];
        if (child.nodeType !== 1) continue;
        hasElements = true;
        var tag = child.nodeName;
        var value = domToObject(child);
        if (Object.prototype.hasOwnProperty.call(object, tag)) {
          if (!Array.isArray(object[tag])) object[tag] = [object[tag]];
          object[tag].push(value);
        } else {
          object[tag] = value;
        }
      }
      if (!hasElements) {
        var text2 = node.textContent.trim();
        if (object['@attributes']) { if (text2) object['#text'] = text2; } else { return text2 || null; }
      }
      return object;
    };
    var result = {};
    result[xmlDocument.documentElement.nodeName] = domToObject(xmlDocument.documentElement);
    Structra.log.perf('WorkerPool', 'XML parse', performance.now() - startTime);
    resolve(result);
  });
};

/* ---------- YAML Worker Pool ---------- */
Structra._yamlWorkerPool = Structra.createWorkerPool({
  name: 'YAML',
  workerUrl: 'src/workers/yaml-parse-worker.js',
  workerCode: null,  // needs js-yaml lib - sync fallback on file://
  maxWorkers: 2,
  poolThreshold: 2,
  taskTimeout: 60000,
  transferThreshold: 0
});

Structra.parseYamlAsync = function(text) {
  Structra.log.info('WorkerPool', 'parseYamlAsync (' + (text.length / 1024).toFixed(1) + ' KB)');
  var startTime = performance.now();
  return Structra._yamlWorkerPool.enqueue(text).then(function(result) {
    Structra.log.perf('WorkerPool', 'YAML parse', performance.now() - startTime);
    return result.data;
  }).catch(function(error) {
    if (typeof jsyaml !== 'undefined' && error.message && error.message.indexOf('Worker failed') !== -1) {
      Structra.log.info('WorkerPool', 'YAML sync fallback');
      var data = jsyaml.load(text);
      Structra.log.perf('WorkerPool', 'YAML parse sync', performance.now() - startTime);
      return data;
    }
    throw error;
  });
};

/* ---------- TOML Worker Pool ---------- */
Structra._tomlWorkerPool = Structra.createWorkerPool({
  name: 'TOML',
  workerUrl: 'src/workers/toml-parse-worker.js',
  workerCode: null,  // needs toml lib - sync fallback on file://
  maxWorkers: 2,
  poolThreshold: 2,
  taskTimeout: 60000,
  transferThreshold: 0
});

Structra.parseTomlAsync = function(text) {
  Structra.log.info('WorkerPool', 'parseTomlAsync (' + (text.length / 1024).toFixed(1) + ' KB)');
  var startTime = performance.now();
  return Structra._tomlWorkerPool.enqueue(text).then(function(result) {
    Structra.log.perf('WorkerPool', 'TOML parse', performance.now() - startTime);
    return result.data;
  }).catch(function(error) {
    if (typeof TOML !== 'undefined' && error.message && error.message.indexOf('Worker failed') !== -1) {
      Structra.log.info('WorkerPool', 'TOML sync fallback');
      var data = TOML.parse(text);
      Structra.log.perf('WorkerPool', 'TOML parse sync', performance.now() - startTime);
      return data;
    }
    throw error;
  });
};
