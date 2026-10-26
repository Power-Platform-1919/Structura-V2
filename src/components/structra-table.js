/* ============================================================
   STRUCTRA V2 - Table View Component
   <structra-table> - tabular data view with:
   - Engine-backed sorting + pagination
   - Virtual scrolling via Structra.virtualList for large datasets
   - Sticky header, row selection, column sort indicators
   - Page-size selector + keyboard navigation

   Wiring (generated from the code below; update it when you add or remove an event):
     Listens to: state:jsonData, view:switched, engine:ingested, settings:changed,
          engine:filter-changed
     Emits: tree:node-selected, charts:open
     Sets state: currentPath
   ============================================================ */

class StructraTable extends StructraComponent {
  static get observedAttributes() { return ['path']; }

  init() {
    this._sortCol = null;
    this._sortAsc = true;
    this._page = 0;
    this._pageSize = parseInt(Structra.appSettings.get('pageSize'), 10) || 50;
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
      Structra.log.debug('Table', 'jsonData changed - stale=true');
      if (Structra.state.activeView === 'table') this.renderTable();
    });
    this.on('view:switched', (view) => {
      if (view === 'table' && this._stale) {
        Structra.log.info('Table', 'View switched to table - rendering');
        this.renderTable();
      }
    });
    this.on('engine:ingested', () => {
      this._stale = true;
      this._page = 0;
      if (Structra.state.activeView === 'table') this.renderTable();
    });
    this.on('settings:changed', (payload) => {
      if (payload && payload.key === 'pageSize') {
        this._pageSize = parseInt(payload.value, 10) || 50;
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

    this.addEventListener('click', (event) => {
      // Column filter icon (must be checked BEFORE th sort)
      const colFilter = event.target.closest('[data-col-filter]');
      if (colFilter) {
        event.stopPropagation();
        this._showColFilterDropdown(colFilter, colFilter.dataset.colFilter);
        return;
      }
      // Sort header click
      const header = event.target.closest('th[data-col]');
      if (header) {
        const column = header.dataset.col;
        if (this._sortCol === column) this._sortAsc = !this._sortAsc;
        else { this._sortCol = column; this._sortAsc = true; }
        this._page = 0;
        this.renderTable();
        return;
      }
      // Pagination buttons
      const button = event.target.closest('[data-page-action]');
      if (button) {
        this._handlePageAction(button.dataset.pageAction);
        return;
      }
      // Page size selector
      const option = event.target.closest('[data-page-size]');
      if (option) {
        this._pageSize = parseInt(option.dataset.pageSize, 10);
        this._page = 0;
        Structra.appSettings.set('pageSize', this._pageSize);
        this.renderTable();
        return;
      }
      // Row selection
      const row = event.target.closest('tbody tr[data-path]');
      if (row) {
        this.queryAll('tbody tr.row-sel').forEach(row => row.classList.remove('row-sel'));
        row.classList.add('row-sel');
        Structra.setState('currentPath', row.dataset.path);
        Structra.events.emit('tree:node-selected', row.dataset.path);
      }
    });

    // Column header right-click menu
    this.addEventListener('contextmenu', (event) => {
      const header = event.target.closest('th[data-col]');
      if (header) {
        event.preventDefault();
        this._showColumnMenu(event.clientX, event.clientY, header.dataset.col);
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
      for (const key of keys) {
        const subs = this._expanded.get(key);
        if (subs && subs.length) {
          const names = subs.map((subKey) => key + '.' + subKey);
          names.forEach((name) => this._expandParent.set(name, key));
          plan.push({ col: key, subs, names });
        } else {
          plan.push({ col: key });
        }
      }
      keys = plan.flatMap((part) => part.names || [part.col]);
      allRows = allRows.map((row) => {
        if (!row || typeof row !== 'object') return row;
        const flat = {};
        for (const part of plan) {
          if (!part.subs) { flat[part.col] = row[part.col]; continue; }
          const object = row[part.col];
          part.subs.forEach((subKey, i) => {
            flat[part.names[i]] = object && typeof object === 'object' ? object[subKey] : undefined;
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
      const ordered = this._colOrder.filter((column) => set.has(column));
      const rest = keys.filter((column) => !this._colOrder.includes(column));
      keys = [...ordered, ...rest];
    }
    return { ...result, allRows, keys };
  }

  _resolveBase() {
    const dataset = Structra.dataEngine.getActive();
    const query = Structra.dataEngine.getQuery();
    let allRows, totalRows, keys, basePath;

    // A filter that matches nothing shows an empty table with its headers, not the whole document
    if (query && query.source === 'filter' && query.rows && query.rows.length === 0) {
      const main = Structra.dataEngine.mainList(dataset);
      return { allRows: [], totalRows: 0, keys: main ? Structra.dataEngine.collectKeys(main.rows) : [], basePath: '$', filtered: true };
    }

    // Active query (from find, filter, or SQL) - render query result rows
    if (query && query.rows && query.rows.length > 0) {
      allRows = query.rows;
      totalRows = allRows.length;
      keys = query.columns && query.columns.length > 0
        ? query.columns
        : Structra.dataEngine.collectKeys(allRows);
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
        Structra.dataEngine.sort(this._sortCol, this._sortAsc ? 'asc' : 'desc');
      }
      const datasetInfo = Structra.dataEngine.getActive();
      this._baseRows = datasetInfo.raw;
      allRows = datasetInfo.indexes.sorted ? datasetInfo.indexes.sorted.refs : datasetInfo.raw;
      totalRows = Array.isArray(allRows) ? allRows.length : 0;
      keys = dataset.indexes.columns
        ? dataset.indexes.columns.map(column => column.name)
        : Structra.dataEngine.collectKeys(allRows);
      basePath = '$';
    } else {
      // Fallback: find array in raw data
      const data = Structra.state.jsonData;
      const array = Structra.dataEngine.findFirstObjectArray(data);
      if (!array || array.rows.length === 0) return null;
      totalRows = array.rows.length;
      basePath = array.path;
      this._baseRows = array.rows;
      keys = Structra.dataEngine.collectKeys(array.rows);

      // Sort if needed
      if (this._sortCol && keys.includes(this._sortCol)) {
        allRows = this._sortRows([...array.rows], this._sortCol, this._sortAsc);
      } else {
        allRows = array.rows;
      }
    }

    return { allRows, totalRows, keys, basePath };
  }

  _applyColumnFiltersToResult(result) {
    if (!result || !this._colFilters || Object.keys(this._colFilters).length === 0) return result;
    const filtered = this._applyColFilters(result.allRows);
    return { ...result, allRows: filtered, totalRows: filtered.length, filtered: true };
  }

  _sortRows(rows, column, asc) {
    return rows.sort((first, second) => {
      const firstValue = first ? first[column] : undefined;
      const secondValue = second ? second[column] : undefined;
      if (firstValue == null && secondValue == null) return 0;
      if (firstValue == null) return 1;
      if (secondValue == null) return -1;
      const compare = Structra.sharedHelpers.compareValues(firstValue, secondValue);
      return asc ? compare : -compare;
    });
  }

  /* ======== RENDER ======== */

  renderTable() {
    this._stale = false;
    Structra.log.info('Table', 'renderTable()');
    const startTime = performance.now();

    // Destroy previous virtual list if any, and the row groups it added to the table
    if (this._vlist) { this._vlist.destroy(); this._vlist = null; }
    this.queryAll('table.data-table > tbody.vl-chunk, table.data-table > tbody.vl-sentinel').forEach((element) => element.remove());

    const head = this.queryOne('#tableHead');
    const body = this.queryOne('#tableBody');
    const pager = this.queryOne('#tablePager');
    if (!head || !body) return;

    const resolved = this._applyColumnFiltersToResult(this._resolveData());
    if (!resolved) {
      const jsonDocument = Structra.state.jsonData;
      if (jsonDocument && typeof jsonDocument === 'object' && !Array.isArray(jsonDocument) && Object.keys(jsonDocument).length) {
        // One record, no list: show it as a Field and Value table
        const shown = (value) => value !== null && typeof value === 'object' ? JSON.stringify(value) : value;
        head.innerHTML = '<tr><th>Field</th><th>Value</th></tr>';
        body.innerHTML = Object.entries(jsonDocument).map(([column, value]) => `<tr><td>${Structra.sharedHelpers.escapeHtml(column)}</td><td>${this._formatCell(shown(value))}</td></tr>`).join('');
        if (pager) pager.innerHTML = `<span class="table-page-info">${Object.keys(jsonDocument).length.toLocaleString()} fields</span>`;
        return;
      }
      head.innerHTML = '';
      body.innerHTML = '<tr><td style="color:var(--text-muted);padding:var(--sp-4)">There is no list of records in this file to show as a table. Use the Tree to browse it.</td></tr>';
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
    this._applyColumnWidths(keys, allRows);

    // Render toolbar (show filter indicator if filtered)
    this._renderToolbar(pager, totalRows, !!resolved.filtered);

    if (totalRows === 0 && resolved.filtered) {
      body.innerHTML = `<tr class="table-empty"><td colspan="${Math.max(1, keys.length)}">No rows match the filter. Change the condition or press Clear.</td></tr>`;
      return;
    }

    // Choose rendering strategy
    if (totalRows > this._VIRTUAL_THRESHOLD) {
      this._renderVirtual(body, allRows, keys, basePath, totalRows);
    } else {
      this._renderPage(body, allRows, keys, basePath, totalRows);
    }

    Structra.log.perf('Table', 'renderTable()', performance.now() - startTime);
  }

  /* ======== COLUMN WIDTHS ======== */

  /**
   * Each column gets the width its content needs (header and the longest of the first rows, within limits),
   * measured once per document and column set, so widths stay put when the sort changes or a page is turned.
   */
  _applyColumnWidths(keys, allRows) {
    const table = this.queryOne('table.data-table');
    if (!table) return;
    const base = this._baseRows && this._baseRows.length ? this._baseRows : allRows;
    const stamp = keys.join('\u0001') + '#' + (Array.isArray(base) ? base.length : 0);
    if (this._widthStamp !== stamp) {
      const sample = (base || []).slice(0, 150);
      const textLength = (value) => (value === null || value === undefined ? 4 : typeof value === 'object' ? (Array.isArray(value) ? 12 : 16) : String(value).length);
      this._widths = {};
      for (const column of keys) {
        let max = String(column).length + 4;                       // the name plus the sort and filter marks
        for (const row of sample) { const length = textLength(row ? row[column] : undefined); if (length > max) max = length; }
        this._widths[column] = Math.max(7, Math.min(40, max));
      }
      this._widthStamp = stamp;
    }
    let group = table.querySelector('colgroup');
    if (!group) { group = document.createElement('colgroup'); table.insertBefore(group, table.firstChild); }
    group.innerHTML = (this._visibleKeys || keys).map((column) => `<col style="width:calc(${this._widths[column] || 12}ch + var(--sp-6))">`).join('');
  }

  /* ======== HEADER ======== */

  _renderHeader(head, keys) {
    let visibleKeys = this._hiddenCols ? keys.filter(column => !this._hiddenCols.has(column)) : keys;
    // Drawing thousands of columns at once takes seconds: show the first ones and offer more
    if (!this._colLimit) this._colLimit = 80;
    this._moreCols = Math.max(0, visibleKeys.length - this._colLimit);
    visibleKeys = visibleKeys.slice(0, this._colLimit);
    // A column of numbers is lined up on the right, like a spreadsheet
    const sample = (this._baseRows && this._baseRows.length ? this._baseRows : this._rows || []).slice(0, 100);
    this._numericCols = new Set(visibleKeys.filter((column) => {
      let seen = 0;
      for (const row of sample) { const value = row ? row[column] : undefined; if (value === null || value === undefined) continue; if (typeof value !== 'number') return false; seen++; }
      return seen > 0;
    }));
    const sortIcon = (column) => {
      if (this._sortCol !== column) return '';
      return this._sortAsc ? ' ↑' : ' ↓';
    };
    const filterIcon = (column) => {
      const isFiltered = this._colFilters && this._colFilters[column];
      return `<span class="th-filter-icon${isFiltered ? ' th-filter-active' : ''}" data-col-filter="${Structra.sharedHelpers.escapeHtml(column)}" title="Filter this column">${Structra.icons.svg('list-filter', { size: 12 })}</span>`;
    };
    head.innerHTML = '<tr>' + visibleKeys.map(column =>
      `<th data-col="${Structra.sharedHelpers.escapeHtml(column)}"${this._numericCols.has(column) ? ' class="num"' : ''}><span class="th-label">${Structra.sharedHelpers.escapeHtml(column)}${sortIcon(column)}</span>${filterIcon(column)}</th>`
    ).join('') + '</tr>';
    this._visibleKeys = visibleKeys;
  }

  /* ======== TOOLBAR ======== */

  _renderToolbar(pager, totalRows, filtered) {
    if (!pager) return;
    const icon = (iconName) => Structra.icons.svg(iconName, { size: 14 });

    const maxPage = Math.max(0, Math.ceil(totalRows / this._pageSize) - 1);
    const from = this._page * this._pageSize + 1;
    const to = Math.min((this._page + 1) * this._pageSize, totalRows);

    // Page size options
    const sizes = [25, 50, 100, 250, 500];
    const sizeOptions = sizes.map(size =>
      `<span class="table-size-opt ${size === this._pageSize ? 'active' : ''}" data-page-size="${size}">${size}</span>`
    ).join('');

    const useVirtual = totalRows > this._VIRTUAL_THRESHOLD;
    const filterBadge = filtered
      ? `<span class="filter-badge" title="Filtered results">${icon('filter')} filtered</span>`
      : '';

    const hiddenBadge = this._hiddenCols.size
      ? `<span class="filter-badge" data-page-action="unhide" title="Show hidden columns">${icon('eye-off')} ${this._hiddenCols.size} hidden</span>`
      : '';
    const moreColumns = this._moreCols
      ? `<span class="filter-badge" data-page-action="more-cols" title="Draw more columns">${icon('columns-3')} ${this._moreCols.toLocaleString()} more columns: show ${Math.min(100, this._moreCols).toLocaleString()}</span>`
      : '';
    // Scrolling replaces pages for a long list: no page buttons or page sizes then
    const pages = useVirtual
      ? `<span class="table-page-info">${totalRows.toLocaleString()} rows</span>`
      : `<button data-page-action="first" ${this._page === 0 ? 'disabled' : ''} title="First page" aria-label="First page">${icon('chevrons-left')}</button>
      <button data-page-action="prev" ${this._page === 0 ? 'disabled' : ''} title="Previous page" aria-label="Previous page">${icon('chevron-left')}</button>
      <span class="table-page-info">${from.toLocaleString()}–${to.toLocaleString()} of ${totalRows.toLocaleString()}</span>
      <button data-page-action="next" ${this._page >= maxPage ? 'disabled' : ''} title="Next page" aria-label="Next page">${icon('chevron-right')}</button>
      <button data-page-action="last" ${this._page >= maxPage ? 'disabled' : ''} title="Last page" aria-label="Last page">${icon('chevrons-right')}</button>
      <span class="table-sep"></span>
      <span class="table-size-label">Rows per page:</span>
      ${sizeOptions}`;
    pager.innerHTML = `${filterBadge}${hiddenBadge}${moreColumns}${pages}`;
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
      container: this.queryOne('table.data-table'),
      root: this.queryOne('#tableScroll'),
      chunkTag: 'tbody',
      totalItems: totalRows,
      chunkSize,
      offscreenPx: 2000,

      buildChunk(start, end) {
        const rows = allRows.slice(start, end);
        return self._buildRowsHtml(rows, keys, basePath, start);
      },

      rehydrate(chunkElement, start, end) {
        const rows = allRows.slice(start, end);
        chunkElement.innerHTML = self._buildRowsHtml(rows, keys, basePath, start);
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
      const row = rows[i];
      const path = this._pathFor(row);
      let cells = '';
      for (let index = 0; index < visibleKeys.length; index++) {
        const value = row ? row[visibleKeys[index]] : undefined;
        cells += `<td${this._numericCols && this._numericCols.has(visibleKeys[index]) ? ' class="num"' : ''}>${this._formatCell(value, visibleKeys[index])}</td>`;
      }
      html += path ? `<tr data-path="${Structra.sharedHelpers.escapeHtml(path)}">${cells}</tr>` : `<tr>${cells}</tr>`;
    }
    return html;
  }

  /** Path of a row in the open document. Empty when the row is not part of it (for example SQL output). */
  _pathFor(row) {
    const source = (row && this._origOf.get(row)) || row;
    if (!source || typeof source !== 'object' || !this._baseRows) return '';
    if (this._indexMapFor !== this._baseRows) {
      const map = new Map();
      const array = this._baseRows;
      for (let i = 0; i < array.length; i++) if (array[i] && typeof array[i] === 'object') map.set(array[i], i);
      this._indexMap = map;
      this._indexMapFor = array;
    }
    const index = this._indexMap.get(source);
    if (index === undefined) return '';
    return `${Structra.dataPaths.strip(this._basePath)}[${index}]`;
  }

  /* ======== PAGE ACTIONS ======== */

  _handlePageAction(action) {
    if (action === 'unhide') { this._hiddenCols.clear(); this.renderTable(); return; }
    if (action === 'more-cols') { this._colLimit = (this._colLimit || 80) + 100; this.renderTable(); return; }
    const maxPage = Math.max(0, Math.ceil(this._totalRows / this._pageSize) - 1);
    if (action === 'first') this._page = 0;
    else if (action === 'prev') this._page = Math.max(0, this._page - 1);
    else if (action === 'next') this._page = Math.min(maxPage, this._page + 1);
    else if (action === 'last') this._page = maxPage;
    this.renderTable();
  }

  /* ======== UTILITIES ======== */

  /* _collectKeys and _findFirstArray removed - use Structra.dataEngine.collectKeys() and Structra.dataEngine.findFirstObjectArray() */

  _formatCell(value, key) {
    if (value === null || value === undefined) return '<span class="tree-null" title="No value">empty</span>';
    // A column written with decimals (prices) keeps them: 2.50 stays 2.50
    if (typeof value === 'number' && key) {
      const tab = (Structra.tabs.list || []).find((tab) => tab.id === Structra.tabs.activeId);
      const places = tab && tab.decimals && tab.decimals[key];
      if (places) return value.toLocaleString(undefined, { minimumFractionDigits: places, maximumFractionDigits: places, useGrouping: false });
    }
    if (typeof value === 'boolean') return `<span class="bool-badge ${value ? 'bool-true' : 'bool-false'}">${value}</span>`;
    if (typeof value === 'object') return this._formatNested(value);
    const text = String(value);
    if (text.length > 120) return Structra.sharedHelpers.escapeHtml(text.slice(0, 117)) + '…';
    return Structra.sharedHelpers.escapeHtml(text);
  }

  /**
   * A cell that holds an object or a list. SharePoint Choice, Person and Lookup fields are objects whose
   * useful part is one field (Value, DisplayName, Title...), so show that instead of "{…}".
   */
  _formatNested(value) {
    const escapeHtml = Structra.sharedHelpers.escapeHtml;
    const FRIENDLY = ['Value', 'DisplayName', 'Title', 'Name', 'Email', 'value', 'displayName', 'title', 'name', 'label', 'text'];
    const brief = (object) => {
      if (object === null || object === undefined) return 'null';
      if (typeof object !== 'object') return String(object);
      const field = FRIENDLY.find((field) => object[field] !== undefined && object[field] !== null && typeof object[field] !== 'object');
      return field === undefined ? null : String(object[field]);
    };
    const full = escapeHtml(JSON.stringify(value).slice(0, 300));

    if (Array.isArray(value)) {
      if (!value.length) return '<span class="tree-null">[ ] empty</span>';
      const parts = value.slice(0, 3).map(brief);
      if (parts.every((part) => part !== null)) {
        const more = value.length > 3 ? ` <span class="tree-bracket">+${value.length - 3}</span>` : '';
        return `<span title="${full}">${escapeHtml(parts.join(', '))}${more}</span>`;
      }
      return `<span class="tree-bracket" title="${full}">[${value.length} ${value.length === 1 ? 'item' : 'items'}]</span>`;
    }
    const one = brief(value);
    if (one !== null) return `<span title="${full}">${escapeHtml(one)}</span>`;
    const keys = Object.keys(value).filter((column) => !column.startsWith('@'));
    if (!keys.length) return '<span class="tree-null">{ } empty</span>';
    return `<span class="tree-bracket" title="${full}">{ ${escapeHtml(keys.slice(0, 3).join(', '))}${keys.length > 3 ? ', …' : ''} }</span>`;
  }


  /* ======== COLUMN CONTEXT MENU (right-click) ======== */

  _showColumnMenu(x, y, column) {
    this._dismissColumnMenu();
    const hasFilter = !!(this._colFilters && this._colFilters[column]);
    const hasObjects = !this._expandParent.has(column) && this._rows && this._rows.slice(0, 500).some(row => {
      const value = row && row[column];
      return value !== null && typeof value === 'object' && !Array.isArray(value);
    });

    const menu = document.createElement('div');
    menu.className = 'col-ctx-menu';
    menu.style.cssText = `left:${x}px;top:${y}px`;
    const iconSpan = (iconName) => `<span class="col-ctx-icon">${Structra.icons.svg(iconName, { size: 14 })}</span>`;
    menu.innerHTML = `
      <div class="col-ctx-item" data-col-action="sort-asc">${iconSpan('arrow-up-narrow-wide')} Sort A to Z (smallest first)</div>
      <div class="col-ctx-item" data-col-action="sort-desc">${iconSpan('arrow-down-wide-narrow')} Sort Z to A (largest first)</div>
      <div class="col-ctx-sep"></div>
      <div class="col-ctx-item" data-col-action="filter">${iconSpan('filter')} Filter this column…</div>
      ${hasFilter ? `<div class="col-ctx-item" data-col-action="clear-filter">${iconSpan('x')} Clear the filter</div>` : ''}
      <div class="col-ctx-sep"></div>
      ${hasObjects ? `<div class="col-ctx-item" data-col-action="expand">${iconSpan('unfold-horizontal')} Split into columns…</div>` : ''}
      ${this._expandParent.has(column) ? `<div class="col-ctx-item" data-col-action="collapse">${iconSpan('fold-horizontal')} Join back into "${Structra.sharedHelpers.escapeHtml(this._expandParent.get(column))}"</div>` : ''}
      <div class="col-ctx-item" data-col-action="move-left">${iconSpan('arrow-left')} Move left</div>
      <div class="col-ctx-item" data-col-action="move-right">${iconSpan('arrow-right')} Move right</div>
      <div class="col-ctx-item" data-col-action="hide">${iconSpan('eye-off')} Hide this column</div>
      ${this._hiddenCols.size ? `<div class="col-ctx-item" data-col-action="unhide-all">${iconSpan('eye')} Show ${this._hiddenCols.size} hidden column${this._hiddenCols.size === 1 ? '' : 's'}</div>` : ''}
      <div class="col-ctx-sep"></div>
      <div class="col-ctx-item" data-col-action="chart">${iconSpan('chart-column')} Chart this column</div>
      <div class="col-ctx-item" data-col-action="stats">${iconSpan('sigma')} Column summary</div>
      <div class="col-ctx-item" data-col-action="distinct">${iconSpan('list')} Every different value</div>
      <div class="col-ctx-item" data-col-action="copy-col">${iconSpan('copy')} Copy the column's values</div>
    `;

    menu.addEventListener('click', (event) => {
      const item = event.target.closest('[data-col-action]');
      if (!item) return;
      const action = item.dataset.colAction;
      this._execColumnAction(action, column);
      this._dismissColumnMenu();
    });

    document.body.appendChild(menu);
    this._activeColMenu = menu;

    // Close on outside click
    const close = (event) => {
      if (!menu.contains(event.target)) {
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

  async _execColumnAction(action, column) {
    switch (action) {
      case 'sort-asc':
        this._sortCol = column; this._sortAsc = true; this._page = 0;
        this.renderTable();
        break;
      case 'sort-desc':
        this._sortCol = column; this._sortAsc = false; this._page = 0;
        this.renderTable();
        break;
      case 'filter':
        this._showColFilterPanel(column);
        break;
      case 'clear-filter':
        delete this._colFilters[column];
        this._page = 0;
        this.renderTable();
        Structra.toast(`Filter cleared on "${column}"`);
        break;
      case 'expand':
        this._showExpandPicker(column);
        break;
      case 'chart':
        Structra.events.emit('charts:open', { path: this._basePath === '$' ? '(root)' : this._basePath, column });
        break;
      case 'collapse': {
        const parent = this._expandParent.get(column);
        if (parent) { this._expanded.delete(parent); this.renderTable(); }
        break;
      }
      case 'move-left':
      case 'move-right': {
        const order = [...(this._visibleKeys || this._keys)];
        const i = order.indexOf(column);
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
        this._hiddenCols.add(column);
        this.renderTable();
        Structra.toast(`"${column}" hidden. Use the "hidden" chip above the table to show it again.`);
        break;
      case 'stats':
        this._showColumnReport(column, 'stats');
        break;
      case 'distinct':
        this._showColumnReport(column, 'distinct');
        break;
      case 'copy-col': {
        const values = (this._rows || []).map(row => row ? String(row[column] ?? '') : '').join('\n');
        Structra.sharedHelpers.copyToClipboard(values, `${column} values copied`);
        break;
      }
    }
  }

  /* ======== COLUMN REPORT (summary and every different value) ======== */

  _showColumnReport(column, kind) {
    this._dismissColumnMenu();
    const rows = this._rows || [];
    const escapeHtml = Structra.sharedHelpers.escapeHtml;
    const text = (value) => (value === null || value === undefined ? '(empty)' : value === '' ? '(empty text)' : typeof value === 'object' ? JSON.stringify(value).slice(0, 80) : String(value));
    const values = rows.map((row) => (row ? row[column] : undefined));
    const filled = values.filter((value) => value !== null && value !== undefined && value !== '');
    const frequency = new Map();
    values.forEach((value) => { const label = text(value); frequency.set(label, (frequency.get(label) || 0) + 1); });
    const ranked = [...frequency.entries()].sort((first, second) => second[1] - first[1] || String(first[0]).localeCompare(String(second[0]), undefined, { numeric: true }));

    let body;
    if (kind === 'distinct') {
      const max = ranked.length ? ranked[0][1] : 1;
      body = `<div class="rep-note">${ranked.length.toLocaleString()} different ${ranked.length === 1 ? 'value' : 'values'} in ${rows.length.toLocaleString()} ${rows.length === 1 ? 'row' : 'rows'}</div>
        <div class="rep-list">${ranked.slice(0, 200).map(([label, count]) => `<div class="rep-row"><span class="rep-val" title="${escapeHtml(label)}">${escapeHtml(label)}</span><span class="rep-bar"><span style="width:${Math.round(count / max * 100)}%"></span></span><span class="rep-n">${count.toLocaleString()}</span></div>`).join('')}</div>
        ${ranked.length > 200 ? `<div class="rep-note">The 200 most common are shown.</div>` : ''}`;
    } else {
      const numbers = filled.filter((value) => typeof value === 'number');
      const kinds = {};
      values.forEach((value) => { const valueType = value === null || value === undefined ? 'empty' : Array.isArray(value) ? 'list' : typeof value; kinds[valueType] = (kinds[valueType] || 0) + 1; });
      const facts = [
        ['Rows', rows.length.toLocaleString()],
        ['With a value', `${filled.length.toLocaleString()} (${rows.length ? Math.round(filled.length / rows.length * 100) : 0}%)`],
        ['Empty', (rows.length - filled.length).toLocaleString()],
        ['Different values', frequency.size.toLocaleString()],
        ['Kinds', Object.entries(kinds).map(([kind, name]) => `${name} ${kind}`).join(', ')],
      ];
      if (numbers.length) {
        const sorted = [...numbers].sort((first, second) => first - second);
        const sum = numbers.reduce((total, item) => total + item, 0);
        const mid = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
        const round = (number) => Math.round(number * 1000) / 1000;
        facts.push(['Smallest', round(sorted[0])], ['Largest', round(sorted[sorted.length - 1])], ['Total', round(sum)], ['Average', round(sum / numbers.length)], ['Middle value', round(mid)]);
      } else if (filled.length) {
        const texts = filled.filter((value) => typeof value === 'string').sort();
        if (texts.length) facts.push(['First (A to Z)', texts[0].slice(0, 60)], ['Last (A to Z)', texts[texts.length - 1].slice(0, 60)]);
      }
      if (ranked.length) facts.push(['Most common', `${ranked[0][0].slice(0, 50)} (${ranked[0][1]})`]);
      body = `<dl class="rep-facts">${facts.map(([column, value]) => `<dt>${escapeHtml(column)}</dt><dd>${escapeHtml(String(value))}</dd>`).join('')}</dl>`;
    }

    const box = document.createElement('div');
    box.className = 'col-pick col-report';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', `${kind === 'distinct' ? 'Every different value' : 'Summary'} of ${column}`);
    box.innerHTML = `
      <div class="col-pick-title">${kind === 'distinct' ? 'Every different value in' : 'Summary of'} "${escapeHtml(column)}"</div>
      ${body}
      <div class="col-pick-actions">
        ${kind === 'distinct' ? '<button class="btn" data-rep="copy">Copy the list</button>' : ''}
        <button class="btn btn-primary" data-rep="close">Close</button>
      </div>`;
    document.body.appendChild(box);
    const done = () => { box.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (event) => { if (event.key === 'Escape') done(); };
    document.addEventListener('keydown', onKey);
    box.addEventListener('click', (event) => {
      const button = event.target.closest('[data-rep]');
      if (!button) return;
      if (button.dataset.rep === 'copy') Structra.sharedHelpers.copyToClipboard(ranked.map(([label, count]) => `${label}\t${count}`).join('\n'), 'List copied');
      else done();
    });
    box.querySelector('[data-rep="close"]').focus();
  }

  /* ======== EXPAND OBJECT COLUMN (pick which keys become columns) ======== */

  _showExpandPicker(column) {
    this._dismissColumnMenu();
    const frequency = new Map();
    const sample = (this._rows || []).slice(0, 500);
    for (const row of sample) {
      const value = row && row[column];
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      for (const column of Object.keys(value)) frequency.set(column, (frequency.get(column) || 0) + 1);
    }
    // System keys (@odata.type, Claims, ItemInternalId) go last and start unticked, so the useful ones come first
    const isSystem = (key) => /^(@|__|odata\.|_x|Claims$|ItemInternalId$)/i.test(key);
    const keys = [...frequency.entries()].sort((first, second) => (isSystem(first[0]) - isSystem(second[0])) || (second[1] - first[1])).map(([column]) => column);
    if (!keys.length) { Structra.toast('No keys to expand in this column'); return; }
    const ticked = new Set(keys.filter((column) => !isSystem(column)).slice(0, 12));

    const box = document.createElement('div');
    box.className = 'col-pick';
    box.innerHTML = `
      <div class="col-pick-title">Expand "${Structra.sharedHelpers.escapeHtml(column)}" into columns</div>
      <div class="col-pick-list">${keys.slice(0, 60).map((column, i) =>
        `<label class="col-pick-item"><input type="checkbox" value="${Structra.sharedHelpers.escapeHtml(column)}" ${ticked.has(column) ? 'checked' : ''}> ${Structra.sharedHelpers.escapeHtml(column)}${isSystem(column) ? ' <span class="col-pick-sys">system</span>' : ''}</label>`).join('')}</div>
      ${keys.length > 60 ? `<div class="col-pick-note">Showing the 60 most common of ${keys.length} keys</div>` : ''}
      <div class="col-pick-actions">
        <button class="btn btn-primary" data-pick="ok">Expand</button>
        <button class="btn" data-pick="cancel">Cancel</button>
      </div>`;
    document.body.appendChild(box);

    const done = () => box.remove();
    box.addEventListener('click', (event) => {
      const button = event.target.closest('[data-pick]');
      if (!button) return;
      if (button.dataset.pick === 'ok') {
        const chosen = [...box.querySelectorAll('input:checked')].map((checkbox) => checkbox.value);
        if (chosen.length) {
          this._expanded.set(column, chosen);
          this._page = 0;
          this.renderTable();
        }
      }
      done();
    });
    setTimeout(() => {
      const close = (event) => { if (!box.contains(event.target)) { done(); document.removeEventListener('mousedown', close); } };
      document.addEventListener('mousedown', close);
    }, 0);
  }

  /* ======== COLUMN FILTER PANEL (values + conditions) ======== */

  _showColFilterPanel(column) {
    this._dismissColFilterPanel();
    const rows = this._rows || [];

    // Collect unique values for this column
    const frequency = {};
    for (const row of rows) {
      const value = row ? row[column] : undefined;
      const key = value == null ? '(null)' : String(value);
      frequency[key] = (frequency[key] || 0) + 1;
    }
    const uniqueValues = Object.entries(frequency).sort((first, second) => second[1] - first[1]);

    const panel = document.createElement('div');
    panel.className = 'col-filter-panel';
    panel.innerHTML = `
      <div class="cfp-header">
        <span class="cfp-title">Filter: ${Structra.sharedHelpers.escapeHtml(column)}</span>
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
          ${uniqueValues.slice(0, 200).map(([uniqueValue, valueCount]) => `
            <label class="cfp-row">
              <input type="checkbox" class="cfp-cb" value="${Structra.sharedHelpers.escapeHtml(uniqueValue)}" checked>
              <span class="cfp-val">${Structra.sharedHelpers.escapeHtml(uniqueValue.length > 40 ? uniqueValue.slice(0, 37) + '…' : uniqueValue)}</span>
              <span class="cfp-cnt">${valueCount}</span>
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
    this._filterPanelCol = column;
    this._filterPanelValues = uniqueValues;

    // Position near center
    panel.style.top = '80px';
    panel.style.left = `${Math.max(20, (window.innerWidth - 360) / 2)}px`;

    // Event delegation
    panel.addEventListener('click', (event) => {
      const action = event.target.closest('[data-cfp]');
      if (!action) return;
      const actionName = action.dataset.cfp;
      if (actionName === 'close' || actionName === 'cancel') this._dismissColFilterPanel();
      else if (actionName === 'apply') this._applyFilterPanel(column);
      else if (actionName === 'clear') { delete this._colFilters[column]; this._dismissColFilterPanel(); this._page = 0; this.renderTable(); }
      else if (actionName === 'select-all') panel.querySelectorAll('.cfp-cb').forEach(element => element.checked = true);
      else if (actionName === 'select-none') panel.querySelectorAll('.cfp-cb').forEach(element => element.checked = false);
      else if (actionName === 'add-cond') this._addFilterCondition();

      const tab = event.target.closest('[data-cfp-tab]');
      if (tab) {
        panel.querySelectorAll('.cfp-tab').forEach(tabEntry => tabEntry.classList.toggle('active', tabEntry === tab));
        panel.querySelector('#cfpValuesBody').style.display = tab.dataset.cfpTab === 'values' ? '' : 'none';
        panel.querySelector('#cfpCondBody').style.display = tab.dataset.cfpTab === 'conditions' ? '' : 'none';
      }
    });

    // Search filter
    panel.querySelector('#cfpSearch').addEventListener('input', (event) => {
      const query = event.target.value.toLowerCase();
      panel.querySelectorAll('.cfp-row').forEach(row => {
        const value = row.querySelector('.cfp-val').textContent.toLowerCase();
        row.style.display = value.includes(query) ? '' : 'none';
      });
    });
  }

  _addFilterCondition() {
    const container = this._activeFilterPanel?.querySelector('#cfpCondRows');
    if (!container) return;
    const operations = [
      ['contains','Contains'],['not-contains','Does not contain'],['equals','Equals'],['not-equals','Does not equal'],
      ['starts-with','Starts with'],['ends-with','Ends with'],['wildcard','Wildcard (* ?)'],
      ['gt','Greater than'],['lt','Less than'],['gte','≥'],['lte','≤'],
      ['is-empty','Is empty/null'],['not-empty','Is not empty'],['regex','Matches regex'],
    ];
    const row = document.createElement('div');
    row.className = 'cfp-cond-row';
    row.innerHTML = `
      <select class="cfp-cond-op">${operations.map(([value, operation]) => `<option value="${value}">${operation}</option>`).join('')}</select>
      <input type="text" class="cfp-cond-val" placeholder="Value…">
      <button class="cfp-cond-rm" title="Remove">${Structra.icons.svg('x', { size: 14 })}</button>`;
    row.querySelector('.cfp-cond-rm').addEventListener('click', () => row.remove());
    container.appendChild(row);
  }

  _applyFilterPanel(column) {
    const panel = this._activeFilterPanel;
    if (!panel) return;

    const valuesTab = panel.querySelector('#cfpValuesBody').style.display !== 'none';
    if (valuesTab) {
      // Values mode: filter to checked values
      const unchecked = new Set();
      panel.querySelectorAll('.cfp-cb').forEach(element => {
        if (!element.checked) unchecked.add(element.value);
      });
      if (unchecked.size === 0) {
        delete this._colFilters[column];
      } else {
        this._colFilters[column] = { type: 'values', excluded: unchecked };
      }
    } else {
      // Conditions mode
      const logic = panel.querySelector('input[name="cfpLogic"]:checked')?.value || 'AND';
      const condRows = panel.querySelectorAll('.cfp-cond-row');
      const conditions = [];
      condRows.forEach(row => {
        const operation = row.querySelector('.cfp-cond-op')?.value;
        const value = row.querySelector('.cfp-cond-val')?.value || '';
        if (operation) conditions.push({ op: operation, val: value });
      });
      if (conditions.length === 0) {
        delete this._colFilters[column];
      } else {
        this._colFilters[column] = { type: 'conditions', logic, conditions };
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

  _showColFilterDropdown(anchor, column) {
    // Remove any existing dropdown
    const existing = this.queryOne('.col-filter-dropdown');
    if (existing) existing.remove();

    const rect = anchor.getBoundingClientRect();
    const containerRect = this.getBoundingClientRect();
    const top = rect.bottom - containerRect.top + 4;
    const left = rect.left - containerRect.left;

    const currentValue = this._colFilters[column] || '';
    const dropdown = document.createElement('div');
    dropdown.className = 'col-filter-dropdown';
    dropdown.style.cssText = `position:absolute;top:${top}px;left:${left}px;z-index:900`;
    dropdown.innerHTML = `
      <div class="cfd-header">${Structra.sharedHelpers.escapeHtml(column)}</div>
      <input type="text" class="cfd-input" placeholder="Filter value…" value="${Structra.sharedHelpers.escapeHtml(currentValue)}" autofocus>
      <div class="cfd-actions">
        <button class="cfd-btn cfd-apply">Apply</button>
        <button class="cfd-btn cfd-clear">Clear</button>
      </div>`;

    this.appendChild(dropdown);

    const input = dropdown.querySelector('.cfd-input');
    input.focus();
    input.select();

    const apply = () => {
      const value = input.value.trim();
      if (value) this._colFilters[column] = value;
      else delete this._colFilters[column];
      dropdown.remove();
      this._page = 0;
      this.renderTable();
    };

    const clear = () => {
      delete this._colFilters[column];
      dropdown.remove();
      this._page = 0;
      this.renderTable();
    };

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); apply(); }
      if (event.key === 'Escape') { dropdown.remove(); }
    });
    dropdown.querySelector('.cfd-apply').addEventListener('click', apply);
    dropdown.querySelector('.cfd-clear').addEventListener('click', clear);

    // Close on outside click
    const closeHandler = (event) => {
      if (!dropdown.contains(event.target) && event.target !== anchor) {
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
      for (const [key, filter] of Object.entries(this._colFilters)) {
        const value = row[key];
        const text = value == null ? '' : String(value);

        if (typeof filter === 'string') {
          // Simple text filter (from quick dropdown)
          if (!text.toLowerCase().includes(filter.toLowerCase())) return false;
        } else if (filter.type === 'values') {
          // Values mode: exclude unchecked
          const key = value == null ? '(null)' : String(value);
          if (filter.excluded.has(key)) return false;
        } else if (filter.type === 'conditions') {
          // Conditions mode
          const pass = filter.logic === 'AND'
            ? filter.conditions.every(condition => this._evalCondition(text, value, condition))
            : filter.conditions.some(condition => this._evalCondition(text, value, condition));
          if (!pass) return false;
        }
      }
      return true;
    });
  }

  _evalCondition(text, raw, condition) {
    const lowered = text.toLowerCase();
    const value = condition.val.toLowerCase();
    switch (condition.op) {
      case 'contains': return lowered.includes(value);
      case 'not-contains': return !lowered.includes(value);
      case 'equals': return lowered === value;
      case 'not-equals': return lowered !== value;
      case 'starts-with': return lowered.startsWith(value);
      case 'ends-with': return lowered.endsWith(value);
      case 'wildcard': {
        const pattern = new RegExp('^' + condition.val.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i');
        return pattern.test(text);
      }
      case 'gt': return parseFloat(text) > parseFloat(condition.val);
      case 'lt': return parseFloat(text) < parseFloat(condition.val);
      case 'gte': return parseFloat(text) >= parseFloat(condition.val);
      case 'lte': return parseFloat(text) <= parseFloat(condition.val);
      case 'is-empty': return raw == null || text === '';
      case 'not-empty': return raw != null && text !== '';
      case 'regex': try { return new RegExp(condition.val, 'i').test(text); } catch { return false; }
      default: return true;
    }
  }

  disconnectedCallback() {
    if (this._vlist) { this._vlist.destroy(); this._vlist = null; }
    super.disconnectedCallback();
  }
}

customElements.define('structra-table', StructraTable);
