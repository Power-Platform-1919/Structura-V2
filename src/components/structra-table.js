/* ============================================================
   STRUCTRA V2 — Table View Component
   <structra-table> — tabular data view with:
   - Engine-backed sorting + pagination
   - Virtual scrolling via Structra.virtualList for large datasets
   - Sticky header, row selection, column sort indicators
   - Page-size selector + keyboard navigation
   ============================================================ */

class StructraTable extends StructraElement {
  static get observedAttributes() { return ['path']; }

  init() {
    this._sortCol = null;
    this._sortAsc = true;
    this._page = 0;
    this._pageSize = parseInt(Structra.settings.get('pageSize'), 10) || 50;
    this._stale = false;
    this._totalRows = 0;
    this._keys = [];
    this._basePath = '$';
    this._rows = null;       // Full sorted array reference (for virtual scroll)
    this._vlist = null;       // VirtualList controller (if active)
    this._ROW_HEIGHT = 32;    // Estimated row height in px for virtual scroll
    this._VIRTUAL_THRESHOLD = 200; // Use virtual scroll above this many rows
    this._colFilters = {};    // {colName: filterValue}
    this._hiddenCols = new Set();
    this._colOrder = null;            // array of column names, or null for data order
    this._expanded = new Map();       // object column -> sub keys shown as "col.sub" columns
    this._expandParent = new Map();   // "col.sub" -> col
    this._origOf = new WeakMap();     // projected row copy -> source row
    this._baseRows = null;            // unsorted source array, used to find a row's real index
    this._indexMap = null;
    this._indexMapFor = null;

    this.on('state:jsonData', () => {
      this._stale = true;
      this._page = 0;
      this._sortCol = null;
      this._sortAsc = true;
      this._colFilters = {};
      this._hiddenCols = new Set();
      this._colOrder = null;
      this._expanded = new Map();
      this._expandParent = new Map();
      Structra.log.debug('Table', 'jsonData changed — stale=true');
      if (Structra.state.activeView === 'table') this.renderTable();
    });
    this.on('view:switched', (view) => {
      if (view === 'table' && this._stale) {
        Structra.log.info('Table', 'View switched to table — rendering');
        this.renderTable();
      }
    });
    this.on('engine:ingested', () => {
      this._stale = true;
      this._page = 0;
      if (Structra.state.activeView === 'table') this.renderTable();
    });
    this.on('settings:changed', (d) => {
      if (d && d.key === 'pageSize') {
        this._pageSize = parseInt(d.value, 10) || 50;
        this._page = 0;
        if (Structra.state.activeView === 'table') this.renderTable();
      }
    });
    // Universal filter: re-render when filter changes
    this.on('engine:filter-changed', () => {
      this._stale = true;
      this._page = 0;
      if (Structra.state.activeView === 'table') this.renderTable();
    });
  }

  render() {
    this.innerHTML = `
      <div class="table-container" id="tableContainer">
        <div class="table-toolbar" id="tablePager"></div>
        <div class="table-scroll" id="tableScroll">
          <table class="data-table">
            <thead id="tableHead"></thead>
            <tbody id="tableBody"></tbody>
          </table>
        </div>
      </div>`;
    this.renderTable();

    this.addEventListener('click', (e) => {
      // Column filter icon (must be checked BEFORE th sort)
      const colFilter = e.target.closest('[data-col-filter]');
      if (colFilter) {
        e.stopPropagation();
        this._showColFilterDropdown(colFilter, colFilter.dataset.colFilter);
        return;
      }
      // Sort header click
      const th = e.target.closest('th[data-col]');
      if (th) {
        const col = th.dataset.col;
        if (this._sortCol === col) this._sortAsc = !this._sortAsc;
        else { this._sortCol = col; this._sortAsc = true; }
        this._page = 0;
        this.renderTable();
        return;
      }
      // Pagination buttons
      const btn = e.target.closest('[data-page-action]');
      if (btn) {
        this._handlePageAction(btn.dataset.pageAction);
        return;
      }
      // Page size selector
      const opt = e.target.closest('[data-page-size]');
      if (opt) {
        this._pageSize = parseInt(opt.dataset.pageSize, 10);
        this._page = 0;
        Structra.settings.set('pageSize', this._pageSize);
        this.renderTable();
        return;
      }
      // Row selection
      const tr = e.target.closest('tbody tr[data-path]');
      if (tr) {
        this.$$('tbody tr.row-sel').forEach(r => r.classList.remove('row-sel'));
        tr.classList.add('row-sel');
        Structra.set('currentPath', tr.dataset.path);
        Structra.events.emit('tree:node-selected', tr.dataset.path);
      }
    });

    // Column header right-click menu
    this.addEventListener('contextmenu', (e) => {
      const th = e.target.closest('th[data-col]');
      if (th) {
        e.preventDefault();
        this._showColumnMenu(e.clientX, e.clientY, th.dataset.col);
      }
    });
  }

  /* ======== DATA RESOLUTION ======== */

  /** Rows and columns for the current view, after expand and column order are applied */
  _resolveData() {
    return this._projectColumns(this._resolveBase());
  }

