/* ============================================================
   STRUCTRA V2 - Engine Worker
   Web Worker for heavy data operations (>10K items).

   Offloaded ops: buildPathIndex, search, filter, sort, aggregate
   Self-registering IIFE pattern (compatible with Blob URL worker pool).

   Messages IN:  {op, data, params, id}
   Messages OUT: {op, result, id, duration}
   ============================================================ */

(function () {
  'use strict';

  /* --- Path Index Builder --- */
  function buildPathIndex(data, maxDepth) {
    const index = new Map();
    const stack = [{ val: data, path: '$', depth: 0 }];

    while (stack.length > 0) {
      const { val, path, depth } = stack.pop();
      if (depth > maxDepth) continue;

      const type = val === null ? 'null'
        : Array.isArray(val) ? 'array'
        : typeof val;

      index.set(path, {
        type,
        depth,
        childCount: (type === 'object') ? Object.keys(val).length
          : (type === 'array') ? val.length : 0,
      });

      if (val && typeof val === 'object') {
        const entries = Array.isArray(val)
          ? val.map((v, i) => [i, v])
          : Object.entries(val);
        for (let i = entries.length - 1; i >= 0; i--) {
          const [k, v] = entries[i];
          const childPath = Array.isArray(val) ? `${path}[${k}]` : `${path}.${k}`;
          stack.push({ val: v, path: childPath, depth: depth + 1 });
        }
      }
    }

    // Convert Map to serializable array
    return Array.from(index.entries()).map(([path, info]) => ({ path, ...info }));
  }

  /* --- Search --- */
  function search(data, pattern, mode, maxDepth) {
    const regex = new RegExp(pattern, 'i');
    const matched = [];
    const stack = [{ val: data, path: '$', depth: 0 }];

    while (stack.length > 0) {
      const { val, path, depth } = stack.pop();
      if (depth > maxDepth) continue;

      if (val && typeof val === 'object') {
        const entries = Array.isArray(val)
          ? val.map((v, i) => [i, v])
          : Object.entries(val);
        for (const [k, v] of entries) {
          const childPath = Array.isArray(val) ? `${path}[${k}]` : `${path}.${k}`;
          if (mode === 'keys' && regex.test(String(k))) {
            matched.push(childPath);
          } else if (mode === 'values' && v !== null && typeof v !== 'object' && regex.test(String(v))) {
            matched.push(childPath);
          } else if (mode === 'paths' && regex.test(childPath)) {
            matched.push(childPath);
          }
          if (v && typeof v === 'object') {
            stack.push({ val: v, path: childPath, depth: depth + 1 });
          }
        }
      }
    }

    return { matchedPaths: matched, total: matched.length };
  }

  /* --- Sort --- */
  function sortArray(data, key, dir) {
    return [...data].sort((a, b) => {
      const av = a && a[key];
      const bv = b && b[key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av < bv) return dir === 'asc' ? -1 : 1;
      if (av > bv) return dir === 'asc' ? 1 : -1;
      return 0;
    });
  }

  /* --- Filter --- */
  function filterArray(data, predicateSource) {
    // predicateSource is a string like "row => row.age > 30"
    // Safe in worker context - isolated from main thread DOM
    const fn = new Function('row', 'return ' + predicateSource);
    return data.filter(row => {
      try { return fn(row); }
      catch { return false; }
    });
  }

  /* --- Aggregate --- */
  function aggregate(data, key, fn) {
    const values = data
      .map(row => row && row[key])
      .filter(v => v !== null && v !== undefined);

    switch (fn) {
      case 'count': return values.length;
      case 'sum': return values.reduce((a, b) => a + (Number(b) || 0), 0);
      case 'avg': {
        const nums = values.filter(v => typeof v === 'number');
        return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
      }
      case 'min': return values.length ? Math.min(...values.filter(v => typeof v === 'number')) : null;
      case 'max': return values.length ? Math.max(...values.filter(v => typeof v === 'number')) : null;
      case 'distinct': return [...new Set(values)];
      case 'countDistinct': return new Set(values).size;
      default: return null;
    }
  }

  /* --- Message Handler --- */
  self.onmessage = function (e) {
    const { op, data, params, id } = e.data;
    const t0 = performance.now();
    let result;

    try {
      switch (op) {
        case 'buildPathIndex':
          result = buildPathIndex(data, params.maxDepth || 20);
          break;
        case 'search':
          result = search(data, params.pattern, params.mode || 'values', params.maxDepth || 20);
          break;
        case 'sort':
          result = sortArray(data, params.key, params.dir || 'asc');
          break;
        case 'filter':
          result = filterArray(data, params.predicate);
          break;
        case 'aggregate':
          result = aggregate(data, params.key, params.fn);
          break;
        default:
          result = { error: 'Unknown op: ' + op };
      }
    } catch (err) {
      result = { error: err.message };
    }

    const duration = performance.now() - t0;
    self.postMessage({ op, result, id, duration });
  };
})();
