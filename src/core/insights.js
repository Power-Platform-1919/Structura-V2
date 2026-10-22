/* ============================================================
   STRUCTRA V2 — Insights
   Structra.insights.build(...) turns the analysis of a document into the
   plain-language summary the Overview screen shows:
     - a one-sentence description of what the data is
     - a few headline figures
     - "worth a look" findings, most important first, each with a place to go
     - the biggest lists in the document
   Pure logic: no DOM, no engine calls. Give it the analysis and it answers.

   Structra.insights.build({ analysis, meta, data, duplicateKeys }) → {
     headline, facts: [{ label, value }],
     findings: [{ severity: 'high'|'med'|'info', title, detail, go: { path?, view?, drawer? } }],
     arrays: [{ path, count, sample }]
   }
   ============================================================ */

window.Structra = window.Structra || {};

Structra.insights = (() => {
  const plural = (n, one, many) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
  const SEVERITY_ORDER = { high: 0, med: 1, info: 2 };

  /** "$.body.value" → "body.value" for reading; the root stays "the document" */
  const readable = (path) => (!path || path === '$' ? 'the document' : path.replace(/^\$\.?/, ''));

  function describe(data, firstArr, profile) {
    if (Array.isArray(data) && data.length === 0) return 'An empty list.';
    if (data && typeof data === 'object' && !Array.isArray(data) && Object.keys(data).length === 0) return 'An empty object.';
    if (Array.isArray(data)) {
      if (firstArr && firstArr.path === '$') {
        const fields = profile ? plural(profile.fieldCount, 'field', 'fields') : 'fields';
        return `A list of ${plural(data.length, 'record', 'records')}, each an object with ${fields}.`;
      }
      return `A list of ${plural(data.length, 'item', 'items')}.`;
    }
    if (data && typeof data === 'object') {
      if (firstArr) {
        const fields = profile ? ` with ${plural(profile.fieldCount, 'field', 'fields')} each` : '';
        return `An object whose main list is ${readable(firstArr.path)}: ${plural(firstArr.rows.length, 'record', 'records')}${fields}.`;
      }
      return `An object with ${plural(Object.keys(data).length, 'top-level key', 'top-level keys')}.`;
    }
    return 'A single value.';
  }

  /** Does this look like a response from a connector, an HTTP action or OData? */
  function looksLikeConnector(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
    return Array.isArray(data.value) || (data.body && typeof data.body === 'object')
      || (data.d && typeof data.d === 'object') || '@odata.context' in data;
  }

  function build({ analysis, meta = {}, data, duplicateKeys = [] }) {
    const { stats: s, firstArr, profile } = analysis;
    const findings = [];

    if (duplicateKeys.length) {
      findings.push({
        severity: 'high',
        title: `${plural(duplicateKeys.length, 'repeated key', 'repeated keys')} in the file`,
        detail: 'A key that appears twice in one object keeps only the last value when the file is read.',
        go: duplicateKeys[0].path ? { path: duplicateKeys[0].path } : {},
      });
    }

    if (profile) {
      for (const issue of profile.quality.issues) {
        findings.push({
          severity: issue.severity === 'high' ? 'high' : 'med',
          title: `${issue.field}: ${issue.msg}`,
          detail: firstArr ? `In the records of ${readable(firstArr.path)}.` : '',
          go: { view: 'table', column: issue.field },
        });
      }
    }

    if (s.depth >= 10) {
      findings.push({ severity: 'med', title: `Nested ${s.depth} levels deep`, detail: 'Deep nesting makes expressions long. Flatten or pick the branch you need.', go: { view: 'tree' } });
    }

    const emptyLists = s.arraysDetail.filter((a) => a.count === 0).length;
    if (emptyLists) {
      findings.push({ severity: 'info', title: `${plural(emptyLists, 'empty list', 'empty lists')}`, detail: 'Their item shape cannot be inferred from this file.', go: { view: 'tree' } });
    }

    const biggest = s.arraysDetail.reduce((m, a) => (a.count > m.count ? a : m), { count: 0 });
    if (biggest.count >= 10000) {
      findings.push({ severity: 'info', title: `${readable(biggest.path)} has ${biggest.count.toLocaleString()} items`, detail: 'Use the table or a filter instead of scrolling the tree.', go: { view: 'table' } });
    }

    if (looksLikeConnector(data)) {
      findings.push({
        severity: 'info',
        title: 'This looks like a connector or API response',
        detail: Structra.expressions ? Structra.expressions.connectorShape(data) : '',
        go: { drawer: 'expressions' },
      });
    }

    findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

    // Lists that repeat inside every record (items[0].tags, items[1].tags ...) are one line, not dozens
    const groups = new Map();
    for (const a of s.arraysDetail) {
      if (a.count === 0) continue;
      const pattern = a.path.replace(/\[\d+\]/g, '[]');
      const g = groups.get(pattern) || { pattern, path: a.path, count: a.count, lists: 0, items: 0 };
      g.lists++;
      g.items += a.count;
      if (a.count > g.count) { g.count = a.count; g.path = a.path; }   // open the biggest one
      groups.set(pattern, g);
    }
    const arrays = [...groups.values()].sort((a, b) => b.items - a.items).slice(0, 5);

    return {
      headline: describe(data, firstArr, profile),
      facts: [
        { label: 'Size', value: Structra.util.formatBytes(meta.fileSize) },
        { label: 'Values', value: s.totalNodes.toLocaleString() },
        { label: 'Keys', value: s.keys.toLocaleString() },
        { label: 'Depth', value: String(s.depth) },
        { label: 'Lists', value: s.arrays.toLocaleString() },
        { label: 'Nulls', value: s.nulls.toLocaleString() },
      ],
      findings,
      arrays,
      quality: profile ? profile.quality : null,
    };
  }

  return { build, describe, looksLikeConnector };
})();
