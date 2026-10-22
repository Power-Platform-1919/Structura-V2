/* ============================================================
   STRUCTRA V2 — Tree View Component
   <structra-tree> — Virtualized JSON tree view with chunked
   lazy-loading, DOM recycling, and rehydration for 200k+ nodes.
   Delegates rendering to Structra.jsonTree (V2 renderer).
   ============================================================ */

class StructraTree extends StructraElement {
  static get observedAttributes() { return ['wrap']; }

  init() {
    this._wrap = false;
    this.on('state:jsonData', () => this.renderTree());
    this.on('state:currentPath', (d) => this._highlightPath(d.value));
    this.on('bookmarks:changed', () => this._markBookmarks());
    this.on('tree:expand-all', () => this._expandAll());
    this.on('tree:collapse-all', () => this._collapseAll());
    this.on('tree:collapse-depth', (depth) => this._collapseToDepth(depth));
    // Navigate to a specific path (from find bar prev/next)
    this.on('tree:navigate-path', (path) => this._highlightPath(path));
    this.on('tree:toggle-wrap', () => {
      this._wrap = !this._wrap;
      const view = this._getView();
      if (view) view.classList.toggle('wrap-mode', this._wrap);
    });
    // Universal query: apply/clear tree-level filtering + highlighting
    this.on('engine:filter-changed', (query) => {
      const view = this._getView();
      if (!view) return;
      if (query && query.matchedPaths) {
        Structra.jsonTree.setFilter(view, query.matchedPaths);
        Structra.jsonTree.highlightPaths(view, query.matchedPaths);
      } else {
        Structra.jsonTree.clearFilter(view);
      }
    });
  }

  render() {
    this.innerHTML = '<div class="json-view" id="jsonView"></div>';
    this.renderTree();
  }

  _getView() {
    return this.$('#jsonView');
  }

  renderTree() {
    const data = Structra.state.jsonData;
    const view = this._getView();
    if (!data) {
      Structra.log.debug('Tree', 'No data — showing empty state');
      view.innerHTML = this._emptyState();
      return;
    }
    const itemCount = Array.isArray(data) ? data.length : Object.keys(data).length;
    Structra.log.info('Tree', 'renderTree() — ' + itemCount + ' top-level items');
    const t0 = performance.now();

    // Render using V2 json-tree renderer
    Structra.jsonTree.render(view, data, {
      onPathSelect: (path) => {
        Structra.set('currentPath', path);
        Structra.events.emit('tree:node-selected', path);
      },
      onContextMenu: (x, y, path) => {
        this._showContextMenu(x, y, path);
      },
    });

    this._markBookmarks();
    Structra.log.perf('Tree', 'renderTree()', performance.now() - t0);
  }

  /** Show the bookmark marker on bookmarked lines that are currently rendered */
  _markBookmarks() {
    const view = this._getView();
    if (view) Structra.jsonTree.updateBookmarkHighlights(view, Structra.bookmarks.paths());
  }

  _emptyState() {
    return '';
  }

  _expandAll() {
    Structra.log.debug('Tree', 'expandAll()');
    const view = this._getView();
    if (view) Structra.jsonTree.expandAll(view);
  }

  _collapseAll() {
    Structra.log.debug('Tree', 'collapseAll()');
    const view = this._getView();
    if (view) Structra.jsonTree.collapseAll(view);
  }

  _collapseToDepth(depth) {
    Structra.log.debug('Tree', 'collapseToDepth(' + depth + ')');
    const view = this._getView();
    if (view) Structra.jsonTree.collapseToDepth(view, depth);
  }

  _highlightPath(path) {
    Structra.log.debug('Tree', 'highlightPath: ' + path);
    const view = this._getView();
    if (view) Structra.jsonTree.highlightPath(view, path);
  }

  /* ======== RIGHT-CLICK CONTEXT MENU ======== */

