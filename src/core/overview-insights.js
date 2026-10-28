/* ============================================================
   STRUCTRA V2 - Insights
   Structra.overviewInsights.build(...) turns the analysis of a document into the
   plain-language summary the Overview screen shows:
     - a one-sentence description of what the data is
     - a few headline figures
     - "worth a look" findings, most important first, each with a place to go
     - the biggest lists in the document
   Pure logic: no DOM, no engine calls. Give it the analysis and it answers.

   Structra.overviewInsights.build({ analysis, meta, data, duplicateKeys }) → {
     headline, facts: [{ label, value }],
     findings: [{ severity: 'high'|'med'|'info', title, detail, go: { path?, view?, drawer? } }],
     arrays: [{ path, count, sample }]
   }
   ============================================================ */

window.Structra = window.Structra || {};

Structra.overviewInsights = (() => {
  const plural = (count, one, many) => `${count.toLocaleString()} ${count === 1 ? one : many}`;
  const SEVERITY_ORDER = { high: 0, med: 1, info: 2 };

  /** "$.body.value" → "body.value" for reading; the root stays "the document" */
  const readable = (path) => (!path || path === '$' ? 'the document' : path.replace(/^\$\.?/, ''));

  function describe(data, firstArray, profile) {
    if (Array.isArray(data) && data.length === 0) return 'An empty list.';
    if (data && typeof data === 'object' && !Array.isArray(data) && Object.keys(data).length === 0) return 'An empty object.';
    if (Array.isArray(data)) {
      if (firstArray && firstArray.path === '$') {
        const fields = profile ? plural(profile.fieldCount, 'field', 'fields') : 'fields';
        return `A list of ${plural(data.length, 'record', 'records')}, each an object with ${fields}.`;
      }
      return `A list of ${plural(data.length, 'item', 'items')}.`;
    }
    if (data && typeof data === 'object') {
      if (firstArray) {
        const fields = profile ? ` with ${plural(profile.fieldCount, 'field', 'fields')} each` : '';
        return `An object whose main list is ${readable(firstArray.path)}: ${plural(firstArray.rows.length, 'record', 'records')}${fields}.`;
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
    const { stats, firstArr: firstArray, profile } = analysis;
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
        const empty = /null|empty|missing/i.test(issue.msg);
        findings.push({
          // An empty value is good to know, not an error: red is kept for what breaks a flow
          severity: empty ? 'info' : issue.severity === 'high' ? 'high' : 'med',
          title: `${issue.field}: ${issue.msg}`,
          // Say what to do about it: in a flow an empty value breaks an expression that does not expect it
          detail: (firstArray ? `In the records of ${readable(firstArray.path)}. ` : '')
            + (empty ? `In Power Automate, wrap it as coalesce(item()?['${issue.field}'], 'default'). The Parse JSON schema from Schema Gen already allows null here.` : ''),
          go: { view: 'table', column: issue.field },
        });
      }
    }

    if (stats.depth >= 10) {
      findings.push({ severity: 'med', title: `Nested ${stats.depth} levels deep`, detail: 'Deep nesting makes expressions long. Flatten or pick the branch you need.', go: { view: 'tree' } });
    }

    const emptyLists = stats.arraysDetail.filter((list) => list.count === 0).length;
    if (emptyLists) {
      findings.push({ severity: 'info', title: `${plural(emptyLists, 'empty list', 'empty lists')}`, detail: 'This file does not show what their items would look like.', go: { view: 'tree' } });
    }

    const biggest = stats.arraysDetail.reduce((accumulator, list) => (list.count > accumulator.count ? list : accumulator), { count: 0 });
    if (biggest.count >= 10000) {
      findings.push({ severity: 'info', title: `${readable(biggest.path)} has ${biggest.count.toLocaleString()} items`, detail: 'Use the table or a filter instead of scrolling the tree.', go: { view: 'table' } });
    }

    if (looksLikeConnector(data)) {
      findings.push({
        severity: 'info',
        title: 'This looks like a connector or API response',
        detail: Structra.powerPlatformExpressions ? Structra.powerPlatformExpressions.connectorShape(data) : '',
        go: { drawer: 'expressions' },
      });
    }

    findings.sort((first, second) => SEVERITY_ORDER[first.severity] - SEVERITY_ORDER[second.severity]);

    // Lists that repeat inside every record (items[0].tags, items[1].tags ...) are one line, not dozens
    const groups = new Map();
    for (const list of stats.arraysDetail) {
      if (list.count === 0) continue;
      const pattern = Structra.dataPaths.toPattern(list.path, '[]');
      const group = groups.get(pattern) || { pattern, path: list.path, count: list.count, lists: 0, items: 0 };
      group.lists++;
      group.items += list.count;
      if (list.count > group.count) { group.count = list.count; group.path = list.path; }   // open the biggest one
      groups.set(pattern, group);
    }
    const arrays = [...groups.values()].sort((first, second) => second.items - first.items).slice(0, 5);

    return {
      headline: describe(data, firstArray, profile),
      facts: [
        { label: 'Size', value: Structra.sharedHelpers.formatBytes(meta.fileSize) },
        { label: 'Values', value: stats.totalNodes.toLocaleString() },
        { label: 'Keys', value: stats.keys.toLocaleString() },
        { label: 'Depth', value: String(stats.depth) },
        { label: 'Lists', value: stats.arrays.toLocaleString() },
        { label: 'Nulls', value: stats.nulls.toLocaleString() },
      ],
      findings,
      arrays,
      quality: profile ? profile.quality : null,
    };
  }

  return { build, describe, looksLikeConnector };
})();
