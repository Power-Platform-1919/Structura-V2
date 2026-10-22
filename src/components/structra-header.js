/* ============================================================
   STRUCTRA V2 — Header Component
   <structra-header> — brand, path bar, toolbar buttons
   ============================================================ */

class StructraHeader extends StructraElement {
  static get observedAttributes() { return ['path', 'show-bookmark']; }

  init() {
    this.on('state:currentPath', (d) => {
      const input = this.$('#pathInput');
      if (input) input.value = d.value;
      this._syncButtons();
    });
    this.on('nav:changed', () => this._syncButtons());
    this.on('bookmarks:changed', () => this._syncButtons());
    this.on('state:jsonData', () => this._syncButtons());
  }

  /** Back and forward enabled state, and whether the current path is bookmarked */
  _syncButtons() {
    if (!this._mounted) return;
    const back = this.$('[data-action="back"]');
    const fwd = this.$('[data-action="forward"]');
    const mark = this.$('[data-action="bookmark"]');
    if (back) back.disabled = !Structra.nav.canBack();
    if (fwd) fwd.disabled = !Structra.nav.canForward();
    if (mark) mark.classList.toggle('active', Structra.bookmarks.has(Structra.state.currentPath));
  }

  render() {
    this.innerHTML = `
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
      <button class="toolbar-btn" data-action="bookmark" title="Bookmark path">
        ${Structra.icons.svg('bookmark')}
      </button>
      <span class="sep"></span>

      <div class="header-right">
        <button class="toolbar-btn" data-action="appearance" title="Appearance and themes">
          ${Structra.icons.svg('palette')}
        </button>
        <button class="toolbar-btn" data-action="toggle-theme" title="Switch light and dark">
          ${Structra.icons.svg('moon')}
        </button>
        <button class="toolbar-btn" data-action="command-palette" title="Search commands">
          ${Structra.icons.svg('search')}
          <span>Commands</span>
          <kbd>${/Mac|iPhone|iPad/.test(navigator.platform) ? '\u2318 K' : 'Ctrl K'}</kbd>
        </button>
      </div>`;

    this.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === 'copy-path') this._copyPath();
      else if (action === 'back') Structra.nav.back();
      else if (action === 'forward') Structra.nav.forward();
      else if (action === 'bookmark') this._toggleBookmark();
      else if (action === 'toggle-theme') Structra.theme.toggle();
      else if (action === 'appearance') Structra.events.emit('theme:open');
      else if (action === 'command-palette') Structra.events.emit('command-palette:toggle');
    });

    this.$('#pathInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._goToPath(e.target.value);
      else if (e.key === 'Escape') { e.target.blur(); }
    });
    this.$('#pathInput').addEventListener('input', (e) => e.target.classList.remove('invalid'));

    this._syncButtons();
  }

  /** Enter in the path bar: check the path exists, show it in a view that can show it, and move there */
  _goToPath(raw) {
    const input = this.$('#pathInput');
    const text = String(raw || '').trim();
    Structra.events.emit('autocomplete:hide');
    if (!text) return;
    const data = Structra.state.jsonData;
    if (!data) { Structra.toast('Open a file first'); return; }
    const path = Structra.paths.canonical(text);
    let value;
    try { value = path === '$' ? data : Structra.paths.resolve(data, path); } catch { value = undefined; }
    if (value === undefined) {
      input.classList.add('invalid');
      Structra.toast(`Nothing at ${text}. Paths are case sensitive: check the spelling, or start typing to see suggestions.`);
      return;
    }
    input.classList.remove('invalid');
    // Overview, Editor and the others have no place to show a path: go to the Tree
    if (!['tree', 'table', 'graph', 'schema'].includes(Structra.state.activeView)) Structra.set('activeView', 'tree');
    Structra.set('currentPath', path);
    input.value = path;
    setTimeout(() => {
      Structra.events.emit('tree:navigate-path', path);
      Structra.events.emit('tree:node-selected', path);
    }, 80);
  }

  _toggleBookmark() {
    const path = Structra.state.currentPath;
    if (!path || path === '$') { Structra.toast('Select a path to bookmark'); return; }
    Structra.toast(Structra.bookmarks.toggle(path) ? 'Bookmarked ' + path : 'Bookmark removed');
  }

  _copyPath() {
    const path = this.$('#pathInput').value;
    if (path) {
      Structra.util.copy(path, 'Path copied');
    }
  }
}

customElements.define('structra-header', StructraHeader);
