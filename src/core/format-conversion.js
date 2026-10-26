/**
 * Format conversion & export - JSON ↔ YAML, JSON → XML, CSV export
 */
Structra.formatConversion = (() => {
  const toast = (msg) => Structra.toast(msg);

  // --- YAML ---
  async function jsonToYaml(json) {
    return jsyaml.dump(json, { indent: 2, lineWidth: 120, noRefs: true });
  }

  async function yamlToJson(yamlStr) {
    return jsyaml.load(yamlStr);
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
      let t = String(key).replace(/[^A-Za-z0-9_.-]/g, '_');
      if (!/^[A-Za-z_]/.test(t)) t = '_' + t;
      return t;
    };
    // Characters XML cannot hold at all (control characters) are dropped
    const escXml = (s) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
    let usesNil = false;
    const nil = (tag) => { usesNil = true; return `<${tag} xsi:nil="true"/>`; };

    function convert(obj, indent = '') {
      if (obj === null) return `${indent}${nil('null')}`;
      if (typeof obj !== 'object') return `${indent}${escXml(String(obj))}`;

      let xml = '';
      if (Array.isArray(obj)) {
        for (const item of obj) {
          const emptyItem = item !== null && typeof item === 'object' && (Array.isArray(item) ? !item.length : !Object.keys(item).length);
          xml += item === null
            ? `${indent}${nil('item')}\n`
            : emptyItem ? `${indent}<item/>\n` : `${indent}<item>\n${convert(item, indent + '  ')}\n${indent}</item>\n`;
        }
      } else {
        for (const [key, val] of Object.entries(obj)) {
          const tag = tagOf(key);
          if (val === null) {
            xml += `${indent}${nil(tag)}\n`;
          } else if (typeof val === 'object') {
            const empty = Array.isArray(val) ? !val.length : !Object.keys(val).length;
            xml += empty ? `${indent}<${tag}/>\n` : `${indent}<${tag}>\n${convert(val, indent + '  ')}\n${indent}</${tag}>\n`;
          } else {
            xml += `${indent}<${tag}>${escXml(String(val))}</${tag}>\n`;
          }
        }
      }
      return xml.replace(/\n$/, '');
    }

    const root = tagOf(rootName);
    const body = convert(json, '  ');
    // xsi:nil needs its namespace declared, or no XML parser will read the file
    const ns = usesNil ? ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"' : '';
    return `<?xml version="1.0" encoding="UTF-8"?>\n<${root}${ns}>\n${body}\n</${root}>`;
  }

  // --- CSV ---
  function escCsv(v) {
    if (v == null) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  }

  function generateCsv(rows, columns) {
    const lines = [columns.map(c => escCsv(c)).join(',')];
    for (const row of rows) {
      lines.push(columns.map(c => escCsv(row[c])).join(','));
    }
    return lines.join('\n') + '\n';
  }

  function downloadCsv(rows, columns, filename) {
    const csv = generateCsv(rows, columns);
    Structra.sharedHelpers.download(csv, filename || 'export.csv', 'text/csv');
    toast('CSV exported');
  }

  return { jsonToYaml, yamlToJson, isYaml, jsonToXml, generateCsv, downloadCsv };
})();


