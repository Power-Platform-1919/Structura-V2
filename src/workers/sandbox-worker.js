/* ============================================================
   STRUCTRA V2 - Sandbox Worker
   Runs the person's own code and patterns away from the page, so that
     - a loop that never ends, or a pattern that takes hours, can be stopped (the page ends this worker),
     - the code cannot touch the page, its storage or the network (see LOCK DOWN below).

   One protocol for every kind of job (written once, used through Structra.sandbox in src/core/sandbox.js):
     in:   { id, op, params }
     out:  { id, ok: true, result }  or  { id, ok: false, error }
   Operations:
     load      { data }                        keep the document here; later jobs use it
     evaluate  { code, locate }                run `return <code>` with `data`; locate adds the place of each object in the document
     filter    { expression, rowsKeys }        keep the rows (the list at rowsKeys) for which `return (<expression>)` with `row` is true
     regex     { pattern, flags, primitives }  every value of the document that matches; primitives also tests numbers and true/false
     transform { input }                       the Transform steps ( .value | filter(x => x.a > 1) | sortBy(-a) ) run on the document
     probe     { pattern, flags, samples }     try a pattern on sample texts (no document needed); the page ends the worker if it takes too long
   A place in the document is a list of keys, ['value', 0, 'Title'], never a text: the page turns it into a path with
   Structra.dataPaths.child, so there is still only one path writer.

   The one file it loads is src/core/transform-step-operations.js, the step language, which the unit tests also load: it is
   written once and used here. Because of that this worker needs a web address (a file on disk cannot load it).
   ============================================================ */
'use strict';

(function () {
  const reply = self.postMessage.bind(self);

  // The step language, loaded before the lock down (importScripts is removed afterwards) from the file the unit tests use too.
  // It expects a global Structra to hang itself on; that stand-in is taken away again so the person's code cannot see it.
  let transformSteps = null;
  try {
    self.Structra = {};
    importScripts('../core/transform-step-operations.js');
    transformSteps = self.Structra.transformStepOperations;
  } catch (_) { /* a file on disk cannot load it: transform jobs then say so */ }
  delete self.Structra;
  let storedData;
  let hasData = false;

  /* ---- LOCK DOWN: before any of the person's code runs, remove what could reach outside ---- */
  const FORBIDDEN = [
    'fetch', 'XMLHttpRequest', 'WebSocket', 'WebTransport', 'EventSource', 'importScripts',
    'indexedDB', 'IDBFactory', 'caches', 'CacheStorage', 'BroadcastChannel', 'MessageChannel', 'SharedWorker', 'Worker',
    'navigator', 'location', 'close', 'postMessage', 'onmessage', 'RTCPeerConnection', 'WebAssembly', 'Cache',
  ];
  function lockDown() {
    for (const name of FORBIDDEN) {
      // The name may live on the global object or further up its chain of prototypes (WorkerGlobalScope)
      for (let holder = self; holder; holder = Object.getPrototypeOf(holder)) {
        try { if (Object.prototype.hasOwnProperty.call(holder, name)) delete holder[name]; } catch (_) { /* not removable here */ }
      }
      try { Object.defineProperty(self, name, { value: undefined, writable: false, configurable: false }); } catch (_) { /* already fixed */ }
    }
  }

  /* ---- helpers ---- */
  function entriesOf(value) {
    return Array.isArray(value) ? value.map((item, index) => [index, item]) : Object.entries(value);
  }

  function walkKeys(root, keys) {
    let node = root;
    for (const key of keys) {
      if (node === null || typeof node !== 'object' || !Object.prototype.hasOwnProperty.call(node, key)) return undefined;
      node = node[key];
    }
    return node;
  }

  /** Where each object of the document lives, found by identity. Looks at no more than `budget` values. */
  function makeLocator(root, budget) {
    let where = null;
    return (object) => {
      if (!where) {
        where = new Map();
        const stack = [[root, []]];
        let left = budget;
        while (stack.length && left-- > 0) {
          const [value, keys] = stack.pop();
          if (!value || typeof value !== 'object') continue;
          if (!where.has(value)) where.set(value, keys);
          for (const [key, child] of entriesOf(value)) stack.push([child, keys.concat([key])]);
        }
      }
      return where.get(object) || null;
    };
  }

  /* ---- operations ---- */
  const operations = {
    load({ data }) {
      storedData = data;
      hasData = true;
      return true;
    },

    evaluate({ code, locate }) {
      if (!hasData) throw new Error('No document is loaded');
      const run = new Function('data', 'return ' + code);
      const value = run(storedData);
      if (!locate) return { value };
      const find = makeLocator(storedData, 200000);
      const place = (item) => (item && typeof item === 'object' ? find(item) : null);
      const items = Array.isArray(value) ? value.map((item, index) => ({ keys: place(item), index, value: item })) : [{ keys: place(value), index: null, value }];
      return { items };
    },

    filter({ expression, rowsKeys }) {
      if (!hasData) throw new Error('No document is loaded');
      const rows = walkKeys(storedData, rowsKeys);
      if (!Array.isArray(rows)) throw new Error('There is no list of records to filter');
      const test = new Function('row', 'return (' + expression + ');');
      const indexes = [];
      for (let i = 0; i < rows.length; i++) {
        try { if (test(rows[i])) indexes.push(i); } catch (_) { /* a row the test cannot read does not match */ }
      }
      return { indexes };
    },

    transform({ input }) {
      if (!hasData) throw new Error('No document is loaded');
      if (!transformSteps) throw new Error('The steps could not be loaded. Open the app from a web address, not from a file on disk.');
      return { value: transformSteps.evaluate(input, storedData) };
    },

    probe({ pattern, flags, samples }) {
      const expression = new RegExp(pattern, flags || 'i');
      let matched = 0;
      for (const sample of samples) { expression.lastIndex = 0; if (expression.test(String(sample))) matched++; }
      return { tried: samples.length, matched };
    },

    regex({ pattern, flags, primitives, limit }) {
      if (!hasData) throw new Error('No document is loaded');
      const expression = new RegExp(pattern, flags || 'i');
      const matches = [];
      const max = limit || 100000;
      let truncated = false;
      // Depth first, in the order the document is written, without recursion (a deep document must not overflow the stack)
      const stack = [[storedData, []]];
      while (stack.length) {
        const [value, keys] = stack.pop();
        if (value && typeof value === 'object') {
          const entries = entriesOf(value);
          for (let i = entries.length - 1; i >= 0; i--) stack.push([entries[i][1], keys.concat([entries[i][0]])]);
        } else if (value !== null && value !== undefined && (typeof value === 'string' || primitives)) {
          expression.lastIndex = 0;
          if (expression.test(String(value))) {
            if (matches.length >= max) { truncated = true; break; }
            matches.push({ keys, value });
          }
        }
      }
      return { matches, truncated };
    },
  };

  lockDown();
  self.addEventListener('message', (event) => {
    const { id, op, params } = event.data || {};
    try {
      if (!operations[op]) throw new Error('Unknown job: ' + op);
      reply({ id, ok: true, result: operations[op](params || {}) });
    } catch (error) {
      // A result that cannot be copied back (it holds a function) is reported in words
      const message = error && error.name === 'DataCloneError' ? 'The result cannot be shown because it holds a function or another value that cannot be copied.' : String((error && error.message) || error);
      try { reply({ id, ok: false, error: message }); } catch (_) { /* nothing more can be done */ }
    }
  });
})();