  _projectColumns(result) {
    if (!result) return result;
    let { allRows, keys } = result;

    if (this._expanded.size) {
      const plan = [];                    // per source column: how it appears in the table
      this._expandParent = new Map();
      for (const col of keys) {
        const subs = this._expanded.get(col);
        if (subs && subs.length) {
          const names = subs.map((s) => col + '.' + s);
          names.forEach((n) => this._expandParent.set(n, col));
          plan.push({ col, subs, names });
        } else {
          plan.push({ col });
        }
      }
      keys = plan.flatMap((p) => p.names || [p.col]);
      allRows = allRows.map((row) => {
        if (!row || typeof row !== 'object') return row;
        const flat = {};
        for (const p of plan) {
          if (!p.subs) { flat[p.col] = row[p.col]; continue; }
          const obj = row[p.col];
          p.subs.forEach((s, i) => {
            flat[p.names[i]] = obj && typeof obj === 'object' ? obj[s] : undefined;
          });
        }
        this._origOf.set(flat, row);
        return flat;
      });
      // A sort on an expanded column cannot happen in the engine, do it here
      if (this._sortCol && this._expandParent.has(this._sortCol)) {
        allRows = this._sortRows([...allRows], this._sortCol, this._sortAsc);
      }
    } else {
      this._expandParent = new Map();
    }

    if (this._colOrder) {
      const set = new Set(keys);
      const ordered = this._colOrder.filter((k) => set.has(k));
      const rest = keys.filter((k) => !this._colOrder.includes(k));
      keys = [...ordered, ...rest];
    }
    return { ...result, allRows, keys };
  }

  _resolveBase() {
    const dataset = Structra.engine.getActive();
    const query = Structra.engine.getQuery();
    let allRows, totalRows, keys, basePath;

    // Active query (from find, filter, or SQL) — render query result rows
    if (query && query.rows && query.rows.length > 0) {
      allRows = query.rows;
      totalRows = allRows.length;
      keys = query.columns && query.columns.length > 0
        ? query.columns
        : Structra.engine.collectKeys(allRows);
      basePath = '$';
      this._baseRows = dataset ? dataset.raw : null;
      if (this._sortCol && keys.includes(this._sortCol)) {
        allRows = this._sortRows([...allRows], this._sortCol, this._sortAsc);
      }
      return { allRows, totalRows, keys, basePath, filtered: true };
    }

    if (dataset && (dataset.meta.shape === 'flat-array' || dataset.meta.shape === 'nested-array')) {
      // Engine-backed: sort full array, return reference
      if (this._sortCol) {
        Structra.engine.sort(this._sortCol, this._sortAsc ? 'asc' : 'desc');
      }
      const ds = Structra.engine.getActive();
      this._baseRows = ds.raw;
      allRows = ds.indexes.sorted ? ds.indexes.sorted.refs : ds.raw;
      totalRows = Array.isArray(allRows) ? allRows.length : 0;
      keys = dataset.indexes.columns
        ? dataset.indexes.columns.map(c => c.name)
        : Structra.engine.collectKeys(allRows);
      basePath = '$';
    } else {
      // Fallback: find array in raw data
      const data = Structra.state.jsonData;
      const arr = Structra.engine.findFirstObjectArray(data);
      if (!arr || arr.rows.length === 0) return null;
      totalRows = arr.rows.length;
      basePath = arr.path;
      this._baseRows = arr.rows;
      keys = Structra.engine.collectKeys(arr.rows);

      // Sort if needed
      if (this._sortCol && keys.includes(this._sortCol)) {
        allRows = this._sortRows([...arr.rows], this._sortCol, this._sortAsc);
      } else {
        allRows = arr.rows;
      }
    }

    return { allRows, totalRows, keys, basePath };
  }

  _applyColumnFiltersToResult(result) {
    if (!result || !this._colFilters || Object.keys(this._colFilters).length === 0) return result;
    const filtered = this._applyColFilters(result.allRows);
    return { ...result, allRows: filtered, totalRows: filtered.length, filtered: true };
  }

  _sortRows(rows, col, asc) {
    return rows.sort((a, b) => {
      const va = a ? a[col] : undefined;
      const vb = b ? b[col] : undefined;
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      const cmp = typeof va === 'string' ? va.localeCompare(vb) : (va > vb ? 1 : va < vb ? -1 : 0);
      return asc ? cmp : -cmp;
    });
  }

  /* ======== RENDER ======== */

