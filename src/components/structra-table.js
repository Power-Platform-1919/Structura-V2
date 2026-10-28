/* ============================================================
   STRUCTRA V2 - Table View Component
   <structra-table> - tabular data view with:
   - Engine-backed sorting + pagination
   - Long lists drawn a window at a time (only the rows on screen are in the page) with a true scrollbar (@tanstack/virtual-core)
   - Sticky header, row selection, column sort indicators
   - A grid for screen readers and the keyboard (the WAI-ARIA grid pattern): arrows, Home, End, Page keys, Enter, Shift+F10
   - Follows the selected path (from the Tree, the path bar or Find)
   - Page-size selector

   Wiring (generated from the code below; update it when you add or remove an event):
     Listens to: state:jsonData, view:switched, engine:ingested, settings:changed,
          engine:filter-changed, state:currentPath
     Emits: tree:node-selected, charts:open
     Sets state: currentPath
   ============================================================ */

const NO_RECORDS = '<tr><td style="color:var(--text-muted);padding:var(--sp-4)">There is no list of records in this file to show as a table. Use the Tree to browse it.</td></tr>';

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
    this._virtualizer = null; // the window of a long list, while one is shown
    this._rowHeight = 32;     // the height of one row, measured from a real row once drawn (every row is one line)
    this._VIRTUAL_THRESHOLD = 200;      // above this many rows the list scrolls as one, drawn a window at a time
    // A browser cannot make an element taller than about 17 million pixels (Firefox) or 33 million (Chrome), and the scrollbar is
    // as long as all the rows: 400,000 rows of 32 px is 12.8 million. A longer list is shown a page at a time.
    this._MAX_WINDOWED_ROWS = 400000;
    this._active = { row: -1, col: 0 };   // the cell the keyboard is on: row -1 is the header
    this._selectedRowPath = null;
    this._renderToken = 0;
    this._listening = false;
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
      this._selectedRowPath = null;
      this._active = { row: -1, col: 0 };
      Structra.log.debug('Table', 'jsonData changed - stale=true');
      if (Structra.state.activeView === 'table') this.renderTable();
    });
    this.on('view:switched', (view) => {
      if (view === 'table' && this._stale) {
        Structra.log.info('Table', 'View switched to table - rendering');
        this.renderTable();
      } else if (view === 'table') {
        this._followPath(Structra.state.currentPath);       // a row chosen in another view while this one was hidden
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
    // A row selected elsewhere (the Tree, the path bar, Find) is shown here: marked, and scrolled to
    this.on('state:currentPath', (change) => this._followPath(change.value));
  }

  render() {
    this.innerHTML = `
      <div class="table-container" id="tableContainer">
        <div class="table-toolbar" id="tablePager"></div>
        <div class="table-scroll" id="tableScroll" role="region" aria-label="Table rows">
          <table class="data-table">
            <thead id="tableHead"></thead>
            <tbody id="tableBody"></tbody>
          </table>
        </div>
      </div>`;
    this.renderTable();
    if (this._listening) return;      // render() can run again (an attribute changed): the listeners below are added once
    this._listening = true;

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
        this._active = this._positionOf(header);
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
      // Row selection; the clicked cell is where the keyboard continues from
      const cell = event.target.closest('tbody td');
      const row = event.target.closest('tbody tr[data-path]');
      if (cell) this._setActiveFromCell(cell);
      if (row) this._selectRow(row);
    });

    // Column header right-click menu
    this.addEventListener('contextmenu', (event) => {
      const header = event.target.closest('th[data-col]');
      if (header) {
        event.preventDefault();
        this._showColumnMenu(event.clientX, event.clientY, header.dataset.col);
      }
    });

    this.addEventListener('keydown', (event) => this._onKeyDown(event));
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

    // The window of the last list goes; a render still waiting for the helper to load is told it is out of date
    this._destroyWindow();
    this._windowFailed = false;
    const token = ++this._renderToken;
    if (this.contains(document.activeElement) && document.activeElement.closest('table.data-table')) this._wantFocus = true;   // the focus comes back to the same cell
    this._setGrid(false);

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
      body.innerHTML = NO_RECORDS;
      if (pager) pager.innerHTML = '';
      return;
    }

    const { allRows, totalRows, keys, basePath } = resolved;
    // A list of plain values (numbers, text) has no columns: rows without cells would be a grid of nothing
    if (!keys.length) {
      head.innerHTML = '';
      body.innerHTML = NO_RECORDS;
      if (pager) pager.innerHTML = '';
      return;
    }
    this._totalRows = totalRows;
    this._keys = keys;
    this._basePath = basePath;
    this._rows = allRows;

    // Render header
    this._renderHeader(head, keys);
    this._applyColumnWidths(keys, allRows);

    // Render toolbar (show filter indicator if filtered)
    this._lastFiltered = !!resolved.filtered;
    this._renderToolbar(pager, totalRows, !!resolved.filtered);
    // The keyboard position stays on the list: a shorter list or fewer columns brings it back inside
    if (this._active.row >= totalRows) this._active = { row: -1, col: this._active.col };
    this._active.col = Math.min(this._active.col, Math.max(0, (this._visibleKeys || keys).length - 1));

    if (totalRows === 0 && resolved.filtered) {
      body.innerHTML = `<tr class="table-empty"><td colspan="${Math.max(1, keys.length)}">No rows match the filter. Change the condition or press Clear.</td></tr>`;
      return;
    }

    // Choose rendering strategy: a window for a long list, a page otherwise
    this._setGrid(true, totalRows, (this._visibleKeys || keys).length);
    this._pendingFollow = true;
    if (this._isWindowed(totalRows)) this._renderWindowed(body, allRows, keys, basePath, totalRows, token);
    else this._renderPage(body, allRows, keys, basePath, totalRows);

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
    const ariaSort = (column) => (this._sortCol === column ? ` aria-sort="${this._sortAsc ? 'ascending' : 'descending'}"` : '');
    const sortIcon = (column) => {
      if (this._sortCol !== column) return '';
      return this._sortAsc ? ' ↑' : ' ↓';
    };
    const filterIcon = (column) => {
      const isFiltered = this._colFilters && this._colFilters[column];
      return `<span class="th-filter-icon${isFiltered ? ' th-filter-active' : ''}" data-col-filter="${Structra.sharedHelpers.escapeHtml(column)}" title="Filter this column">${Structra.icons.svg('list-filter', { size: 12 })}</span>`;
    };
    head.innerHTML = '<tr aria-rowindex="1">' + visibleKeys.map((column, columnIndex) =>
      `<th data-col="${Structra.sharedHelpers.escapeHtml(column)}"${this._numericCols.has(column) ? ' class="num"' : ''}${this._active.row === -1 && this._active.col === columnIndex ? ' tabindex="0"' : ''}${ariaSort(column)}><span class="th-label">${Structra.sharedHelpers.escapeHtml(column)}${sortIcon(column)}</span>${filterIcon(column)}</th>`
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

    const useVirtual = this._isWindowed(totalRows);
    const tooLong = totalRows > this._MAX_WINDOWED_ROWS;
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
      : `${tooLong ? '<span class="table-page-info" title="A list this long is shown a page at a time">very long list</span>' : ''}<button data-page-action="first" ${this._page === 0 ? 'disabled' : ''} title="First page" aria-label="First page">${icon('chevrons-left')}</button>
      <button data-page-action="prev" ${this._page === 0 ? 'disabled' : ''} title="Previous page" aria-label="Previous page">${icon('chevron-left')}</button>
      <span class="table-page-info">${from.toLocaleString()}–${to.toLocaleString()} of ${totalRows.toLocaleString()}</span>
      <button data-page-action="next" ${this._page >= maxPage ? 'disabled' : ''} title="Next page" aria-label="Next page">${icon('chevron-right')}</button>
      <button data-page-action="last" ${this._page >= maxPage ? 'disabled' : ''} title="Last page" aria-label="Last page">${icon('chevrons-right')}</button>
      <span class="table-sep"></span>
      <span class="table-size-label">Rows per page:</span>
      ${sizeOptions}`;
    pager.innerHTML = `${filterBadge}${hiddenBadge}${moreColumns}${pages}`;
  }

  /* ======== PAGED RENDER (a short list, or a list too long to scroll as one) ======== */

  _renderPage(body, allRows, keys, basePath, totalRows) {
    const offset = this._page * this._pageSize;
    const rows = allRows.slice(offset, offset + this._pageSize);
    body.innerHTML = this._buildRowsHtml(rows, keys, basePath, offset);
    this._afterPaint();
  }

  /* ======== WINDOWED RENDER (a long list: only the rows on screen are in the page, the scrollbar is the true size) ======== */

  /**
   * The rows that are on screen (and a few more above and below) are drawn between two empty spacer rows whose heights stand for
   * the rows that are not, so the scrollbar is as long as the whole list and can be dragged to any row. The arithmetic (which rows
   * are visible, how tall the whole list is, where to scroll to) is Structra.rowWindow (src/core/row-window.js).
   * Every row is one line (cells do not wrap), so every row is the same height; it is measured from a real row.
   */
  async _renderWindowed(body, allRows, keys, basePath, totalRows, token) {
    const scroll = this.queryOne('#tableScroll');
    const head = this.queryOne('#tableHead');
    let rowWindow;
    try {
      rowWindow = await Structra.rowWindow.create({
        scrollElement: scroll,
        count: totalRows,
        rowHeight: this._rowHeight || 32,
        headerHeight: head.offsetHeight,
        onChange: () => this._paintWindow(),
      });
    } catch (error) {
      // The helper could not be loaded: show the list a page at a time instead of showing nothing
      Structra.log.warn('Table', 'virtual-core did not load, paging instead: ' + error.message);
      this._windowFailed = true;
      if (token === this._renderToken) { this._renderToolbar(this.queryOne('#tablePager'), totalRows, !!this._lastFiltered); this._renderPage(body, allRows, keys, basePath, totalRows); }
      return;
    }
    if (token !== this._renderToken) { rowWindow.destroy(); return; }

    this._windowRows = allRows;
    this._windowKeys = keys;
    this._windowBase = basePath;
    this._paintedRange = null;
    this._rowHeight = this._rowHeight || 32;
    this._virtualizer = rowWindow;
    this._paintWindow();
  }

  /** Draw the rows the window asks for, between two spacers. Does nothing when the same rows are already drawn. */
  _paintWindow() {
    const virtualizer = this._virtualizer;
    const body = this.queryOne('#tableBody');
    if (!virtualizer || !body || !this._windowRows) return;
    const items = virtualizer.items();
    const first = items.length ? items[0].index : -1;
    const last = items.length ? items[items.length - 1].index : -1;
    const range = first + ':' + last;
    if (range === this._paintedRange) return;
    this._paintedRange = range;

    const hadFocus = body.contains(document.activeElement);
    const margin = virtualizer.margin();
    const columns = Math.max(1, (this._visibleKeys || this._windowKeys).length);
    const spacer = (pixels) => (pixels > 0 ? `<tr class="vl-spacer" aria-hidden="true" style="height:${pixels}px"><td colspan="${columns}"></td></tr>` : '');
    if (!items.length) { body.innerHTML = ''; return; }
    const above = items[0].start - margin;
    const below = Math.max(0, virtualizer.totalSize() - (items[items.length - 1].end - margin));
    body.innerHTML = spacer(above) + this._buildRowsHtml(this._windowRows.slice(first, last + 1), this._windowKeys, this._windowBase, first) + spacer(below);

    this._measureRows();
    if (hadFocus) this._focusActive({ preventScroll: true });
    this._afterPaint();
  }

  /** The real height of a row and of the header can differ from the guess (the view was hidden when it was first drawn): correct it once */
  _measureRows() {
    const virtualizer = this._virtualizer;
    const row = this.queryOne('#tableBody tr[data-index]');
    const head = this.queryOne('#tableHead');
    if (!virtualizer || !row) return;
    const height = row.getBoundingClientRect().height;
    const headerHeight = head ? head.offsetHeight : 0;
    const rowChanged = height > 8 && Math.abs(height - this._rowHeight) > 0.5;
    const headerChanged = headerHeight > 0 && headerHeight !== virtualizer.margin();
    if (!rowChanged && !headerChanged) return;
    if (rowChanged) this._rowHeight = height;
    this._paintedRange = null;
    virtualizer.setMeasurements({ rowHeight: this._rowHeight, headerHeight });
  }

  _destroyWindow() {
    if (this._virtualizer) this._virtualizer.destroy();
    this._virtualizer = null;
    this._windowRows = null;
    this._paintedRange = null;
  }

  /* ======== ROW HTML BUILDER ======== */

  /**
   * The rows as HTML. startOffset is the position of the first row in the whole list (not in the page or the window), so every row
   * knows its place: data-index for the keyboard, aria-rowindex for a screen reader (row 1 is the header, so the first row is 2).
   */
  _buildRowsHtml(rows, keys, basePath, startOffset) {
    const visibleKeys = this._visibleKeys || keys;
    const escapeHtml = Structra.sharedHelpers.escapeHtml;
    let html = '';
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const index = startOffset + i;
      const path = this._pathFor(row);
      const isActiveRow = this._active.row === index;
      let cells = '';
      for (let columnIndex = 0; columnIndex < visibleKeys.length; columnIndex++) {
        const value = row ? row[visibleKeys[columnIndex]] : undefined;
        const tab = isActiveRow && this._active.col === columnIndex ? ' tabindex="0"' : '';
        cells += `<td${this._numericCols && this._numericCols.has(visibleKeys[columnIndex]) ? ' class="num"' : ''}${tab}>${this._formatCell(value, visibleKeys[columnIndex])}</td>`;
      }
      // The selected row keeps its mark when its rows are drawn again (after a scroll, a sort or a page change)
      const selected = path && path === this._selectedRowPath ? ' class="row-sel" aria-selected="true"' : '';
      html += `<tr${path ? ` data-path="${escapeHtml(path)}"` : ''} data-index="${index}" aria-rowindex="${index + 2}"${selected}>${cells}</tr>`;
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

  /* ======== THE GRID: roles, selection, keyboard ======== */

  /**
   * The table is a grid for a screen reader and for the keyboard (the WAI-ARIA grid pattern): one cell is the tab stop (tabindex 0),
   * the arrow keys move between cells, and Tab leaves the grid. this._active is that cell: row -1 is the header, rows 0 and up are
   * data rows counted in the whole list, col counts the columns shown.
   */
  _setGrid(on, totalRows, columnCount) {
    const table = this.queryOne('table.data-table');
    const scroll = this.queryOne('#tableScroll');
    if (!table || !scroll) return;
    if (on) {
      table.setAttribute('role', 'grid');
      table.setAttribute('aria-rowcount', String(totalRows + 1));
      table.setAttribute('aria-colcount', String(columnCount));
      table.setAttribute('aria-label', `${totalRows.toLocaleString()} rows`);
      scroll.removeAttribute('tabindex');       // a cell is the tab stop now
    } else {
      for (const name of ['role', 'aria-rowcount', 'aria-colcount', 'aria-label']) table.removeAttribute(name);
      scroll.tabIndex = 0;                      // a message or a field list: the box itself must be reachable
    }
  }

  _isWindowed(totalRows) {
    return !this._windowFailed && totalRows > this._VIRTUAL_THRESHOLD && totalRows <= this._MAX_WINDOWED_ROWS;
  }

  /** The cell element at a place, or null when that row is not drawn */
  _cellEl(row, col) {
    if (row < 0) return this.querySelector(`#tableHead th:nth-child(${col + 1})`);
    const tr = this.querySelector(`#tableBody tr[data-index="${row}"]`);
    return tr ? tr.children[col] || null : null;
  }

  _positionOf(cell) {
    const tr = cell.closest('tr');
    return { row: cell.tagName === 'TH' ? -1 : Number(tr.dataset.index), col: cell.cellIndex };
  }

  /** Make a cell the one the keyboard continues from (a click does this); focus moves to it */
  _setActiveFromCell(cell) {
    this._active = this._positionOf(cell);
    this._focusActive({ preventScroll: true });
  }

  /** Give the active cell the tab stop and the focus. Returns false when that row is not drawn. */
  _focusActive({ preventScroll = false } = {}) {
    const cell = this._cellEl(this._active.row, this._active.col);
    if (!cell) return false;
    this.querySelectorAll('table.data-table [tabindex]').forEach((other) => { if (other !== cell) other.removeAttribute('tabindex'); });
    cell.tabIndex = 0;
    cell.focus({ preventScroll });
    return true;
  }

  /** After rows are drawn: something must be the tab stop, the focus comes back if it was in the grid, the selected path is followed */
  _afterPaint() {
    if (!this.querySelector('table.data-table [tabindex="0"]')) {
      const header = this.querySelector('#tableHead th');
      if (header) header.setAttribute('tabindex', '0');
    }
    if (this._wantFocus && this._focusActive({ preventScroll: true })) this._wantFocus = false;
    if (this._pendingFollow) { this._pendingFollow = false; this._followPath(Structra.state.currentPath); }
  }

  /** The last data row the keyboard can reach: the end of the list, or the end of this page when the list is paged */
  _lastRowIndex() {
    if (this._isWindowed(this._totalRows)) return this._totalRows - 1;
    return Math.min(this._totalRows, (this._page + 1) * this._pageSize) - 1;
  }

  _firstRowIndex() {
    return this._isWindowed(this._totalRows) ? 0 : this._page * this._pageSize;
  }

  _rowsPerScreen() {
    const scroll = this.queryOne('#tableScroll');
    const head = this.queryOne('#tableHead');
    const visible = (scroll ? scroll.clientHeight : 0) - (head ? head.offsetHeight : 0);
    return Math.max(1, Math.floor(visible / (this._rowHeight || 32)) - 1);
  }

  /** Move the keyboard position. A row that is not drawn (far down a long list) is scrolled to first, and gets the focus when it is drawn. */
  _moveTo(row, col) {
    this._active = { row, col };
    if (this._focusActive()) return;
    if (this._virtualizer && row >= 0) {
      this._wantFocus = true;
      this._virtualizer.scrollToIndex(row, { align: 'auto' });
    }
  }

  _onKeyDown(event) {
    if (event.altKey || event.metaKey || (event.ctrlKey && event.key !== 'Home' && event.key !== 'End')) return;
    const cell = event.target && event.target.closest ? event.target.closest('table.data-table th, table.data-table td') : null;
    if (!cell || event.target !== cell) return;           // a key typed inside a control in the cell is not ours
    let { row, col } = this._positionOf(cell);
    const firstRow = this._firstRowIndex();
    const lastRow = this._lastRowIndex();
    const lastCol = Math.max(0, (this._visibleKeys || this._keys || []).length - 1);
    switch (event.key) {
      case 'ArrowDown': row = row < firstRow ? firstRow : Math.min(lastRow, row + 1); break;
      case 'ArrowUp': row = row <= firstRow ? -1 : row - 1; break;
      case 'ArrowRight': col = Math.min(lastCol, col + 1); break;
      case 'ArrowLeft': col = Math.max(0, col - 1); break;
      case 'Home': col = 0; if (event.ctrlKey) row = -1; break;
      case 'End': col = lastCol; if (event.ctrlKey) row = lastRow; break;
      case 'PageDown': row = Math.min(lastRow, Math.max(row, firstRow - 1) + this._rowsPerScreen()); break;
      case 'PageUp': row = row - this._rowsPerScreen() < firstRow ? (row > firstRow ? firstRow : -1) : row - this._rowsPerScreen(); break;
      case 'Enter':
      case ' ': {
        event.preventDefault();
        if (row === -1) cell.click();                      // a header sorts, as a click does
        else { const tr = cell.closest('tr'); if (tr && tr.dataset.path) this._selectRow(tr); }
        return;
      }
      case 'ContextMenu':
      case 'F10': {
        if (event.key === 'F10' && !event.shiftKey) return;
        if (row !== -1 || !cell.dataset.col) return;
        event.preventDefault();
        const box = cell.getBoundingClientRect();
        this._showColumnMenu(box.left, box.bottom, cell.dataset.col);
        return;
      }
      default: return;
    }
    event.preventDefault();
    this._moveTo(row, col);
  }

  /** Select a row: the mark, the path bar, the Node panel and the other views follow */
  _selectRow(tr) {
    this.queryAll('tbody tr.row-sel').forEach((other) => { other.classList.remove('row-sel'); other.removeAttribute('aria-selected'); });
    tr.classList.add('row-sel');
    tr.setAttribute('aria-selected', 'true');
    this._selectedRowPath = tr.dataset.path;
    Structra.setState('currentPath', tr.dataset.path);
    Structra.events.emit('tree:node-selected', tr.dataset.path);
  }

  /* ======== FOLLOWING THE SELECTED PATH (from the Tree, the path bar, Find ...) ======== */

  /** "value[12].Title" in a table of the list at "value" is row 12: the path of the row, or '' when it is not a row of this table */
  _rowPathOf(path) {
    if (!path || !this._rows) return '';
    const base = Structra.dataPaths.strip(this._basePath);
    const stripped = Structra.dataPaths.strip(path);
    const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = new RegExp('^' + escaped + '\\[(\\d+)\\]').exec(stripped);
    return match ? `${base}[${match[1]}]` : '';
  }

  /** Where a row is in the list as shown (after sorting and filtering), or -1 */
  _displayIndexOf(rowPath) {
    const rows = this._rows;
    if (!rows) return -1;
    const wanted = /\[(\d+)\]$/.exec(rowPath);
    if (this._baseRows === rows && wanted && Number(wanted[1]) < rows.length) return Number(wanted[1]);   // the list is in the document's order
    for (let i = 0; i < rows.length; i++) if (this._pathFor(rows[i]) === rowPath) return i;
    return -1;
  }

  _followPath(path) {
    if (Structra.state.activeView !== 'table' || !this._rows) return;
    const rowPath = this._rowPathOf(path);
    if (!rowPath || rowPath === this._selectedRowPath) return;
    const index = this._displayIndexOf(rowPath);
    if (index < 0) return;
    this._selectedRowPath = rowPath;
    this._active = { row: index, col: this._active.col };
    if (this._virtualizer) {
      this.queryAll('tbody tr.row-sel').forEach((other) => { other.classList.remove('row-sel'); other.removeAttribute('aria-selected'); });
      this._paintedRange = null;
      this._virtualizer.scrollToIndex(index, { align: 'center' });
      this._paintWindow();
    } else {
      const page = Math.floor(index / this._pageSize);
      if (page !== this._page) { this._page = page; this.renderTable(); }
      else {
        this.queryAll('tbody tr.row-sel').forEach((other) => { other.classList.remove('row-sel'); other.removeAttribute('aria-selected'); });
        const tr = this.querySelector(`#tableBody tr[data-index="${index}"]`);
        if (tr) { tr.classList.add('row-sel'); tr.setAttribute('aria-selected', 'true'); tr.scrollIntoView({ block: 'nearest' }); }
      }
    }
  }

  disconnectedCallback() {
    this._destroyWindow();
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
    const FRIENDLY_LABEL_KEYS = ['Value', 'DisplayName', 'Title', 'Name', 'Email', 'value', 'displayName', 'title', 'name', 'label', 'text'];
    const brief = (object) => {
      if (object === null || object === undefined) return 'null';
      if (typeof object !== 'object') return String(object);
      const field = FRIENDLY_LABEL_KEYS.find((field) => object[field] !== undefined && object[field] !== null && typeof object[field] !== 'object');
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

  /** The pattern a "like" (wildcard) condition stands for: * is any text, ? is one character */
  _wildcardSource(text) {
    return '^' + text.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$';
  }

  /** A pattern is tried on the longest texts of its column in the sandbox first: the filter then runs on the page once per cell */
  async _patternIsTooSlow(column, conditions) {
    const patterns = conditions.filter((condition) => condition.op === 'regex' || condition.op === 'wildcard')
      .map((condition) => (condition.op === 'regex' ? condition.val : this._wildcardSource(condition.val)));
    if (!patterns.length) return false;
    const rows = (this._resolveData().allRows || []).slice(0, 200000);
    const samples = Structra.sandbox.pickSamples(rows.map((row) => (row && row[column] !== null && row[column] !== undefined ? String(row[column]) : '')));
    for (const pattern of patterns) {
      try { await Structra.sandbox.probePattern(pattern, 'i', samples); }
      catch (error) { if (error.timedOut) return true; /* an invalid pattern matches nothing, as before */ }
    }
    return false;
  }

  async _applyFilterPanel(column) {
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
      if (conditions.length && await this._patternIsTooSlow(column, conditions)) {
        Structra.toast(Structra.sharedHelpers.RISKY_REGEX_MESSAGE);
        return;
      }
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
        return new RegExp(this._wildcardSource(condition.val), 'i').test(text);
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
}

customElements.define('structra-table', StructraTable);
