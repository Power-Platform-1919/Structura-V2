/* ============================================================
   STRUCTRA V2 - Paths
   Structra.dataPaths - write, parse, resolve and format data paths.

   Accepted path syntax (a leading "$" is optional):
     users[0].name          dot keys and [index]
     ["key.with.dots"]      quoted keys; inside the quotes \\ is a backslash, \" (or \') a quote, \uXXXX a character
     [""]                   the empty key
     items[*].id            wildcard over an array

   NEVER WRITE A PATH BY HAND (`${path}.${key}`, `${path}["${key}"]`). child() is the only writer, and tokenize() reads back exactly
   what it writes, for any key (dots, brackets, quotes, backslashes, an empty key, a "$" at the start). tests/unit/data-paths.test.js
   proves it against a list of hostile keys, and tests/unit/path-writers.test.js fails when a hand-written path appears in src.

   API:
     Structra.dataPaths.child(path, key)     → the path of a child: a text key, or a number (array position)
     Structra.dataPaths.toPattern(path)      → the path with list positions replaced: value[3].a → value[*].a
     Structra.dataPaths.tokenize(path)       → [{type:'key'|'index'|'wildcard', value}]
     Structra.dataPaths.resolve(data, path)  → value, or undefined when missing
     Structra.dataPaths.setNested(data, path, value) → assign in place, true when set
     Structra.dataPaths.strip(path)          → path without the leading "$"
     Structra.dataPaths.lastKey(path)        → last key name, or 'data'
     Structra.dataPaths.powerAutomate(path)  → body('Parse_JSON')?['a'][0]
     Structra.dataPaths.powerAutomateDynamic(path, { call }) → outputs('Get_item')?['body/Author/DisplayName']  (as the designer writes dynamic content)
     Structra.dataPaths.powerFx(path)        → ParseJSON(jsonText).a
   ============================================================ */

window.Structra = window.Structra || {};

