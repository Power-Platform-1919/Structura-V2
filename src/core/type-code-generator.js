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
  const escapeQuotes = (key) => String(key).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const KEYWORDS = {
    python: new Set(['and', 'as', 'class', 'def', 'del', 'else', 'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'not', 'or', 'pass', 'return', 'try', 'while', 'with', 'yield', 'None', 'True', 'False']),
    rust: new Set(['as', 'break', 'const', 'continue', 'crate', 'else', 'enum', 'extern', 'false', 'fn', 'for', 'if', 'impl', 'in', 'let', 'loop', 'match', 'mod', 'move', 'mut', 'pub', 'ref', 'return', 'self', 'Self', 'static', 'struct', 'super', 'trait', 'true', 'type', 'unsafe', 'use', 'where', 'while', 'async', 'await', 'dyn']),
    java: new Set(['abstract', 'boolean', 'break', 'byte', 'case', 'catch', 'char', 'class', 'const', 'continue', 'default', 'do', 'double', 'else', 'enum', 'extends', 'final', 'finally', 'float', 'for', 'goto', 'if', 'implements', 'import', 'instanceof', 'int', 'interface', 'long', 'native', 'new', 'package', 'private', 'protected', 'public', 'return', 'short', 'static', 'super', 'switch', 'synchronized', 'this', 'throw', 'throws', 'transient', 'try', 'void', 'volatile', 'while']),
  };
  const noKeyword = (lang, id) => (KEYWORDS[lang] && KEYWORDS[lang].has(id) ? id + '_' : id);
  const tsKey = (key) => (/^[A-Za-z_$][\w$]*$/.test(key) ? key : "'" + String(key).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'");
  const parts = (key) => words(key).split(/[\s_-]+/).filter(Boolean);
  const upFirst = (word) => word.charAt(0).toUpperCase() + word.slice(1);
  const pascalIdent = (key) => parts(key).map(upFirst).join('');
  const camelIdent = (key) => { const wordParts = parts(key); return wordParts.map((word, i) => (i === 0 ? word.charAt(0).toLowerCase() + word.slice(1) : upFirst(word))).join(''); };
  const snakeIdent = (key) => parts(key).map((word) => snakeCase(word)).join('_');
  const typeName = (key) => lead(pascalIdent(key));

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

  // === TypeScript ===
  function toTypeScript(value, name = 'Root') {
    const interfaces = [];

    function walk(value, interfaceName) {
      if (Array.isArray(value)) {
        if (value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
          walk(value[0], interfaceName + 'Item');
          return `${interfaceName}Item[]`;
        }
        if (value.length > 0) return inferTsType(value[0]) + '[]';
        return 'any[]';
      }
      if (value && typeof value === 'object') {
        const fields = [];
        for (const [key, val] of Object.entries(value)) {
          const type = walk(val, typeName(key));
          // A field that can be empty reads "T | null": it is there, but may hold nothing
          const orNull = isNullable(value, key, val) && type !== 'null' ? ' | null' : '';
          fields.push(`  ${tsKey(key)}: ${type}${orNull};`);
        }
        interfaces.push(`interface ${interfaceName} {\n${fields.join('\n')}\n}`);
        return interfaceName;
      }
      return inferTsType(value);
    }

    function inferTsType(value) {
      if (value === null) return 'null';
      if (typeof value === 'string') return 'string';
      if (typeof value === 'number') return Number.isInteger(value) ? 'number' : 'number';
      if (typeof value === 'boolean') return 'boolean';
      return 'any';
    }

    walk(value, name);
    return interfaces.reverse().join('\n\n');
  }

  // === Python (dataclass) ===
  function toPython(value, name = 'Root') {
    const classes = [];

    function walk(value, className) {
      if (Array.isArray(value)) {
        if (value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
          walk(value[0], className + 'Item');
          return `List[${className}Item]`;
        }
        if (value.length > 0) return `List[${pyType(value[0])}]`;
        return 'List[Any]';
      }
      if (value && typeof value === 'object') {
        const fields = [];
        for (const [key, val] of Object.entries(value)) {
          const type = walk(val, typeName(key));
          const optional = isNullable(value, key, val) ? `Optional[${type}]` : type;
          const pyName = noKeyword('python', lead(snakeIdent(key)));
          fields.push(`    ${pyName}: ${isNullable(value, key, val) ? optional : type}${pyName === key ? '' : '  # JSON key: "' + escapeQuotes(key) + '"'}`);
        }
        classes.push(`@dataclass\nclass ${className}:\n${fields.join('\n')}`);
        return className;
      }
      return pyType(value);
    }

    function pyType(value) {
      if (value === null) return 'None';
      if (typeof value === 'string') return 'str';
      if (typeof value === 'number') return Number.isInteger(value) ? 'int' : 'float';
      if (typeof value === 'boolean') return 'bool';
      return 'Any';
    }

    walk(value, name);
    return 'from dataclasses import dataclass\nfrom typing import List, Optional, Any\n\n' + classes.reverse().join('\n\n');
  }

  // === C# ===
  function toCSharp(value, name = 'Root') {
    const classes = [];

    function walk(value, className) {
      if (Array.isArray(value)) {
        if (value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
          walk(value[0], className + 'Item');
          return `List<${className}Item>`;
        }
        if (value.length > 0) return `List<${csType(value[0])}>`;
        return 'List<object>';
      }
      if (value && typeof value === 'object') {
        const properties = [];
        for (const [key, val] of Object.entries(value)) {
          const type = walk(val, typeName(key));
          const nullable = isNullable(value, key, val) ? '?' : '';
          const csName = typeName(key);
          properties.push((csName === key ? '' : '    [JsonPropertyName("' + escapeQuotes(key) + '")]\n') + `    public ${type}${nullable} ${csName} { get; set; }`);
        }
        classes.push(`public class ${className}\n{\n${properties.join('\n')}\n}`);
        return className;
      }
      return csType(value);
    }

    function csType(value) {
      if (value === null) return 'object';
      if (typeof value === 'string') return 'string';
      if (typeof value === 'number') return Number.isInteger(value) ? 'int' : 'double';
      if (typeof value === 'boolean') return 'bool';
      return 'object';
    }

    walk(value, name);
    return 'using System.Text.Json.Serialization;\n\n' + classes.reverse().join('\n\n');
  }

  // === Go ===
  function toGo(value, name = 'Root') {
    const structs = [];

    function walk(value, structName) {
      if (Array.isArray(value)) {
        if (value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
          walk(value[0], structName + 'Item');
          return `[]${structName}Item`;
        }
        if (value.length > 0) return `[]${goType(value[0])}`;
        return '[]interface{}';
      }
      if (value && typeof value === 'object') {
        const fields = [];
        for (const [key, val] of Object.entries(value)) {
          const type = walk(val, typeName(key));
          const pointer = isNullable(value, key, val) ? '*' : '';
          fields.push(`\t${typeName(key)} ${pointer}${type} \`json:"${escapeQuotes(key)}"\``);
        }
        structs.push(`type ${structName} struct {\n${fields.join('\n')}\n}`);
        return structName;
      }
      return goType(value);
    }

    function goType(value) {
      if (value === null) return 'interface{}';
      if (typeof value === 'string') return 'string';
      if (typeof value === 'number') return Number.isInteger(value) ? 'int' : 'float64';
      if (typeof value === 'boolean') return 'bool';
      return 'interface{}';
    }

    walk(value, name);
    return structs.reverse().join('\n\n');
  }

  // === Rust ===
  function toRust(value, name = 'Root') {
    const structs = [];

    function walk(value, structName) {
      if (Array.isArray(value)) {
        if (value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
          walk(value[0], structName + 'Item');
          return `Vec<${structName}Item>`;
        }
        if (value.length > 0) return `Vec<${rustType(value[0])}>`;
        return 'Vec<serde_json::Value>';
      }
      if (value && typeof value === 'object') {
        const fields = [];
        for (const [key, val] of Object.entries(value)) {
          const type = walk(val, typeName(key));
          const option = isNullable(value, key, val) ? `Option<${type}>` : type;
          const rsName = noKeyword('rust', lead(snakeIdent(key)));
          fields.push((rsName === key ? '' : '    #[serde(rename = "' + escapeQuotes(key) + '")]\n') + `    pub ${rsName}: ${isNullable(value, key, val) ? option : type},`);
        }
        structs.push(`#[derive(Debug, Serialize, Deserialize)]\npub struct ${structName} {\n${fields.join('\n')}\n}`);
        return structName;
      }
      return rustType(value);
    }

    function rustType(value) {
      if (value === null) return 'serde_json::Value';
      if (typeof value === 'string') return 'String';
      if (typeof value === 'number') return Number.isInteger(value) ? 'i64' : 'f64';
      if (typeof value === 'boolean') return 'bool';
      return 'serde_json::Value';
    }

    walk(value, name);
    return 'use serde::{Serialize, Deserialize};\n\n' + structs.reverse().join('\n\n');
  }

  // === Java ===
  function toJava(value, name = 'Root') {
    const classes = [];

    function walk(value, className) {
      if (Array.isArray(value)) {
        if (value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
          walk(value[0], className + 'Item');
          return `List<${className}Item>`;
        }
        if (value.length > 0) return `List<${javaType(value[0], true)}>`;
        return 'List<Object>';
      }
      if (value && typeof value === 'object') {
        const fields = [];
        for (const [key, val] of Object.entries(value)) {
          const type = walk(val, typeName(key));
          const jName = noKeyword('java', lead(camelIdent(key)));
          fields.push((jName === key ? '' : '    @JsonProperty("' + escapeQuotes(key) + '")\n') + `    private ${type} ${jName};`);
        }
        classes.push(`public class ${className} {\n${fields.join('\n')}\n}`);
        return className;
      }
      return javaType(value, false);
    }

    function javaType(value, boxed) {
      if (value === null) return 'Object';
      if (typeof value === 'string') return 'String';
      if (typeof value === 'number') return Number.isInteger(value) ? (boxed ? 'Integer' : 'int') : (boxed ? 'Double' : 'double');
      if (typeof value === 'boolean') return boxed ? 'Boolean' : 'boolean';
      return 'Object';
    }

    walk(value, name);
    return 'import java.util.List;\nimport com.fasterxml.jackson.annotation.JsonProperty;\n\n' + classes.reverse().join('\n\n');
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
