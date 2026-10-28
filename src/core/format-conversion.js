/**
 * Format conversion & export - JSON ↔ YAML, JSON → XML, CSV export
 */
Structra.formatConversion = (() => {
  const toast = (message) => Structra.toast(message);

  // --- YAML ---
  async function jsonToYaml(json) {
    return Structra.yamlIo.stringify(json);
  }

  async function yamlToJson(yamlText) {
    return Structra.yamlIo.parse(yamlText).data;
  }

  function isYaml(text) {
    const trimmed = text.trim();
    // Not JSON (doesn't start with { or [) and has YAML-like structure
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) return false;
    // Check for YAML markers or key: value patterns
    if (trimmed.startsWith('---') || trimmed.startsWith('%YAML')) return true;
    return /^[\w-]+\s*:/m.test(trimmed) && !trimmed.includes(';');
  }

  // --- XML ---
  function jsonToXml(json, rootName = 'root') {
    // A JSON key is not always a legal XML name: no spaces or symbols, and it may not start with a digit
    const tagOf = (key) => {
      let safeName = String(key).replace(/[^A-Za-z0-9_.-]/g, '_');
      if (!/^[A-Za-z_]/.test(safeName)) safeName = '_' + safeName;
      return safeName;
    };
    // Characters XML cannot hold at all (control characters) are dropped
    const escXml = (text) => text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
    let usesNil = false;
    const nil = (tag) => { usesNil = true; return `<${tag} xsi:nil="true"/>`; };

    function convert(object, indent = '') {
      if (object === null) return `${indent}${nil('null')}`;
      if (typeof object !== 'object') return `${indent}${escXml(String(object))}`;

      let xml = '';
      if (Array.isArray(object)) {
        for (const item of object) {
          const emptyItem = item !== null && typeof item === 'object' && (Array.isArray(item) ? !item.length : !Object.keys(item).length);
          xml += item === null
            ? `${indent}${nil('item')}\n`
            : emptyItem ? `${indent}<item/>\n` : `${indent}<item>\n${convert(item, indent + '  ')}\n${indent}</item>\n`;
        }
      } else {
        // Two keys can become the same name ("a b" and "a_b" are both a_b): the second one gets _2, the third _3, so no value is
        // merged into the other one when the file is read back
        const taken = new Set();
        for (const [key, value] of Object.entries(object)) {
          let tag = tagOf(key);
          if (taken.has(tag)) { let count = 2; while (taken.has(tag + '_' + count)) count++; tag = tag + '_' + count; }
          taken.add(tag);
          if (value === null) {
            xml += `${indent}${nil(tag)}\n`;
          } else if (typeof value === 'object') {
            const empty = Array.isArray(value) ? !value.length : !Object.keys(value).length;
            xml += empty ? `${indent}<${tag}/>\n` : `${indent}<${tag}>\n${convert(value, indent + '  ')}\n${indent}</${tag}>\n`;
          } else {
            xml += `${indent}<${tag}>${escXml(String(value))}</${tag}>\n`;
          }
        }
      }
      return xml.replace(/\n$/, '');
    }

    const root = tagOf(rootName);
    const body = convert(json, '  ');
    // xsi:nil needs its namespace declared, or no XML parser will read the file
    const namespaceAttribute = usesNil ? ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"' : '';
    return `<?xml version="1.0" encoding="UTF-8"?>\n<${root}${namespaceAttribute}>\n${body}\n</${root}>`;
  }

  // --- CSV ---
  /**
   * The CSV text for a list of rows. PapaParse (already in the app for reading CSV) writes it, so quoting follows the same rules
   * as the reader. Two things are ours: a nested value goes into its cell as JSON text, and escapeFormulae is always on: a text cell
   * that starts with = + - @ (or a tab or carriage return) gets a leading apostrophe, so a spreadsheet never runs it as a formula
   * (CSV injection). A real number such as -5 is not text and is left alone, and neither is a number written as text ("-5.50").
   */
  // Text that starts with = + - @ tab or carriage return, except plain numbers written as text ("-5.50", "+7"), which no spreadsheet runs
  const FORMULA_START = /^(?![+-]?\d+(\.\d+)?([eE][+-]?\d+)?$)[=+\-@\t\r]/;

  /** The one place CSV text is written: a header row and rows of cells (an array per row). Every CSV the app saves goes through here. */
  function writeCsv(columns, matrix, options = {}) {
    const cell = (value) => (value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : value);
    const newline = options.newline || '\n';
    return Papa.unparse({ fields: columns, data: matrix.map((row) => row.map(cell)) }, { newline, escapeFormulae: FORMULA_START }) + newline;
  }

  function generateCsv(rows, columns) {
    return writeCsv(columns, rows.map((row) => columns.map((column) => row[column])));
  }

  function downloadCsv(rows, columns, filename) {
    const csv = generateCsv(rows, columns);
    Structra.sharedHelpers.downloadFile(csv, filename || 'export.csv', 'text/csv');
    toast('CSV exported');
  }

  return { jsonToYaml, yamlToJson, isYaml, jsonToXml, writeCsv, generateCsv, downloadCsv };
})();


