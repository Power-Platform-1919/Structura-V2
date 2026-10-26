/* ============================================================
   STRUCTRA V2 - Parse JSON Schema Generator
   Structra.parseJsonSchemaGenerator - JSON Schema for the Power Automate
   "Parse JSON" action.

   API:
     Structra.parseJsonSchemaGenerator.basic(value, opts)  → schema from the first array item only
     Structra.parseJsonSchemaGenerator.smart(value, opts)  → schema from every item, merged:
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

Structra.parseJsonSchemaGenerator = (() => {
  const kindOf = Structra.sharedHelpers.jsonTypeOf;
  const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

  const DEFAULTS = { integers: false, required: true };

  /** A type name or a list of them: one name stays a string, several become an array */
  const typeValue = (list) => (list.length === 1 ? list[0] : list);

  function numberType(values, options) {
    return options.integers && values.every((value) => Number.isInteger(value)) ? 'integer' : 'number';
  }

  /**
   * Schema for everything seen at one place in the data.
   * `values` holds every value found there (one per row, per parent object, and so on).
   */
  function infer(values, options) {
    const seen = { string: [], number: [], boolean: [], object: [], array: [] };
    let hasNull = false;
    for (const value of values) {
      const kind = kindOf(value);
      if (kind === 'null') hasNull = true;
      else if (seen[kind]) seen[kind].push(value);
    }

    const scalarTypes = [];
    if (seen.string.length) scalarTypes.push('string');
    if (seen.number.length) scalarTypes.push(numberType(seen.number, options));
    if (seen.boolean.length) scalarTypes.push('boolean');

    const hasObject = seen.object.length > 0;
    const hasArray = seen.array.length > 0;
    if (!scalarTypes.length && !hasObject && !hasArray) return {};          // only null, or nothing seen: accept anything

    const parts = [];
    if (hasObject) parts.push(objectSchema(seen.object, options));
    if (hasArray) parts.push(arraySchema(seen.array, options));

    // One kind of value
    if (scalarTypes.length && !parts.length) return { type: typeValue(hasNull ? [...scalarTypes, 'null'] : scalarTypes) };
    if (!scalarTypes.length && parts.length === 1) {
      const only = parts[0];
      return hasNull ? { ...only, type: [only.type, 'null'] } : only;
    }

    // Several kinds, including objects or lists: list every shape
    const anyOf = [...scalarTypes.map((scalarType) => ({ type: scalarType })), ...parts];
    if (hasNull) anyOf.push({ type: 'null' });
    return { anyOf };
  }

  function objectSchema(objects, options) {
    const byKey = new Map();
    for (const object of objects) {
      for (const kind of Object.keys(object)) {
        let entry = byKey.get(kind);
        if (!entry) { entry = { present: 0, values: [] }; byKey.set(kind, entry); }
        entry.present++;
        entry.values.push(object[kind]);
      }
    }
    const properties = {};
    const required = [];
    for (const [key, entry] of byKey) {
      properties[key] = infer(entry.values, options);
      if (entry.present === objects.length) required.push(key);
    }
    const schema = { type: 'object', properties };
    if (options.required && required.length) schema.required = required;
    return schema;
  }

  function arraySchema(arrays, options) {
    const items = [];
    for (const list of arrays) for (const element of list) items.push(element);
    const schema = { type: 'array' };
    if (items.length) schema.items = infer(items, options);
    return schema;
  }

  /** The whole document: every row decides */
  function smart(value, options = {}) {
    return infer([value], { ...DEFAULTS, ...options });
  }

  /** The quick version: only the first item of each list decides */
  function basic(value, options = {}) {
    const schemaOptions = { ...DEFAULTS, ...options };
    const walk = (value) => {
      if (Array.isArray(value)) return value.length ? { type: 'array', items: walk(value[0]) } : { type: 'array' };
      if (isPlainObject(value)) {
        const properties = {};
        const required = [];
        for (const [kind, child] of Object.entries(value)) {
          properties[kind] = walk(child);
          if (child !== null) required.push(kind);
        }
        const schema = { type: 'object', properties };
        if (schemaOptions.required && required.length) schema.required = required;
        return schema;
      }
      return infer([value], schemaOptions);
    };
    return walk(value);
  }

  return { basic, smart };
})();
