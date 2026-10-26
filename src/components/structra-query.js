/* ============================================================
   STRUCTRA V2 - Query Panel Component
   <structra-query> - query/filter panel (path/jsonpath/regex/js)

   Wiring (generated from the code below; update it when you add or remove an event):
     Listens to: query:show-tab, tabs:switched, tabs:closed, engine:ingested,
          state:queryPanelOpen, state:jsonData
     Emits: pivot:open, query:tab-switched, tree:navigate-path
     Sets state: queryPanelOpen, activeView, currentPath
   ============================================================ */

class StructraQuery extends StructraElement {
  static get observedAttributes() { return ['mode']; }

  /** What each mode is for, with an example that works on most documents */
  static get MODE_NAMES() { return { path: 'Path', jsonpath: 'JSONPath', regex: 'Pattern', js: 'JavaScript' }; }

  static get MODE_HELP() {
    return {
      path: { example: 'value[*].Title', hint: 'A path through the data. [*] means every item, so value[*].Title lists every Title.' },
      jsonpath: { example: '$.value[?(@.Cost > 100)].Title', hint: 'JSONPath: $ is the document, [?(...)] keeps items that pass a test, $..name finds name at any depth.' },
      regex: { example: '^[A-Z][a-z]+$', hint: 'Finds text values that match a pattern (not case sensitive).' },
      js: { example: 'data.value.filter(x => x.Approved)', hint: 'JavaScript where data is the whole document. It runs only in this browser.' },
    };
  }

  init() {
    this._mode = 'path';
    this.on('query:show-tab', (tab) => this._switchTab(tab));
    // Results and transform output belong to the document they were made from
    const clear = () => this._resetResults();
    this.on('tabs:switched', clear);
    this.on('tabs:closed', clear);
    this.on('engine:ingested', clear);
    this.on('state:queryPanelOpen', (d) => {
      Structra.log.info('Query', 'queryPanel ' + (d.value ? 'opened' : 'closed'));
      this.classList.toggle('show', d.value);
    });
  }

  _resetResults() {
    this._lastMatches = [];
    this._lastTransform = null;
    const results = this.$('#queryResults');
    if (results) results.innerHTML = '<div class="qp-summary">Type a query and press Run</div>';
  }