  _showContextMenu(x, y, path) {
    this._dismissCtxMenu();
    const data = Structra.state.jsonData;
    const val = this._resolve(data, path);
    const isObj = val !== null && typeof val === 'object';
    const isArray = Array.isArray(val);

    const menu = document.createElement('div');
    menu.className = 'tree-ctx-menu';
    menu.style.cssText = `left:${x}px;top:${y}px`;

    const codeGenLangs = [
      { id: 'typescript', label: 'TypeScript' },
      { id: 'python', label: 'Python' },
      { id: 'csharp', label: 'C#' },
      { id: 'go', label: 'Go' },
      { id: 'rust', label: 'Rust' },
      { id: 'java', label: 'Java' },
      { id: 'sql', label: 'SQL' },
    ];

    menu.innerHTML = `
      <div class="tree-ctx-item" data-ctx="copy-path"><span>📋</span> Copy Path</div>
      <div class="tree-ctx-item" data-ctx="copy-value"><span>📄</span> Copy Value</div>
      ${isObj ? '<div class="tree-ctx-item" data-ctx="copy-subtree"><span>🌳</span> Copy Subtree (JSON)</div>' : ''}
      <div class="tree-ctx-sep"></div>
      <div class="tree-ctx-item tree-ctx-sub-parent" data-ctx="copy-as"><span>💻</span> Copy As…
        <div class="tree-ctx-submenu">
          ${codeGenLangs.map(l => `<div class="tree-ctx-item" data-ctx="gen" data-lang="${l.id}">${l.label}</div>`).join('')}
        </div>
      </div>
      <div class="tree-ctx-sep"></div>
      ${isObj ? `<div class="tree-ctx-item" data-ctx="expand-here"><span>🔍</span> Explore in Table</div>` : ''}
      ${isArray ? `<div class="tree-ctx-item" data-ctx="array-stats"><span>📊</span> Array Stats (${val.length} items)</div>` : ''}
      <div class="tree-ctx-item" data-ctx="mock"><span>⚡</span> Generate Mock Data</div>
      <div class="tree-ctx-item" data-ctx="bookmark"><span>⭐</span> Bookmark</div>
      <div class="tree-ctx-sep"></div>
      <div class="tree-ctx-item" data-ctx="filter-to"><span>🔎</span> Filter to This</div>
      <div class="tree-ctx-item" data-ctx="select"><span>🎯</span> Select in Context Panel</div>
    `;

    menu.addEventListener('click', (e) => {
      const item = e.target.closest('[data-ctx]');
      if (!item) return;
      this._execCtxAction(item.dataset.ctx, path, val, item.dataset.lang);
      this._dismissCtxMenu();
    });

    document.body.appendChild(menu);
    this._activeCtxMenu = menu;

    // Adjust position if off-screen
    requestAnimationFrame(() => {
      const rect = menu.getBoundingClientRect();
      if (rect.right > window.innerWidth) menu.style.left = `${x - rect.width}px`;
      if (rect.bottom > window.innerHeight) menu.style.top = `${y - rect.height}px`;
    });

    const close = (e) => {
      if (!menu.contains(e.target)) {
        this._dismissCtxMenu();
        document.removeEventListener('mousedown', close);
      }
    };
    setTimeout(() => document.addEventListener('mousedown', close), 0);
  }

  _dismissCtxMenu() {
    if (this._activeCtxMenu) {
      this._activeCtxMenu.remove();
      this._activeCtxMenu = null;
    }
  }

  async _execCtxAction(action, path, val, lang) {
    switch (action) {
      case 'copy-path':
        navigator.clipboard.writeText(path).then(() => Structra.toast('Path copied'));
        break;
      case 'copy-value': {
        const text = val === null ? 'null' : typeof val === 'object' ? JSON.stringify(val) : String(val);
        navigator.clipboard.writeText(text).then(() => Structra.toast('Value copied'));
        break;
      }
      case 'copy-subtree': {
        const json = JSON.stringify(val, null, 2);
        navigator.clipboard.writeText(json).then(() => Structra.toast('Subtree copied'));
        break;
      }
      case 'gen': {
        if (!lang) break;
        try {
          const code = Structra.codeGen.generate(lang, val, 'Data');
          navigator.clipboard.writeText(code).then(() => Structra.toast(`Copied as ${lang}`));
        } catch (e) {
          Structra.toast('Code gen failed: ' + e.message, 'error');
        }
        break;
      }
      case 'expand-here': {
        // If it's an array of objects, switch to table view focused on this path
        if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object') {
          Structra.set('activeView', 'table');
          Structra.toast(`Showing ${val.length} items in table`);
        } else if (typeof val === 'object' && val !== null) {
          // Single object — show key/value pairs
          Structra.set('activeView', 'table');
        }
        break;
      }
      case 'array-stats': {
        if (!Array.isArray(val)) break;
        try {
          const types = {};
          val.forEach(v => { const t = v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v; types[t] = (types[t] || 0) + 1; });
          const typeStr = Object.entries(types).map(([t, c]) => `${t}:${c}`).join(', ');
          Structra.toast(`Array[${val.length}]: ${typeStr}`, 'info', 4000);
        } catch { Structra.toast(`Array with ${val.length} items`); }
        break;
      }
      case 'mock': {
        try {
          const mocked = Structra.mockGen.generate(val, 3);
          navigator.clipboard.writeText(JSON.stringify(mocked, null, 2))
            .then(() => Structra.toast('Mock data copied'));
        } catch { Structra.toast('Mock generation failed', 'error'); }
        break;
      }
      case 'bookmark':
        Structra.events.emit('bookmark:add', { path, preview: this._preview(val) });
        Structra.toast('Bookmarked: ' + path);
        break;
      case 'filter-to': {
        // Set active view data to just this subtree
        Structra.set('currentPath', path);
        Structra.events.emit('tree:navigate-path', path);
        Structra.toast('Filtered to ' + path);
        break;
      }
      case 'select':
        Structra.events.emit('tree:node-selected', path);
        break;
    }
  }

  _resolve(data, path) {
    if (!data || !path || path === '$') return data;
    const parts = path.replace(/^\$\.?/, '').replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
    let cur = data;
    for (const p of parts) {
      if (cur == null) return undefined;
      cur = Array.isArray(cur) ? cur[parseInt(p, 10)] : cur[p];
    }
    return cur;
  }

  _preview(val) {
    if (val === null) return 'null';
    if (typeof val === 'string') return val.length > 30 ? val.slice(0, 27) + '…' : val;
    if (Array.isArray(val)) return `[${val.length}]`;
    if (typeof val === 'object') return `{${Object.keys(val).length} keys}`;
    return String(val);
  }

  connectedCallback() {
    super.connectedCallback();
  }
}

customElements.define('structra-tree', StructraTree);
