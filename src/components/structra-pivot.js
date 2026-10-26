/* ============================================================
   STRUCTRA V2 - Pivot Table Component
   <structra-pivot> - Aggregate/group tabular data with drag-and-
   drop field placement. Uses DuckDB GROUP BY / aggregate SQL.

   Wiring (generated from the code below; update it when you add or remove an event):
     Listens to: pivot:open, engine:ingested, tabs:switched
   ============================================================ */

class StructraPivot extends StructraDialog {
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
                <option value="sum">Total</option>
                <option value="avg">Average</option>
                <option value="min">Smallest</option>
                <option value="max">Largest</option>
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
      // Field chip click - add to appropriate zone
      const field = e.target.closest('[data-field]');
      if (field && !field.closest('.pivot-zone-drop')) {
        this._addFieldToZone(field.dataset.field);
      }
      const act = e.target.closest('[data-pivot-act]');
      if (act) { if (act.dataset.pivotAct === 'copy') this._copyAll(); else this._openAll(); return; }
      // Remove from zone
      const rm = e.target.closest('[data-rm-zone]');
      if (rm) {
        this._removeFromZone(rm.dataset.rmZone, rm.dataset.rmField);
      }
    });

    this.queryOne('#pivotAgg').addEventListener('change', (e) => { this._aggFn = e.target.value; });
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
    if (this.queryOne('#pivotRows')) this._renderZones();
    const el = this.queryOne('#pivotResult');
    if (el) el.innerHTML = '';
  }

  /** The columns of the main list (Status.Value for a Choice field), not the top-level keys of the document */
  _refreshFields() {
    this._fields = Structra.dataEngine.mainColumns();
    const main = Structra.dataEngine.mainList();
    const help = this.queryOne('#pivotHelp');
    if (help) {
      help.textContent = main
        ? `Pivoting the ${main.rows.length.toLocaleString()} ${main.rows.length === 1 ? 'row' : 'rows'} of ${main.path === '$' ? 'the document' : main.path.replace(/^\$\./, '')}. Click a field to add it: fields with numbers are totalled, other fields group the rows. Click the x on a chip to remove it.`
        : 'This document has no list of records to pivot.';
    }
    this._renderFields();
  }

  _renderFields() {
    const container = this.queryOne('#pivotFields');
    if (!container) return;
    container.innerHTML = this._fields.map(f =>
      `<span class="pivot-chip" data-field="${Structra.sharedHelpers.escapeHtml(f)}">${Structra.sharedHelpers.escapeHtml(f)}</span>`
    ).join('');
  }

  /** A field whose values are numbers is something to total; any other field is something to group by */
  _isNumeric(field) {
    const main = Structra.dataEngine.mainList();
    if (!main) return false;
    let seen = 0;
    for (const row of main.rows.slice(0, 200)) {
      const v = Structra.dataEngine.fieldValue(row, field);
      if (v === null || v === undefined || v === '') continue;
      if (typeof v !== 'number') return false;
      seen++;
    }
    return seen > 0;
  }

  _addFieldToZone(field) {
    if (this._rows.includes(field) || this._cols.includes(field) || this._values.includes(field)) return;
    if (this._isNumeric(field)) {
      this._values.push(field);
      // The first number chosen is totalled rather than counted
      if (this._values.length === 1 && this._aggFn === 'count') { this._aggFn = 'sum'; const sel = this.queryOne('#pivotAgg'); if (sel) sel.value = 'sum'; }
    } else if (this._rows.length < 2) {
      this._rows.push(field);
    } else if (this._cols.length < 2) {
      this._cols.push(field);
    } else {
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
      `<span class="pivot-zone-chip">${Structra.sharedHelpers.escapeHtml(field)} <span class="pivot-zone-rm" data-rm-zone="${zone}" data-rm-field="${Structra.sharedHelpers.escapeHtml(field)}">${Structra.icons.svg('x', { size: 14 })}</span></span>`;
    this.queryOne('#pivotRows').innerHTML = this._rows.map(f => chip(f, 'rows')).join('') || '<span class="pivot-zone-hint">Click a field on the left</span>';
    this.queryOne('#pivotCols').innerHTML = this._cols.map(f => chip(f, 'cols')).join('') || '<span class="pivot-zone-hint">Click a field on the left</span>';
    this.queryOne('#pivotValues').innerHTML = this._values.map(f => chip(f, 'values')).join('') || '<span class="pivot-zone-hint">Click a field on the left</span>';
  }

  _runPivot() {
    if (this._rows.length === 0 && this._cols.length === 0) {
      Structra.toast('Choose at least one field to group by', 'warning');
      return;
    }
    const main = Structra.dataEngine.mainList();
    if (!main) { this._renderPivotTable(null); return; }
    this._renderPivotTable(this._pivot(main.rows));
  }

  /** Group the rows by the chosen fields and count or total the chosen value fields (in the browser, on the main list) */
  _pivot(rows) {
    const read = (r, f) => Structra.dataEngine.fieldValue(r, f);
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
    const el = this.queryOne('#pivotResult');
    this._last = data && data.rows && data.rows.length ? data : null;
    if (!this._last) {
      el.innerHTML = '<div class="pivot-empty">Nothing to show. This document has no list of records, or the chosen fields have no values.</div>';
      return;
    }

    const cols = data.columns;
    const numeric = new Set(cols.filter((c) => data.rows.every((r) => r[c] === '' || r[c] === null || typeof r[c] === 'number')));
    let html = `<div class="pivot-actions">
        <span class="pivot-count">${data.rows.length.toLocaleString()} ${data.rows.length === 1 ? 'row' : 'rows'}</span>
        <button class="btn btn-sm" type="button" data-pivot-act="copy" title="Copy every row, ready to paste into Excel">Copy all rows</button>
        <button class="btn btn-sm" type="button" data-pivot-act="tab" title="Open every row as a table in a new tab">Open in a new tab</button>
      </div>`;
    html += '<table class="pivot-table"><thead><tr>';
    html += cols.map(c => `<th${numeric.has(c) ? ' class="num"' : ''}>${Structra.sharedHelpers.escapeHtml(c)}</th>`).join('');
    html += '</tr></thead><tbody>';
    for (const row of data.rows.slice(0, 500)) {
      html += '<tr>' + cols.map(c => `<td${numeric.has(c) ? ' class="num"' : ''}>${row[c] != null ? Structra.sharedHelpers.escapeHtml(String(row[c])) : ''}</td>`).join('') + '</tr>';
    }
    html += '</tbody></table>';
    if (data.rows.length > 500) html += `<div class="pivot-more">Showing the first 500 of ${data.rows.length.toLocaleString()} rows. Copy all rows or open them in a new tab to get every row.</div>`;
    el.innerHTML = html;
  }

  _copyAll() {
    if (!this._last) return;
    const { rows, columns } = this._last;
    const cell = (v) => String(v == null ? '' : v).replace(/[\t\r\n]+/g, ' ');
    const text = [columns.join('\t'), ...rows.map((r) => columns.map((c) => cell(r[c])).join('\t'))].join('\n');
    Structra.sharedHelpers.copyToClipboard(text, `${rows.length.toLocaleString()} rows copied: paste them into Excel`);
  }

  _openAll() {
    if (!this._last) return;
    const cmd = document.querySelector('structra-command');
    const name = (Structra.state.fileName || 'data').replace(/\.[^.]+$/, '') + ' (pivot)';
    cmd._openInNewTab(this._last.rows, name).then((opened) => { if (opened) { this.close(); Structra.toast('The pivot is open in a new tab'); } else Structra.toast('Close a tab first: the limit of open tabs is reached.', 'warning'); });
  }

}

customElements.define('structra-pivot', StructraPivot);
