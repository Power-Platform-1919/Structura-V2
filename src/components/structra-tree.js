/* ============================================================
   STRUCTRA V2 - Tree View Component
   <structra-tree> - Virtualized JSON tree view with chunked
   lazy-loading, DOM recycling, and rehydration for 200k+ nodes.
   Delegates rendering to Structra.jsonTreeRenderer (V2 renderer).

   Wiring (generated from the code below; update it when you add or remove an event):
     Listens to: state:jsonData, state:currentPath, bookmarks:changed, tree:expand-all,
          tree:collapse-all, tree:collapse-depth, tree:navigate-path, tree:toggle-wrap,
          engine:filter-changed
     Emits: tree:wrap-state, tree:node-selected, tree:rendered, find:prefill
     Sets state: currentPath, activeView
   ============================================================ */

class StructraTree extends StructraComponent {
  static get observedAttributes() { return ['wrap']; }

  init() {
    this._wrap = false;
    this.on('state:jsonData', () => this.renderTree());
    this.on('state:currentPath', (change) => this._highlightPath(change.value));
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
        Structra.jsonTreeRenderer.setFilter(view, query.matchedPaths);
        Structra.jsonTreeRenderer.highlightPaths(view, query.matchedPaths);
      } else {
        Structra.jsonTreeRenderer.clearFilter(view);
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
    view.addEventListener('keydown', (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', ' ', 'Home', 'End'].includes(event.key)) return;
      const lines = [...view.querySelectorAll('.j-line')].filter((line) => line.offsetParent !== null);
      if (!lines.length) return;
      event.preventDefault();
      let current = lines.indexOf(this._kcur);
      if (current < 0) current = lines.findIndex((line) => line.classList.contains('highlighted'));
      const select = (line) => {
        if (!line) return;
        view.querySelectorAll('.j-line.highlighted').forEach((line) => line.classList.remove('highlighted'));
        line.classList.add('highlighted');
        this._kcur = line;
        const path = Structra.dataPaths.canonical(line.dataset.path);
        Structra.setState('currentPath', path);
        Structra.events.emit('tree:node-selected', path);
        line.scrollIntoView({ block: 'nearest' });
      };
      const toggle = current >= 0 ? lines[current].querySelector('.j-toggle') : null;
      const open = toggle && toggle.textContent.trim() === '\u25BC';
      if (event.key === 'ArrowDown') select(lines[Math.min(lines.length - 1, current + 1)]);
      else if (event.key === 'ArrowUp') select(lines[Math.max(0, current - 1)]);
      else if (event.key === 'Home') select(lines[0]);
      else if (event.key === 'End') select(lines[lines.length - 1]);
      else if (event.key === 'ArrowRight') { if (toggle && !open) toggle.click(); else select(lines[Math.min(lines.length - 1, current + 1)]); }
      else if (event.key === 'ArrowLeft') { if (toggle && open) toggle.click(); }
      else if (current >= 0) { if (toggle && event.key === ' ') toggle.click(); else select(lines[current]); }
      else select(lines[0]);
    });
  }

  _getView() {
    return this.queryOne('#jsonView');
  }

  renderTree() {
    const data = Structra.state.jsonData;
    const view = this._getView();
    if (!data) {
      Structra.log.debug('Tree', 'No data - showing empty state');
      view.innerHTML = this._emptyState();
      return;
    }
    const itemCount = Array.isArray(data) ? data.length : Object.keys(data).length;
    Structra.log.info('Tree', 'renderTree() - ' + itemCount + ' top-level items');
    const startTime = performance.now();

    // Render using V2 json-tree renderer
    Structra.jsonTreeRenderer.render(view, data, {
      onPathSelect: (path) => {
        const canonicalPath = Structra.dataPaths.canonical(path);
        Structra.setState('currentPath', canonicalPath);
        Structra.events.emit('tree:node-selected', canonicalPath);
      },
      onContextMenu: (x, y, path) => {
        // A right-click selects the line first, so the path bar and the expressions follow the menu
        const canonicalPath = Structra.dataPaths.canonical(path);
        Structra.setState('currentPath', canonicalPath);
        this._showContextMenu(x, y, canonicalPath);
      },
    });

    this._markBookmarks();
    if (this._wrap) view.classList.add('wrap-mode');
    Structra.events.emit('tree:rendered');
    Structra.log.perf('Tree', 'renderTree()', performance.now() - startTime);
  }

