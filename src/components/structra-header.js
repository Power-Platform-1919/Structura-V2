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
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5"/><line x1="12" y1="22" x2="12" y2="15.5"/><line x1="22" y1="8.5" x2="12" y2="15.5"/><line x1="2" y1="8.5" x2="12" y2="15.5"/></svg>
        Structra
      </div>
      <span class="sep"></span>

      <button class="toolbar-btn" data-action="back" title="Back (Alt+Left)" disabled>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
      </button>
      <button class="toolbar-btn" data-action="forward" title="Forward (Alt+Right)" disabled>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
      </button>

      <div class="search-bar">
        <span class="sb-label">Path</span>
        <input type="text" id="pathInput" placeholder="Click an element or type a path (e.g. $.users[0].name)" autocomplete="off">
      </div>

      <button class="toolbar-btn" data-action="copy-path" title="Copy path">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
      </button>
      <button class="toolbar-btn" data-action="bookmark" title="Bookmark path">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
      </button>
      <span class="sep"></span>

      <div class="header-right">
        <button class="toolbar-btn" data-action="toggle-theme" title="Toggle theme">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
        </button>
        <button class="toolbar-btn" data-action="command-palette" title="Commands (Ctrl+K)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z"/></svg>
          <kbd>⌘K</kbd>
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
      else if (action === 'toggle-theme') Structra.toggleTheme();
      else if (action === 'command-palette') Structra.events.emit('command-palette:toggle');
    });

    this.$('#pathInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        Structra.set('currentPath', e.target.value);
      }
    });

    this._syncButtons();
  }

  _toggleBookmark() {
    const path = Structra.state.currentPath;
    if (!path || path === '$') { Structra.toast('Select a path to bookmark'); return; }
    Structra.toast(Structra.bookmarks.toggle(path) ? 'Bookmarked ' + path : 'Bookmark removed');
  }

  _copyPath() {
    const path = this.$('#pathInput').value;
    if (path) {
      navigator.clipboard.writeText(path).then(() => Structra.toast('Path copied'));
    }
  }
}

customElements.define('structra-header', StructraHeader);
