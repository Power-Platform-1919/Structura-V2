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
      const { val: value, path, depth } = stack.pop();
      if (depth > maxDepth) continue;

      const type = value === null ? 'null'
        : Array.isArray(value) ? 'array'
        : typeof value;

      index.set(path, {
        type,
        depth,
        childCount: (type === 'object') ? Object.keys(value).length
          : (type === 'array') ? value.length : 0,
      });

      if (value && typeof value === 'object') {
        const entries = Array.isArray(value)
          ? value.map((item, i) => [i, item])
          : Object.entries(value);
        for (let i = entries.length - 1; i >= 0; i--) {
          const [key, v] = entries[i];
          const childPath = Array.isArray(value) ? `${path}[${key}]` : `${path}.${key}`;
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
      const { val: value, path, depth } = stack.pop();
      if (depth > maxDepth) continue;

      if (value && typeof value === 'object') {
        const entries = Array.isArray(value)
          ? value.map((item, i) => [i, item])
          : Object.entries(value);
        for (const [key, item] of entries) {
          const childPath = Array.isArray(value) ? `${path}[${key}]` : `${path}.${key}`;
          if (mode === 'keys' && regex.test(String(key))) {
            matched.push(childPath);
          } else if (mode === 'values' && item !== null && typeof item !== 'object' && regex.test(String(item))) {
            matched.push(childPath);
          } else if (mode === 'paths' && regex.test(childPath)) {
            matched.push(childPath);
          }
          if (item && typeof item === 'object') {
            stack.push({ val: item, path: childPath, depth: depth + 1 });
          }
        }
      }
    }

    return { matchedPaths: matched, total: matched.length };
  }

  /* --- Sort --- */
  function sortArray(data, key, direction) {
    return [...data].sort((first, second) => {
      const firstValue = first && first[key];
      const secondValue = second && second[key];
      if (firstValue == null && secondValue == null) return 0;
      if (firstValue == null) return 1;
      if (secondValue == null) return -1;
      if (firstValue < secondValue) return direction === 'asc' ? -1 : 1;
      if (firstValue > secondValue) return direction === 'asc' ? 1 : -1;
      return 0;
    });
  }

  /* --- Filter --- */
  function filterArray(data, predicateSource) {
    // predicateSource is a string like "row => row.age > 30"
    // Safe in worker context - isolated from main thread DOM
    const callback = new Function('row', 'return ' + predicateSource);
    return data.filter(row => {
      try { return callback(row); }
      catch { return false; }
    });
  }

  /* --- Aggregate --- */
  function aggregate(data, key, callback) {
    const values = data
      .map(row => row && row[key])
      .filter(item => item !== null && item !== undefined);

    switch (callback) {
      case 'count': return values.length;
      case 'sum': return values.reduce((total, value) => total + (Number(value) || 0), 0);
      case 'avg': {
        const numbers = values.filter(item => typeof item === 'number');
        return numbers.length ? numbers.reduce((total, number) => total + number, 0) / numbers.length : null;
      }
      case 'min': return values.length ? Math.min(...values.filter(item => typeof item === 'number')) : null;
      case 'max': return values.length ? Math.max(...values.filter(item => typeof item === 'number')) : null;
      case 'distinct': return [...new Set(values)];
      case 'countDistinct': return new Set(values).size;
      default: return null;
    }
  }

  /* --- Message Handler --- */
  self.onmessage = function (event) {
    const { op: operation, data, params, id } = event.data;
    const startTime = performance.now();
    let result;

    try {
      switch (operation) {
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
          result = { error: 'Unknown op: ' + operation };
      }
    } catch (error) {
      result = { error: error.message };
    }

    const duration = performance.now() - startTime;
    self.postMessage({ op: operation, result, id, duration });
  };
})();
