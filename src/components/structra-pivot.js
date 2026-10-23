/* ============================================================
   STRUCTRA V2 — Pivot Table Component
   <structra-pivot> — Aggregate/group tabular data with drag-and-
   drop field placement. Uses DuckDB GROUP BY / aggregate SQL.
   ============================================================ */

class StructraPivot extends StructraOverlay {
  init() {
    super.init();
    this._rows = [];
    this._cols = [];
    this._values = [];
    this._aggFn = 'count';
    this._result = null;
    this._fields = [];

    this.on('pivot:open', () => this._open());
    this.on('engine:ingested', () => this._reset());
    this.on('tabs:switched', () => this._reset());
  }

  render() {
    this.mount({ title: 'Pivot Table', size: 'xl flush', body: `<div class="pivot-config">
          <div class="pivot-field-list">
            <div class="pivot-field-title">Fields</div>
            <div class="pivot-fields" id="pivotFields"></div>
          </div>
          <div class="pivot-zones">
            <div class="pivot-zone">
              <div class="pivot-zone-title">Group by (rows)</div>
              <div class="pivot-zone-drop" id="pivotRows" data-zone="rows"></div>
            </div>
            <div class="pivot-zone">
              <div class="pivot-zone-title">Then by (columns)</div>
              <div class="pivot-zone-drop" id="pivotCols" data-zone="cols"></div>
            </div>
            <div class="pivot-zone">
              <div class="pivot-zone-title">Count or total of</div>
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
          <button class="btn btn-primary pivot-run" data-action="run">Make the table</button>
        </div>
        <p class="pivot-help" id="pivotHelp"></p>
        <div class="pivot-result" id="pivotResult"></div>` });

    this.addEventListener('click', (e) => {
      const action = e.target.closest('[data-action]');
      if (action) {
        if (action.dataset.action === 'close') this.close();
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
    this.open();
    this._refreshFields();
    this._renderZones();
  }

  /** A new document or tab starts with an empty pivot */
  _reset() {
    this._rows = []; this._cols = []; this._values = [];
    this._refreshFields();
    if (this.$('#pivotRows')) this._renderZones();
    const el = this.$('#pivotResult');
    if (el) el.innerHTML = '';
  }

  /** The columns of the main list (Status.Value for a Choice field), not the top-level keys of the document */
  _refreshFields() {
    this._fields = Structra.engine.mainColumns();
    const main = Structra.engine.mainList();
    const help = this.$('#pivotHelp');
    if (help) {
      help.textContent = main
        ? `Pivoting the ${main.rows.length.toLocaleString()} ${main.rows.length === 1 ? 'row' : 'rows'} of ${main.path === '$' ? 'the document' : main.path.replace(/^\$\./, '')}. Click a field to add it: the first two go to Group by, the next two to Then by, then to Count or total of. Click the x on a chip to remove it.`
        : 'This document has no list of records to pivot.';
    }
    this._renderFields();
  }

  _renderFields() {
    const container = this.$('#pivotFields');
    if (!container) return;
    container.innerHTML = this._fields.map(f =>
      `<span class="pivot-chip" data-field="${Structra.util.esc(f)}">${Structra.util.esc(f)}</span>`
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
      `<span class="pivot-zone-chip">${Structra.util.esc(field)} <span class="pivot-zone-rm" data-rm-zone="${zone}" data-rm-field="${Structra.util.esc(field)}">${Structra.icons.svg('x', { size: 14 })}</span></span>`;
    this.$('#pivotRows').innerHTML = this._rows.map(f => chip(f, 'rows')).join('') || '<span class="pivot-zone-hint">Click a field on the left</span>';
    this.$('#pivotCols').innerHTML = this._cols.map(f => chip(f, 'cols')).join('') || '<span class="pivot-zone-hint">Click a field on the left</span>';
    this.$('#pivotValues').innerHTML = this._values.map(f => chip(f, 'values')).join('') || '<span class="pivot-zone-hint">Click a field on the left</span>';
  }

  _runPivot() {
    if (this._rows.length === 0 && this._cols.length === 0) {
      Structra.toast('Choose at least one field to group by', 'warning');
      return;
    }
    const main = Structra.engine.mainList();
    if (!main) { this._renderPivotTable(null); return; }
    this._renderPivotTable(this._pivot(main.rows));
  }

  /** Group the rows by the chosen fields and count or total the chosen value fields (in the browser, on the main list) */
  _pivot(rows) {
    const read = (r, f) => Structra.engine.fieldValue(r, f);
    const groupBy = [...this._rows, ...this._cols];
    const valueFields = this._values.length ? this._values : ['*'];
    const groups = new Map();
    for (const row of rows) {
      if (!row) continue;
      const parts = groupBy.map((f) => { const v = read(row, f); return v === null || v === undefined ? '(empty)' : (typeof v === 'object' ? JSON.stringify(v) : String(v)); });
      const key = parts.join('\u0001');
      if (!groups.has(key)) groups.set(key, { parts, rows: [] });
      groups.get(key).rows.push(row);
    }
    const agg = this._aggFn;
    const out = [...groups.values()].map((g) => {
      const o = {};
      groupBy.forEach((f, i) => { o[f] = g.parts[i]; });
      for (const vf of valueFields) {
        const label = vf === '*' ? 'Count' : `${{ count: 'Count', sum: 'Total', avg: 'Average', min: 'Smallest', max: 'Largest' }[agg]} of ${vf}`;
        if (vf === '*' || agg === 'count') {
          o[vf === '*' ? 'Count' : label] = vf === '*' ? g.rows.length : g.rows.filter((r) => { const v = read(r, vf); return v !== null && v !== undefined && v !== ''; }).length;
          continue;
        }
        const nums = g.rows.map((r) => Number(read(r, vf))).filter((n) => Number.isFinite(n));
        if (!nums.length) { o[label] = ''; continue; }
        if (agg === 'sum') o[label] = Math.round(nums.reduce((a, b) => a + b, 0) * 1e6) / 1e6;
        else if (agg === 'avg') o[label] = Math.round(nums.reduce((a, b) => a + b, 0) / nums.length * 100) / 100;
        else if (agg === 'min') o[label] = Math.min(...nums);
        else if (agg === 'max') o[label] = Math.max(...nums);
      }
      return o;
    });
    out.sort((a, b) => groupBy.map((f) => String(a[f]).localeCompare(String(b[f]), undefined, { numeric: true })).find((c) => c !== 0) || 0);
    return { rows: out, columns: out.length ? Object.keys(out[0]) : [] };
  }

  _renderPivotTable(data) {
    const el = this.$('#pivotResult');
    if (!data || !data.rows || data.rows.length === 0) {
      el.innerHTML = '<div class="pivot-empty">Nothing to show. This document has no list of records, or the chosen fields have no values.</div>';
      return;
    }

    const cols = data.columns;
    let html = '<table class="pivot-table"><thead><tr>';
    html += cols.map(c => `<th>${Structra.util.esc(c)}</th>`).join('');
    html += '</tr></thead><tbody>';
    for (const row of data.rows.slice(0, 500)) {
      html += '<tr>' + cols.map(c => `<td>${row[c] != null ? Structra.util.esc(String(row[c])) : ''}</td>`).join('') + '</tr>';
    }
    html += '</tbody></table>';
    if (data.rows.length > 500) html += `<div class="pivot-more">Showing 500 of ${data.rows.length} rows</div>`;
    el.innerHTML = html;
  }

}

customElements.define('structra-pivot', StructraPivot);
