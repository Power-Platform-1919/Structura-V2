/**
 * Code Generator - generate typed code from JSON in multiple languages
 */
Structra.typeCodeGenerator = (() => {

  const { snakeCase } = Structra.sharedHelpers;

  /**
   * The generators below read one example of each record. To be right for every record, a list is first
   * reduced to one merged example: each field takes its first real value (so a field that is empty in
   * the first record but "HR" in the second is a string), and a field that is null or missing in any record
   * is remembered as nullable under NULLABLE.
   */
  const NULLABLE = Symbol('nullable');
  const isNullable = (parent, key, value) => value === null || !!(parent && parent[NULLABLE] && parent[NULLABLE].has(key));
  const isPlain = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

  /**
   * Names in generated code must be valid in that language, whatever the JSON key looks like
   * ('@odata.context', 'first name', '1st'). The JSON key itself is kept in an attribute, tag or comment.
   */
  const words = (key) => String(key).replace(/[^A-Za-z0-9_\s-]+/g, ' ').trim() || 'field';
  const lead = (id) => (/^[0-9]/.test(id) ? '_' + id : id);
  const parts = (key) => words(key).split(/[\s_-]+/).filter(Boolean);
  const upFirst = (word) => word.charAt(0).toUpperCase() + word.slice(1);
  const pascalIdent = (key) => parts(key).map(upFirst).join('');
  const camelIdent = (key) => { const wordParts = parts(key); return wordParts.map((word, i) => (i === 0 ? word.charAt(0).toLowerCase() + word.slice(1) : upFirst(word))).join(''); };
  const typeName = (key) => lead(pascalIdent(key));

  /** One number that stands for all of them: a decimal if any is, else the biggest, else the first */
  function widestNumber(numbers) {
    const decimal = numbers.find((item) => !Number.isInteger(item) || !Number.isSafeInteger(item));
    if (decimal !== undefined) return Number.isInteger(decimal) ? 0.5 : decimal;
    return numbers.reduce((biggest, item) => (Math.abs(item) > Math.abs(biggest) ? item : biggest), numbers[0]);
  }

  function mergeRecords(records) {
    const out = {};
    const nullable = new Set();
    const keys = [];
    records.forEach((record) => Object.keys(record).forEach((key) => { if (!keys.includes(key)) keys.push(key); }));
    for (const key of keys) {
      const values = records.map((record) => record[key]);
      if (values.some((value) => value === null || value === undefined)) nullable.add(key);
      const real = values.filter((value) => value !== null && value !== undefined);
      if (!real.length) out[key] = null;
      else if (real.every(isPlain)) out[key] = mergeRecords(real.map((record) => record));
      else if (real.every(Array.isArray)) out[key] = normalize(real.flat());
      else if (real.every((item) => typeof item === 'number')) out[key] = widestNumber(real);
      else out[key] = real[0];
    }
    out[NULLABLE] = nullable;
    return out;
  }

  function normalize(value) {
    if (Array.isArray(value)) {
      const records = value.filter(isPlain);
      if (records.length) return [mergeRecords(records)];
      const nested = value.filter(Array.isArray);
      if (nested.length) return [normalize(nested.flat())];
      return value.length ? [value.find((x) => x !== null && x !== undefined) ?? null] : value;
    }
    if (isPlain(value)) {
      const out = {};
      for (const [key, x] of Object.entries(value)) out[key] = normalize(x);
      return out;
    }
    return value;
  }

  // ---- the shared way to name things -------------------------------------------------------------------------------------------------
  // Every language below is built by buildTypes() with a small description of the language (an "adapter"). The walk, the naming and the
  // checks are written once: a class name is never used twice, a field name is never used twice in one class, a reserved word or a name
  // of the language's own types is never taken, and a key is written into a string of the language only after it is escaped.

  /** A key inside a double-quoted string of any of these languages: JSON escaping, and the three line separators C# and others also count */
  const quotedInner = (key) => JSON.stringify(String(key)).slice(1, -1).replace(/[\u2028\u2029\u0085]/g, (character) => '\\u' + character.charCodeAt(0).toString(16).padStart(4, '0'));

  /** Rust writes a code point as \u{...}; a lone surrogate cannot be written at all */
  function rustInner(key) {
    let out = '';
    for (const character of String(key)) {
      const code = character.codePointAt(0);
      if (character === '"') out += '\\"';
      else if (character === '\\') out += '\\\\';
      else if (character === '\n') out += '\\n';
      else if (character === '\r') out += '\\r';
      else if (character === '\t') out += '\\t';
      else if (code >= 0xD800 && code <= 0xDFFF) out += '\\u{FFFD}';
      else if (code < 0x20 || code === 0x7F || code === 0x85 || code === 0x2028 || code === 0x2029) out += '\\u{' + code.toString(16) + '}';
      else out += character;
    }
    return out;
  }

  const KEYWORDS = {
    python: ['False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue', 'def', 'del', 'elif', 'else', 'except', 'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield', 'match', 'case', 'type', '_'],
    rust: ['Self', 'abstract', 'as', 'async', 'await', 'become', 'box', 'break', 'const', 'continue', 'crate', 'do', 'dyn', 'else', 'enum', 'extern', 'false', 'final', 'fn', 'for', 'gen', 'if', 'impl', 'in', 'let', 'loop', 'macro', 'match', 'mod', 'move', 'mut', 'override', 'priv', 'pub', 'ref', 'return', 'self', 'static', 'struct', 'super', 'trait', 'true', 'try', 'type', 'typeof', 'unsafe', 'unsized', 'use', 'virtual', 'where', 'while', 'yield', '_'],
    java: ['_', 'abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char', 'class', 'const', 'continue', 'default', 'do', 'double', 'else', 'enum', 'extends', 'false', 'final', 'finally', 'float', 'for', 'goto', 'if', 'implements', 'import', 'instanceof', 'int', 'interface', 'long', 'native', 'new', 'non-sealed', 'null', 'package', 'permits', 'private', 'protected', 'public', 'record', 'return', 'sealed', 'short', 'static', 'strictfp', 'super', 'switch', 'synchronized', 'this', 'throw', 'throws', 'transient', 'true', 'try', 'var', 'void', 'volatile', 'while', 'yield'],
    csharp: [],
    go: [],
    typescript: [],
  };
  // Names the language or the generated file itself already uses for types: a class with one of these names would take their place
  const RESERVED_TYPES = {
    typescript: ['Array', 'Object', 'String', 'Number', 'Boolean', 'Date', 'Promise', 'Record', 'Map', 'Set', 'Function', 'Symbol', 'Error', 'Partial', 'Readonly', 'Pick', 'Omit', 'RegExp', 'JSON', 'Math', 'BigInt', 'Infinity', 'NaN'],
    python: ['List', 'Optional', 'Any', 'dataclass', 'None', 'True', 'False', 'annotations'],
    csharp: ['List', 'Task', 'Dictionary', 'JsonPropertyName', 'JsonSerializer', 'Object', 'String', 'Int32', 'Int64', 'Double', 'Boolean', 'Nullable', 'Action', 'Func', 'Type', 'Attribute', 'Exception', 'Math', 'Console', 'Convert', 'Guid', 'DateTime', 'TimeSpan', 'Array', 'Enum'],
    go: [],
    rust: ['Option', 'Vec', 'String', 'Box', 'Result', 'Value', 'Serialize', 'Deserialize', 'Debug', 'Default', 'Self', 'Some', 'None', 'Ok', 'Err', 'Clone', 'Copy', 'Send', 'Sync', 'Drop', 'Fn', 'Iterator', 'Vec', 'Sized'],
    java: ['List', 'String', 'Object', 'Integer', 'Long', 'Double', 'Boolean', 'JsonProperty', 'Override', 'Math', 'System', 'Class', 'Number', 'Character', 'Byte', 'Short', 'Float', 'Void', 'Enum', 'Record', 'Thread', 'Runnable', 'Iterable', 'Comparable'],
  };
  // Members every object has: a field with such a name would hide or clash with them
  const RESERVED_MEMBERS = { csharp: ['Equals', 'GetHashCode', 'ToString', 'GetType', 'Finalize', 'MemberwiseClone', 'ReferenceEquals'], java: [], rust: [], python: [], go: [], typescript: [] };

  /** A number a language's plain integer type can hold? The others are written as the wide type or as a decimal */
  const INT32_LIMIT = 2147483647;
  function numberKind(number) {
    if (!Number.isFinite(number) || !Number.isInteger(number) || !Number.isSafeInteger(number)) return 'decimal';
    return Math.abs(number) > INT32_LIMIT ? 'long' : 'int';
  }

  function buildTypes(value, rootName, adapter) {
    const usedTypes = new Set(RESERVED_TYPES[adapter.lang] || []);
    const keywords = new Set(KEYWORDS[adapter.lang] || []);
    const blocks = [];

    function claimType(base) {
      let name = lead(adapter.typeLead ? adapter.typeLead(base) : base) || 'Item';
      if (usedTypes.has(name)) { let count = 2; while (usedTypes.has(name + count)) count++; name += count; }
      usedTypes.add(name);
      return name;
    }

    function fieldScope(ownerName) {
      const taken = new Set(RESERVED_MEMBERS[adapter.lang] || []);
      if (adapter.memberNotOwnerName) taken.add(ownerName);
      return (key) => {
        let identifier = adapter.ident(key);
        if (!identifier) identifier = adapter.emptyName || 'field';
        if (/^[0-9]/.test(identifier)) identifier = adapter.digitLead + identifier;
        if (keywords.has(identifier)) identifier += '_';
        if (taken.has(identifier)) { let count = 2; while (taken.has(identifier + '_' + count)) count++; identifier += '_' + count; }
        taken.add(identifier);
        return identifier;
      };
    }

    function walk(current, hint) {
      if (Array.isArray(current)) {
        if (!current.length) return adapter.emptyList();
        return adapter.list(walk(current[0], hint + 'Item'));
      }
      if (isPlain(current)) {
        const own = claimType(hint);
        const claim = fieldScope(own);
        const fields = [];
        for (const [key, fieldValue] of Object.entries(current)) {
          const type = walk(fieldValue, typeName(key));
          fields.push(adapter.field(claim(key), key, type, isNullable(current, key, fieldValue)));
        }
        blocks.push(adapter.block(own, fields));
        return own;
      }
      return adapter.primitive(current);
    }

    walk(value, rootName);
    return blocks.length ? (adapter.header || '') + blocks.reverse().join('\n\n') : '';
  }

  // === TypeScript ===
  function toTypeScript(value, name = 'Root') {
    return buildTypes(value, name, {
      lang: 'typescript',
      ident: (key) => key,
      digitLead: '',
      emptyList: () => 'any[]',
      list: (inner) => `${inner}[]`,
      primitive: (sample) => (sample === null ? 'null' : typeof sample === 'string' ? 'string' : typeof sample === 'number' ? 'number' : typeof sample === 'boolean' ? 'boolean' : 'any'),
      // a property of an interface can have any name when it is written as a string
      field: (identifier, key, type, nullable) => `  ${/^[A-Za-z_$][\w$]*$/.test(key) ? key : "'" + quotedInner(key).split('\\"').join('"').split("'").join("\\'") + "'"}: ${type}${nullable && type !== 'null' ? ' | null' : ''};`,
      block: (own, fields) => `interface ${own} {\n${fields.join('\n')}\n}`,
    });
  }

  // === Python (dataclass) ===
  function toPython(value, name = 'Root') {
    const python = {
      lang: 'python',
      // "from __future__ import annotations" lets a class name another one that comes later in the file
      header: 'from __future__ import annotations\nfrom dataclasses import dataclass\nfrom typing import List, Optional, Any\n\n',
      ident: (key) => parts(key).map((word) => snakeCase(word)).join('_'),
      digitLead: '_',
      emptyList: () => 'List[Any]',
      list: (inner) => `List[${inner}]`,
      primitive: (sample) => (sample === null ? 'None' : typeof sample === 'string' ? 'str' : typeof sample === 'number' ? (Number.isInteger(sample) ? 'int' : 'float') : typeof sample === 'boolean' ? 'bool' : 'Any'),
      field: (identifier, key, type, nullable) => `    ${identifier}: ${nullable && type !== 'None' ? `Optional[${type}]` : type}${identifier === key ? '' : '  # JSON key: "' + quotedInner(key) + '"'}`,
      block: (own, fields) => `@dataclass\nclass ${own}:\n${fields.length ? fields.join('\n') : '    pass'}`,
    };
    return buildTypes(value, name, python);
  }

  // === C# ===
  function toCSharp(value, name = 'Root') {
    return buildTypes(value, name, {
      lang: 'csharp',
      header: '#nullable enable\nusing System.Collections.Generic;\nusing System.Text.Json.Serialization;\n\n',
      ident: (key) => pascalIdent(key),
      digitLead: '_',
      memberNotOwnerName: true,
      emptyList: () => 'List<object>',
      list: (inner) => `List<${inner}>`,
      primitive: (sample) => (sample === null ? 'object' : typeof sample === 'string' ? 'string' : typeof sample === 'number' ? ({ int: 'int', long: 'long', decimal: 'double' })[numberKind(sample)] : typeof sample === 'boolean' ? 'bool' : 'object'),
      // System.Text.Json matches names exactly (name is not Name), so every property says its JSON key
      field: (identifier, key, type, nullable) => `    [JsonPropertyName("${quotedInner(key)}")]\n    public ${type}${nullable ? '?' : ''} ${identifier} { get; set; }`,
      block: (own, fields) => `public class ${own}\n{\n${fields.join('\n')}\n}`,
    });
  }

  // === Go ===
  function toGo(value, name = 'Root') {
    return buildTypes(value, name, {
      lang: 'go',
      // a name that starts with a digit or an underscore would not be exported, and the JSON reader skips fields that are not exported
      typeLead: (base) => (/^[0-9_]/.test(base) ? 'X' + base.replace(/^_+/, '') : base),
      ident: (key) => pascalIdent(key),
      digitLead: 'X',
      emptyName: 'Field',      // a Go field must start with a capital letter to be exported
      emptyList: () => '[]interface{}',
      list: (inner) => `[]${inner}`,
      primitive: (sample) => (sample === null ? 'interface{}' : typeof sample === 'string' ? 'string' : typeof sample === 'number' ? ({ int: 'int', long: 'int64', decimal: 'float64' })[numberKind(sample)] : typeof sample === 'boolean' ? 'bool' : 'interface{}'),
      field: (identifier, key, type, nullable) => {
        const tag = 'json:"' + quotedInner(key) + '"';
        // a backtick cannot be inside a raw string: then the tag is written as an ordinary string
        const literal = key.includes('`') ? '"' + tag.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"' : '`' + tag + '`';
        return `\t${identifier} ${nullable && type !== 'interface{}' ? '*' : ''}${type} ${literal}`;
      },
      block: (own, fields) => (fields.length ? `type ${own} struct {\n${fields.join('\n')}\n}` : `type ${own} struct{}`),
    });
  }

  // === Rust ===
  function toRust(value, name = 'Root') {
    return buildTypes(value, name, {
      lang: 'rust',
      header: 'use serde::{Serialize, Deserialize};\n\n',
      ident: (key) => parts(key).map((word) => snakeCase(word)).join('_'),
      digitLead: '_',
      emptyList: () => 'Vec<serde_json::Value>',
      list: (inner) => `Vec<${inner}>`,
      primitive: (sample) => (sample === null ? 'serde_json::Value' : typeof sample === 'string' ? 'String' : typeof sample === 'number' ? (numberKind(sample) === 'decimal' ? 'f64' : 'i64') : typeof sample === 'boolean' ? 'bool' : 'serde_json::Value'),
      field: (identifier, key, type, nullable) => (identifier === key ? '' : `    #[serde(rename = "${rustInner(key)}")]\n`) + `    pub ${identifier}: ${nullable && type !== 'serde_json::Value' ? `Option<${type}>` : type},`,
      block: (own, fields) => `#[derive(Debug, Serialize, Deserialize)]\npub struct ${own} {${fields.length ? '\n' + fields.join('\n') + '\n' : ''}}`,
    });
  }

  // === Java ===
  function toJava(value, name = 'Root') {
    const boxed = { int: 'Integer', long: 'Long', double: 'Double', boolean: 'Boolean' };
    return buildTypes(value, name, {
      lang: 'java',
      // none of the classes is public, so all of them can stay in one file; make one public by moving it to a file of its own name
      header: 'import java.util.List;\nimport com.fasterxml.jackson.annotation.JsonProperty;\n\n',
      ident: (key) => camelIdent(key),
      digitLead: '_',
      emptyList: () => 'List<Object>',
      // inside List<...> a plain number type is written as its object type
      list: (inner) => `List<${boxed[inner] || inner}>`,
      primitive: (sample) => (sample === null ? 'Object' : typeof sample === 'string' ? 'String' : typeof sample === 'number' ? ({ int: 'int', long: 'long', decimal: 'double' })[numberKind(sample)] : typeof sample === 'boolean' ? 'boolean' : 'Object'),
      // a field that can be empty cannot be a plain int, double or boolean; the reader needs the key on every field (private fields have no getters)
      field: (identifier, key, type, nullable) => `    @JsonProperty("${quotedInner(key)}")\n    private ${nullable ? boxed[type] || type : type} ${identifier};`,
      block: (own, fields) => `class ${own} {${fields.length ? '\n' + fields.join('\n') + '\n' : ''}}`,
    });
  }

  // === Power Fx UDT ===
  function toPowerFx(value) {
    const body = buildFxUDTInline(value, 2);
    return `RootType :=\n    Type(\n${body}\n    );\n`;
  }

  function buildFxUDTInline(object, indent) {
    const pad = '    '.repeat(indent);
    if (Array.isArray(object)) {
      if (object.length === 0) {
        return `${pad}[\n${pad}    {\n${pad}        Value: Text\n${pad}    }\n${pad}]`;
      } else if (typeof object[0] === 'object' && object[0] !== null) {
        const inner = buildFxRecordFields(object[0], indent + 2);
        return `${pad}[\n${pad}    {\n${inner}\n${pad}    }\n${pad}]`;
      } else {
        return `${pad}[\n${pad}    {\n${pad}        Value: ${fxType(object[0])}\n${pad}    }\n${pad}]`;
      }
    } else if (object && typeof object === 'object') {
      const inner = buildFxRecordFields(object, indent + 1);
      return `${pad}{\n${inner}\n${pad}}`;
    }
    return `${pad}${fxType(object)}`;
  }

  function buildFxRecordFields(object, indent) {
    const pad = '    '.repeat(indent);
    const entries = Object.entries(object);
    const lines = [];
    for (const [key, value] of entries) {
      const safe = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key) ? key : `'${key}'`;
      if (Array.isArray(value)) {
        if (value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
          const inner = buildFxRecordFields(value[0], indent + 2);
          lines.push(`${pad}${safe}: [\n${pad}    {\n${inner}\n${pad}    }\n${pad}]`);
        } else {
          const valType = value.length > 0 ? fxType(value[0]) : 'Text';
          lines.push(`${pad}${safe}: [{ Value: ${valType} }]`);
        }
      } else if (value && typeof value === 'object') {
        const inner = buildFxRecordFields(value, indent + 1);
        lines.push(`${pad}${safe}: {\n${inner}\n${pad}}`);
      } else {
        lines.push(`${pad}${safe}: ${fxType(value)}`);
      }
    }
    return lines.join(',\n');
  }

  function fxType(value) {
    if (value === null) return 'Text';
    if (typeof value === 'string') return 'Text';
    if (typeof value === 'number') return 'Number';
    if (typeof value === 'boolean') return 'Boolean';
    return 'Text';
  }

  // === SQL DDL ===
  function toSQL(value, name = 'Root') {
    const tableName = snakeCase(name);
    // Normalise input: if object, wrap in array; if array of primitives, skip
    let rows;
    if (Array.isArray(value)) {
      rows = value.filter(record => record && typeof record === 'object' && !Array.isArray(record));
      if (rows.length === 0) return `-- Cannot generate SQL: array does not contain objects`;
    } else if (value && typeof value === 'object') {
      rows = [value];
    } else {
      return `-- Cannot generate SQL from primitive value`;
    }

    // Collect all columns across all rows
    const colSet = new Map();
    for (const row of rows) {
      for (const [key, value] of Object.entries(row)) {
        if (!colSet.has(key)) colSet.set(key, inferSqlType(value));
        else {
          const existing = colSet.get(key);
          const newType = inferSqlType(value);
          if (existing !== newType && value !== null) colSet.set(key, mergeSqlTypes(existing, newType));
        }
      }
    }

    const columns = [...colSet.entries()];
    const lines = columns.map(([column, type]) => `  ${sqlIdent(column)} ${type}`);
    let ddl = `CREATE TABLE ${sqlIdent(tableName)} (\n${lines.join(',\n')}\n);\n`;

    // INSERT statements
    if (rows.length <= 200) {
      const colNames = columns.map(column => sqlIdent(column[0]));
      ddl += `\nINSERT INTO ${sqlIdent(tableName)} (${colNames.join(', ')})\nVALUES\n`;
      const valueRows = rows.map(row => {
        const values = columns.map(([column]) => sqlLiteral(row[column]));
        return `  (${values.join(', ')})`;
      });
      ddl += valueRows.join(',\n') + ';\n';
    } else {
      ddl += `\n-- ${rows.length} rows (INSERT statements omitted for large datasets)\n`;
    }

    return ddl;
  }

  function inferSqlType(value) {
    if (value === null || value === undefined) return 'TEXT';
    if (typeof value === 'boolean') return 'BOOLEAN';
    if (typeof value === 'number') return Number.isInteger(value) ? 'INTEGER' : 'REAL';
    if (typeof value === 'string') {
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return 'TIMESTAMP';
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'DATE';
      if (value.length > 255) return 'TEXT';
      return 'VARCHAR(255)';
    }
    if (Array.isArray(value) || typeof value === 'object') return 'JSONB';
    return 'TEXT';
  }

  function mergeSqlTypes(first, second) {
    if (first === second) return first;
    const rank = { BOOLEAN: 1, INTEGER: 2, REAL: 3, DATE: 4, TIMESTAMP: 5, 'VARCHAR(255)': 6, TEXT: 7, JSONB: 8 };
    return (rank[first] || 99) >= (rank[second] || 99) ? first : second;
  }

  function sqlIdent(name) {
    return /^[a-zA-Z_]\w*$/.test(name) ? name : `"${name.replace(/"/g, '""')}"`;
  }

  function sqlLiteral(value) {
    if (value === null || value === undefined) return 'NULL';
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
    if (typeof value === 'number') return String(value);
    if (typeof value === 'object') return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
    return `'${String(value).replace(/'/g, "''")}'`;
  }

  const generators = {
    typescript: { label: 'TypeScript', fn: toTypeScript, ext: 'ts' },
    python: { label: 'Python', fn: toPython, ext: 'py' },
    csharp: { label: 'C#', fn: toCSharp, ext: 'cs' },
    go: { label: 'Go', fn: toGo, ext: 'go' },
    rust: { label: 'Rust', fn: toRust, ext: 'rs' },
    java: { label: 'Java', fn: toJava, ext: 'java' },
    powerfx: { label: 'Power Fx', fn: toPowerFx, ext: 'fx' },
    sql: { label: 'SQL DDL', fn: toSQL, ext: 'sql' },
  };

  // Aliases for short tab IDs
  const aliases = { ts: 'typescript' };

  function generate(lang, value, name) {
    const key = aliases[lang] || lang;
    const gen = generators[key];
    if (!gen) return '';
    return gen.fn(normalize(value), name || 'Root');
  }

  function getLanguages() {
    return Object.entries(generators).map(([id, value]) => ({ id, label: value.label }));
  }

  return { generate, getLanguages, generators };
})();
