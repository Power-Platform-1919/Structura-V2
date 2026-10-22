/* ============================================================
   STRUCTRA V2 — Query Panel Component
   <structra-query> — query/filter panel (path/jsonpath/regex/js)
   ============================================================ */

class StructraQuery extends StructraElement {
  static get observedAttributes() { return ['mode']; }

  init() {
    this._mode = 'path';
    this.on('state:queryPanelOpen', (d) => {
      Structra.log.info('Query', 'queryPanel ' + (d.value ? 'opened' : 'closed'));
      this.classList.toggle('show', d.value);
    });
  }

  render() {
    const modes = Structra.constants.QUERY_MODES;

    this.innerHTML = `
      <div class="qp-header">
        Query &amp; Filter
        <button class="qp-close" data-action="close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="qp-tabs">
        <button class="qp-tab active" data-qtab="query">Query</button>
        <button class="qp-tab" data-qtab="transform">Transform</button>
      </div>
      <div class="qp-tab-body" id="qpQueryBody">
        <div class="qp-modes">
          ${modes.map(m => `<span class="qp-mode ${m === this._mode ? 'active' : ''}" data-mode="${m}">${m.charAt(0).toUpperCase() + m.slice(1)}</span>`).join('')}
        </div>
        <textarea class="qp-input" id="queryInput" placeholder="*.email\nor $..name\nor /^[A-Z]/\nor =data.filter(x => x.active)"></textarea>
        <button class="btn btn-primary qp-run" data-action="run">&#9654; Run Query</button>
      </div>
      <div class="qp-tab-body" id="qpTransformBody" style="display:none">
        <div class="qp-transform-presets" id="transformPresets"></div>
        <textarea class="qp-input" id="transformInput" placeholder="Enter jq-style expression: .[] | select(.active) | .name"></textarea>
        <button class="btn btn-primary qp-run" data-action="runTransform">&#9654; Run Transform</button>
      </div>
      <div class="qp-results" id="queryResults">
        <div class="qp-summary">Type a query and press Run</div>
      </div>`;

    this._renderTransformPresets();

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
        this.$$('.qp-mode').forEach(m => m.classList.toggle('active', m.dataset.mode === this._mode));
        return;
      }
      const action = e.target.closest('[data-action]');
      if (!action) return;
      if (action.dataset.action === 'close') Structra.set('queryPanelOpen', false);
      else if (action.dataset.action === 'run') this._runQuery();
      else if (action.dataset.action === 'runTransform') this._runTransform();
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
    this.querySelectorAll('.qp-tab').forEach(t => t.classList.toggle('active', t.dataset.qtab === tab));
    this.$('#qpQueryBody').style.display = tab === 'query' ? '' : 'none';
    this.$('#qpTransformBody').style.display = tab === 'transform' ? '' : 'none';
  }

  _renderTransformPresets() {
    const presets = [
      { label: 'Pick fields', expr: '.[] | {name, email}' },
      { label: 'Filter active', expr: '.[] | select(.active == true)' },
      { label: 'Sort by key', expr: 'sort_by(.name)' },
      { label: 'Group by type', expr: 'group_by(.type)' },
      { label: 'Count items', expr: 'length' },
      { label: 'Unique values', expr: '[.[] .category] | unique' },
      { label: 'Flatten arrays', expr: 'flatten' },
      { label: 'Map values', expr: '.[] | .price * 1.1' },
    ];
    const container = this.$('#transformPresets');
    if (!container) return;
    container.innerHTML = presets.map(p =>
      `<button class="qp-preset-btn" data-preset="${this._esc(p.expr)}" title="${this._esc(p.expr)}">${p.label}</button>`
    ).join('');
  }

  async _runTransform() {
    const input = this.$('#transformInput').value.trim();
    const results = this.$('#queryResults');
    if (!input) { results.innerHTML = '<div class="qp-summary">Enter a transform expression</div>'; return; }

    const data = Structra.state.jsonData;
    if (!data) { results.innerHTML = '<div class="qp-summary">No JSON loaded</div>'; return; }

    try {
      const output = Structra.transformOps.evaluate(input, data);
      const preview = JSON.stringify(output, null, 2);
      const lines = preview.split('\n');
      const truncated = lines.length > 50 ? lines.slice(0, 50).join('\n') + '\n…' : preview;
      results.innerHTML = `<div class="qp-summary">Transform result (${typeof output === 'object' && Array.isArray(output) ? output.length + ' items' : typeof output})</div>
        <pre class="qp-transform-output">${this._esc(truncated)}</pre>`;
      Structra.toast(`Transform: ${Array.isArray(output) ? output.length + ' items' : 'done'}`);
    } catch (err) {
      results.innerHTML = `<div class="qp-summary" style="color:var(--danger)">Error: ${this._esc(err.message)}</div>`;
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
            `<div class="qp-result" data-path="${this._esc(m.path)}" style="cursor:pointer;padding:var(--sp-1) 0;font-size:var(--fs-xs);font-family:var(--font-mono)">
              <span style="color:var(--accent)">${this._esc(m.path)}</span>
              <span style="color:var(--text-muted);margin-left:var(--sp-2)">${this._esc(this._preview(m.value))}</span>
            </div>`
          ).join('');

        results.querySelectorAll('.qp-result[data-path]').forEach(el => {
          el.addEventListener('click', () => {
            Structra.set('currentPath', el.dataset.path);
            Structra.events.emit('tree:node-selected', el.dataset.path);
          });
        });
      }

      Structra.toast(`${matches.length} match${matches.length > 1 ? 'es' : ''}`);
    } catch (err) {
      results.innerHTML = `<div class="qp-summary" style="color:var(--danger)">Error: ${this._esc(err.message)}</div>`;
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

  _esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}

customElements.define('structra-query', StructraQuery);
