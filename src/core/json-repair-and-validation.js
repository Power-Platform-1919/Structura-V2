/* ============================================================
   STRUCTRA V2 - JSON Tools
   Structra.jsonRepairAndValidation - repair, duplicate keys, JSON Patch, schema validation.

   API:
     await Structra.jsonRepairAndValidation.repair(text)            → repaired JSON text
     await Structra.jsonRepairAndValidation.findDuplicateKeys(text) → [{ key, path, line }]
     Structra.jsonRepairAndValidation.patch(from, to)               → RFC 6902 operations
     await Structra.jsonRepairAndValidation.validate(data, schema)  → { valid, errors: [{ path, message, keyword }] }
   ============================================================ */

window.Structra = window.Structra || {};

Structra.jsonRepairAndValidation = (() => {
  /* ---------- repair ---------- */

  async function repair(text) {
    await Structra.libraryLoader.loadLibrary('jsonrepair');
    const lib = window.JSONRepair || window.jsonrepair;
    const fn = lib && (lib.jsonrepair || lib);
    if (typeof fn !== 'function') throw new Error('jsonrepair did not load');
    return fn(text);
  }

  /* ---------- duplicate keys ---------- */

  const SIMPLE_KEY = /^[A-Za-z_$][\w$]*$/;
  const keyPath = (base, key) =>
    SIMPLE_KEY.test(key) ? (base ? base + '.' + key : key) : `${base}["${key}"]`;

  /**
   * Scan raw JSON text for objects that repeat a key. JSON.parse keeps only the
   * last value, so this has to look at the text. Iterative, so deep nesting is safe.
   */
  async function findDuplicateKeys(text) {
    const found = [];
    const stack = [];     // frames: { isObject, keys, path, expectKey, pendingKey, index }
    let line = 1;
    let lastYield = performance.now();

    const childPath = () => {
      const top = stack[stack.length - 1];
      if (!top) return '';
      return top.isObject ? keyPath(top.path, top.pendingKey) : `${top.path}[${top.index}]`;
    };

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '\n') { line++; continue; }

      if (ch === '"') {
        let j = i + 1;
        while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
        const top = stack[stack.length - 1];
        if (top && top.isObject && top.expectKey) {
          const key = text.slice(i + 1, j);
          top.expectKey = false;
          top.pendingKey = key;
          if (top.keys.has(key)) found.push({ key, path: keyPath(top.path, key), line });
          else top.keys.add(key);
        }
        i = j;
      } else if (ch === '{') {
        stack.push({ isObject: true, keys: new Set(), path: childPath(), expectKey: true, pendingKey: '' });
      } else if (ch === '[') {
        stack.push({ isObject: false, path: childPath(), index: 0 });
      } else if (ch === '}' || ch === ']') {
        stack.pop();
      } else if (ch === ',') {
        const top = stack[stack.length - 1];
        if (top) { if (top.isObject) top.expectKey = true; else top.index++; }
      }

      // Large files: give the page a turn about every 12 ms
      if ((i & 0xFFFF) === 0xFFFF && performance.now() - lastYield > 12) {
        await Structra.sharedHelpers.yieldToBrowser();
        lastYield = performance.now();
      }
    }
    return found;
  }

  /* ---------- JSON Patch (RFC 6902) ---------- */

  const pointer = (key) => String(key).replace(/~/g, '~0').replace(/\//g, '~1');
  const isContainer = (v) => v !== null && typeof v === 'object';

  function patch(from, to, base = '', ops = []) {
    if (from === to) return ops;
    if (!isContainer(from) || !isContainer(to) || Array.isArray(from) !== Array.isArray(to)) {
      ops.push({ op: 'replace', path: base, value: to });
      return ops;
    }

    if (Array.isArray(from)) {
      const common = Math.min(from.length, to.length);
      for (let i = 0; i < common; i++) patch(from[i], to[i], `${base}/${i}`, ops);
      for (let i = common; i < to.length; i++) ops.push({ op: 'add', path: `${base}/${i}`, value: to[i] });
      for (let i = from.length - 1; i >= common; i--) ops.push({ op: 'remove', path: `${base}/${i}` });
      return ops;
    }

    for (const key of Object.keys(from)) {
      if (!(key in to)) ops.push({ op: 'remove', path: `${base}/${pointer(key)}` });
    }
    for (const key of Object.keys(to)) {
      if (!(key in from)) ops.push({ op: 'add', path: `${base}/${pointer(key)}`, value: to[key] });
      else patch(from[key], to[key], `${base}/${pointer(key)}`, ops);
    }
    return ops;
  }

  /* ---------- schema validation ---------- */

  /** "/body/value/0/name" → "body.value[0].name" */
  function pointerToPath(ptr) {
    if (!ptr) return '';
    let out = '';
    for (const raw of ptr.split('/').slice(1)) {
      const seg = raw.replace(/~1/g, '/').replace(/~0/g, '~');
      out = /^\d+$/.test(seg) ? `${out}[${seg}]` : keyPath(out, seg);
    }
    return out;
  }

  async function validate(data, schema) {
    await Structra.libraryLoader.loadLibrary('ajv');
    const ajv = new window.Ajv({ allErrors: true, jsonPointers: true });
    const check = ajv.compile(schema);          // throws on an invalid schema
    const valid = check(data);
    const errors = (check.errors || []).map((e) => ({
      path: pointerToPath(e.dataPath),
      // An enum says which values are allowed, not only that the value is not one of them
      message: e.keyword === 'enum' && e.params && e.params.allowedValues ? 'should be one of: ' + e.params.allowedValues.map((v) => JSON.stringify(v)).join(', ') : e.message,
      keyword: e.keyword,
    }));
    return { valid: !!valid, errors };
  }

  return { repair, findDuplicateKeys, patch, validate };
})();
