/* ============================================================
   STRUCTRA V2 — Parse JSON Schema Generator
   Structra.schemaGen — JSON Schema for the Power Automate
   "Parse JSON" action.

   API:
     Structra.schemaGen.basic(value)  → schema from the first array item only
     Structra.schemaGen.smart(value)  → schema from every array item:
                                         optional keys are left out of "required",
                                         keys that are sometimes null become anyOf [type, null],
                                         keys with mixed types become {}
   ============================================================ */

window.Structra = window.Structra || {};

Structra.schemaGen = (() => {
  const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

  function scalar(value) {
    if (value === null) return { type: 'null' };
    if (typeof value === 'string') return { type: 'string' };
    if (typeof value === 'number') return { type: Number.isInteger(value) ? 'integer' : 'number' };
    if (typeof value === 'boolean') return { type: 'boolean' };
    return {};
  }

  /* --- basic: first item decides --- */
  function basic(value) {
    if (Array.isArray(value)) {
      return { type: 'array', items: value.length ? basic(value[0]) : {} };
    }
    if (isPlainObject(value)) {
      const properties = {};
      const required = [];
      for (const [k, v] of Object.entries(value)) {
        properties[k] = basic(v);
        if (v !== null) required.push(k);
      }
      const schema = { type: 'object', properties };
      if (required.length) schema.required = required;
      return schema;
    }
    return scalar(value);
  }

  /* --- smart: every item decides --- */
  function smart(value) {
    if (Array.isArray(value)) {
      const schema = { type: 'array' };
      if (value.length) schema.items = _mergeItems(value);
      return schema;
    }
    if (isPlainObject(value)) {
      const properties = {};
      for (const [k, v] of Object.entries(value)) properties[k] = smart(v);
      return { type: 'object', properties, required: Object.keys(value) };
    }
    return scalar(value);
  }

  function _typeName(v) {
    if (v === null) return 'null';
    return Array.isArray(v) ? 'array' : typeof v;
  }

  function _mergeItems(arr) {
    const objects = arr.filter(isPlainObject);
    if (!objects.length) return smart(arr[0]);

    // Per key: how many objects have it, which types it takes, and one non-null sample
    const profile = new Map();
    for (const obj of objects) {
      for (const [k, v] of Object.entries(obj)) {
        let p = profile.get(k);
        if (!p) { p = { present: 0, types: new Set(), sample: undefined }; profile.set(k, p); }
        p.present++;
        p.types.add(_typeName(v));
        if (p.sample === undefined && v !== null) p.sample = v;
      }
    }

    const properties = {};
    const required = [];
    for (const [k, p] of profile) {
      const nonNull = [...p.types].filter((t) => t !== 'null');
      const hasNull = p.types.has('null');
      if (nonNull.length === 0) properties[k] = { type: 'null' };
      else if (nonNull.length > 1) properties[k] = {};
      else if (hasNull) properties[k] = { anyOf: [smart(p.sample), { type: 'null' }] };
      else properties[k] = smart(p.sample);
      if (p.present === objects.length) required.push(k);
    }

    const schema = { type: 'object', properties };
    if (required.length) schema.required = required;
    return schema;
  }

  return { basic, smart };
})();
