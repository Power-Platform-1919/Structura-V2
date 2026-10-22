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
            ${Structra.icons.svg('x')}
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

    // Described by action, so the list always follows Structra.constants.SHORTCUTS
    const describe = {
      'command-palette': ['Panels', 'Command palette'],
      'find': ['Panels', 'Find'],
      'find-replace': ['Panels', 'Find and replace'],
      'filter': ['Panels', 'Filter'],
      'focus-path': ['Navigation', 'Focus the path bar'],
      'bookmark': ['Navigation', 'Bookmark the selected path'],
      'nav-back': ['Navigation', 'Back'],
      'nav-forward': ['Navigation', 'Forward'],
      'new-tab': ['Tabs', 'New tab'],
      'close-tab': ['Tabs', 'Close tab'],
      'view-tree': ['Views', 'Tree view'],
      'view-table': ['Views', 'Table view'],
      'view-graph': ['Views', 'Graph view'],
      'view-schema': ['Views', 'Schema view'],
      'view-overview': ['Views', 'Overview'],
      'view-editor': ['Views', 'Editor view'],
      'sort': ['Tools', 'Sort keys A to Z'],
      'export-csv': ['Tools', 'Export as CSV'],
      'mask': ['Tools', 'Mask sensitive data'],
      'compare': ['Tools', 'Compare two documents'],
      'undo': ['General', 'Undo'],
      'redo': ['General', 'Redo'],
      'theme': ['General', 'Toggle theme'],
      'close-overlay': ['General', 'Close overlays'],
    };

    for (const [key, action] of Object.entries(shortcuts)) {
      const [cat, desc] = describe[action] || ['General', action];
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push({ key, desc });
    }

    // Remove empty categories
    for (const key of Object.keys(categories)) {
      if (categories[key].length === 0) delete categories[key];
    }

    return categories;
  }

  _formatKey(key) {
    return key.split('+').map(part => {
      const labels = { ctrl: 'Ctrl', shift: 'Shift', alt: 'Alt', escape: 'Esc', arrowleft: '\u2190', arrowright: '\u2192' };
      return `<span class="sc-key-part">${labels[part] || part.toUpperCase()}</span>`;
    }).join('<span class="sc-key-sep">+</span>');
  }
}

customElements.define('structra-shortcuts', StructraShortcuts);