  render() {
    const modes = Structra.constants.QUERY_MODES;

    this.innerHTML = `
      <div class="panel-head">
        <span class="panel-title">Query and Transform</span>
        <button class="btn btn-icon btn-ghost" type="button" data-action="close" aria-label="Close panel" title="Close">
          ${Structra.icons.svg('x', { size: 16 })}
        </button>
      </div>
      <div class="tabs qp-tabs" role="tablist">
        <button class="tab active" type="button" role="tab" data-qtab="query">Query</button>
        <button class="tab" type="button" role="tab" data-qtab="transform">Transform</button>
      </div>
      <div class="qp-tab-body" id="qpQueryBody">
        <div class="seg qp-modes">
          ${modes.map(m => `<button class="seg-btn ${m === this._mode ? 'active' : ''}" type="button" data-mode="${m}">${StructraQuery.MODE_NAMES[m] || m}</button>`).join('')}
        </div>
        <textarea class="qp-input" id="queryInput" spellcheck="false" placeholder=""></textarea>
        <div class="qp-hint" id="queryHint"></div>
        <button class="btn btn-primary qp-run" type="button" data-action="run">Run query</button>
      </div>
      <div class="qp-tab-body" id="qpTransformBody" hidden>
        <div class="qp-transform-presets" id="transformPresets"></div>
        <button class="btn qp-pivot" type="button" data-action="openPivot" title="Group the rows and total or count a column, like a pivot table">${Structra.icons.svg('table-properties', { size: 14 })} Group and total (Pivot)</button>
        <details class="qp-advanced" id="qpAdvanced">
          <summary>Advanced: write your own steps</summary>
          <textarea class="qp-input" id="transformInput" spellcheck="false" placeholder="Steps, for example: .[] | select(.active) | .name"></textarea>
          <button class="btn btn-primary qp-run" type="button" data-action="runTransform">Run transform</button>
        </details>
      </div>
      <div class="qp-results" id="queryResults">
        <div class="qp-summary">Type a query and press Run</div>
      </div>`;

    this._showModeHelp();
    this._renderTransformPresets();
    // The presets name the open file's fields, so they follow the open document
    this.on('state:jsonData', () => this._renderTransformPresets());
    this.on('engine:ingested', () => this._renderTransformPresets());

    this.addEventListener('click', (e) => {
      const tab = e.target.closest('[data-qtab]');
      if (tab) {
        this._switchTab(tab.dataset.qtab);
        return;
      }
      const copy = e.target.closest('[data-copy-expr]');
      if (copy) {
        e.stopPropagation();
        const path = copy.closest('.qp-result').dataset.path;
        const expr = copy.dataset.copyExpr === 'pa' ? Structra.paths.powerAutomate(path) : Structra.paths.powerFx(path);
        Structra.util.copy(expr, copy.dataset.copyExpr === 'pa' ? 'Power Automate expression copied' : 'Power Fx expression copied');
        return;
      }
      const hit = e.target.closest('.qp-result[data-path]');
      if (hit) { this._showMatch(hit.dataset.path); return; }
      if (e.target.closest('[data-action="openPivot"]')) { Structra.events.emit('pivot:open'); return; }
      const preset = e.target.closest('[data-preset]');
      if (preset) {
        this.$('#transformInput').value = preset.dataset.preset;
        this._runTransform();                       // a preset is a ready-made answer: it runs at once
        return;
      }
      const mode = e.target.closest('[data-mode]');
      if (mode) {
        this._mode = mode.dataset.mode;
        this.$$('.seg-btn').forEach(m => m.classList.toggle('active', m.dataset.mode === this._mode));
        this._showModeHelp();
        return;
      }
      const action = e.target.closest('[data-action]');
      if (!action) return;
      if (action.dataset.action === 'close') Structra.set('queryPanelOpen', false);
      else if (action.dataset.action === 'run') this._runQuery();
      else if (action.dataset.action === 'copyMatches') this._copyMatches();
      else if (action.dataset.action === 'openMatches') this._openMatches();
      else if (action.dataset.action === 'runTransform') this._runTransform();
      else if (action.dataset.action === 'openTransform') this._openTransform();
      else if (action.dataset.action === 'copyTransform') Structra.util.copy(JSON.stringify(this._lastTransform, null, 2), 'Result copied');
    });

    this.$('#queryInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {            // Enter runs, Shift+Enter starts a new line
        e.preventDefault();
        this._runQuery();
      }
    });
    this.$('#transformInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        this._runTransform();
      }
    });
  }

  _switchTab(tab) {
    this._tab = tab;
    const title = this.$('.panel-title');
    if (title) title.textContent = tab === 'transform' ? 'Transform' : 'Query and Transform';
    Structra.events.emit('query:tab-switched', tab);
    this.querySelectorAll('.tabs .tab').forEach(t => t.classList.toggle('active', t.dataset.qtab === tab));
    this.$('#qpQueryBody').hidden = tab !== 'query';
    this.$('#qpTransformBody').hidden = tab !== 'transform';
  }

  /**
   * One-click transforms built from the open file, so they always run: they name the file's real list and fields.
   * Returns { presets: [{ label, expr }], example }
   */
  _transformPresets() {
    const ds = Structra.engine.getActive();
    const data = ds ? ds.raw : Structra.state.jsonData;
    let rows = null;
    let nav = '';
    if (Array.isArray(data)) rows = data;
    else if (data && typeof data === 'object') {
      const first = Structra.engine.findFirstObjectArray ? Structra.engine.findFirstObjectArray(data) : null;
      // Only a list reached through plain keys can be written as .a.b
      if (first && first.path && /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/.test(first.path.replace(/^\$\.?/, ''))) {
        rows = first.rows;
        nav = '.' + first.path.replace(/^\$\.?/, '');
      }
    }
    const head = nav ? nav + ' | ' : '';
    if (!rows || !rows.length || typeof rows[0] !== 'object' || rows[0] === null) {
      return { presets: [{ label: 'Count items', expr: 'length' }, { label: 'Keys', expr: 'keys()' }], example: 'keys() | slice(0, 5)' };
    }
    const sample = rows.slice(0, 50).filter((r) => r && typeof r === 'object' && !Array.isArray(r));
    const keys = [];
    sample.forEach((r) => Object.keys(r).forEach((k) => { if (!keys.includes(k) && /^[A-Za-z_$][\w$]*$/.test(k) && !k.startsWith('@')) keys.push(k); }));
    const kindOf = (k) => {
      const vals = sample.map((r) => r[k]).filter((v) => v !== null && v !== undefined);
      if (!vals.length) return null;
      if (vals.every((v) => typeof v === 'boolean')) return 'boolean';
      if (vals.every((v) => typeof v === 'number')) return 'number';
      if (vals.every((v) => typeof v === 'string')) return 'string';
      return null;
    };
    const text = keys.find((k) => kindOf(k) === 'string');
    const num = keys.find((k) => kindOf(k) === 'number');
    const flag = keys.find((k) => kindOf(k) === 'boolean');
    const presets = [];
    presets.push({ label: 'Count items', expr: head + 'length' });
    if (keys.length >= 2) presets.push({ label: 'Pick fields', expr: `${head}pick(${keys.slice(0, 3).join(', ')})` });
    if (text) presets.push({ label: 'Sort by ' + text, expr: `${head}sortBy(${text})` });
    if (text) presets.push({ label: 'Unique ' + text, expr: `${head}map(x => x?.${text}) | unique()` });
    if (flag) presets.push({ label: 'Only ' + flag, expr: `${head}filter(x => x?.${flag} == true)` });
    if (num) presets.push({ label: 'Total ' + num, expr: `${head}sum(x => x?.${num})` });
    if (num) presets.push({ label: 'Biggest ' + num, expr: `${head}sortBy(-${num}) | slice(0, 5)` });
    if (text) presets.push({ label: 'Group by ' + text, expr: `${head}groupBy(x => x?.${text})` });
    return { presets, example: presets[1] ? presets[1].expr : presets[0].expr };
  }

  _renderTransformPresets() {
    const container = this.$('#transformPresets');
    if (!container) return;
    const { presets, example } = this._transformPresets();
    container.innerHTML = presets.map(p =>
      `<button class="qp-preset-btn" type="button" data-preset="${Structra.util.esc(p.expr)}" title="${Structra.util.esc(p.expr)}">${Structra.util.esc(p.label)}</button>`
    ).join('');
    const input = this.$('#transformInput');
    if (input) input.placeholder = `Steps joined with |\nExample: ${example}`;
  }

  /** Keep the result of a transform: it opens in a new tab and the open file stays as it is */
  _openTransform() {
    const cmd = document.querySelector('structra-command');
    if (this._lastTransform === undefined || !cmd) return;
    const name = (Structra.state.fileName || 'data').replace(/\.[^.]+$/, '') + ' (transform)';
    cmd._openInNewTab(this._lastTransform, name).then((opened) => { if (opened) Structra.toast('Result opened in a new tab'); });
  }

  async _runTransform() {
    const input = this.$('#transformInput').value.trim();
    const results = this.$('#queryResults');
    if (!input) { results.innerHTML = '<div class="qp-summary">Type the steps first</div>'; return; }

    const data = Structra.state.jsonData;
    if (!data) { results.innerHTML = '<div class="qp-summary">No JSON loaded</div>'; return; }

    try {
      const output = Structra.transformOps.evaluate(input, data);
      this._lastTransform = output;
      if (output === undefined) {
        results.innerHTML = '<div class="qp-summary">The steps found nothing. A field named in the steps is not in this data.</div>';
        return;
      }
      const preview = JSON.stringify(output, null, 2);
      const lines = preview.split('\n');
      const truncated = lines.length > 50 ? lines.slice(0, 50).join('\n') + '\n…' : preview;
      const kind = Array.isArray(output) ? output.length + (output.length === 1 ? ' item' : ' items') : (output && typeof output === 'object' ? 'an object' : typeof output);
      results.innerHTML = `<div class="qp-summary">Result: ${kind}</div>
        <pre class="qp-transform-output">${Structra.util.esc(truncated)}</pre>
        <div class="qp-actions">
          <button class="btn btn-sm" type="button" data-action="openTransform">Open result in a new tab</button>
          <button class="btn btn-sm btn-ghost" type="button" data-action="copyTransform">Copy</button>
        </div>`;
    } catch (err) {
      results.innerHTML = `<div class="qp-summary is-error">${Structra.util.esc(err.message)}</div>`;
    }
  }

  _showModeHelp() {
    const help = StructraQuery.MODE_HELP[this._mode] || StructraQuery.MODE_HELP.path;
    const input = this.$('#queryInput');
    if (input) input.placeholder = 'Example: ' + help.example;
    const hint = this.$('#queryHint');
    if (hint) hint.textContent = help.hint;
  }

  async _runQuery() {
    const input = this.$('#queryInput').value.trim();
    const results = this.$('#queryResults');
    const help = StructraQuery.MODE_HELP[this._mode];
    if (!input) {
      results.innerHTML = `<div class="qp-summary">Type a query first. Example: <code>${Structra.util.esc(help.example)}</code></div>`;
      this.$('#queryInput').focus();
      return;
    }

    const ds = Structra.engine.getActive();
    const data = ds ? ds.raw : Structra.state.jsonData;
    if (!data) { results.innerHTML = '<div class="qp-summary">Open a file first</div>'; return; }

    try {
      let matches = [];
      if (this._mode === 'path' || this._mode === 'jsonpath') matches = Structra.jsonpath.query(data, input);
      else if (this._mode === 'regex') matches = this._queryRegex(data, input);
      else if (this._mode === 'js') {
        // The code is tried first in a separate thread, so one that never ends cannot freeze the page
        const probe = await Structra.util.tryInWorker(input.replace(/^=/, ''), data);
        if (!probe.ok) throw new Error('The JavaScript did not run: ' + probe.error);
        matches = this._queryJs(data, input);
      }
      this._lastMatches = matches;

      if (matches.length === 0) {
        results.innerHTML = `<div class="qp-summary">No matches. Nothing in this file fits <code>${Structra.util.esc(input)}</code>.</div>`;
        return;
      }
      const shown = matches.slice(0, 100);
      results.innerHTML = `<div class="qp-summary">${matches.length.toLocaleString()} ${matches.length === 1 ? 'match' : 'matches'}${matches.length > shown.length ? ` (first ${shown.length} shown)` : ''}</div>
        <div class="qp-actions">
          <button class="btn btn-sm" type="button" data-action="copyMatches">Copy values</button>
          <button class="btn btn-sm" type="button" data-action="openMatches">Open in a new tab</button>
        </div>` +
        shown.map((m, i) =>
          `<div class="qp-result" data-i="${i}" data-path="${Structra.util.esc(m.path)}" title="Show in the Tree">
            <span class="qp-result-path">${Structra.util.esc(m.path)}</span>
            <span class="qp-result-value">${Structra.util.esc(this._preview(m.value))}</span>
            <span class="qp-result-copy">
              <button class="btn btn-sm btn-ghost" type="button" data-copy-expr="pa" title="Copy the Power Automate expression for this value">Power Automate</button>
              <button class="btn btn-sm btn-ghost" type="button" data-copy-expr="fx" title="Copy the Power Fx expression for this value">Power Fx</button>
            </span>
          </div>`
        ).join('');
    } catch (err) {
      results.innerHTML = `<div class="qp-summary is-error">${Structra.util.esc(err.message)}</div>`;
    }
  }

  /** A result was clicked: show it in the Tree, where it can be read in context and its expressions are one click away */
  _showMatch(path) {
    if (!path || !path.startsWith('$')) return;
    Structra.set('activeView', 'tree');
    Structra.set('currentPath', path);
    // Every match is marked in the Tree, and the clicked one is brought into view
    setTimeout(() => {
      const view = document.getElementById('jsonView');
      const all = (this._lastMatches || []).map((m) => m.path).filter((p) => typeof p === 'string' && p.startsWith('$'));
      if (view && all.length) Structra.jsonTree.highlightPaths(view, all);
      Structra.events.emit('tree:navigate-path', path);
    }, 60);
  }

  _copyMatches() {
    const values = (this._lastMatches || []).map((m) => m.value);
    Structra.util.copy(JSON.stringify(values, null, 2), `${values.length} ${values.length === 1 ? 'value' : 'values'} copied`);
  }

  _openMatches() {
    const cmd = document.querySelector('structra-command');
    const values = (this._lastMatches || []).map((m) => m.value);
    if (!cmd || !values.length) return;
    const name = (Structra.state.fileName || 'data').replace(/\.[^.]+$/, '') + ' (query)';
    cmd._openInNewTab(values, name).then((opened) => { if (opened) Structra.toast('Matches opened in a new tab'); });
  }

  _queryRegex(data, pattern) {
    const matches = [];
    let re;
    const source = pattern.replace(/^\/|\/[a-z]*$/g, '');
    if (Structra.util.riskyRegex(source)) throw new Error(Structra.util.RISKY_MESSAGE);
    try { re = new RegExp(source, 'i'); }
    catch (err) { throw new Error('That is not a valid pattern: ' + err.message.replace(/^Invalid regular expression: /, '')); }
    const walk = (val, path) => {
      if (typeof val === 'string' && re.test(val)) matches.push({ path, value: val });
      if (val && typeof val === 'object') {
        const entries = Array.isArray(val) ? val.map((v, i) => [i, v]) : Object.entries(val);
        entries.forEach(([k, v]) => {
          const p = Array.isArray(val) ? `${path}[${k}]` : (/^[A-Za-z_$][\w$]*$/.test(k) ? `${path}.${k}` : `${path}['${k}']`);
          walk(v, p);
        });
      }
    };
    walk(data, '$');
    return matches;
  }

  _queryJs(data, expr) {
    // Strip leading = if present
    const code = expr.replace(/^=/, '');
    let result;
    try { result = new Function('data', `return ${code};`)(data); }
    catch (err) { throw new Error('The JavaScript did not run: ' + err.message); }

    // Items that are objects inside the document are given their real path ($.value[1]), the rest are numbered
    let where = null;
    const locate = (obj) => {
      if (!where) {
        where = new Map();
        const walk = (val, path, budget) => {
          if (budget.left-- <= 0 || !val || typeof val !== 'object') return;
          if (!where.has(val)) where.set(val, path);
          const entries = Array.isArray(val) ? val.map((v, i) => [i, v]) : Object.entries(val);
          for (const [k, v] of entries) walk(v, Array.isArray(val) ? `${path}[${k}]` : (/^[A-Za-z_$][\w$]*$/.test(k) ? `${path}.${k}` : `${path}['${k}']`), budget);
        };
        walk(data, '$', { left: 200000 });
      }
      return where.get(obj);
    };
    if (Array.isArray(result)) return result.map((v, i) => ({ path: (v && typeof v === 'object' && locate(v)) || `result[${i}]`, value: v }));
    return [{ path: (result && typeof result === 'object' && locate(result)) || 'result', value: result }];
  }

  _preview(val) {
    if (val === null) return 'null';
    if (typeof val === 'string') return val.length > 40 ? val.slice(0, 40) + '…' : val;
    if (typeof val === 'object') { const t = JSON.stringify(val); return t.length > 60 ? t.slice(0, 60) + '…' : t; }
    return String(val);
  }

}

customElements.define('structra-query', StructraQuery);
