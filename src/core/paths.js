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
     Structra.paths.setNested(data, path, value) → assign in place, true when set
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

  /** Assign a value at a path in place. Missing parents are not created. */
  function setNested(data, path, value) {
    const tokens = tokenize(path);
    if (!tokens.length) return false;
    if (tokens.some((t) => t.value === '__proto__' || t.value === 'constructor' || t.value === 'prototype')) return false;
    let node = data;
    for (let i = 0; i < tokens.length - 1; i++) {
      node = node[tokens[i].value];
      if (node === null || typeof node !== 'object') return false;
    }
    node[tokens[tokens.length - 1].value] = value;
    return true;
  }

  function lastKey(path) {
    const tokens = tokenize(path);
    for (let i = tokens.length - 1; i >= 0; i--) {
      if (tokens[i].type === 'key') return tokens[i].value;
    }
    return 'data';
  }

  /**
   * Power Automate expression for a path.
   * opts.root        the expression the document starts at, default body('Parse_JSON')
   * opts.dropBody    the document is a whole action output ({ statusCode, headers, body }): the
   *                  leading "body" key is the root itself, so it is not repeated
   * Every step is null-safe (?['key'], ?[0]) so a missing branch gives null instead of a failed run.
   */
  function powerAutomate(path, opts = {}) {
    let out = opts.root || "body('Parse_JSON')";
    const tokens = tokenize(path);
    if (opts.dropBody && tokens.length && tokens[0].type === 'key' && tokens[0].value === 'body') tokens.shift();
    for (const t of tokens) {
      if (t.type === 'key') out += `?['${t.value.replace(/'/g, "''")}']`;
      else out += `?[${t.type === 'wildcard' ? 0 : t.value}]`;
    }
    return out;
  }

  /**
   * Power Fx expression for a path, read from a text variable that holds the JSON.
   * opts.variable  the variable (or any text expression), default jsonText
   * Power Fx tables are 1-based, so index 0 becomes 1.
   */
  function powerFx(path, opts = {}) {
    let out = `ParseJSON(${opts.variable || 'jsonText'})`;
    for (const t of tokenize(path)) {
      if (t.type === 'key') {
        out += SIMPLE_FX_KEY.test(t.value) ? `.${t.value}` : `.'${t.value.replace(/'/g, "''")}'`;
      } else {
        out = `Index(${out}, ${t.type === 'wildcard' ? 1 : t.value + 1})`;
      }
    }
    return out;
  }

  /**
   * A value inside a list item is usually used while looping over the list, where the item is
   * "the current item" and the position in the list does not matter.
   * Returns null when the path is not inside a list item, otherwise
   *   { listPath: 'value', restTokens: [...] }   for value[0].Requester.Email → value and Requester.Email
   * (the last list on the way decides, so nested lists loop over the innermost one).
   */
  function splitAtItem(path) {
    const tokens = tokenize(path);
    for (let i = tokens.length - 1; i >= 0; i--) {
      if (tokens[i].type === 'index' || tokens[i].type === 'wildcard') {
        const listTokens = tokens.slice(0, i);
        const listPath = listTokens.map((t, n) => (t.type === 'key' ? (n ? '.' : '') + t.value : `[${t.type === 'wildcard' ? '*' : t.value}]`)).join('');
        return { listPath: listPath || '$', restTokens: tokens.slice(i + 1) };
      }
    }
    return null;
  }

  const steps = (tokens) => tokens.map((t) => (t.type === 'key' ? `?['${t.value.replace(/'/g, "''")}']` : `?[${t.type === 'wildcard' ? 0 : t.value}]`)).join('');

  /** Power Automate inside "Apply to each": items('Apply_to_each')?['Requester']?['Email'] */
  function powerAutomateInLoop(path, loopName) {
    const at = splitAtItem(path);
    return at ? { listPath: at.listPath, expr: `items('${loopName || 'Apply_to_each'}')${steps(at.restTokens)}` } : null;
  }

  /** Power Automate inside Select, Filter array and Condition on a list: item()?['Requester']?['Email'] */
  function powerAutomateInItem(path) {
    const at = splitAtItem(path);
    return at ? { listPath: at.listPath, expr: `item()${steps(at.restTokens)}` } : null;
  }

  /** Power Fx inside ForAll (ThisRecord) or a gallery (ThisItem) */
  function powerFxInRecord(path, head = 'ThisRecord') {
    const at = splitAtItem(path);
    if (!at) return null;
    let out = head;
    for (const t of at.restTokens) {
      if (t.type === 'key') out += SIMPLE_FX_KEY.test(t.value) ? `.${t.value}` : `.'${t.value.replace(/'/g, "''")}'`;
      else out = `Index(${out}, ${t.type === 'wildcard' ? 1 : t.value + 1})`;
    }
    return { listPath: at.listPath, expr: out };
  }

  /** The path as people see it everywhere: starting with $ (value[0].Email → $.value[0].Email, [0] → $[0]) */
  function canonical(path) {
    const p = String(path || '').trim();
    if (!p || p === '$') return '$';
    if (p.startsWith('$')) return p;
    return p.startsWith('[') ? '$' + p : '$.' + p;
  }

  return { tokenize, resolve, setNested, strip, lastKey, canonical, powerAutomate, powerFx, splitAtItem, powerAutomateInLoop, powerAutomateInItem, powerFxInRecord };
})();
