/* ============================================================
   STRUCTRA V2 - Header Component
   <structra-header> - brand, path bar, toolbar buttons

   Wiring (generated from the code below; update it when you add or remove an event):
     Listens to: state:currentPath, nav:changed, bookmarks:changed, state:jsonData
     Emits: theme:open, command-palette:toggle, autocomplete:hide, tree:navigate-path,
          tree:node-selected
     Sets state: activeView, currentPath
   ============================================================ */

class StructraHeader extends StructraComponent {
  static get observedAttributes() { return ['path', 'show-bookmark']; }

  init() {
    this.on('state:currentPath', (change) => {
      const input = this.queryOne('#pathInput');
      if (input) input.value = change.value === '$' ? '' : change.value;     // nothing selected: show the hint text
      this._syncButtons();
    });
    this.on('nav:changed', () => this._syncButtons());
    this.on('bookmarks:changed', () => this._syncButtons());
    this.on('state:jsonData', () => this._syncButtons());
  }

  /** Back and forward enabled state, and whether the current path is bookmarked */
  _syncButtons() {
    if (!this._mounted) return;
    const back = this.queryOne('[data-action="back"]');
    const forwardButton = this.queryOne('[data-action="forward"]');
    const mark = this.queryOne('[data-action="bookmark"]');
    if (back) back.disabled = !Structra.pathHistory.canBack();
    if (forwardButton) forwardButton.disabled = !Structra.pathHistory.canForward();
    if (mark) mark.classList.toggle('active', Structra.bookmarks.has(Structra.state.currentPath));
    const count = this.queryOne('#bmCount');
    if (count) { const bookmarkCount = Structra.bookmarks.list().length; count.textContent = bookmarkCount ? String(bookmarkCount) : ''; }
  }

