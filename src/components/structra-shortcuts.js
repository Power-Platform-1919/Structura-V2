/* ============================================================
   STRUCTRA V2 — Keyboard Shortcuts Overlay
   <structra-shortcuts> — Modal overlay showing all available
   keyboard shortcuts grouped by category.
   ============================================================ */

class StructraShortcuts extends StructraElement {
  init() {
    this.on('shortcuts:open', () => this._open());
    this.on('overlay:close', () => this._close());
  }

  render() {
    this.innerHTML = `<div class="shortcuts-overlay" id="shortcutsOverlay" style="display:none">
      <div class="shortcuts-modal">
        <div class="shortcuts-header">
          <span class="shortcuts-title">Keyboard Shortcuts</span>
          <button class="shortcuts-close" data-action="close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="shortcuts-body" id="shortcutsBody"></div>
      </div>
    </div>`;

    this.addEventListener('click', (e) => {
      const action = e.target.closest('[data-action]');
      if (action && action.dataset.action === 'close') this._close();
      // Close on backdrop click
      if (e.target.id === 'shortcutsOverlay') this._close();
    });

    this.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this._close();
    });
  }

  _open() {
    this.$('#shortcutsOverlay').style.display = '';
    this._renderShortcuts();
    this.$('#shortcutsOverlay').focus();
  }

  _close() {
    this.$('#shortcutsOverlay').style.display = 'none';
  }

  _renderShortcuts() {
    const body = this.$('#shortcutsBody');
    if (!body) return;

    const shortcuts = Structra.constants.SHORTCUTS || {};
    // Group shortcuts by category
    const categories = this._categorize(shortcuts);

    let html = '';
    for (const [cat, items] of Object.entries(categories)) {
      html += `<div class="sc-category">
        <div class="sc-cat-title">${cat}</div>
        <div class="sc-cat-items">`;
      for (const item of items) {
        html += `<div class="sc-item">
          <kbd class="sc-keys">${this._formatKey(item.key)}</kbd>
          <span class="sc-desc">${item.desc}</span>
        </div>`;
      }
      html += '</div></div>';
    }
    body.innerHTML = html;
  }

  _categorize(shortcuts) {
    const categories = {
      'Navigation': [],
      'Views': [],
      'Tools': [],
      'Panels': [],
      'General': []
    };

    const mapping = {
      'ctrl+f': { cat: 'Panels', desc: 'Find' },
      'ctrl+shift+f': { cat: 'Panels', desc: 'Filter panel' },
      'ctrl+shift+p': { cat: 'Tools', desc: 'Mask PII data' },
      'ctrl+p': { cat: 'Panels', desc: 'Command palette' },
      'ctrl+g': { cat: 'Panels', desc: 'Graph view' },
      'ctrl+e': { cat: 'Panels', desc: 'Editor' },
      'ctrl+q': { cat: 'Panels', desc: 'Query panel' },
      'ctrl+1': { cat: 'Views', desc: 'Tree view' },
      'ctrl+2': { cat: 'Views', desc: 'Table view' },
      'ctrl+3': { cat: 'Views', desc: 'Graph view' },
      'ctrl+4': { cat: 'Views', desc: 'Schema view' },
      'ctrl+5': { cat: 'Views', desc: 'Stats view' },
      'ctrl+6': { cat: 'Views', desc: 'Editor view' },
      'ctrl+shift+s': { cat: 'Tools', desc: 'Sort keys' },
      'ctrl+shift+e': { cat: 'Tools', desc: 'Export CSV' },
      'ctrl+d': { cat: 'Tools', desc: 'Compare / diff' },
      'ctrl+z': { cat: 'General', desc: 'Undo' },
      'ctrl+y': { cat: 'General', desc: 'Redo' },
      'alt+t': { cat: 'General', desc: 'Toggle theme' },
      'escape': { cat: 'General', desc: 'Close overlays' },
    };

    for (const [key, action] of Object.entries(shortcuts)) {
      const info = mapping[key] || { cat: 'General', desc: action };
      const cat = info.cat;
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push({ key, desc: info.desc });
    }

    // Remove empty categories
    for (const key of Object.keys(categories)) {
      if (categories[key].length === 0) delete categories[key];
    }

    return categories;
  }

  _formatKey(key) {
    return key.split('+').map(part => {
      const labels = { ctrl: 'Ctrl', shift: 'Shift', alt: 'Alt', escape: 'Esc' };
      return `<span class="sc-key-part">${labels[part] || part.toUpperCase()}</span>`;
    }).join('<span class="sc-key-sep">+</span>');
  }
}

customElements.define('structra-shortcuts', StructraShortcuts);