  renderTable() {
    this._stale = false;
    Structra.log.info('Table', 'renderTable()');
    const t0 = performance.now();

    // Destroy previous virtual list if any, and the row groups it added to the table
    if (this._vlist) { this._vlist.destroy(); this._vlist = null; }
    this.$$('table.data-table > tbody.vl-chunk, table.data-table > tbody.vl-sentinel').forEach((el) => el.remove());

    const head = this.$('#tableHead');
    const body = this.$('#tableBody');
    const pager = this.$('#tablePager');
    if (!head || !body) return;

    const resolved = this._applyColumnFiltersToResult(this._resolveData());
    if (!resolved) {
      head.innerHTML = '';
      body.innerHTML = '<tr><td style="color:var(--text-muted);padding:var(--sp-4)">No tabular data found</td></tr>';
      if (pager) pager.innerHTML = '';
      return;
    }

    const { allRows, totalRows, keys, basePath } = resolved;
    this._totalRows = totalRows;
    this._keys = keys;
    this._basePath = basePath;
    this._rows = allRows;

    // Render header
    this._renderHeader(head, keys);

    // Render toolbar (show filter indicator if filtered)
    this._renderToolbar(pager, totalRows, !!resolved.filtered);

    // Choose rendering strategy
    if (totalRows > this._VIRTUAL_THRESHOLD) {
      this._renderVirtual(body, allRows, keys, basePath, totalRows);
    } else {
      this._renderPage(body, allRows, keys, basePath, totalRows);
    }

    Structra.log.perf('Table', 'renderTable()', performance.now() - t0);
  }

  /* ======== HEADER ======== */

  _renderHeader(head, keys) {
    const visibleKeys = this._hiddenCols ? keys.filter(k => !this._hiddenCols.has(k)) : keys;
    const sortIcon = (col) => {
      if (this._sortCol !== col) return '';
      return this._sortAsc ? ' ↑' : ' ↓';
    };
    const filterIcon = (col) => {
      const isFiltered = this._colFilters && this._colFilters[col];
      return `<span class="th-filter-icon${isFiltered ? ' th-filter-active' : ''}" data-col-filter="${Structra.util.esc(col)}" title="Filter column">⫧</span>`;
    };
    head.innerHTML = '<tr>' + visibleKeys.map(k =>
      `<th data-col="${Structra.util.esc(k)}"><span class="th-label">${Structra.util.esc(k)}${sortIcon(k)}</span>${filterIcon(k)}</th>`
    ).join('') + '</tr>';
    this._visibleKeys = visibleKeys;
  }

  /* ======== TOOLBAR ======== */

  _renderToolbar(pager, totalRows, filtered) {
    if (!pager) return;

    const maxPage = Math.max(0, Math.ceil(totalRows / this._pageSize) - 1);
    const from = this._page * this._pageSize + 1;
    const to = Math.min((this._page + 1) * this._pageSize, totalRows);

    // Page size options
    const sizes = [25, 50, 100, 250, 500];
    const sizeOpts = sizes.map(s =>
      `<span class="table-size-opt ${s === this._pageSize ? 'active' : ''}" data-page-size="${s}">${s}</span>`
    ).join('');

    const useVirtual = totalRows > this._VIRTUAL_THRESHOLD;
    const filterBadge = filtered
      ? '<span class="filter-badge" title="Filtered results">🔍 filtered</span>'
      : '';

    const hiddenBadge = this._hiddenCols.size
      ? `<span class="filter-badge" data-page-action="unhide" title="Show hidden columns">⊘ ${this._hiddenCols.size} hidden</span>`
      : '';
    pager.innerHTML = `
      ${filterBadge}${hiddenBadge}
      <button data-page-action="first" ${this._page === 0 || useVirtual ? 'disabled' : ''} title="First page">⟨⟨</button>
      <button data-page-action="prev" ${this._page === 0 || useVirtual ? 'disabled' : ''} title="Previous page">⟨</button>
      <span class="table-page-info">${useVirtual
        ? `${totalRows.toLocaleString()} rows (virtual scroll)`
        : `${from.toLocaleString()}–${to.toLocaleString()} of ${totalRows.toLocaleString()}`
      }</span>
      <button data-page-action="next" ${this._page >= maxPage || useVirtual ? 'disabled' : ''} title="Next page">⟩</button>
      <button data-page-action="last" ${this._page >= maxPage || useVirtual ? 'disabled' : ''} title="Last page">⟩⟩</button>
      <span class="table-sep"></span>
      <span class="table-size-label">Rows:</span>
      ${sizeOpts}`;
  }

  /* ======== PAGINATED RENDER (small datasets) ======== */

  _renderPage(body, allRows, keys, basePath, totalRows) {
    const offset = this._page * this._pageSize;
    const rows = allRows.slice(offset, offset + this._pageSize);
    body.innerHTML = this._buildRowsHtml(rows, keys, basePath, offset);
  }

  /* ======== VIRTUAL SCROLL RENDER (large datasets) ======== */

