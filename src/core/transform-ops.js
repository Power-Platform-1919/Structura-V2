/**
 * Transform Operations — operation registry for safe jq-style expression evaluation.
 * Each operation has a pattern (regex) and an exec function.
 */
Structra.transformOps = (() => {

  // Safety: block dangerous patterns in callback expressions
  function validateExpression(body, allowedParams) {
    const blocked = /\b(eval|Function|import|require|fetch|XMLHttpRequest|document|window|globalThis|process|__proto__|constructor|prototype)\b/;
    if (blocked.test(body)) throw new Error('Expression contains blocked keyword');
    if (/(?<![=!<>])=(?![=>])/.test(body)) throw new Error('Assignment not allowed in expressions');
  }

  function buildFn1(param, body) {
    validateExpression(body, [param]);
    return new Function(param, `return (${body});`);
  }

  function buildFn2(p1, p2, body) {
    validateExpression(body, [p1, p2]);
    return new Function(p1, p2, `return (${body});`);
  }

  // Operation registry — each entry: { pattern, exec(data, match) }
  const operations = [
    // The data as it is
    { pattern: /^\.$/, exec(data) { return data; } },
    // Navigate: .key or .key.subkey
    { pattern: /^\.[a-zA-Z_$][\w$.]*$/, exec(data, m) {
      const keys = m[0].slice(1).split('.');
      let result = data;
      for (const k of keys) { if (result == null) return undefined; result = result[k]; }
      return result;
    }},
    // Array index: [0] or [-1]
    { pattern: /^\[-?\d+\]$/, exec(data, m) {
      const idx = parseInt(m[0].slice(1, -1));
      if (!Array.isArray(data)) return undefined;
      return idx < 0 ? data[data.length + idx] : data[idx];
    }},
    // Simple keywords
    { pattern: /^length$/, exec(data) {
      if (Array.isArray(data)) return data.length;
      if (typeof data === 'string') return data.length;
      if (data && typeof data === 'object') return Object.keys(data).length;
      return undefined;
    }},
    { pattern: /^keys\(\)$/, exec(data) {
      return (data && typeof data === 'object' && !Array.isArray(data)) ? Object.keys(data) : undefined;
    }},
    { pattern: /^values\(\)$/, exec(data) {
      return (data && typeof data === 'object' && !Array.isArray(data)) ? Object.values(data) : undefined;
    }},
    { pattern: /^entries\(\)$/, exec(data) {
      return (data && typeof data === 'object' && !Array.isArray(data)) ? Object.entries(data) : undefined;
    }},
    { pattern: /^flat\(\)$/, exec(data) { return Array.isArray(data) ? data.flat() : data; }},
    { pattern: /^reverse\(\)$/, exec(data) { return Array.isArray(data) ? [...data].reverse() : data; }},
    // unique()
    { pattern: /^unique\(\)$/, exec(data) {
      if (!Array.isArray(data)) return data;
      const seen = new Set();
      return data.filter(item => { const key = JSON.stringify(item); if (seen.has(key)) return false; seen.add(key); return true; });
    }},
    // pick(a, b.c): keep only these fields of every item
    { pattern: /^pick\(([\w$.,\s]+)\)$/, exec(data, m) {
      const fields = m[1].split(',').map((f) => f.trim()).filter(Boolean);
      const read = (obj, field) => field.split('.').reduce((v, k) => (v == null ? undefined : v[k]), obj);
      const one = (item) => {
        const out = {};
        for (const f of fields) out[f] = read(item, f);
        return out;
      };
      return Array.isArray(data) ? data.map(one) : one(data);
    }},
    // sortBy(field) or sortBy(-field) for descending
    { pattern: /^sortBy\((-?)([\w$.]+)\)$/, exec(data, m) {
      if (!Array.isArray(data)) return data;
      const read = (obj) => m[2].split('.').reduce((v, k) => (v == null ? undefined : v[k]), obj);
      const dir = m[1] ? -1 : 1;
      return [...data].sort((a, b) => {
        const x = read(a), y = read(b);
        if (x === y) return 0;
        if (x == null) return 1;
        if (y == null) return -1;
        return (x < y ? -1 : 1) * dir;
      });
    }},
    // slice(start, end?)
    { pattern: /^slice\((-?\d+)(?:\s*,\s*(-?\d+))?\)$/, exec(data, m) {
      if (!Array.isArray(data)) return data;
      const start = parseInt(m[1]);
      const end = m[2] != null ? parseInt(m[2]) : undefined;
      return data.slice(start, end);
    }},
    // map(x => expr)
    { pattern: /^map\((\w+)\s*=>\s*(.+)\)$/, exec(data, m) {
      if (!Array.isArray(data)) return data;
      return data.map(buildFn1(m[1], m[2]));
    }},
    // filter(x => expr)
    { pattern: /^filter\((\w+)\s*=>\s*(.+)\)$/, exec(data, m) {
      if (!Array.isArray(data)) return data;
      return data.filter(buildFn1(m[1], m[2]));
    }},
    // sort((a,b) => expr)
    { pattern: /^sort\((\([\w,\s]+\))\s*=>\s*(.+)\)$/, exec(data, m) {
      if (!Array.isArray(data)) return data;
      const params = m[1].replace(/[()]/g, '').split(',').map(s => s.trim());
      return [...data].sort(buildFn2(params[0], params[1], m[2]));
    }},
    // reduce((acc, x) => expr, init)
    { pattern: /^reduce\((\([\w,\s]+\))\s*=>\s*(.+),\s*(.+)\)$/, exec(data, m) {
      if (!Array.isArray(data)) return data;
      const params = m[1].replace(/[()]/g, '').split(',').map(s => s.trim());
      const init = JSON.parse(m[3]);
      return data.reduce(buildFn2(params[0], params[1], m[2]), init);
    }},
    // groupBy(x => expr)
    { pattern: /^groupBy\((\w+)\s*=>\s*(.+)\)$/, exec(data, m) {
      if (!Array.isArray(data)) return data;
      const fn = buildFn1(m[1], m[2]);
      const groups = {};
      for (const item of data) { const key = String(fn(item)); if (!groups[key]) groups[key] = []; groups[key].push(item); }
      return groups;
    }},
    // find(x => expr)
    { pattern: /^find\((\w+)\s*=>\s*(.+)\)$/, exec(data, m) {
      if (!Array.isArray(data)) return data;
      return data.find(buildFn1(m[1], m[2]));
    }},
    // count(x => expr)
    { pattern: /^count\((\w+)\s*=>\s*(.+)\)$/, exec(data, m) {
      if (!Array.isArray(data)) return data;
      return data.filter(buildFn1(m[1], m[2])).length;
    }},
    // sum(x => expr)
    { pattern: /^sum\((\w+)\s*=>\s*(.+)\)$/, exec(data, m) {
      if (!Array.isArray(data)) return 0;
      const fn = buildFn1(m[1], m[2]);
      return data.reduce((acc, item) => acc + (Number(fn(item)) || 0), 0);
    }},
    // avg(x => expr)
    { pattern: /^avg\((\w+)\s*=>\s*(.+)\)$/, exec(data, m) {
      if (!Array.isArray(data) || data.length === 0) return 0;
      const fn = buildFn1(m[1], m[2]);
      return data.reduce((acc, item) => acc + (Number(fn(item)) || 0), 0) / data.length;
    }},
    // min(x => expr)
    { pattern: /^min\((\w+)\s*=>\s*(.+)\)$/, exec(data, m) {
      if (!Array.isArray(data) || data.length === 0) return undefined;
      return Math.min(...data.map(buildFn1(m[1], m[2])));
    }},
    // max(x => expr)
    { pattern: /^max\((\w+)\s*=>\s*(.+)\)$/, exec(data, m) {
      if (!Array.isArray(data) || data.length === 0) return undefined;
      return Math.max(...data.map(buildFn1(m[1], m[2])));
    }},
  ];

  function executeStep(data, step) {
    for (const op of operations) {
      const m = step.match(op.pattern);
      if (m) return op.exec(data, m);
    }
    throw new Error(`Unknown step: ${step}`);
  }

  /** Split on | that is not inside brackets, braces, parentheses or quotes ("||" stays in one piece) */
  function splitSteps(input) {
    const steps = [];
    let depth = 0, quote = null, cur = '';
    for (let i = 0; i < input.length; i++) {
      const c = input[i];
      if (quote) { cur += c; if (c === quote && input[i - 1] !== '\\') quote = null; continue; }
      if (c === '"' || c === "'" || c === '`') { quote = c; cur += c; continue; }
      if ('([{'.includes(c)) depth++;
      else if (')]}'.includes(c)) depth--;
      if (c === '|' && depth === 0 && input[i + 1] !== '|' && input[i - 1] !== '|') { steps.push(cur.trim()); cur = ''; continue; }
      cur += c;
    }
    steps.push(cur.trim());
    return steps.filter(Boolean);
  }

  /**
   * Run a pipeline of steps joined with |, each step receiving the result of the one before:
   *   .value | filter(x => x.Approved == true) | pick(Title, Cost) | sortBy(-Cost)
   */
  function evaluate(input, data) {
    const steps = splitSteps(String(input || ''));
    if (!steps.length) throw new Error('Type at least one step');
    let result = data;
    for (const step of steps) {
      try { result = executeStep(result, step); }
      catch (err) {
        if (/^Unknown step/.test(err.message)) {
          throw new Error(`${err.message}. Steps: .field  [0]  length  keys()  unique()  pick(a, b)  sortBy(field)  slice(0, 10)  map(x => x.a)  filter(x => x.a > 1)  groupBy(x => x.a)  sum(x => x.a)`);
        }
        throw new Error(`Step "${step}": ${err.message}`);
      }
    }
    return result;
  }

  return { executeStep, evaluate, splitSteps, operations, validateExpression, buildFn1, buildFn2 };
})();