  /** Show the bookmark marker on bookmarked lines that are currently rendered */
  _markBookmarks() {
    const view = this._getView();
    if (view) Structra.jsonTreeRenderer.updateBookmarkHighlights(view, Structra.bookmarks.paths());
  }

  _emptyState() {
    return '';
  }

  _expandAll() {
    Structra.log.debug('Tree', 'expandAll()');
    const view = this._getView();
    if (view) Structra.jsonTreeRenderer.expandAll(view);
  }

  _collapseAll() {
    Structra.log.debug('Tree', 'collapseAll()');
    const view = this._getView();
    if (view) Structra.jsonTreeRenderer.collapseAll(view);
  }

  _collapseToDepth(depth) {
    Structra.log.debug('Tree', 'collapseToDepth(' + depth + ')');
    const view = this._getView();
    if (view) Structra.jsonTreeRenderer.collapseToDepth(view, depth);
  }

  _highlightPath(path) {
    Structra.log.debug('Tree', 'highlightPath: ' + path);
    const view = this._getView();
    if (view) Structra.jsonTreeRenderer.highlightPath(view, path);
  }

  /* ======== RIGHT-CLICK CONTEXT MENU ======== */

  _showContextMenu(x, y, path) {
    this._dismissCtxMenu();
    const data = Structra.state.jsonData;
    const value = this._resolve(data, path);
    const isObject = value !== null && typeof value === 'object';
    const isArray = Array.isArray(value);

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

    const iconSpan = (name) => `<span class="tree-ctx-icon">${Structra.icons.svg(name, { size: 14 })}</span>`;
    const scalar = value !== null && value !== undefined && !isObject;
    // A text value that holds JSON (a flow run's Payload) can be opened and read as data
    let inner = null;
    if (typeof value === 'string' && /^\s*[\[{]/.test(value)) { try { const parsed = JSON.parse(value); if (parsed && typeof parsed === 'object') inner = parsed; } catch { /* just text */ } }
    menu.innerHTML = `
      <div class="tree-ctx-item" data-ctx="copy-path">${iconSpan('copy')} Copy path</div>
      <div class="tree-ctx-item" data-ctx="copy-value">${iconSpan('clipboard')} Copy value</div>
      ${isObject ? `<div class="tree-ctx-item" data-ctx="copy-subtree">${iconSpan('braces')} Copy as JSON</div>` : ''}
      <div class="tree-ctx-sep"></div>
      <div class="tree-ctx-item" data-ctx="copy-pa">${iconSpan('zap')} Copy Power Automate expression</div>
      <div class="tree-ctx-item" data-ctx="copy-fx">${iconSpan('zap')} Copy Power Fx formula</div>
      <div class="tree-ctx-item tree-ctx-sub-parent" data-ctx="copy-as">${iconSpan('code-xml')} Copy as type definition
        <div class="tree-ctx-submenu">
          ${codeGenLangs.map(language => `<div class="tree-ctx-item" data-ctx="gen" data-lang="${language.id}">${language.label}</div>`).join('')}
        </div>
      </div>
      <div class="tree-ctx-sep"></div>
      ${isArray && value.length && value[0] && typeof value[0] === 'object' ? `<div class="tree-ctx-item" data-ctx="expand-here">${iconSpan('table')} Show as a table</div>` : ''}
      ${inner ? `<div class="tree-ctx-item" data-ctx="open-json-text">${iconSpan('braces')} Open this text as JSON in a new tab</div>` : ''}
      ${scalar ? `<div class="tree-ctx-item" data-ctx="find-value">${iconSpan('search')} Find this value</div>` : ''}
      <div class="tree-ctx-item" data-ctx="mock">${iconSpan('dices')} Copy mock data</div>
      <div class="tree-ctx-item" data-ctx="bookmark">${iconSpan('bookmark')} ${Structra.bookmarks.has(path) ? 'Remove bookmark' : 'Bookmark'}</div>
    `;

    menu.addEventListener('click', (event) => {
      const item = event.target.closest('[data-ctx]');
      if (!item) return;
      this._execCtxAction(item.dataset.ctx, path, value, item.dataset.lang);
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

    const close = (event) => {
      if (!menu.contains(event.target)) {
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

  async _execCtxAction(action, path, value, lang) {
    switch (action) {
      case 'copy-path':
        Structra.sharedHelpers.copyToClipboard(path, 'Path copied');
        break;
      case 'copy-value': {
        const text = value === null ? 'null' : typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
        Structra.sharedHelpers.copyToClipboard(text, 'Value copied');
        break;
      }
      case 'open-json-text': {
        try {
          const inner = JSON.parse(value);
          const command = document.querySelector('structra-command');
          const leaf = String(path).split('.').pop().replace(/\[\d+\]$/, '') || 'text';
          const ok = await command._openInNewTab(inner, leaf);
          if (!ok) Structra.toast('Close a tab first: the limit of open tabs is reached.', 'warning');
        } catch { Structra.toast('This text is not valid JSON, so it cannot be opened', 'error'); }
        break;
      }
      case 'copy-subtree': {
        const json = JSON.stringify(value, null, 2);
        Structra.sharedHelpers.copyToClipboard(json, 'Subtree copied');
        break;
      }
      case 'gen': {
        if (!lang) break;
        try {
          const code = Structra.typeCodeGenerator.generate(lang, value, 'Data');
          Structra.sharedHelpers.copyToClipboard(code, `Copied as ${lang}`);
        } catch (error) {
          Structra.toast('Could not generate the code: ' + error.message, 'error');
        }
        break;
      }
      case 'expand-here': {
        // If it's an array of objects, switch to table view focused on this path
        if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
          Structra.setState('activeView', 'table');
          Structra.toast(`Showing ${value.length} items in table`);
        } else if (typeof value === 'object' && value !== null) {
          // Single object - show key/value pairs
          Structra.setState('activeView', 'table');
        }
        break;
      }
      case 'mock': {
        try {
          const mocked = Structra.mockDataGenerator.generate(value, 3);
          Structra.sharedHelpers.copyToClipboard(JSON.stringify(mocked, null, 2), 'Mock data copied');
        } catch { Structra.toast('Could not make sample data', 'error'); }
        break;
      }
      case 'bookmark':
        Structra.toast(Structra.bookmarks.toggle(path) ? 'Bookmarked ' + path : 'Bookmark removed');
        break;
      case 'copy-pa':
      case 'copy-fx': {
        const want = action === 'copy-pa' ? 'Power Automate' : 'Power Fx';
        const row = Structra.powerPlatformExpressions.quick(path, value).filter((row) => row.app === want)[0];
        if (row) Structra.sharedHelpers.copyToClipboard(row.code, row.label + ' copied');
        break;
      }
      case 'find-value':
        if (value !== null && value !== undefined && typeof value !== 'object') Structra.events.emit('find:prefill', String(value));
        break;
    }
  }

  _resolve(data, path) {
    if (!data || !path || path === '$') return data;
    return Structra.dataPaths.resolve(data, path);
  }

  _preview(value) {
    if (value === null) return 'null';
    if (typeof value === 'string') return value.length > 30 ? value.slice(0, 27) + '…' : value;
    if (Array.isArray(value)) return `[${value.length}]`;
    if (typeof value === 'object') return `{${Object.keys(value).length} keys}`;
    return String(value);
  }

  connectedCallback() {
    super.connectedCallback();
  }
}

customElements.define('structra-tree', StructraTree);
