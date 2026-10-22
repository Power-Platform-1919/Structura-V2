/* ============================================================
   STRUCTRA V2 — Pivot Table Component
   <structra-pivot> — Aggregate/group tabular data with drag-and-
   drop field placement. Uses DuckDB GROUP BY / aggregate SQL.
   ============================================================ */

class StructraPivot extends StructraElement {
  init() {
    this._rows = [];
    this._cols = [];
    this._values = [];
    this._aggFn = 'count';
    this._result = null;
    this._fields = [];

    this.on('pivot:open', () => this._open());
    this.on('overlay:close', () => this._close());
    this.on('engine:ingested', () => this._refreshFields());
  }

  render() {
    this.innerHTML = `<div class="pivot-overlay" id="pivotOverlay" style="display:none">
      <div class="pivot-modal">
        <div class="pivot-header">
          <span class="pivot-title">Pivot Table</span>
          <button class="pivot-close" data-action="close">✕</button>
        </div>
        <div class="pivot-config">
          <div class="pivot-field-list">
            <div class="pivot-field-title">Fields</div>
            <div class="pivot-fields" id="pivotFields"></div>
          </div>
          <div class="pivot-zones">
            <div class="pivot-zone">
              <div class="pivot-zone-title">Rows</div>
              <div class="pivot-zone-drop" id="pivotRows" data-zone="rows"></div>
            </div>
            <div class="pivot-zone">
              <div class="pivot-zone-title">Columns</div>
              <div class="pivot-zone-drop" id="pivotCols" data-zone="cols"></div>
            </div>
            <div class="pivot-zone">
              <div class="pivot-zone-title">Values</div>
              <div class="pivot-zone-drop" id="pivotValues" data-zone="values"></div>
              <select class="pivot-agg" id="pivotAgg">
                <option value="count">Count</option>
                <option value="sum">Sum</option>
                <option value="avg">Average</option>
                <option value="min">Min</option>
                <option value="max">Max</option>
              </select>
            </div>
          </div>
          <button class="btn btn-primary pivot-run" data-action="run">Generate Pivot</button>
        </div>
        <div class="pivot-result" id="pivotResult"></div>
      </div>
    </div>`;

    this.addEventListener('click', (e) => {
      const action = e.target.closest('[data-action]');
      if (action) {
        if (action.dataset.action === 'close') this._close();
        else if (action.dataset.action === 'run') this._runPivot();
      }
      // Field chip click — add to appropriate zone
      const field = e.target.closest('[data-field]');
      if (field && !field.closest('.pivot-zone-drop')) {
        this._addFieldToZone(field.dataset.field);
      }
      // Remove from zone
      const rm = e.target.closest('[data-rm-zone]');
      if (rm) {
        this._removeFromZone(rm.dataset.rmZone, rm.dataset.rmField);
      }
    });

    this.$('#pivotAgg').addEventListener('change', (e) => { this._aggFn = e.target.value; });
  }

  _open() {
    this.$('#pivotOverlay').style.display = '';
    this._refreshFields();
  }

  _close() { this.$('#pivotOverlay').style.display = 'none'; }