  render() {
    this.innerHTML = `
      <h1 class="sr-only">Structra, a JSON analyzer</h1>
      <div class="brand">
        ${Structra.icons.svg('box')}
        Structra
      </div>
      <span class="sep"></span>

      <button class="toolbar-btn" data-action="back" title="Back (Alt+Left)" disabled>
        ${Structra.icons.svg('arrow-left')}
      </button>
      <button class="toolbar-btn" data-action="forward" title="Forward (Alt+Right)" disabled>
        ${Structra.icons.svg('arrow-right')}
      </button>

      <div class="search-bar">
        <span class="sb-label">Path</span>
        <input type="text" id="pathInput" placeholder="Click an element or type a path (e.g. $.users[0].name)" autocomplete="off">
      </div>

      <button class="toolbar-btn" data-action="copy-path" title="Copy path">
        ${Structra.icons.svg('copy')}
      </button>
      <button class="toolbar-btn" data-action="bookmark" title="Bookmark this path (Ctrl+B)">
        ${Structra.icons.svg('bookmark')}
      </button>
      <button class="toolbar-btn" data-action="bookmarks" title="Show my bookmarks" aria-haspopup="menu">
        ${Structra.icons.svg('list')}<span class="bm-count" id="bmCount"></span>
      </button>
      <span class="sep"></span>

      <div class="header-right">
        <button class="toolbar-btn" data-action="toggle-theme" title="Switch light and dark">
          ${Structra.icons.svg('moon')}
        </button>
        <button class="toolbar-btn" data-action="command-palette" title="Search commands">
          ${Structra.icons.svg('search')}
          <span>Commands</span>
          <kbd>${/Mac|iPhone|iPad/.test(navigator.platform) ? '\u2318 K' : 'Ctrl K'}</kbd>
        </button>
      </div>`;

    this.addEventListener('click', (event) => {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      const action = button.dataset.action;
      if (action === 'copy-path') this._copyPath();
      else if (action === 'back') Structra.pathHistory.back();
      else if (action === 'forward') Structra.pathHistory.forward();
      else if (action === 'bookmark') this._toggleBookmark();
      else if (action === 'bookmarks') this._showBookmarks(button);
      else if (action === 'toggle-theme') Structra.themeEngine.toggle();
      else if (action === 'appearance') Structra.events.emit('theme:open');
      else if (action === 'command-palette') Structra.events.emit('command-palette:toggle');
    });

    this.queryOne('#pathInput').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') this._goToPath(event.target.value);
      else if (event.key === 'Escape') { event.target.blur(); }
    });
    this.queryOne('#pathInput').addEventListener('input', (event) => event.target.classList.remove('invalid'));

    this._syncButtons();
  }

  /** Enter in the path bar: check the path exists, show it in a view that can show it, and move there */
  _goToPath(raw) {
    const input = this.queryOne('#pathInput');
    const text = String(raw || '').trim();
    Structra.events.emit('autocomplete:hide');
    if (!text) return;
    const data = Structra.state.jsonData;
    if (!data) { Structra.toast('Open a file first'); return; }
    const path = Structra.dataPaths.canonical(text);
    let value;
    try { value = path === '$' ? data : Structra.dataPaths.resolve(data, path); } catch { value = undefined; }
    if (value === undefined) {
      input.classList.add('invalid');
      Structra.toast(`Nothing at ${text}. Paths are case sensitive: check the spelling, or start typing to see suggestions.`);
      return;
    }
    input.classList.remove('invalid');
    // Overview, Editor and the others have no place to show a path: go to the Tree
    if (!['tree', 'table', 'graph', 'schema'].includes(Structra.state.activeView)) Structra.setState('activeView', 'tree');
    Structra.setState('currentPath', path);
    input.value = path;
    setTimeout(() => {
      Structra.events.emit('tree:navigate-path', path);
      Structra.events.emit('tree:node-selected', path);
    }, 80);
  }

  _toggleBookmark() {
    const path = Structra.state.currentPath;
    if (!path || path === '$') { Structra.toast('Select a path to bookmark'); return; }
    Structra.toast(Structra.bookmarks.toggle(path) ? `Bookmarked ${path}. The list button next to it shows all your bookmarks.` : 'Bookmark removed');
  }

  /** A menu of the bookmarks for this file: click one to go there, the x removes it */
  _showBookmarks(anchor) {
    const old = document.querySelector('.bm-menu');
    if (old) { old.remove(); return; }
    const items = Structra.bookmarks.list();
    const escapeHtml = Structra.sharedHelpers.escapeHtml;
    const menu = document.createElement('div');
    menu.className = 'bm-menu';
    menu.setAttribute('role', 'menu');
    menu.innerHTML = items.length
      ? items.map((item) => `<div class="bm-item" role="menuitem" tabindex="0" data-path="${escapeHtml(item.path)}"><span class="bm-path">${escapeHtml(item.path)}</span><button class="bm-remove" type="button" data-remove="${escapeHtml(item.path)}" aria-label="Remove bookmark ${escapeHtml(item.path)}">${Structra.icons.svg('x', { size: 12 })}</button></div>`).join('')
      : '<div class="bm-empty">No bookmarks in this file yet. Select a line and press Ctrl+B.</div>';
    const rect = anchor.getBoundingClientRect();
    menu.style.top = (rect.bottom + 4) + 'px';
    menu.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - 300)) + 'px';
    document.body.appendChild(menu);
    const close = () => { menu.remove(); document.removeEventListener('mousedown', outside, true); document.removeEventListener('keydown', onKey, true); };
    const outside = (event) => { if (!menu.contains(event.target) && !anchor.contains(event.target)) close(); };
    const onKey = (event) => { if (event.key === 'Escape') close(); };
    document.addEventListener('mousedown', outside, true);
    document.addEventListener('keydown', onKey, true);
    menu.addEventListener('click', (event) => {
      const removeButton = event.target.closest('[data-remove]');
      if (removeButton) { Structra.bookmarks.remove(removeButton.dataset.remove); close(); return; }
      const item = event.target.closest('.bm-item');
      if (!item) return;
      close();
      this.queryOne('#pathInput').value = item.dataset.path;
      this._goToPath(item.dataset.path);
    });
    menu.addEventListener('keydown', (event) => { if (event.key === 'Enter' && event.target.classList.contains('bm-item')) event.target.click(); });
  }

  _copyPath() {
    const path = this.queryOne('#pathInput').value;
    if (path) {
      Structra.sharedHelpers.copyToClipboard(path, 'Path copied');
    }
  }
}

customElements.define('structra-header', StructraHeader);
