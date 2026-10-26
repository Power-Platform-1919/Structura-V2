/**
 * Format conversion & export - JSON ↔ YAML, JSON → XML, CSV export
 */
Structra.formatConversion = (() => {
  const toast = (message) => Structra.toast(message);

  // --- YAML ---
  async function jsonToYaml(json) {
    return jsyaml.dump(json, { indent: 2, lineWidth: 120, noRefs: true });
  }

  async function yamlToJson(yamlText) {
    return jsyaml.load(yamlText);
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
        for (const [key, value] of Object.entries(object)) {
          const tag = tagOf(key);
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
  function escCsv(value) {
    if (value == null) return '';
    const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
    return text.includes(',') || text.includes('"') || text.includes('\n') ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function generateCsv(rows, columns) {
    const lines = [columns.map(column => escCsv(column)).join(',')];
    for (const row of rows) {
      lines.push(columns.map(column => escCsv(row[column])).join(','));
    }
    return lines.join('\n') + '\n';
  }

  function downloadCsv(rows, columns, filename) {
    const csv = generateCsv(rows, columns);
    Structra.sharedHelpers.downloadFile(csv, filename || 'export.csv', 'text/csv');
    toast('CSV exported');
  }

  return { jsonToYaml, yamlToJson, isYaml, jsonToXml, generateCsv, downloadCsv };
})();