  _renderVirtual(body, allRows, keys, basePath, totalRows) {
    body.innerHTML = '';
    const self = this;
    const chunkSize = this._pageSize; // Reuse page size as chunk size

    // Chunks are <tbody> row groups inside the <table>; the scroll box is #tableScroll
    this._vlist = Structra.virtualList.create({
      container: this.$('table.data-table'),
      root: this.$('#tableScroll'),
      chunkTag: 'tbody',
      totalItems: totalRows,
      chunkSize,
      offscreenPx: 2000,

      buildChunk(start, end) {
        const rows = allRows.slice(start, end);
        return self._buildRowsHtml(rows, keys, basePath, start);
      },

      rehydrate(chunkEl, start, end) {
        const rows = allRows.slice(start, end);
        chunkEl.innerHTML = self._buildRowsHtml(rows, keys, basePath, start);
      },

      sentinelHtml(remaining) {
        return `<tr class="vl-sentinel-row"><td colspan="${keys.length}" style="color:var(--text-muted);text-align:center;padding:var(--sp-2)">Loading ${Math.min(remaining, chunkSize)} more of ${remaining.toLocaleString()} rows…</td></tr>`;
      },
    });

    this._vlist.init();
    Structra.log.info('Table', `Virtual scroll active: ${totalRows} rows, chunk=${chunkSize}`);
  }

  /* ======== ROW HTML BUILDER ======== */

