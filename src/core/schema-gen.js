/* ============================================================
   STRUCTRA V2 - Parse JSON Schema Generator
   Structra.schemaGen - JSON Schema for the Power Automate
   "Parse JSON" action.

   API:
     Structra.schemaGen.basic(value, opts)  → schema from the first array item only
     Structra.schemaGen.smart(value, opts)  → schema from every item, merged:
         - a key that is sometimes null becomes a type list, e.g. ["string", "null"]
         - a key that is missing from some objects is left out of "required"
         - a key that holds different types gets all of them, e.g. ["string", "number"]
         - nested objects and lists are merged across rows, not taken from the first row

   opts:
     integers: false   (default) every number is "number", which also accepts whole numbers, so a
                       flow does not fail when a later run sends 1.5 where the sample had 1
               true    whole numbers are "integer", as the designer's own generator writes them
     required: true    (default) list keys that are present in every object under "required"
               false   write no "required" at all (the run never fails because a key is missing)
   ============================================================ */

window.Structra = window.Structra || {};

Structra.schemaGen = (() => {
  const kindOf = Structra.util.typeOf;
  const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

  const DEFAULTS = { integers: false, required: true };

  /** A type name or a list of them: one name stays a string, several become an array */
  const typeValue = (list) => (list.length === 1 ? list[0] : list);

  function numberType(values, opts) {
    return opts.integers && values.every((n) => Number.isInteger(n)) ? 'integer' : 'number';
  }

  /**
   * Schema for everything seen at one place in the data.
   * `values` holds every value found there (one per row, per parent object, and so on).
   */
  function infer(values, opts) {
    const seen = { string: [], number: [], boolean: [], object: [], array: [] };
    let hasNull = false;
    for (const v of values) {
      const k = kindOf(v);
      if (k === 'null') hasNull = true;
      else if (seen[k]) seen[k].push(v);
    }

    const scalarTypes = [];
    if (seen.string.length) scalarTypes.push('string');
    if (seen.number.length) scalarTypes.push(numberType(seen.number, opts));
    if (seen.boolean.length) scalarTypes.push('boolean');

    const hasObject = seen.object.length > 0;
    const hasArray = seen.array.length > 0;
    if (!scalarTypes.length && !hasObject && !hasArray) return {};          // only null, or nothing seen: accept anything

    const parts = [];
    if (hasObject) parts.push(objectSchema(seen.object, opts));
    if (hasArray) parts.push(arraySchema(seen.array, opts));

    // One kind of value
    if (scalarTypes.length && !parts.length) return { type: typeValue(hasNull ? [...scalarTypes, 'null'] : scalarTypes) };
    if (!scalarTypes.length && parts.length === 1) {
      const only = parts[0];
      return hasNull ? { ...only, type: [only.type, 'null'] } : only;
    }

    // Several kinds, including objects or lists: list every shape
    const anyOf = [...scalarTypes.map((t) => ({ type: t })), ...parts];
    if (hasNull) anyOf.push({ type: 'null' });
    return { anyOf };
  }

  function objectSchema(objects, opts) {
    const byKey = new Map();
    for (const obj of objects) {
      for (const k of Object.keys(obj)) {
        let entry = byKey.get(k);
        if (!entry) { entry = { present: 0, values: [] }; byKey.set(k, entry); }
        entry.present++;
        entry.values.push(obj[k]);
      }
    }
    const properties = {};
    const required = [];
    for (const [k, entry] of byKey) {
      properties[k] = infer(entry.values, opts);
      if (entry.present === objects.length) required.push(k);
    }
    const schema = { type: 'object', properties };
    if (opts.required && required.length) schema.required = required;
    return schema;
  }

  function arraySchema(arrays, opts) {
    const items = [];
    for (const a of arrays) for (const el of a) items.push(el);
    const schema = { type: 'array' };
    if (items.length) schema.items = infer(items, opts);
    return schema;
  }

  /** The whole document: every row decides */
  function smart(value, options = {}) {
    return infer([value], { ...DEFAULTS, ...options });
  }

  /** The quick version: only the first item of each list decides */
  function basic(value, options = {}) {
    const opts = { ...DEFAULTS, ...options };
    const walk = (v) => {
      if (Array.isArray(v)) return v.length ? { type: 'array', items: walk(v[0]) } : { type: 'array' };
      if (isPlainObject(v)) {
        const properties = {};
        const required = [];
        for (const [k, child] of Object.entries(v)) {
          properties[k] = walk(child);
          if (child !== null) required.push(k);
        }
        const schema = { type: 'object', properties };
        if (opts.required && required.length) schema.required = required;
        return schema;
      }
      return infer([v], opts);
    };
    return walk(value);
  }

  return { basic, smart };
})();
