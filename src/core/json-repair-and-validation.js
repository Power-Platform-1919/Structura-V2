/* ============================================================
   STRUCTRA V2 - JSON Tools
   Structra.jsonRepairAndValidation - repair, duplicate keys, JSON Patch, schema validation.

   API:
     await Structra.jsonRepairAndValidation.repair(text)            → repaired JSON text
     await Structra.jsonRepairAndValidation.findDuplicateKeys(text) → [{ key, path, line }]
     await Structra.jsonRepairAndValidation.explainParseError(text) → { offset, line, column, reason } or null when the text is valid
     Structra.jsonRepairAndValidation.patch(from, to)               → RFC 6902 operations
     await Structra.jsonRepairAndValidation.validate(data, schema)  → { valid, errors: [{ path, message, keyword }] }
   ============================================================ */

window.Structra = window.Structra || {};

Structra.jsonRepairAndValidation = (() => {
  /* ---------- repair ---------- */

  async function repair(text) {
    await Structra.libraryLoader.loadLibrary('jsonrepair');
    const library = window.JSONRepair || window.jsonrepair;
    const callback = library && (library.jsonrepair || library);
    if (typeof callback !== 'function') throw new Error('jsonrepair did not load');
    return callback(text);
  }

  /* ---------- where and why JSON is broken ---------- */

  // The browsers' own JSON.parse messages differ (Chrome says "at position 12", Firefox "at line 1 column 12 of the JSON data",
  // Safari gives no place at all), so the place cannot be read from them. jsonc-parser reports the same offset and error code
  // everywhere. Its error codes (ParseErrorCode) used below:
  const CODE = { invalidSymbol: 1, invalidNumber: 2, propertyNameExpected: 3, valueExpected: 4, colonExpected: 5, commaExpected: 6,
    closeBraceExpected: 7, closeBracketExpected: 8, endOfFileExpected: 9, invalidComment: 10, unexpectedEndOfComment: 11,
    unexpectedEndOfString: 12, unexpectedEndOfNumber: 13, invalidUnicode: 14, invalidEscape: 15, invalidCharacter: 16 };

  const isCompleteJson = (text) => { try { JSON.parse(text); return text.trim() !== ''; } catch { return false; } };

  /** The error said the way a maker would: what is wrong, not which token */
  function plainReason(code, text, offset) {
    const character = text[offset] || '';
    const atEnd = text.slice(offset).trim() === '';
    if (code === CODE.unexpectedEndOfString || (atEnd && code !== CODE.endOfFileExpected)) return 'the text ends too early: a closing bracket or quote is missing';
    if (code === CODE.endOfFileExpected || (code === CODE.invalidSymbol && offset > 0 && isCompleteJson(text.slice(0, offset)))) return 'there is extra text after the end of the JSON';
    if (code === CODE.invalidComment || code === CODE.unexpectedEndOfComment) return 'comments are not allowed in JSON';
    if (code === CODE.invalidNumber || code === CODE.unexpectedEndOfNumber) return 'this number is not written the way JSON allows (no leading zeros, no plus sign)';
    if (code === CODE.invalidUnicode || code === CODE.invalidEscape) return 'a backslash in a text value is followed by something JSON does not allow';
    if (code === CODE.invalidCharacter) return 'a character that cannot be written as it is (like a line break inside a text value) must be escaped';
    if (code === CODE.colonExpected) return 'a colon is missing after the key';
    if (code === CODE.commaExpected) return 'a comma is missing between two items';
    if (code === CODE.closeBraceExpected || code === CODE.closeBracketExpected) return 'a closing bracket is missing or in the wrong place';
    const location = window.JSONC && window.JSONC.getLocation ? window.JSONC.getLocation(text, offset) : null;
    const atKey = !!(location && location.isAtPropertyKey);
    if (character === "'") return atKey ? 'keys need double quotes, not single quotes' : 'text needs double quotes ("like this"), not single quotes';
    if (code === CODE.propertyNameExpected) return 'a key is missing or needs double quotes (a trailing comma?)';
    if (code === CODE.valueExpected && (character === '}' || character === ']' || character === ',')) return 'a value is missing (a trailing comma?)';
    if (code === CODE.valueExpected) return 'a value is missing';
    if (/[A-Za-z]/.test(character)) return atKey ? 'a key needs double quotes' : 'text needs double quotes ("like this"), unless it is true, false or null';
    if (character === ',') return 'a comma is not allowed here';
    if (character === '}' || character === ']') return 'a closing bracket is in the wrong place';
    if (character === ':') return 'a colon is not allowed here';
    return 'this character is not allowed here';
  }

  /**
   * Where and why a text is not valid JSON: { offset, line, column, reason } (line and column count from 1), or null when it is valid.
   * The same answer in every browser.
   */
  async function explainParseError(text) {
    await Structra.libraryLoader.loadLibrary('jsonc');
    const errors = [];
    window.JSONC.parse(String(text), errors, { allowTrailingComma: false, disallowComments: true });
    if (!errors.length) return null;
    const { error: code, offset } = errors[0];
    const before = String(text).slice(0, offset);
    return { offset, line: before.split('\n').length, column: before.length - before.lastIndexOf('\n'), reason: plainReason(code, String(text), offset) };
  }

  /* ---------- duplicate keys ---------- */

  const keyPath = (base, key) => Structra.dataPaths.child(base, key);

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
      const character = text[i];
      if (character === '\n') { line++; continue; }

      if (character === '"') {
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
      } else if (character === '{') {
        stack.push({ isObject: true, keys: new Set(), path: childPath(), expectKey: true, pendingKey: '' });
      } else if (character === '[') {
        stack.push({ isObject: false, path: childPath(), index: 0 });
      } else if (character === '}' || character === ']') {
        stack.pop();
      } else if (character === ',') {
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
  const isContainer = (value) => value !== null && typeof value === 'object';

  function patch(from, to, base = '', operations = []) {
    if (from === to) return operations;
    if (!isContainer(from) || !isContainer(to) || Array.isArray(from) !== Array.isArray(to)) {
      operations.push({ op: 'replace', path: base, value: to });
      return operations;
    }

    if (Array.isArray(from)) {
      const common = Math.min(from.length, to.length);
      for (let i = 0; i < common; i++) patch(from[i], to[i], `${base}/${i}`, operations);
      for (let i = common; i < to.length; i++) operations.push({ op: 'add', path: `${base}/${i}`, value: to[i] });
      for (let i = from.length - 1; i >= common; i--) operations.push({ op: 'remove', path: `${base}/${i}` });
      return operations;
    }

    for (const key of Object.keys(from)) {
      if (!(key in to)) operations.push({ op: 'remove', path: `${base}/${pointer(key)}` });
    }
    for (const key of Object.keys(to)) {
      if (!(key in from)) operations.push({ op: 'add', path: `${base}/${pointer(key)}`, value: to[key] });
      else patch(from[key], to[key], `${base}/${pointer(key)}`, operations);
    }
    return operations;
  }

  /* ---------- schema validation ---------- */

  /** "/body/value/0/name" → "body.value[0].name" */
  function pointerToPath(pointer) {
    if (!pointer) return '';
    let out = '';
    for (const raw of pointer.split('/').slice(1)) {
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
    const errors = (check.errors || []).map((error) => ({
      path: pointerToPath(error.dataPath),
      // An enum says which values are allowed, not only that the value is not one of them
      message: error.keyword === 'enum' && error.params && error.params.allowedValues ? 'should be one of: ' + error.params.allowedValues.map((value) => JSON.stringify(value)).join(', ') : error.message,
      keyword: error.keyword,
    }));
    return { valid: !!valid, errors };
  }

  return { repair, explainParseError, findDuplicateKeys, patch, validate };
})();
