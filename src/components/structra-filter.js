/* ============================================================
   STRUCTRA V2 — Filter Bar Component
   <structra-filter> — Advanced data filter with structured
   conditions.  Queries DuckDB directly when available, falls
   back to in-memory filtering.

   Conditions: [{field, op, value, logic}]
   Operators:  eq, neq, gt, lt, gte, lte, contains,
               notcontains, startswith, endswith, isnull, notnull
   ============================================================ */

class StructraFilter extends StructraElement {
  static get observedAttributes() { return ['open']; }

  init() {
    this._conditions = [];
    this._columns = [];  // Available column names from active dataset
    this._filterMode = 'structured'; // structured | jsonpath | regex | expression

    this.on('state:filterBarOpen', (d) => {
      this.props.open = d.value ? 'true' : '';
      if (d.value && Structra.state.findBarOpen) Structra.set('findBarOpen', false);
      this._toggle(d.value);
    });
    this.on('overlay:close', () => this._close());
    this.on('engine:ingested', () => this._refreshColumns());
    this.on('engine:active', () => this._refreshColumns());
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
        <div class="tabs filter-mode-tabs">
          <button class="tab filter-mode-tab active" type="button" data-fmode="structured">Structured</button>
          <button class="tab filter-mode-tab" type="button" data-fmode="jsonpath">JSONPath</button>
          <button class="tab filter-mode-tab" type="button" data-fmode="regex">Regex</button>
          <button class="tab filter-mode-tab" type="button" data-fmode="expression">Expression</button>
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
    Structra.set('filterBarOpen', false);
  }

  /* ======== COLUMNS ======== */

  _refreshColumns() {
    const ds = Structra.engine.getActive();
    if (ds && ds.indexes.columns) {
      this._columns = ds.indexes.columns.map(c => c.name);
    } else if (ds && Array.isArray(ds.raw) && ds.raw.length > 0 && typeof ds.raw[0] === 'object') {
      // Fallback: extract keys from first few rows
      const keySet = new Set();
      const limit = Math.min(ds.raw.length, 100);
      for (let i = 0; i < limit; i++) {
        if (ds.raw[i]) Object.keys(ds.raw[i]).forEach(k => keySet.add(k));
      }
      this._columns = [...keySet];
    } else {
      this._columns = [];
    }
  }

  /* ======== CONDITION ROWS ======== */

  _addCondition() {
    const container = this.$('#filterConditions');
    if (!container) return;

    const idx = this._conditions.length;
    this._conditions.push({ field: this._columns[0] || '', op: 'contains', value: '', logic: 'AND' });

    const row = document.createElement('div');
    row.className = 'fc-row';
    row.dataset.idx = idx;

    // Logic selector (hidden for first condition)
    const logicHtml = idx > 0
      ? `<select class="fc-logic"><option value="AND"${this._conditions[idx].logic === 'AND' ? ' selected' : ''}>AND</option><option value="OR"${this._conditions[idx].logic === 'OR' ? ' selected' : ''}>OR</option></select>`
      : '<span class="fc-logic-placeholder">Where</span>';

    // Field selector
    const fieldOpts = this._columns.map(c =>
      `<option value="${Structra.util.esc(c)}">${Structra.util.esc(c)}</option>`
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
        result = await Structra.engine.filterDb(conditions);
      } else {
        const expr = (this.$('#filterExprInput') || {}).value || '';
        if (!expr.trim()) { this._clear(); return; }

        if (this._filterMode === 'jsonpath') {
          result = await Structra.engine.filterByPath(expr.trim());
        } else if (this._filterMode === 'regex') {
          result = await Structra.engine.regexSearch(expr.trim());
        } else if (this._filterMode === 'expression') {
          result = await Structra.engine.filterByExpression(expr.trim());
        }
      }

      const total = result ? (result.total ?? (Array.isArray(result) ? result.length : 0)) : 0;
      if (countEl) countEl.textContent = `${total} rows`;
      Structra.log.info('Filter', `Applied ${this._filterMode} filter → ${total} rows`);
    } catch (err) {
      Structra.log.error('Filter', 'Filter failed', err.message);
      if (countEl) countEl.textContent = 'Error';
      Structra.toast(err.message, 'error');
    }
  }

  _clear() {
    this._conditions = [];
    const container = this.$('#filterConditions');
    if (container) container.innerHTML = '';
    const countEl = this.$('#filterCount');
    if (countEl) countEl.textContent = '';
    Structra.engine.clearQuery();
  }

  /* ======== UTILS ======== */

}

customElements.define('structra-filter', StructraFilter);
