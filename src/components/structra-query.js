/* ============================================================
   STRUCTRA V2 — Query Panel Component
   <structra-query> — query/filter panel (path/jsonpath/regex/js)
   ============================================================ */

class StructraQuery extends StructraElement {
  static get observedAttributes() { return ['mode']; }

  init() {
    this._mode = 'path';
    this.on('query:show-tab', (tab) => this._switchTab(tab));
    this.on('state:queryPanelOpen', (d) => {
      Structra.log.info('Query', 'queryPanel ' + (d.value ? 'opened' : 'closed'));
      this.classList.toggle('show', d.value);
    });
  }

  render() {
    const modes = Structra.constants.QUERY_MODES;

    this.innerHTML = `
      <div class="panel-head">
        <span class="panel-title">Query &amp; Filter</span>
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
          ${modes.map(m => `<button class="seg-btn ${m === this._mode ? 'active' : ''}" type="button" data-mode="${m}">${m.charAt(0).toUpperCase() + m.slice(1)}</button>`).join('')}
        </div>
        <textarea class="qp-input" id="queryInput" spellcheck="false" placeholder="*.email\nor $..name\nor /^[A-Z]/\nor =data.filter(x => x.active)"></textarea>
        <button class="btn btn-primary qp-run" type="button" data-action="run">Run query</button>
      </div>
      <div class="qp-tab-body" id="qpTransformBody" hidden>
        <div class="qp-transform-presets" id="transformPresets"></div>
        <textarea class="qp-input" id="transformInput" spellcheck="false" placeholder="jq-style expression: .[] | select(.active) | .name"></textarea>
        <button class="btn btn-primary qp-run" type="button" data-action="runTransform">Run transform</button>
      </div>
      <div class="qp-results" id="queryResults">
        <div class="qp-summary">Type a query and press Run</div>
      </div>`;

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
      const preset = e.target.closest('[data-preset]');
      if (preset) {
        this.$('#transformInput').value = preset.dataset.preset;
        return;
      }
      const mode = e.target.closest('[data-mode]');
      if (mode) {
        this._mode = mode.dataset.mode;
        this.$$('.seg-btn').forEach(m => m.classList.toggle('active', m.dataset.mode === this._mode));
        return;
      }
      const action = e.target.closest('[data-action]');
      if (!action) return;
      if (action.dataset.action === 'close') Structra.set('queryPanelOpen', false);
      else if (action.dataset.action === 'run') this._runQuery();
      else if (action.dataset.action === 'runTransform') this._runTransform();
      else if (action.dataset.action === 'openTransform') this._openTransform();
      else if (action.dataset.action === 'copyTransform') Structra.util.copy(JSON.stringify(this._lastTransform, null, 2), 'Result copied');
    });

    this.$('#queryInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
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
    if (!input) { results.innerHTML = '<div class="qp-summary">Enter a transform expression</div>'; return; }

    const data = Structra.state.jsonData;
    if (!data) { results.innerHTML = '<div class="qp-summary">No JSON loaded</div>'; return; }

    try {
      const output = Structra.transformOps.evaluate(input, data);
      this._lastTransform = output;
      if (output === undefined) {
        results.innerHTML = '<div class="qp-summary">The steps found nothing (a field in the steps does not exist here)</div>';
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

  _runQuery() {
    const input = this.$('#queryInput').value.trim();
    const results = this.$('#queryResults');
    if (!input) { results.innerHTML = '<div class="qp-summary">Type a query and press Run</div>'; return; }

    const data = Structra.state.jsonData;
    if (!data) { results.innerHTML = '<div class="qp-summary">No JSON loaded</div>'; return; }

    try {
      let matches = [];
      if (this._mode === 'path') matches = this._queryPath(data, input);
      else if (this._mode === 'jsonpath') matches = this._queryJsonPath(data, input);
      else if (this._mode === 'regex') matches = this._queryRegex(data, input);
      else if (this._mode === 'js') matches = this._queryJs(data, input);

      if (matches.length === 0) {
        results.innerHTML = '<div class="qp-summary">No matches</div>';
      } else {
        results.innerHTML = `<div class="qp-summary">${matches.length} match${matches.length > 1 ? 'es' : ''}</div>` +
          matches.slice(0, 100).map(m =>
            `<div class="qp-result" data-path="${Structra.util.esc(m.path)}">
              <span class="qp-result-path">${Structra.util.esc(m.path)}</span>
              <span class="qp-result-value">${Structra.util.esc(this._preview(m.value))}</span>
            </div>`
          ).join('');

        results.querySelectorAll('.qp-result[data-path]').forEach(el => {
          el.addEventListener('click', () => {
            Structra.set('currentPath', el.dataset.path);
            Structra.events.emit('tree:node-selected', el.dataset.path);
          });
        });
      }

      Structra.toast(`${matches.length} match${matches.length === 1 ? '' : 'es'}`);
    } catch (err) {
      results.innerHTML = `<div class="qp-summary is-error">Error: ${Structra.util.esc(err.message)}</div>`;
    }
  }

  _queryPath(data, pattern) {
    const matches = [];
    const parts = pattern.replace(/^\$\.?/, '').split('.');
    const walk = (val, path, depth) => {
      if (depth >= parts.length) { matches.push({ path, value: val }); return; }
      const part = parts[depth];
      if (val && typeof val === 'object') {
        if (part === '*') {
          const entries = Array.isArray(val) ? val.map((v, i) => [i, v]) : Object.entries(val);
          entries.forEach(([k, v]) => {
            const p = Array.isArray(val) ? `${path}[${k}]` : `${path}.${k}`;
            walk(v, p, depth + 1);
          });
        } else if (Array.isArray(val)) {
          const idx = parseInt(part, 10);
          if (!isNaN(idx) && idx < val.length) walk(val[idx], `${path}[${idx}]`, depth + 1);
        } else if (part in val) {
          walk(val[part], `${path}.${part}`, depth + 1);
        }
      }
    };
    walk(data, '$', 0);
    return matches;
  }

  _queryJsonPath(data, expr) {
    // Simple $.. recursive descent
    const matches = [];
    const key = expr.replace(/^\$\.\./, '');
    const walk = (val, path) => {
      if (val && typeof val === 'object') {
        const entries = Array.isArray(val) ? val.map((v, i) => [i, v]) : Object.entries(val);
        entries.forEach(([k, v]) => {
          const p = Array.isArray(val) ? `${path}[${k}]` : `${path}.${k}`;
          if (String(k) === key) matches.push({ path: p, value: v });
          walk(v, p);
        });
      }
    };
    walk(data, '$');
    return matches;
  }

  _queryRegex(data, pattern) {
    const matches = [];
    const re = new RegExp(pattern.replace(/^\/|\/$/g, ''));
    const walk = (val, path) => {
      if (typeof val === 'string' && re.test(val)) matches.push({ path, value: val });
      if (val && typeof val === 'object') {
        const entries = Array.isArray(val) ? val.map((v, i) => [i, v]) : Object.entries(val);
        entries.forEach(([k, v]) => {
          const p = Array.isArray(val) ? `${path}[${k}]` : `${path}.${k}`;
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
    const fn = new Function('data', `return ${code};`);
    const result = fn(data);
    if (Array.isArray(result)) return result.map((v, i) => ({ path: `result[${i}]`, value: v }));
    return [{ path: '$', value: result }];
  }

  _preview(val) {
    if (val === null) return 'null';
    if (typeof val === 'string') return val.length > 40 ? val.slice(0, 40) + '…' : val;
    if (typeof val === 'object') return JSON.stringify(val).slice(0, 50);
    return String(val);
  }

}

customElements.define('structra-query', StructraQuery);
