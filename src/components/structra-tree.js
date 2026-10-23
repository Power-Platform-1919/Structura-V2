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
      Structra.events.emit('tree:wrap-state', this._wrap);
      Structra.toast(this._wrap ? 'Long values now wrap onto several lines' : 'Long values stay on one line');
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
    this.innerHTML = '<div class="json-view" id="jsonView" tabindex="0" role="tree" aria-label="JSON tree. Arrow keys move, Left and Right fold, Enter selects."></div>';
    this._bindKeys();
    this.renderTree();
  }

  /** Up and Down move between lines, Right opens and Left closes a block, Enter selects the line */
  _bindKeys() {
    const view = this._getView();
    view.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', ' ', 'Home', 'End'].includes(e.key)) return;
      const lines = [...view.querySelectorAll('.j-line')].filter((l) => l.offsetParent !== null);
      if (!lines.length) return;
      e.preventDefault();
      let cur = lines.indexOf(this._kcur);
      if (cur < 0) cur = lines.findIndex((l) => l.classList.contains('highlighted'));
      const select = (l) => {
        if (!l) return;
        view.querySelectorAll('.j-line.highlighted').forEach((x) => x.classList.remove('highlighted'));
        l.classList.add('highlighted');
        this._kcur = l;
        const p = Structra.paths.canonical(l.dataset.path);
        Structra.set('currentPath', p);
        Structra.events.emit('tree:node-selected', p);
        l.scrollIntoView({ block: 'nearest' });
      };
      const toggle = cur >= 0 ? lines[cur].querySelector('.j-toggle') : null;
      const open = toggle && toggle.textContent.trim() === '\u25BC';
      if (e.key === 'ArrowDown') select(lines[Math.min(lines.length - 1, cur + 1)]);
      else if (e.key === 'ArrowUp') select(lines[Math.max(0, cur - 1)]);
      else if (e.key === 'Home') select(lines[0]);
      else if (e.key === 'End') select(lines[lines.length - 1]);
      else if (e.key === 'ArrowRight') { if (toggle && !open) toggle.click(); else select(lines[Math.min(lines.length - 1, cur + 1)]); }
      else if (e.key === 'ArrowLeft') { if (toggle && open) toggle.click(); }
      else if (cur >= 0) { if (toggle && e.key === ' ') toggle.click(); else select(lines[cur]); }
      else select(lines[0]);
    });
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
        const p = Structra.paths.canonical(path);
        Structra.set('currentPath', p);
        Structra.events.emit('tree:node-selected', p);
      },
      onContextMenu: (x, y, path) => {
        // A right-click selects the line first, so the path bar and the expressions follow the menu
        const p = Structra.paths.canonical(path);
        Structra.set('currentPath', p);
        this._showContextMenu(x, y, p);
      },
    });

    this._markBookmarks();
    if (this._wrap) view.classList.add('wrap-mode');
    Structra.events.emit('tree:rendered');
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

    const ic = (name) => `<span class="tree-ctx-icon">${Structra.icons.svg(name, { size: 14 })}</span>`;
    const scalar = val !== null && val !== undefined && !isObj;
    menu.innerHTML = `
      <div class="tree-ctx-item" data-ctx="copy-path">${ic('copy')} Copy path</div>
      <div class="tree-ctx-item" data-ctx="copy-value">${ic('clipboard')} Copy value</div>
      ${isObj ? `<div class="tree-ctx-item" data-ctx="copy-subtree">${ic('braces')} Copy as JSON</div>` : ''}
      <div class="tree-ctx-sep"></div>
      <div class="tree-ctx-item" data-ctx="copy-pa">${ic('zap')} Copy Power Automate expression</div>
      <div class="tree-ctx-item" data-ctx="copy-fx">${ic('zap')} Copy Power Fx formula</div>
      <div class="tree-ctx-item tree-ctx-sub-parent" data-ctx="copy-as">${ic('code-xml')} Copy as type definition
        <div class="tree-ctx-submenu">
          ${codeGenLangs.map(l => `<div class="tree-ctx-item" data-ctx="gen" data-lang="${l.id}">${l.label}</div>`).join('')}
        </div>
      </div>
      <div class="tree-ctx-sep"></div>
      ${isArray && val.length && val[0] && typeof val[0] === 'object' ? `<div class="tree-ctx-item" data-ctx="expand-here">${ic('table')} Show as a table</div>` : ''}
      ${scalar ? `<div class="tree-ctx-item" data-ctx="find-value">${ic('search')} Find this value</div>` : ''}
      <div class="tree-ctx-item" data-ctx="mock">${ic('dices')} Copy mock data</div>
      <div class="tree-ctx-item" data-ctx="bookmark">${ic('bookmark')} ${Structra.bookmarks.has(path) ? 'Remove bookmark' : 'Bookmark'}</div>
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
        Structra.util.copy(path, 'Path copied');
        break;
      case 'copy-value': {
        const text = val === null ? 'null' : typeof val === 'object' ? JSON.stringify(val, null, 2) : String(val);
        Structra.util.copy(text, 'Value copied');
        break;
      }
      case 'copy-subtree': {
        const json = JSON.stringify(val, null, 2);
        Structra.util.copy(json, 'Subtree copied');
        break;
      }
      case 'gen': {
        if (!lang) break;
        try {
          const code = Structra.codeGen.generate(lang, val, 'Data');
          Structra.util.copy(code, `Copied as ${lang}`);
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
      case 'mock': {
        try {
          const mocked = Structra.mockGen.generate(val, 3);
          Structra.util.copy(JSON.stringify(mocked, null, 2), 'Mock data copied');
        } catch { Structra.toast('Mock generation failed', 'error'); }
        break;
      }
      case 'bookmark':
        Structra.toast(Structra.bookmarks.toggle(path) ? 'Bookmarked ' + path : 'Bookmark removed');
        break;
      case 'copy-pa':
      case 'copy-fx': {
        const want = action === 'copy-pa' ? 'Power Automate' : 'Power Fx';
        const row = Structra.expressions.quick(path, val).filter((r) => r.app === want)[0];
        if (row) Structra.util.copy(row.code, row.label + ' copied');
        break;
      }
      case 'find-value':
        if (val !== null && val !== undefined && typeof val !== 'object') Structra.events.emit('find:prefill', String(val));
        break;
    }
  }

  _resolve(data, path) {
    if (!data || !path || path === '$') return data;
    return Structra.paths.resolve(data, path);
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