Structra.dataPaths = (() => {
  const SIMPLE_FX_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;

  // A key that can follow a dot as it is. Any other key is written as ["key"]. A key that starts with "$" is always quoted, so it can
  // never be taken for the root "$" (by this reader or by a JSONPath tool).
  const PLAIN_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;

  // Inside the quotes a backslash and a quote get a backslash; a control character (a line break, a tab) is written \uXXXX, as RFC 9535 requires
  const escapeCharacter = (character) => (character === '\\' || character === '"' ? '\\' + character : '\\u' + character.charCodeAt(0).toString(16).padStart(4, '0'));

  /** The path of a child. A number is an array position: [3]. A text is a key: .name, or ["odd key"] when it needs quotes. */
  function child(path, key) {
    const base = path === undefined || path === null ? '' : String(path);
    if (typeof key === 'number') return `${base}[${key}]`;
    const text = String(key);
    if (PLAIN_KEY.test(text)) return base ? `${base}.${text}` : text;
    return `${base}["${text.replace(/[\\"\u0000-\u001f]/g, escapeCharacter)}"]`;
  }

  /** The path without the root "$". Only a "$" that is the root goes: "$", "$.a" and "$[0]", but not the key "$a". */
  function strip(path) {
    if (!path || path === '$') return '';
    return path.replace(/^\$(?=\.|\[)\.?/, '');
  }

  /** Read a quoted key whose opening quote is at source[start]. Returns { value, next } (next is after the closing "]"), or null. */
  function readQuoted(source, start) {
    const quote = source[start];
    let value = '';
    for (let i = start + 1; i < source.length; i++) {
      const character = source[i];
      if (character === '\\' && (source[i + 1] === '\\' || source[i + 1] === '"' || source[i + 1] === "'")) { value += source[i + 1]; i++; continue; }
      if (character === '\\' && source[i + 1] === 'u' && /^[0-9a-fA-F]{4}$/.test(source.slice(i + 2, i + 6))) { value += String.fromCharCode(parseInt(source.slice(i + 2, i + 6), 16)); i += 5; continue; }
      if (character === quote && source[i + 1] === ']') return { value, next: i + 2 };
      value += character;
    }
    return null;
  }

  function tokenize(path) {
    const source = strip(path);
    const tokens = [];
    let i = 0;
    while (i < source.length) {
      const character = source[i];
      if (character === '.') { i++; continue; }

      if (character === '[') {
        const quote = source[i + 1];
        if (quote === '"' || quote === "'") {
          const read = readQuoted(source, i + 1);
          if (!read) break;
          tokens.push({ type: 'key', value: read.value });
          i = read.next;
        } else {
          const end = source.indexOf(']', i);
          if (end === -1) break;
          const inner = source.slice(i + 1, end);
          tokens.push(inner === '*'
            ? { type: 'wildcard', value: '*' }
            : { type: 'index', value: parseInt(inner, 10) });
          i = end + 1;
        }
        continue;
      }

      let end = i;
      while (end < source.length && source[end] !== '.' && source[end] !== '[') end++;
      tokens.push({ type: 'key', value: source.slice(i, end) });
      i = end;
    }
    return tokens;
  }

  /** The same path with every list position replaced: value[3].Tags[0] → value[*].Tags[*]. A key that looks like a position, ["a[0]"], is left alone. */
  function toPattern(path, marker = '[*]') {
    let out = /^\$(?=\.|\[|$)/.test(String(path)) ? '$' : '';
    for (const token of tokenize(path)) out = token.type === 'key' ? child(out, token.value) : `${out}${marker}`;
    return out;
  }

  /** The key names of a path, as a list: value[0].Title → ['value', 'Title'] (list positions left out) */
  function keysOf(path) {
    return tokenize(path).filter((token) => token.type === 'key').map((token) => token.value);
  }

  function _walk(node, tokens, at) {
    if (at >= tokens.length) return node;
    if (node === null || node === undefined) return undefined;
    const token = tokens[at];
    if (token.type === 'wildcard') {
      if (!Array.isArray(node)) return undefined;
      const out = [];
      for (const item of node) {
        const subResults = _walk(item, tokens, at + 1);
        if (subResults === undefined) continue;
        if (Array.isArray(subResults)) out.push(...subResults); else out.push(subResults);
      }
      return out;
    }
    // Only the node's own keys count: "constructor" or "toString" must not find what every object inherits
    if (typeof node !== 'object' || !Object.prototype.hasOwnProperty.call(node, token.value)) return undefined;
    return _walk(node[token.value], tokens, at + 1);
  }

  function resolve(data, path) {
    const tokens = tokenize(path);
    return tokens.length ? _walk(data, tokens, 0) : data;
  }

  /** Assign a value at a path in place. Missing parents are not created. */
  function setNested(data, path, value) {
    const tokens = tokenize(path);
    if (!tokens.length) return false;
    if (tokens.some((token) => token.value === '__proto__' || token.value === 'constructor' || token.value === 'prototype')) return false;
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
  function powerAutomate(path, options = {}) {
    let out = options.root || "body('Parse_JSON')";
    const tokens = tokenize(path);
    if (options.dropBody && tokens.length && tokens[0].type === 'key' && tokens[0].value === 'body') tokens.shift();
    for (const token of tokens) {
      if (token.type === 'key') out += `?['${token.value.replace(/'/g, "''")}']`;
      else out += `?[${token.type === 'wildcard' ? 0 : token.value}]`;
    }
    return out;
  }

  /**
   * The way the flow designer writes a value picked from "dynamic content": the keys under body in one text with slashes, as
   *   outputs('Get_item')?['body/Author/DisplayName']      triggerOutputs()?['body/Title']
   * (the Microsoft error reference writes outputs('Get_item')?['body/title'] the same way). A slash cannot step into a list, so the keys
   * before the first list position go in the one text and what follows is written step by step, null-safe: 'body/value' then ?[0]?['Title'].
   * A key that itself holds a slash ends the run (its own step), so a slash always means "go one level in".
   * opts.call      the start: "outputs('Get_item')" or "triggerOutputs()"
   * opts.dropBody  the document is a whole output ({ statusCode, headers, body }): the first key body is the "body" of the text
   */
  function powerAutomateDynamic(path, options = {}) {
    const tokens = tokenize(path);
    if (options.dropBody && tokens.length && tokens[0].type === 'key' && tokens[0].value === 'body') tokens.shift();
    const run = ['body'];
    let at = 0;
    while (at < tokens.length && tokens[at].type === 'key' && !tokens[at].value.includes('/')) { run.push(tokens[at].value); at++; }
    const quote = (text) => text.replace(/'/g, "''");
    let out = `${options.call || "outputs('Get_item')"}?['${quote(run.join('/'))}']`;
    for (const token of tokens.slice(at)) {
      if (token.type === 'key') out += `?['${quote(token.value)}']`;
      else out += `?[${token.type === 'wildcard' ? 0 : token.value}]`;
    }
    return out;
  }

  /**
   * Power Fx expression for a path, read from a text variable that holds the JSON.
   * opts.variable  the variable (or any text expression), default jsonText
   * Power Fx tables are 1-based, so index 0 becomes 1.
   */
  function powerFx(path, options = {}) {
    let out = `ParseJSON(${options.variable || 'jsonText'})`;
    for (const token of tokenize(path)) {
      if (token.type === 'key') {
        out += SIMPLE_FX_KEY.test(token.value) ? `.${token.value}` : `.'${token.value.replace(/'/g, "''")}'`;
      } else {
        out = `Index(${out}, ${token.type === 'wildcard' ? 1 : token.value + 1})`;
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
        let listPath = '';
        for (const token of tokens.slice(0, i)) listPath = token.type === 'wildcard' ? `${listPath}[*]` : child(listPath, token.value);
        return { listPath: listPath || '$', restTokens: tokens.slice(i + 1) };
      }
    }
    return null;
  }

  const steps = (tokens) => tokens.map((token) => (token.type === 'key' ? `?['${token.value.replace(/'/g, "''")}']` : `?[${token.type === 'wildcard' ? 0 : token.value}]`)).join('');

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
    for (const token of at.restTokens) {
      if (token.type === 'key') out += SIMPLE_FX_KEY.test(token.value) ? `.${token.value}` : `.'${token.value.replace(/'/g, "''")}'`;
      else out = `Index(${out}, ${token.type === 'wildcard' ? 1 : token.value + 1})`;
    }
    return { listPath: at.listPath, expr: out };
  }

  /** The path as people see it everywhere: starting with $ (value[0].Email → $.value[0].Email, [0] → $[0]) */
  function canonical(path) {
    const cleanPath = String(path || '').trim();
    if (!cleanPath || cleanPath === '$') return '$';
    if (cleanPath.startsWith('$') && /^\$(\.|\[|$)/.test(cleanPath)) return cleanPath;
    return cleanPath.startsWith('[') ? '$' + cleanPath : '$.' + cleanPath;
  }

  return { child, toPattern, keysOf, tokenize, resolve, setNested, strip, lastKey, canonical, powerAutomate, powerAutomateDynamic, powerFx, splitAtItem, powerAutomateInLoop, powerAutomateInItem, powerFxInRecord };
})();