  _buildRowsHtml(rows, keys, basePath, startOffset) {
    const visibleKeys = this._visibleKeys || keys;
    let html = '';
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const path = this._pathFor(r);
      let cells = '';
      for (let k = 0; k < visibleKeys.length; k++) {
        const v = r ? r[visibleKeys[k]] : undefined;
        cells += `<td>${this._formatCell(v)}</td>`;
      }
      html += path ? `<tr data-path="${Structra.util.esc(path)}">${cells}</tr>` : `<tr>${cells}</tr>`;
    }
    return html;
  }

  /** Path of a row in the open document. Empty when the row is not part of it (for example SQL output). */
  _pathFor(row) {
    const src = (row && this._origOf.get(row)) || row;
    if (!src || typeof src !== 'object' || !this._baseRows) return '';
    if (this._indexMapFor !== this._baseRows) {
      const map = new Map();
      const arr = this._baseRows;
      for (let i = 0; i < arr.length; i++) if (arr[i] && typeof arr[i] === 'object') map.set(arr[i], i);
      this._indexMap = map;
      this._indexMapFor = arr;
    }
    const idx = this._indexMap.get(src);
    if (idx === undefined) return '';
    return `${Structra.paths.strip(this._basePath)}[${idx}]`;
  }

  /* ======== PAGE ACTIONS ======== */

  _handlePageAction(action) {
    if (action === 'unhide') { this._hiddenCols.clear(); this.renderTable(); return; }
    const maxPage = Math.max(0, Math.ceil(this._totalRows / this._pageSize) - 1);
    if (action === 'first') this._page = 0;
    else if (action === 'prev') this._page = Math.max(0, this._page - 1);
    else if (action === 'next') this._page = Math.min(maxPage, this._page + 1);
    else if (action === 'last') this._page = maxPage;
    this.renderTable();
  }

  /* ======== UTILITIES ======== */

  /* _collectKeys and _findFirstArray removed — use Structra.engine.collectKeys() and Structra.engine.findFirstObjectArray() */

  _formatCell(val) {
    if (val === null || val === undefined) return '<span class="tree-null">null</span>';
    if (typeof val === 'boolean') return `<span class="bool-badge ${val ? 'bool-true' : 'bool-false'}">${val}</span>`;
    if (typeof val === 'object') return this._formatNested(val);
    const s = String(val);
    if (s.length > 120) return Structra.util.esc(s.slice(0, 117)) + '…';
    return Structra.util.esc(s);
  }

  /**
   * A cell that holds an object or a list. SharePoint Choice, Person and Lookup fields are objects whose
   * useful part is one field (Value, DisplayName, Title...), so show that instead of "{…}".
   */
  _formatNested(val) {
    const esc = Structra.util.esc;
    const FRIENDLY = ['Value', 'DisplayName', 'Title', 'Name', 'Email', 'value', 'displayName', 'title', 'name', 'label', 'text'];
    const brief = (o) => {
      if (o === null || o === undefined) return 'null';
      if (typeof o !== 'object') return String(o);
      const k = FRIENDLY.find((f) => o[f] !== undefined && o[f] !== null && typeof o[f] !== 'object');
      return k === undefined ? null : String(o[k]);
    };
    const full = esc(JSON.stringify(val).slice(0, 300));

    if (Array.isArray(val)) {
      if (!val.length) return '<span class="tree-null">[ ] empty</span>';
      const parts = val.slice(0, 3).map(brief);
      if (parts.every((p) => p !== null)) {
        const more = val.length > 3 ? ` <span class="tree-bracket">+${val.length - 3}</span>` : '';
        return `<span title="${full}">${esc(parts.join(', '))}${more}</span>`;
      }
      return `<span class="tree-bracket" title="${full}">[${val.length} ${val.length === 1 ? 'item' : 'items'}]</span>`;
    }
    const one = brief(val);
    if (one !== null) return `<span title="${full}">${esc(one)}</span>`;
    const keys = Object.keys(val).filter((k) => !k.startsWith('@'));
    if (!keys.length) return '<span class="tree-null">{ } empty</span>';
    return `<span class="tree-bracket" title="${full}">{ ${esc(keys.slice(0, 3).join(', '))}${keys.length > 3 ? ', …' : ''} }</span>`;
  }


  /* ======== COLUMN CONTEXT MENU (right-click) ======== */

  _showColumnMenu(x, y, col) {
    this._dismissColumnMenu();
    const hasFilter = !!(this._colFilters && this._colFilters[col]);
    const hasObjects = !this._expandParent.has(col) && this._rows && this._rows.slice(0, 500).some(row => {
      const v = row && row[col];
      return v !== null && typeof v === 'object' && !Array.isArray(v);
    });
    const isHidden = this._hiddenCols && this._hiddenCols.has(col);

    const menu = document.createElement('div');
    menu.className = 'col-ctx-menu';
    menu.style.cssText = `left:${x}px;top:${y}px`;
    menu.innerHTML = `
      <div class="col-ctx-item" data-col-action="sort-asc">▲ Sort Ascending</div>
      <div class="col-ctx-item" data-col-action="sort-desc">▼ Sort Descending</div>
      <div class="col-ctx-sep"></div>
      <div class="col-ctx-item" data-col-action="filter">⏷ Filter Values…</div>
      ${hasFilter ? `<div class="col-ctx-item" data-col-action="clear-filter">${Structra.icons.svg('x', { size: 14 })} Clear Filter</div>` : ''}
      <div class="col-ctx-sep"></div>
      ${hasObjects ? '<div class="col-ctx-item" data-col-action="expand">⊞ Expand Object Column…</div>' : ''}
      ${this._expandParent.has(col) ? `<div class="col-ctx-item" data-col-action="collapse">⊟ Collapse "${Structra.util.esc(this._expandParent.get(col))}"</div>` : ''}
      <div class="col-ctx-item" data-col-action="move-left">◀ Move Left</div>
      <div class="col-ctx-item" data-col-action="move-right">${Structra.icons.svg('arrow-right', { size: 14 })} Move Right</div>
      <div class="col-ctx-item" data-col-action="hide">⊘ Hide Column</div>
      ${this._hiddenCols.size ? `<div class="col-ctx-item" data-col-action="unhide-all">⊙ Show ${this._hiddenCols.size} Hidden Column${this._hiddenCols.size === 1 ? '' : 's'}</div>` : ''}
      <div class="col-ctx-item" data-col-action="chart">📈 Chart This Column</div>
      <div class="col-ctx-item" data-col-action="stats">📊 Column Stats</div>
      <div class="col-ctx-item" data-col-action="distinct">🔢 Distinct Values</div>
      <div class="col-ctx-item" data-col-action="copy-col">📋 Copy Column Values</div>
    `;

    menu.addEventListener('click', (e) => {
      const item = e.target.closest('[data-col-action]');
      if (!item) return;
      const action = item.dataset.colAction;
      this._execColumnAction(action, col);
      this._dismissColumnMenu();
    });

    document.body.appendChild(menu);
    this._activeColMenu = menu;

    // Close on outside click
    const close = (e) => {
      if (!menu.contains(e.target)) {
        this._dismissColumnMenu();
        document.removeEventListener('mousedown', close);
      }
    };
    setTimeout(() => document.addEventListener('mousedown', close), 0);
  }

  _dismissColumnMenu() {
    if (this._activeColMenu) {
      this._activeColMenu.remove();
      this._activeColMenu = null;
    }
  }

  async _execColumnAction(action, col) {
    switch (action) {
      case 'sort-asc':
        this._sortCol = col; this._sortAsc = true; this._page = 0;
        this.renderTable();
        break;
      case 'sort-desc':
        this._sortCol = col; this._sortAsc = false; this._page = 0;
        this.renderTable();
        break;
      case 'filter':
        this._showColFilterPanel(col);
        break;
      case 'clear-filter':
        delete this._colFilters[col];
        this._page = 0;
        this.renderTable();
        Structra.toast(`Filter cleared on "${col}"`);
        break;
      case 'expand':
        this._showExpandPicker(col);
        break;
      case 'chart':
        Structra.events.emit('charts:open', { path: this._basePath === '$' ? '(root)' : this._basePath, column: col });
        break;
      case 'collapse': {
        const parent = this._expandParent.get(col);
        if (parent) { this._expanded.delete(parent); this.renderTable(); }
        break;
      }
      case 'move-left':
      case 'move-right': {
        const order = [...(this._visibleKeys || this._keys)];
        const i = order.indexOf(col);
        const j = action === 'move-left' ? i - 1 : i + 1;
        if (i < 0 || j < 0 || j >= order.length) break;
        [order[i], order[j]] = [order[j], order[i]];
        this._colOrder = order;
        this.renderTable();
        break;
      }
      case 'unhide-all':
        this._hiddenCols.clear();
        this.renderTable();
        break;
      case 'hide':
        this._hiddenCols.add(col);
        this.renderTable();
        Structra.toast(`"${col}" hidden. Use the "hidden" chip above the table to show it again.`);
        break;
      case 'stats': {
        // DuckDB column stats query
        try {
          const sql = `SELECT 
            COUNT(*) as total,
            COUNT(DISTINCT "${col}") as distinct_count,
            COUNT(*) - COUNT("${col}") as null_count,
            MIN("${col}") as min_val,
            MAX("${col}") as max_val
          FROM data`;
          const result = await Structra.engine.runSql(sql);
          if (result && result.rows && result.rows[0]) {
            const s = result.rows[0];
            Structra.toast(`${col}: ${s.distinct_count} distinct, ${s.null_count} nulls, min=${s.min_val}, max=${s.max_val}`);
          } else {
            // Fallback in-memory
            const vals = (this._rows || []).map(r => r && r[col]).filter(v => v != null);
            Structra.toast(`${col}: ${new Set(vals).size} distinct of ${vals.length} values`);
          }
        } catch {
          const vals = (this._rows || []).map(r => r && r[col]).filter(v => v != null);
          Structra.toast(`${col}: ${new Set(vals).size} distinct of ${vals.length} values`);
        }
        break;
      }
      case 'distinct': {
        // Show distinct values via DuckDB
        try {
          const sql = `SELECT "${col}" as val, COUNT(*) as cnt FROM data GROUP BY "${col}" ORDER BY cnt DESC LIMIT 20`;
          const result = await Structra.engine.runSql(sql);
          if (result && result.rows) {
            const top = result.rows.map(r => `${r.val} (${r.cnt})`).join(', ');
            Structra.toast(`Top values: ${top}`, 'info', 5000);
          }
        } catch {
          // Fallback
          const freq = {};
          (this._rows || []).forEach(r => { const v = r && r[col]; freq[v] = (freq[v] || 0) + 1; });
          const top = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([v, c]) => `${v} (${c})`).join(', ');
          Structra.toast(`Top values: ${top}`, 'info', 5000);
        }
        break;
      }
      case 'copy-col': {
        const vals = (this._rows || []).map(r => r ? String(r[col] ?? '') : '').join('\n');
        Structra.util.copy(vals, `${col} values copied`);
        break;
      }
    }
  }

  /* ======== EXPAND OBJECT COLUMN (pick which keys become columns) ======== */

  _showExpandPicker(col) {
    this._dismissColumnMenu();
    const freq = new Map();
    const sample = (this._rows || []).slice(0, 500);
    for (const row of sample) {
      const v = row && row[col];
      if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
      for (const k of Object.keys(v)) freq.set(k, (freq.get(k) || 0) + 1);
    }
    const keys = [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
    if (!keys.length) { Structra.toast('No keys to expand in this column'); return; }

    const box = document.createElement('div');
    box.className = 'col-pick';
    box.innerHTML = `
      <div class="col-pick-title">Expand "${Structra.util.esc(col)}" into columns</div>
      <div class="col-pick-list">${keys.slice(0, 60).map((k, i) =>
        `<label class="col-pick-item"><input type="checkbox" value="${Structra.util.esc(k)}" ${i < 12 ? 'checked' : ''}> ${Structra.util.esc(k)}</label>`).join('')}</div>
      ${keys.length > 60 ? `<div class="col-pick-note">Showing the 60 most common of ${keys.length} keys</div>` : ''}
      <div class="col-pick-actions">
        <button class="btn btn-primary" data-pick="ok">Expand</button>
        <button class="btn" data-pick="cancel">Cancel</button>
      </div>`;
    document.body.appendChild(box);

    const done = () => box.remove();
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pick]');
      if (!b) return;
      if (b.dataset.pick === 'ok') {
        const chosen = [...box.querySelectorAll('input:checked')].map((i) => i.value);
        if (chosen.length) {
          this._expanded.set(col, chosen);
          this._page = 0;
          this.renderTable();
        }
      }
      done();
    });
    setTimeout(() => {
      const close = (e) => { if (!box.contains(e.target)) { done(); document.removeEventListener('mousedown', close); } };
      document.addEventListener('mousedown', close);
    }, 0);
  }

  /* ======== COLUMN FILTER PANEL (values + conditions) ======== */

  _showColFilterPanel(col) {
    this._dismissColFilterPanel();
    const rows = this._rows || [];

    // Collect unique values for this column
    const freq = {};
    for (const row of rows) {
      const v = row ? row[col] : undefined;
      const key = v == null ? '(null)' : String(v);
      freq[key] = (freq[key] || 0) + 1;
    }
    const uniqueValues = Object.entries(freq).sort((a, b) => b[1] - a[1]);
    const currentFilter = this._colFilters[col] || '';

    const panel = document.createElement('div');
    panel.className = 'col-filter-panel';
    panel.innerHTML = `
      <div class="cfp-header">
        <span class="cfp-title">Filter: ${Structra.util.esc(col)}</span>
        <button class="cfp-close" data-cfp="close">${Structra.icons.svg('x', { size: 14 })}</button>
      </div>
      <div class="cfp-tabs">
        <button class="cfp-tab active" data-cfp-tab="values">Values</button>
        <button class="cfp-tab" data-cfp-tab="conditions">Conditions</button>
      </div>
      <div class="cfp-body cfp-values-body" id="cfpValuesBody">
        <input type="text" class="cfp-search" placeholder="Search values…" id="cfpSearch">
        <div class="cfp-quick">
          <span class="cfp-link" data-cfp="select-all">Select All</span>
          <span class="cfp-link" data-cfp="select-none">Select None</span>
        </div>
        <div class="cfp-list" id="cfpList">
          ${uniqueValues.slice(0, 200).map(([val, cnt]) => `
            <label class="cfp-row">
              <input type="checkbox" class="cfp-cb" value="${Structra.util.esc(val)}" checked>
              <span class="cfp-val">${Structra.util.esc(val.length > 40 ? val.slice(0, 37) + '…' : val)}</span>
              <span class="cfp-cnt">${cnt}</span>
            </label>`).join('')}
        </div>
      </div>
      <div class="cfp-body cfp-cond-body" id="cfpCondBody" style="display:none">
        <div class="cfp-logic">
          <label><input type="radio" name="cfpLogic" value="AND" checked> Match ALL</label>
          <label><input type="radio" name="cfpLogic" value="OR"> Match ANY</label>
        </div>
        <div class="cfp-cond-rows" id="cfpCondRows"></div>
        <button class="cfp-add-cond" data-cfp="add-cond">+ Add Condition</button>
      </div>
      <div class="cfp-footer">
        <button class="btn btn-primary cfp-apply" data-cfp="apply">Apply</button>
        <button class="btn cfp-clear" data-cfp="clear">Clear</button>
        <button class="btn cfp-cancel" data-cfp="cancel">Cancel</button>
      </div>`;

    document.body.appendChild(panel);
    this._activeFilterPanel = panel;
    this._filterPanelCol = col;
    this._filterPanelValues = uniqueValues;

    // Position near center
    panel.style.top = '80px';
    panel.style.left = `${Math.max(20, (window.innerWidth - 360) / 2)}px`;

    // Event delegation
    panel.addEventListener('click', (e) => {
      const action = e.target.closest('[data-cfp]');
      if (!action) return;
      const a = action.dataset.cfp;
      if (a === 'close' || a === 'cancel') this._dismissColFilterPanel();
      else if (a === 'apply') this._applyFilterPanel(col);
      else if (a === 'clear') { delete this._colFilters[col]; this._dismissColFilterPanel(); this._page = 0; this.renderTable(); }
      else if (a === 'select-all') panel.querySelectorAll('.cfp-cb').forEach(cb => cb.checked = true);
      else if (a === 'select-none') panel.querySelectorAll('.cfp-cb').forEach(cb => cb.checked = false);
      else if (a === 'add-cond') this._addFilterCondition();

      const tab = e.target.closest('[data-cfp-tab]');
      if (tab) {
        panel.querySelectorAll('.cfp-tab').forEach(t => t.classList.toggle('active', t === tab));
        panel.querySelector('#cfpValuesBody').style.display = tab.dataset.cfpTab === 'values' ? '' : 'none';
        panel.querySelector('#cfpCondBody').style.display = tab.dataset.cfpTab === 'conditions' ? '' : 'none';
      }
    });

    // Search filter
    panel.querySelector('#cfpSearch').addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      panel.querySelectorAll('.cfp-row').forEach(row => {
        const val = row.querySelector('.cfp-val').textContent.toLowerCase();
        row.style.display = val.includes(q) ? '' : 'none';
      });
    });
  }

  _addFilterCondition() {
    const container = this._activeFilterPanel?.querySelector('#cfpCondRows');
    if (!container) return;
    const ops = [
      ['contains','Contains'],['not-contains','Does not contain'],['equals','Equals'],['not-equals','Does not equal'],
      ['starts-with','Starts with'],['ends-with','Ends with'],['wildcard','Wildcard (* ?)'],
      ['gt','Greater than'],['lt','Less than'],['gte','≥'],['lte','≤'],
      ['is-empty','Is empty/null'],['not-empty','Is not empty'],['regex','Matches regex'],
    ];
    const row = document.createElement('div');
    row.className = 'cfp-cond-row';
    row.innerHTML = `
      <select class="cfp-cond-op">${ops.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
      <input type="text" class="cfp-cond-val" placeholder="Value…">
      <button class="cfp-cond-rm" title="Remove">${Structra.icons.svg('x', { size: 14 })}</button>`;
    row.querySelector('.cfp-cond-rm').addEventListener('click', () => row.remove());
    container.appendChild(row);
  }

  _applyFilterPanel(col) {
    const panel = this._activeFilterPanel;
    if (!panel) return;

    const valuesTab = panel.querySelector('#cfpValuesBody').style.display !== 'none';
    if (valuesTab) {
      // Values mode: filter to checked values
      const unchecked = new Set();
      panel.querySelectorAll('.cfp-cb').forEach(cb => {
        if (!cb.checked) unchecked.add(cb.value);
      });
      if (unchecked.size === 0) {
        delete this._colFilters[col];
      } else {
        this._colFilters[col] = { type: 'values', excluded: unchecked };
      }
    } else {
      // Conditions mode
      const logic = panel.querySelector('input[name="cfpLogic"]:checked')?.value || 'AND';
      const condRows = panel.querySelectorAll('.cfp-cond-row');
      const conditions = [];
      condRows.forEach(row => {
        const op = row.querySelector('.cfp-cond-op')?.value;
        const val = row.querySelector('.cfp-cond-val')?.value || '';
        if (op) conditions.push({ op, val });
      });
      if (conditions.length === 0) {
        delete this._colFilters[col];
      } else {
        this._colFilters[col] = { type: 'conditions', logic, conditions };
      }
    }

    this._dismissColFilterPanel();
    this._page = 0;
    this.renderTable();
  }

  _dismissColFilterPanel() {
    if (this._activeFilterPanel) {
      this._activeFilterPanel.remove();
      this._activeFilterPanel = null;
    }
  }

  /* ======== COLUMN FILTER DROPDOWN (simple text) ======== */

  _showColFilterDropdown(anchor, col) {
    // Remove any existing dropdown
    const existing = this.$('.col-filter-dropdown');
    if (existing) existing.remove();

    const rect = anchor.getBoundingClientRect();
    const containerRect = this.getBoundingClientRect();
    const top = rect.bottom - containerRect.top + 4;
    const left = rect.left - containerRect.left;

    const currentVal = this._colFilters[col] || '';
    const dropdown = document.createElement('div');
    dropdown.className = 'col-filter-dropdown';
    dropdown.style.cssText = `position:absolute;top:${top}px;left:${left}px;z-index:900`;
    dropdown.innerHTML = `
      <div class="cfd-header">${Structra.util.esc(col)}</div>
      <input type="text" class="cfd-input" placeholder="Filter value…" value="${Structra.util.esc(currentVal)}" autofocus>
      <div class="cfd-actions">
        <button class="cfd-btn cfd-apply">Apply</button>
        <button class="cfd-btn cfd-clear">Clear</button>
      </div>`;

    this.appendChild(dropdown);

    const input = dropdown.querySelector('.cfd-input');
    input.focus();
    input.select();

    const apply = () => {
      const val = input.value.trim();
      if (val) this._colFilters[col] = val;
      else delete this._colFilters[col];
      dropdown.remove();
      this._page = 0;
      this.renderTable();
    };

    const clear = () => {
      delete this._colFilters[col];
      dropdown.remove();
      this._page = 0;
      this.renderTable();
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); apply(); }
      if (e.key === 'Escape') { dropdown.remove(); }
    });
    dropdown.querySelector('.cfd-apply').addEventListener('click', apply);
    dropdown.querySelector('.cfd-clear').addEventListener('click', clear);

    // Close on outside click
    const closeHandler = (e) => {
      if (!dropdown.contains(e.target) && e.target !== anchor) {
        dropdown.remove();
        document.removeEventListener('mousedown', closeHandler);
      }
    };
    setTimeout(() => document.addEventListener('mousedown', closeHandler), 0);
  }

  _applyColFilters(rows) {
    if (!this._colFilters || Object.keys(this._colFilters).length === 0) return rows;
    return rows.filter(row => {
      if (!row) return false;
      for (const [col, filter] of Object.entries(this._colFilters)) {
        const val = row[col];
        const str = val == null ? '' : String(val);

        if (typeof filter === 'string') {
          // Simple text filter (from quick dropdown)
          if (!str.toLowerCase().includes(filter.toLowerCase())) return false;
        } else if (filter.type === 'values') {
          // Values mode: exclude unchecked
          const key = val == null ? '(null)' : String(val);
          if (filter.excluded.has(key)) return false;
        } else if (filter.type === 'conditions') {
          // Conditions mode
          const pass = filter.logic === 'AND'
            ? filter.conditions.every(c => this._evalCondition(str, val, c))
            : filter.conditions.some(c => this._evalCondition(str, val, c));
          if (!pass) return false;
        }
      }
      return true;
    });
  }

  _evalCondition(str, raw, cond) {
    const s = str.toLowerCase();
    const v = cond.val.toLowerCase();
    switch (cond.op) {
      case 'contains': return s.includes(v);
      case 'not-contains': return !s.includes(v);
      case 'equals': return s === v;
      case 'not-equals': return s !== v;
      case 'starts-with': return s.startsWith(v);
      case 'ends-with': return s.endsWith(v);
      case 'wildcard': {
        const re = new RegExp('^' + cond.val.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i');
        return re.test(str);
      }
      case 'gt': return parseFloat(str) > parseFloat(cond.val);
      case 'lt': return parseFloat(str) < parseFloat(cond.val);
      case 'gte': return parseFloat(str) >= parseFloat(cond.val);
      case 'lte': return parseFloat(str) <= parseFloat(cond.val);
      case 'is-empty': return raw == null || str === '';
      case 'not-empty': return raw != null && str !== '';
      case 'regex': try { return new RegExp(cond.val, 'i').test(str); } catch { return false; }
      default: return true;
    }
  }

  disconnectedCallback() {
    if (this._vlist) { this._vlist.destroy(); this._vlist = null; }
    super.disconnectedCallback();
  }
}

customElements.define('structra-table', StructraTable);
