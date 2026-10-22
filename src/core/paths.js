/* ============================================================
   STRUCTRA V2 — Paths
   Structra.paths — parse, resolve and format data paths.

   Accepted path syntax (a leading "$" is optional):
     users[0].name          dot keys and [index]
     ["key.with.dots"]      quoted keys
     items[*].id            wildcard over an array

   API:
     Structra.paths.tokenize(path)       → [{type:'key'|'index'|'wildcard', value}]
     Structra.paths.resolve(data, path)  → value, or undefined when missing
     Structra.paths.strip(path)          → path without the leading "$"
     Structra.paths.lastKey(path)        → last key name, or 'data'
     Structra.paths.powerAutomate(path)  → body('Parse_JSON')?['a'][0]
     Structra.paths.powerFx(path)        → ParseJSON(jsonText).a
   ============================================================ */

window.Structra = window.Structra || {};

Structra.paths = (() => {
  const SIMPLE_FX_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;

  function strip(path) {
    if (!path || path === '$') return '';
    return path.replace(/^\$\.?/, '');
  }

  function tokenize(path) {
    const src = strip(path);
    const tokens = [];
    let i = 0;
    while (i < src.length) {
      const ch = src[i];
      if (ch === '.') { i++; continue; }

      if (ch === '[') {
        const quote = src[i + 1];
        if (quote === '"' || quote === "'") {
          const end = src.indexOf(quote + ']', i + 2);
          if (end === -1) break;
          tokens.push({ type: 'key', value: src.slice(i + 2, end) });
          i = end + 2;
        } else {
          const end = src.indexOf(']', i);
          if (end === -1) break;
          const inner = src.slice(i + 1, end);
          tokens.push(inner === '*'
            ? { type: 'wildcard', value: '*' }
            : { type: 'index', value: parseInt(inner, 10) });
          i = end + 1;
        }
        continue;
      }

      let end = i;
      while (end < src.length && src[end] !== '.' && src[end] !== '[') end++;
      tokens.push({ type: 'key', value: src.slice(i, end) });
      i = end;
    }
    return tokens;
  }

  function _walk(node, tokens, at) {
    if (at >= tokens.length) return node;
    if (node === null || node === undefined) return undefined;
    const t = tokens[at];
    if (t.type === 'wildcard') {
      if (!Array.isArray(node)) return undefined;
      const out = [];
      for (const item of node) {
        const sub = _walk(item, tokens, at + 1);
        if (sub === undefined) continue;
        if (Array.isArray(sub)) out.push(...sub); else out.push(sub);
      }
      return out;
    }
    return _walk(node[t.value], tokens, at + 1);
  }

  function resolve(data, path) {
    const tokens = tokenize(path);
    return tokens.length ? _walk(data, tokens, 0) : data;
  }

  function lastKey(path) {
    const tokens = tokenize(path);
    for (let i = tokens.length - 1; i >= 0; i--) {
      if (tokens[i].type === 'key') return tokens[i].value;
    }
    return 'data';
  }

  function powerAutomate(path) {
    let out = "body('Parse_JSON')";
    for (const t of tokenize(path)) {
      if (t.type === 'key') out += `?['${t.value}']`;
      else out += `[${t.type === 'wildcard' ? 0 : t.value}]`;
    }
    return out;
  }

  function powerFx(path) {
    let out = 'ParseJSON(jsonText)';
    for (const t of tokenize(path)) {
      if (t.type === 'key') {
        out += SIMPLE_FX_KEY.test(t.value) ? `.${t.value}` : `.'${t.value}'`;
      } else {
        // Power Fx tables are 1-based
        out = `Index(${out}, ${t.type === 'wildcard' ? 1 : t.value + 1})`;
      }
    }
    return out;
  }

  return { tokenize, resolve, strip, lastKey, powerAutomate, powerFx };
})();
