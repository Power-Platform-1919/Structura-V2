/* ============================================================
   STRUCTRA V2 - Filter Bar Component
   <structra-filter> - Advanced data filter with structured
   conditions.  Queries DuckDB directly when available, falls
   back to in-memory filtering.

   Conditions: [{field, op, value, logic}]
   Operators:  eq, neq, gt, lt, gte, lte, contains,
               notcontains, startswith, endswith, isnull, notnull

   Wiring (generated from the code below; update it when you add or remove an event):
     Listens to: state:filterBarOpen, overlay:close, engine:ingested, engine:active,
          state:jsonData, tabs:switched
     Sets state: findBarOpen, filterBarOpen, activeView
   ============================================================ */

class StructraFilter extends StructraComponent {
  static get observedAttributes() { return ['open']; }

  init() {
    this._conditions = [];
    this._columns = [];  // Available column names from active dataset
    this._filterMode = 'structured'; // structured | jsonpath | regex | expression

    this.on('state:filterBarOpen', (d) => {
      this.props.open = d.value ? 'true' : '';
      if (d.value && Structra.state.findBarOpen) Structra.setState('findBarOpen', false);
      this._toggle(d.value);
    });
    this.on('overlay:close', () => this._close());
    this.on('engine:ingested', () => this._refreshColumns());
    this.on('engine:active', () => this._refreshColumns());
    this.on('state:jsonData', () => { this._conditions = []; this._refreshColumns(); this._rebuildRows(); });
    this.on('tabs:switched', () => { this._conditions = []; this._refreshColumns(); this._rebuildRows(); });
  }