  _refreshFields() {
    const ds = Structra.engine.getActive();
    if (ds && ds.indexes.columns) {
      this._fields = ds.indexes.columns.map(c => c.name);
    } else {
      const data = Structra.state.jsonData;
      if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object') {
        const keys = new Set();
        data.slice(0, 100).forEach(r => { if (r) Object.keys(r).forEach(k => keys.add(k)); });
        this._fields = [...keys];
      }
    }
    this._renderFields();
  }

  _renderFields() {
    const container = this.$('#pivotFields');
    if (!container) return;
    container.innerHTML = this._fields.map(f =>
      `<span class="pivot-chip" data-field="${this._esc(f)}">${this._esc(f)}</span>`
    ).join('');
  }

  _addFieldToZone(field) {
    // Cycle: rows → cols → values (smart default based on type)
    if (!this._rows.includes(field) && this._rows.length < 2) {
      this._rows.push(field);
    } else if (!this._cols.includes(field) && this._cols.length < 2) {
      this._cols.push(field);
    } else if (!this._values.includes(field)) {
      this._values.push(field);
    }
    this._renderZones();
  }

  _removeFromZone(zone, field) {
    if (zone === 'rows') this._rows = this._rows.filter(f => f !== field);
    else if (zone === 'cols') this._cols = this._cols.filter(f => f !== field);
    else if (zone === 'values') this._values = this._values.filter(f => f !== field);
    this._renderZones();
  }

  _renderZones() {
    const chip = (field, zone) =>
      `<span class="pivot-zone-chip">${this._esc(field)} <span class="pivot-zone-rm" data-rm-zone="${zone}" data-rm-field="${this._esc(field)}">✕</span></span>`;
    this.$('#pivotRows').innerHTML = this._rows.map(f => chip(f, 'rows')).join('') || '<span class="pivot-zone-hint">Click fields…</span>';
    this.$('#pivotCols').innerHTML = this._cols.map(f => chip(f, 'cols')).join('') || '<span class="pivot-zone-hint">Click fields…</span>';
    this.$('#pivotValues').innerHTML = this._values.map(f => chip(f, 'values')).join('') || '<span class="pivot-zone-hint">Click fields…</span>';
  }

  async _runPivot() {
    if (this._rows.length === 0 && this._cols.length === 0) {
      Structra.toast('Add at least one row or column field', 'warning');
      return;
    }

    const resultEl = this.$('#pivotResult');
    resultEl.innerHTML = '<div class="pivot-loading">Computing…</div>';

    // Try DuckDB first
    if (Structra.engine.duckReady) {
      try {
        const result = await this._pivotDuckDb();
        if (result) { this._renderPivotTable(result); return; }
      } catch (err) {
        Structra.log.warn('Pivot', 'DuckDB pivot failed, falling back', err.message);
      }
    }

    // Fallback: in-memory
    const result = this._pivotInMemory();
    this._renderPivotTable(result);
  }

  async _pivotDuckDb() {
    const groupBy = [...this._rows, ...this._cols];
    const valueFields = this._values.length > 0 ? this._values : ['*'];
    const agg = this._aggFn;

    const aggExprs = valueFields.map(f => {
      if (f === '*') return `${agg.toUpperCase()}(*) as "count"`;
      return `${agg.toUpperCase()}("${f}") as "${agg}_${f}"`;
    }).join(', ');

    const groupByExpr = groupBy.map(f => `"${f}"`).join(', ');
    const sql = `SELECT ${groupByExpr}, ${aggExprs} FROM data GROUP BY ${groupByExpr} ORDER BY ${groupByExpr}`;

    const result = await Structra.engine.runSql(sql);
    if (!result || !result.rows) return null;
    return { rows: result.rows, columns: result.columns || Object.keys(result.rows[0] || {}) };
  }

  _pivotInMemory() {
    const data = Structra.state.jsonData;
    if (!Array.isArray(data)) return { rows: [], columns: [] };

    const groupBy = [...this._rows, ...this._cols];
    const groups = {};

    for (const row of data) {
      if (!row) continue;
      const key = groupBy.map(f => String(row[f] ?? '(null)')).join('|');
      if (!groups[key]) groups[key] = { _key: key, _rows: [] };
      groups[key]._rows.push(row);
      for (const f of groupBy) groups[key][f] = row[f];
    }

    const result = Object.values(groups).map(g => {
      const out = {};
      for (const f of groupBy) out[f] = g[f];
      for (const vf of (this._values.length > 0 ? this._values : ['*'])) {
        const vals = g._rows.map(r => vf === '*' ? 1 : parseFloat(r[vf]) || 0);
        const label = vf === '*' ? 'count' : `${this._aggFn}_${vf}`;
        if (this._aggFn === 'count') out[label] = vals.length;
        else if (this._aggFn === 'sum') out[label] = vals.reduce((a, b) => a + b, 0);
        else if (this._aggFn === 'avg') out[label] = (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2);
        else if (this._aggFn === 'min') out[label] = Math.min(...vals);
        else if (this._aggFn === 'max') out[label] = Math.max(...vals);
      }
      return out;
    });

    return { rows: result, columns: Object.keys(result[0] || {}) };
  }

  _renderPivotTable(data) {
    const el = this.$('#pivotResult');
    if (!data || !data.rows || data.rows.length === 0) {
      el.innerHTML = '<div class="pivot-empty">No results</div>';
      return;
    }

    const cols = data.columns;
    let html = '<table class="pivot-table"><thead><tr>';
    html += cols.map(c => `<th>${this._esc(c)}</th>`).join('');
    html += '</tr></thead><tbody>';
    for (const row of data.rows.slice(0, 500)) {
      html += '<tr>' + cols.map(c => `<td>${row[c] != null ? this._esc(String(row[c])) : ''}</td>`).join('') + '</tr>';
    }
    html += '</tbody></table>';
    if (data.rows.length > 500) html += `<div class="pivot-more">Showing 500 of ${data.rows.length} rows</div>`;
    el.innerHTML = html;
  }

  _esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
}

customElements.define('structra-pivot', StructraPivot);
