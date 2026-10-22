/**
 * JSONPath — find values by path.
 *
 *   Structra.jsonpath.query(data, '$.value[*].Requester.Email')
 *     → [{ path: '$.value[0].Requester.Email', value: 'ann@contoso.com' }, ...]
 *
 * Supported (the parts people use):
 *   $              the whole document (optional at the start: 'value[0].Title' works too)
 *   .key  ['key']  a field            .*  [*]  every field or item
 *   [2]  [-1]      an item            [0:3] [1:]  a range of items
 *   ..key          the field at any depth
 *   [?(@.Cost > 100 && @.Approved == true)]   items that pass a test (== != > >= < <= =~, && ||)
 *   ['a','b'] [0,2]  several at once
 */
Structra.jsonpath = (() => {

  /* ---------- reading the expression ---------- */

  function parse(expr) {
    const src = String(expr).trim();
    let i = 0;
    const steps = [];
    const fail = (msg) => { throw new Error(`${msg} (at character ${i + 1} of "${src}")`); };

    if (src[i] === '$') i++;
    while (i < src.length) {
      if (src.startsWith('..', i)) {
        i += 2;
        steps.push({ type: 'descend' });
        if (src[i] === '[') continue;                       // ..[?(...)]
        if (src[i] === '*') { i++; steps.push({ type: 'wild' }); continue; }
        const name = readName();
        if (!name) fail('Expected a field name after ..');
        steps.push({ type: 'keys', keys: [name] });
      } else if (src[i] === '.') {
        i++;
        if (src[i] === '*') { i++; steps.push({ type: 'wild' }); continue; }
        const name = readName();
        if (!name) fail('Expected a field name after .');
        steps.push({ type: 'keys', keys: [name] });
      } else if (src[i] === '[') {
        steps.push(readBracket());
      } else if (steps.length === 0 || /\s/.test(src[i])) {
        // 'value[0].Title' or '*.email' without the leading $
        if (/\s/.test(src[i])) { i++; continue; }
        if (src[i] === '*') { i++; steps.push({ type: 'wild' }); continue; }
        const name = readName();
        if (!name) fail('Unexpected character');
        steps.push({ type: 'keys', keys: [name] });
      } else {
        fail('Unexpected character');
      }
    }
    return steps;

    function readName() {
      const m = /^[^.\[\]\s,()=<>!&|*]+/.exec(src.slice(i));
      if (!m) return '';
      i += m[0].length;
      return m[0];
    }

    function readBracket() {
      i++;                                                   // [
      while (src[i] === ' ') i++;
      if (src[i] === '*') { i++; closeBracket(); return { type: 'wild' }; }
      if (src[i] === '?') {
        i++;
        if (src[i] === '(') {
          let depth = 0, start = i;
          for (; i < src.length; i++) {
            if (src[i] === '(') depth++;
            else if (src[i] === ')' && --depth === 0) { i++; break; }
            else if (src[i] === '"' || src[i] === "'") { const q = src[i]; i++; while (i < src.length && src[i] !== q) i++; }
          }
          const body = src.slice(start + 1, i - 1);
          closeBracket();
          return { type: 'filter', test: parseTest(body) };
        }
        fail('A filter looks like [?(@.field == "value")]');
      }
      // names, numbers, slices, separated by commas
      const items = [];
      for (;;) {
        while (src[i] === ' ') i++;
        if (src[i] === "'" || src[i] === '"') {
          const q = src[i++]; let s = '';
          while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; s += src[i++]; }
          if (src[i] !== q) fail('A quote is not closed');
          i++;
          items.push({ key: s });
        } else {
          const m = /^(-?\d*)(?::(-?\d*))?(?::(-?\d*))?/.exec(src.slice(i));
          if (!m || !m[0]) fail('Expected a number, a range or a quoted name');
          i += m[0].length;
          if (m[0].includes(':')) items.push({ slice: [m[1] === '' ? null : +m[1], m[2] === undefined || m[2] === '' ? null : +m[2], m[3] === undefined || m[3] === '' ? 1 : +m[3]] });
          else items.push({ index: +m[1] });
        }
        while (src[i] === ' ') i++;
        if (src[i] === ',') { i++; continue; }
        break;
      }
      closeBracket();
      return { type: 'select', items };
    }

    function closeBracket() {
      while (src[i] === ' ') i++;
      if (src[i] !== ']') fail('Expected ]');
      i++;
    }
  }

  /* ---------- filters: @.a.b == 3 && @.c ---------- */

  function parseTest(body) {
    // split on || first, then &&, outside quotes
    const splitOn = (text, op) => {
      const out = []; let cur = '', q = null;
      for (let k = 0; k < text.length; k++) {
        const c = text[k];
        if (q) { cur += c; if (c === q) q = null; continue; }
        if (c === '"' || c === "'") { q = c; cur += c; continue; }
        if (text.startsWith(op, k)) { out.push(cur); cur = ''; k += op.length - 1; continue; }
        cur += c;
      }
      out.push(cur);
      return out;
    };
    const ors = splitOn(body, '||').map((part) => splitOn(part, '&&').map(parseComparison));
    return (node) => ors.some((ands) => ands.every((t) => t(node)));
  }

  function parseComparison(text) {
    const t = text.trim();
    const m = /^(@[^\s=!<>~]*)\s*(==|!=|>=|<=|=~|>|<)\s*(.+)$/.exec(t);
    const read = (ref) => {
      const keys = ref.replace(/^@\.?/, '').split('.').filter(Boolean);
      return (node) => keys.reduce((v, k) => (v === null || v === undefined ? undefined : v[k]), node);
    };
    if (!m) {
      if (/^!?@[\w$.]*$/.test(t)) { const neg = t[0] === '!'; const get = read(t.replace(/^!/, '')); return (node) => (get(node) !== undefined && get(node) !== null && get(node) !== false) !== neg; }
      throw new Error(`Cannot read the filter test "${t}". Try @.field == "value"`);
    }
    const get = read(m[1]);
    const lit = literal(m[3].trim());
    const op = m[2];
    return (node) => {
      const v = get(node);
      switch (op) {
        case '==': return v === lit || (v != null && lit != null && typeof v !== 'object' && String(v) === String(lit));
        case '!=': return !(v === lit || (v != null && lit != null && typeof v !== 'object' && String(v) === String(lit)));
        case '>': return v > lit;
        case '>=': return v >= lit;
        case '<': return v < lit;
        case '<=': return v <= lit;
        case '=~': return typeof v === 'string' && lit instanceof RegExp && lit.test(v);
        default: return false;
      }
    };
  }

  function literal(s) {
    if (/^(['"]).*\1$/.test(s)) return s.slice(1, -1);
    if (s === 'true') return true;
    if (s === 'false') return false;
    if (s === 'null') return null;
    if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
    const re = /^\/(.*)\/([a-z]*)$/.exec(s);
    if (re) return new RegExp(re[1], re[2]);
    return s;
  }

  /* ---------- running it ---------- */

  const childPath = (path, key) => (typeof key === 'number' ? `${path}[${key}]` : (/^[A-Za-z_$][\w$]*$/.test(key) ? `${path}.${key}` : `${path}['${String(key).replace(/'/g, "\\'")}']`));
  const children = (node) => {
    const v = node.value;
    if (Array.isArray(v)) return v.map((x, i) => ({ path: childPath(node.path, i), value: x, key: i }));
    if (v && typeof v === 'object') return Object.keys(v).map((k) => ({ path: childPath(node.path, k), value: v[k], key: k }));
    return [];
  };

  function query(data, expr) {
    const steps = parse(expr);
    let nodes = [{ path: '$', value: data }];
    for (const step of steps) {
      const next = [];
      for (const node of nodes) {
        const v = node.value;
        if (step.type === 'keys') {
          if (v && typeof v === 'object' && !Array.isArray(v)) {
            for (const k of step.keys) if (Object.prototype.hasOwnProperty.call(v, k)) next.push({ path: childPath(node.path, k), value: v[k] });
          } else if (Array.isArray(v) && /^\d+$/.test(step.keys[0])) {
            const idx = Number(step.keys[0]);
            if (idx < v.length) next.push({ path: childPath(node.path, idx), value: v[idx] });
          }
        } else if (step.type === 'wild') {
          next.push(...children(node));
        } else if (step.type === 'descend') {
          const stack = [node];
          while (stack.length) {
            const n = stack.shift();
            next.push(n);
            stack.unshift(...children(n));
          }
        } else if (step.type === 'select') {
          const kids = children(node);
          for (const item of step.items) {
            if (item.key !== undefined) {
              if (v && typeof v === 'object' && !Array.isArray(v) && Object.prototype.hasOwnProperty.call(v, item.key)) next.push({ path: childPath(node.path, item.key), value: v[item.key] });
            } else if (Array.isArray(v)) {
              if (item.index !== undefined) {
                const idx = item.index < 0 ? v.length + item.index : item.index;
                if (idx >= 0 && idx < v.length) next.push({ path: childPath(node.path, idx), value: v[idx] });
              } else {
                let [a, b, st] = item.slice;
                const len = v.length;
                a = a === null ? 0 : (a < 0 ? Math.max(0, len + a) : Math.min(a, len));
                b = b === null ? len : (b < 0 ? Math.max(0, len + b) : Math.min(b, len));
                for (let k = a; k < b; k += st || 1) next.push({ path: childPath(node.path, k), value: v[k] });
              }
            }
          }
        } else if (step.type === 'filter') {
          for (const kid of children(node)) if (kid.value !== null && typeof kid.value === 'object' ? step.test(kid.value) : step.test(kid.value)) next.push(kid);
        }
      }
      nodes = next;
    }
    return nodes.map(({ path, value }) => ({ path, value }));
  }

  return { query, parse };
})();
