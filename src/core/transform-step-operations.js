/**
 * Transform Operations - operation registry for safe jq-style expression evaluation.
 * Each operation has a pattern (regex) and an exec function.
 */
Structra.transformStepOperations = (() => {

  // Safety: block dangerous patterns in callback expressions
  function validateExpression(body, allowedParams) {
    const blocked = /\b(eval|Function|import|require|fetch|XMLHttpRequest|document|window|globalThis|process|__proto__|constructor|prototype)\b/;
    if (blocked.test(body)) throw new Error('That expression uses a word that is not allowed here');
    if (/(?<![=!<>])=(?![=>])/.test(body)) throw new Error('Expressions cannot use a single = to set a value. Use == to compare.');
  }

  function buildFn1(param, body) {
    validateExpression(body, [param]);
    return new Function(param, `return (${body});`);
  }

  function buildFn2(firstParameter, secondParameter, body) {
    validateExpression(body, [firstParameter, secondParameter]);
    return new Function(firstParameter, secondParameter, `return (${body});`);
  }

  // Operation registry - each entry: { pattern, exec(data, match) }
  const operations = [
    // The data as it is
    { pattern: /^\.$/, exec(data) { return data; } },
    // Navigate: .key or .key.subkey
    { pattern: /^\.[a-zA-Z_$][\w$.]*$/, exec(data, match) {
      const keys = match[0].slice(1).split('.');
      let result = data;
      for (const key of keys) { if (result == null) return undefined; result = result[key]; }
      return result;
    }},
    // Array index: [0] or [-1]
    { pattern: /^\[-?\d+\]$/, exec(data, match) {
      const index = parseInt(match[0].slice(1, -1));
      if (!Array.isArray(data)) return undefined;
      return index < 0 ? data[data.length + index] : data[index];
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
    { pattern: /^pick\(([\w$.,\s]+)\)$/, exec(data, match) {
      const fields = match[1].split(',').map((part) => part.trim()).filter(Boolean);
      const read = (object, field) => field.split('.').reduce((accumulator, part) => (accumulator == null ? undefined : accumulator[part]), object);
      const one = (item) => {
        const out = {};
        for (const field of fields) out[field] = read(item, field);
        return out;
      };
      return Array.isArray(data) ? data.map(one) : one(data);
    }},
    // sortBy(field) or sortBy(-field) for descending
    { pattern: /^sortBy\((-?)([\w$.]+)\)$/, exec(data, match) {
      if (!Array.isArray(data)) return data;
      const read = (object) => match[2].split('.').reduce((accumulator, part) => (accumulator == null ? undefined : accumulator[part]), object);
      const direction = match[1] ? -1 : 1;
      return [...data].sort((first, second) => {
        const x = read(first), y = read(second);
        if (x === y) return 0;
        if (x == null) return 1;
        if (y == null) return -1;
        return (x < y ? -1 : 1) * direction;
      });
    }},
    // slice(start, end?)
    { pattern: /^slice\((-?\d+)(?:\s*,\s*(-?\d+))?\)$/, exec(data, match) {
      if (!Array.isArray(data)) return data;
      const start = parseInt(match[1]);
      const end = match[2] != null ? parseInt(match[2]) : undefined;
      return data.slice(start, end);
    }},
    // map(x => expr)
    { pattern: /^map\((\w+)\s*=>\s*(.+)\)$/, exec(data, match) {
      if (!Array.isArray(data)) return data;
      return data.map(buildFn1(match[1], match[2]));
    }},
    // filter(x => expr)
    { pattern: /^filter\((\w+)\s*=>\s*(.+)\)$/, exec(data, match) {
      if (!Array.isArray(data)) return data;
      return data.filter(buildFn1(match[1], match[2]));
    }},
    // sort((a,b) => expr)
    { pattern: /^sort\((\([\w,\s]+\))\s*=>\s*(.+)\)$/, exec(data, match) {
      if (!Array.isArray(data)) return data;
      const params = match[1].replace(/[()]/g, '').split(',').map(part => part.trim());
      return [...data].sort(buildFn2(params[0], params[1], match[2]));
    }},
    // reduce((acc, x) => expr, init)
    { pattern: /^reduce\((\([\w,\s]+\))\s*=>\s*(.+),\s*(.+)\)$/, exec(data, match) {
      if (!Array.isArray(data)) return data;
      const params = match[1].replace(/[()]/g, '').split(',').map(part => part.trim());
      const init = JSON.parse(match[3]);
      return data.reduce(buildFn2(params[0], params[1], match[2]), init);
    }},
    // groupBy(x => expr)
    { pattern: /^groupBy\((\w+)\s*=>\s*(.+)\)$/, exec(data, match) {
      if (!Array.isArray(data)) return data;
      const callback = buildFn1(match[1], match[2]);
      const groups = {};
      for (const item of data) { const key = String(callback(item)); if (!groups[key]) groups[key] = []; groups[key].push(item); }
      return groups;
    }},
    // find(x => expr)
    { pattern: /^find\((\w+)\s*=>\s*(.+)\)$/, exec(data, match) {
      if (!Array.isArray(data)) return data;
      return data.find(buildFn1(match[1], match[2]));
    }},
    // count(x => expr)
    { pattern: /^count\((\w+)\s*=>\s*(.+)\)$/, exec(data, match) {
      if (!Array.isArray(data)) return data;
      return data.filter(buildFn1(match[1], match[2])).length;
    }},
    // sum(x => expr)
    { pattern: /^sum\((\w+)\s*=>\s*(.+)\)$/, exec(data, match) {
      if (!Array.isArray(data)) return 0;
      const callback = buildFn1(match[1], match[2]);
      return data.reduce((total, item) => total + (Number(callback(item)) || 0), 0);
    }},
    // avg(x => expr)
    { pattern: /^avg\((\w+)\s*=>\s*(.+)\)$/, exec(data, match) {
      if (!Array.isArray(data) || data.length === 0) return 0;
      const callback = buildFn1(match[1], match[2]);
      return data.reduce((total, item) => total + (Number(callback(item)) || 0), 0) / data.length;
    }},
    // min(x => expr)
    { pattern: /^min\((\w+)\s*=>\s*(.+)\)$/, exec(data, match) {
      if (!Array.isArray(data) || data.length === 0) return undefined;
      return Math.min(...data.map(buildFn1(match[1], match[2])));
    }},
    // max(x => expr)
    { pattern: /^max\((\w+)\s*=>\s*(.+)\)$/, exec(data, match) {
      if (!Array.isArray(data) || data.length === 0) return undefined;
      return Math.max(...data.map(buildFn1(match[1], match[2])));
    }},
  ];

  function executeStep(data, step) {
    for (const operation of operations) {
      const match = step.match(operation.pattern);
      if (match) return operation.exec(data, match);
    }
    throw new Error(`Unknown step: ${step}`);
  }

  /** Split on | that is not inside brackets, braces, parentheses or quotes ("||" stays in one piece) */
  function splitSteps(input) {
    const steps = [];
    let depth = 0, quote = null, current = '';
    for (let i = 0; i < input.length; i++) {
      const character = input[i];
      if (quote) { current += character; if (character === quote && input[i - 1] !== '\\') quote = null; continue; }
      if (character === '"' || character === "'" || character === '`') { quote = character; current += character; continue; }
      if ('([{'.includes(character)) depth++;
      else if (')]}'.includes(character)) depth--;
      if (character === '|' && depth === 0 && input[i + 1] !== '|' && input[i - 1] !== '|') { steps.push(current.trim()); current = ''; continue; }
      current += character;
    }
    steps.push(current.trim());
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
      catch (error) {
        if (/^Unknown step/.test(error.message)) {
          throw new Error(`${error.message}. Steps: .field  [0]  length  keys()  unique()  pick(a, b)  sortBy(field)  slice(0, 10)  map(x => x.a)  filter(x => x.a > 1)  groupBy(x => x.a)  sum(x => x.a)`);
        }
        throw new Error(`Step "${step}": ${error.message}`);
      }
    }
    return result;
  }

  return { executeStep, evaluate, splitSteps, operations, validateExpression, buildFn1, buildFn2 };
})();