  render() {
    this.innerHTML = `
      <div class="filter-panel" id="filterPanel">
        <div class="filter-header">
          <span class="filter-title">Filter Data</span>
          <span class="filter-count" id="filterCount"></span>
          <div class="filter-actions">
            <button class="fb-btn" data-action="apply" title="Apply filter">Apply</button>
            <button class="fb-btn" data-action="clear" title="Clear all">Clear</button>
            <button class="fb-btn" data-action="close" title="Close">
              ${Structra.icons.svg('x')}
            </button>
          </div>
        </div>
        <div class="filter-scope" id="filterScope"></div>
        <div class="filter-summary" id="filterSummary" hidden></div>
        <div class="tabs filter-mode-tabs">
          <button class="tab filter-mode-tab active" type="button" data-fmode="structured">Simple</button>
          <button class="tab filter-mode-tab" type="button" data-fmode="jsonpath">JSONPath</button>
          <button class="tab filter-mode-tab" type="button" data-fmode="regex">Pattern</button>
          <button class="tab filter-mode-tab" type="button" data-fmode="expression">Formula</button>
        </div>
        <div class="filter-body" id="filterBody">
          <div class="filter-conditions" id="filterConditions"></div>
          <button class="filter-add-btn" data-action="addCondition">+ Add condition</button>
        </div>
        <div class="filter-expr-body" id="filterExprBody" style="display:none">
          <textarea class="filter-expr-input" id="filterExprInput" rows="3"
            placeholder="Enter expression…"></textarea>
          <div class="filter-expr-hint" id="filterExprHint"></div>
        </div>
      </div>`;

    this.addEventListener('click', (e) => {
      const modeTab = e.target.closest('[data-fmode]');
      if (modeTab) {
        this._setFilterMode(modeTab.dataset.fmode);
        return;
      }
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const a = btn.dataset.action;
      if (a === 'addCondition') this._addCondition();
      else if (a === 'removeCondition') this._removeCondition(btn);
      else if (a === 'apply') this._apply();
      else if (a === 'clear') this._clear();
      else if (a === 'close') this._close();
    });

    // Listen for Enter key in value inputs
    this.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.target.classList.contains('fc-value') || e.target.id === 'filterExprInput')) {
        if (e.target.id === 'filterExprInput' && !e.ctrlKey) return; // allow newlines unless Ctrl+Enter
        e.preventDefault();
        this._apply();
      }
      if (e.key === 'Escape') this._close();
    });

    this._refreshColumns();
  }

  /* ======== TOGGLE ======== */

  _setFilterMode(mode) {
    this._filterMode = mode;
    this.querySelectorAll('.filter-mode-tab').forEach(t => t.classList.toggle('active', t.dataset.fmode === mode));
    const structuredBody = this.$('#filterBody');
    const exprBody = this.$('#filterExprBody');
    const exprInput = this.$('#filterExprInput');
    const hint = this.$('#filterExprHint');

    if (mode === 'structured') {
      structuredBody.style.display = '';
      exprBody.style.display = 'none';
    } else {
      structuredBody.style.display = 'none';
      exprBody.style.display = '';
      const hints = {
        jsonpath: 'JSONPath expression: $.store.book[?(@.price<10)]',
        regex: 'Regex pattern applied to all string values',
        expression: 'JS expression: row.age > 18 && row.status === "active"'
      };
      if (hint) hint.textContent = hints[mode] || '';
      const placeholders = {
        jsonpath: '$.data[?(@.age > 25)]',
        regex: '\\b[A-Z]{2,}\\b',
        expression: 'row.price > 100 && row.category === "electronics"'
      };
      if (exprInput) {
        exprInput.placeholder = placeholders[mode] || '';
        exprInput.focus();
      }
    }
  }

  _toggle(show) {
    const panel = this.$('#filterPanel');
    if (!panel) return;
    panel.classList.toggle('show', show);
    if (show) {
      this._refreshColumns();
      if (this._conditions.length === 0) this._addCondition();
    }
  }

  _close() {
    Structra.setState('filterBarOpen', false);
  }

  /* ======== COLUMNS ======== */

  /** The columns of the list being filtered: the rows of the main list, not the top-level keys of the document */
  _refreshColumns() {
    this._columns = Structra.dataEngine.mainColumns();
    const main = Structra.dataEngine.mainList();
    const scope = this.$('#filterScope');
    if (scope) {
      scope.textContent = main
        ? `Filtering the ${main.rows.length.toLocaleString()} ${main.rows.length === 1 ? 'row' : 'rows'} of ${main.path === '$' ? 'the document' : main.path.replace(/^\$\./, '')}`
        : 'This document has no list of records to filter';
    }
  }

  /** Start again from one empty condition (the data changed, or Clear was pressed) */
  _rebuildRows() {
    const container = this.$('#filterConditions');
    if (!container) return;
    container.innerHTML = '';
    this._conditions = [];
    const summary = this.$('#filterSummary');
    if (summary) summary.hidden = true;
    const count = this.$('#filterCount');
    if (count) count.textContent = '';
    if (this.$('#filterPanel')?.classList.contains('show') && this._filterMode === 'structured') this._addCondition();
  }

  /* ======== CONDITION ROWS ======== */

  /** Typing a name finds nothing in an id column, so the first condition starts on the first column that holds text */
  _firstTextColumn() {
    const cols = this._columns || [];
    try {
      const main = Structra.dataEngine.mainList();
      const sample = main ? main.rows.slice(0, 50) : [];
      const hit = cols.find((c) => sample.some((r) => typeof Structra.dataEngine.fieldValue(r, c) === 'string'));
      if (hit) return hit;
    } catch { /* no list: use the first column */ }
    return cols[0] || '';
  }

  _addCondition() {
    const container = this.$('#filterConditions');
    if (!container) return;

    const idx = this._conditions.length;
    this._conditions.push({ field: this._firstTextColumn(), op: 'contains', value: '', logic: 'AND' });

    const row = document.createElement('div');
    row.className = 'fc-row';
    row.dataset.idx = idx;

    // Logic selector (hidden for first condition)
    const logicHtml = idx > 0
      ? `<select class="fc-logic"><option value="AND"${this._conditions[idx].logic === 'AND' ? ' selected' : ''}>AND</option><option value="OR"${this._conditions[idx].logic === 'OR' ? ' selected' : ''}>OR</option></select>`
      : '<span class="fc-logic-placeholder">Where</span>';

    // Field selector
    const fieldOpts = this._columns.map(c =>
      `<option value="${Structra.sharedHelpers.esc(c)}"${c === this._conditions[idx].field ? ' selected' : ''}>${Structra.sharedHelpers.esc(c)}</option>`
    ).join('');

    // Operator selector
    const ops = [
      ['contains',    'contains'],
      ['notcontains', 'not contains'],
      ['eq',          '='],
      ['neq',         '≠'],
      ['gt',          '>'],
      ['lt',          '<'],
      ['gte',         '≥'],
      ['lte',         '≤'],
      ['startswith',  'starts with'],
      ['endswith',    'ends with'],
      ['isnull',      'is null'],
      ['notnull',     'not null'],
    ];
    const opOpts = ops.map(([val, label]) =>
      `<option value="${val}">${label}</option>`
    ).join('');

    row.innerHTML = `
      ${logicHtml}
      <select class="fc-field">${fieldOpts}</select>
      <select class="fc-op">${opOpts}</select>
      <input type="text" class="fc-value" placeholder="value…" autocomplete="off">
      <button class="fb-btn fc-remove" data-action="removeCondition" title="Remove">
        ${Structra.icons.svg('x', { size: 14 })}
      </button>`;

    container.appendChild(row);

    // Hide value input for isnull/notnull
    const opSelect = row.querySelector('.fc-op');
    const valueInput = row.querySelector('.fc-value');
    opSelect.addEventListener('change', () => {
      valueInput.style.display = (opSelect.value === 'isnull' || opSelect.value === 'notnull') ? 'none' : '';
    });

    // Focus the value input
    valueInput.focus();
  }

  _removeCondition(btn) {
    const row = btn.closest('.fc-row');
    if (!row) return;
    const idx = parseInt(row.dataset.idx, 10);
    row.remove();
    this._conditions.splice(idx, 1);
    // Re-index remaining rows
    this.$('#filterConditions').querySelectorAll('.fc-row').forEach((r, i) => {
      r.dataset.idx = i;
    });
  }

  /* ======== READ CONDITIONS FROM DOM ======== */

  _readConditions() {
    const rows = this.$$('#filterConditions .fc-row');
    const conditions = [];
    rows.forEach((row, i) => {
      const field = row.querySelector('.fc-field')?.value || '';
      const op = row.querySelector('.fc-op')?.value || 'contains';
      const value = row.querySelector('.fc-value')?.value || '';
      const logicEl = row.querySelector('.fc-logic');
      const logic = logicEl ? logicEl.value : 'AND';
      if (field) conditions.push({ field, op, value, logic });
    });
    return conditions;
  }

  /* ======== APPLY / CLEAR ======== */

  async _apply() {
    const countEl = this.$('#filterCount');
    if (countEl) countEl.textContent = 'Querying…';

    try {
      let result;
      if (this._filterMode === 'structured') {
        const conditions = this._readConditions();
        if (conditions.length === 0) { this._clear(); return; }
        result = await Structra.dataEngine.filterDb(conditions);
      } else {
        const expr = (this.$('#filterExprInput') || {}).value || '';
        if (!expr.trim()) { this._clear(); return; }

        if (this._filterMode === 'jsonpath') {
          result = await Structra.dataEngine.filterByPath(expr.trim());
        } else if (this._filterMode === 'regex') {
          result = await Structra.dataEngine.regexSearch(expr.trim());
        } else if (this._filterMode === 'expression') {
          result = await Structra.dataEngine.filterByExpression(expr.trim());
        }
      }

      const total = result ? (result.total ?? (Array.isArray(result) ? result.length : 0)) : 0;
      if (countEl) countEl.textContent = total === 0 ? 'No rows match' : `${total.toLocaleString()} ${total === 1 ? 'row' : 'rows'} match`;
      // Say which condition produced these rows
      const summary = this.$('#filterSummary');
      if (summary && result && result.query) { summary.hidden = false; summary.textContent = result.query; summary.title = result.query; }
      // The result is a table: show it
      if (total > 0 && ['tree', 'editor', 'overview', 'graph', 'schema'].includes(Structra.state.activeView)) Structra.setState('activeView', 'table');
      Structra.log.info('Filter', `Applied ${this._filterMode} filter → ${total} rows`);
    } catch (err) {
      Structra.log.error('Filter', 'Filter failed', err.message);
      if (countEl) countEl.textContent = 'Error';
      Structra.toast(err.message, 'error');
    }
  }

  _clear() {
    Structra.dataEngine.clearQuery();
    this._rebuildRows();          // leaves one empty condition to type into
  }

  /* ======== UTILS ======== */

}

customElements.define('structra-filter', StructraFilter);
