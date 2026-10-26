/* ============================================================
   STRUCTRA V2 - Canvas Header Component
   <structra-canvas-header> - view tabs + tree toolbar buttons

   Wiring (generated from the code below; update it when you add or remove an event):
     Listens to: tree:wrap-state, toolbar:reset, state:activeView, state:findBarOpen,
          state:filterBarOpen
     Emits: tree:expand-all, tree:collapse-all, tree:collapse-depth, tree:toggle-wrap
     Sets state: activeView, findBarOpen, filterBarOpen
   ============================================================ */

class StructraCanvasHeader extends StructraComponent {
  static get observedAttributes() { return ['active-view']; }

  /** Buttons a person may hide. View tabs and Find always stay. */
  static HIDEABLE = ['expand-all', 'collapse-all', 'depth-1', 'depth-2', 'depth-3', 'filter', 'wrap', 'copy-json'];
  static HIDDEN_KEY = 'structra.toolbarHidden';

  init() {
    this.on('tree:wrap-state', (on) => { const b = this.queryOne('[data-action="wrap"]'); if (b) { b.classList.toggle('active', !!on); b.setAttribute('aria-pressed', String(!!on)); } });
    this.on('toolbar:reset', () => { this._setHidden([]); Structra.toast('All toolbar buttons are visible'); });
    this.on('state:activeView', (d) => {
      this.props.activeView = d.value;
      this._updateTabs();
    });
    this.on('state:findBarOpen', (d) => this.queryOne('[data-action="find"]')?.classList.toggle('active', !!d.value));
    this.on('state:filterBarOpen', (d) => this.queryOne('[data-action="filter"]')?.classList.toggle('active', !!d.value));
  }

  render() {
    const views = Structra.constants.VIEWS;
    const active = this.props.activeView || Structra.state.activeView || 'tree';

    const viewTabs = views.map(v =>
      `<button class="view-tab ${v === active ? 'active' : ''}" data-view="${v}">${v.charAt(0).toUpperCase() + v.slice(1)}</button>`
    ).join('');

    this.innerHTML = `
      <div class="view-tabs">${viewTabs}</div>
      <span class="sep tree-only"></span>
      <div class="toolbar-group tree-only">
        <button class="toolbar-btn" data-action="expand-all" title="Expand all levels" aria-label="Expand all levels">
          ${Structra.icons.svg('maximize-2')}
          <span class="tb-label">Expand</span>
        </button>
        <button class="toolbar-btn" data-action="collapse-all" title="Collapse all levels" aria-label="Collapse all levels">
          ${Structra.icons.svg('minimize-2')}
          <span class="tb-label">Collapse</span>
        </button>
        <span class="tb-group-label" title="Show only this many levels">Levels</span>
        <button class="toolbar-btn" data-action="depth-1" title="Show only the first level" aria-label="Show only the first level">1</button>
        <button class="toolbar-btn" data-action="depth-2" title="Show two levels" aria-label="Show two levels">2</button>
        <button class="toolbar-btn" data-action="depth-3" title="Show three levels" aria-label="Show three levels">3</button>
      </div>
      <span class="sep"></span>
      <div class="canvas-right">
        <button class="toolbar-btn" data-action="more" title="Hidden toolbar buttons" aria-haspopup="menu" hidden>
          ${Structra.icons.svg('ellipsis')}
        </button>
        <button class="toolbar-btn" data-action="find" title="Find text in the document (Ctrl+F)" aria-label="Find">
          ${Structra.icons.svg('search')}
          <span class="tb-label">Find</span>
        </button>
        <button class="toolbar-btn" data-action="filter" title="Filter rows by a condition (Ctrl+Shift+F)" aria-label="Filter">
          ${Structra.icons.svg('filter')}
          <span class="tb-label">Filter</span>
        </button>
        <button class="toolbar-btn tree-only" data-action="wrap" title="Wrap long values onto several lines" aria-label="Wrap long values">
          ${Structra.icons.svg('wrap-text')}
          <span class="tb-label">Wrap</span>
        </button>
        <button class="toolbar-btn" data-action="copy-json" title="Copy the whole document as JSON" aria-label="Copy the document as JSON">
          ${Structra.icons.svg('copy')}
          <span class="tb-label">Copy JSON</span>
        </button>
      </div>`;

    this._applyHidden();
    this.addEventListener('contextmenu', (e) => this._onContextMenu(e));

    this.addEventListener('click', (e) => {
      const viewBtn = e.target.closest('[data-view]');
      if (viewBtn) {
        Structra.setState('activeView', viewBtn.dataset.view);
        return;
      }

      const actionBtn = e.target.closest('[data-action]');
      if (!actionBtn) return;
      const action = actionBtn.dataset.action;

      switch (action) {
        case 'expand-all':   Structra.log.info('CanvasHeader', 'Action: expand-all'); Structra.events.emit('tree:expand-all'); break;
        case 'collapse-all': Structra.log.info('CanvasHeader', 'Action: collapse-all'); Structra.events.emit('tree:collapse-all'); break;
        case 'depth-1':      Structra.log.info('CanvasHeader', 'Action: depth-1'); Structra.events.emit('tree:collapse-depth', 1); break;
        case 'depth-2':      Structra.log.info('CanvasHeader', 'Action: depth-2'); Structra.events.emit('tree:collapse-depth', 2); break;
        case 'depth-3':      Structra.log.info('CanvasHeader', 'Action: depth-3'); Structra.events.emit('tree:collapse-depth', 3); break;
        case 'wrap':         Structra.log.info('CanvasHeader', 'Action: wrap'); Structra.events.emit('tree:toggle-wrap'); break;
        case 'copy-json':    Structra.log.info('CanvasHeader', 'Action: copy-json'); this._copyJson(); break;
        case 'more':         this._showMoreMenu(actionBtn); break;
        case 'find':         Structra.setState('findBarOpen', true); break;
        case 'filter':       Structra.setState('filterBarOpen', !Structra.state.filterBarOpen); break;
      }
    });
  }

  /* ---- Customize: right-click a button to hide it; hidden ones live under the "..." button ---- */

  _getHidden() {
    try { return JSON.parse(localStorage.getItem(StructraCanvasHeader.HIDDEN_KEY) || '[]'); } catch { return []; }
  }

  _setHidden(list) {
    try { localStorage.setItem(StructraCanvasHeader.HIDDEN_KEY, JSON.stringify(list)); } catch { /* not saved in a private window */ }
    this._applyHidden();
  }

  _applyHidden() {
    const hidden = this._getHidden();
    StructraCanvasHeader.HIDEABLE.forEach((id) => {
      const btn = this.queryOne(`[data-action="${id}"]`);
      if (btn) btn.hidden = hidden.includes(id);
    });
    const more = this.queryOne('[data-action="more"]');
    if (more) more.hidden = !hidden.length;
    // A group with every button hidden should not leave a stray divider
    this.queryAll('.toolbar-group').forEach((g) => { g.hidden = !g.querySelector('.toolbar-btn:not([hidden])'); });
  }

  _label(btn) { return (btn.getAttribute('title') || btn.textContent).replace(/\s*\(.*\)$/, '').trim(); }

  _openMenu(x, y, items) {
    this._closeMenu();
    const menu = document.createElement('div');
    menu.className = 'menu';
    menu.setAttribute('role', 'menu');
    menu.innerHTML = items.map((it) => it === '-'
      ? '<div class="menu-sep"></div>'
      : `<button class="menu-item" type="button" role="menuitem" data-i="${items.indexOf(it)}">${Structra.sharedHelpers.escapeHtml(it.label)}</button>`).join('');
    document.body.appendChild(menu);
    const r = menu.getBoundingClientRect();
    menu.style.left = Math.max(8, Math.min(x, window.innerWidth - r.width - 8)) + 'px';
    menu.style.top = Math.max(8, Math.min(y, window.innerHeight - r.height - 8)) + 'px';
    menu.addEventListener('click', (e) => {
      const item = e.target.closest('[data-i]');
      if (item) items[Number(item.dataset.i)].run();
      this._closeMenu();
    });
    this._menu = menu;
    setTimeout(() => {
      this._off = (e) => { if (e.type === 'keydown' && e.key !== 'Escape') return; if (e.type === 'click' && menu.contains(e.target)) return; this._closeMenu(); };
      document.addEventListener('click', this._off); document.addEventListener('keydown', this._off); window.addEventListener('blur', this._off);
    }, 0);
  }

  _closeMenu() {
    if (this._menu) { this._menu.remove(); this._menu = null; }
    if (this._off) { document.removeEventListener('click', this._off); document.removeEventListener('keydown', this._off); window.removeEventListener('blur', this._off); this._off = null; }
  }

  _onContextMenu(e) {
    const btn = e.target.closest('.toolbar-btn[data-action]');
    if (!btn || !StructraCanvasHeader.HIDEABLE.includes(btn.dataset.action)) return;
    e.preventDefault();
    const id = btn.dataset.action;
    const items = [{ label: `Hide "${this._label(btn)}" from the toolbar`, run: () => this._setHidden([...this._getHidden(), id]) }];
    if (this._getHidden().length) items.push('-', { label: 'Show all buttons', run: () => this._setHidden([]) });
    this._openMenu(e.clientX, e.clientY, items);
  }

  _showMoreMenu(anchor) {
    const hidden = this._getHidden();
    const r = anchor.getBoundingClientRect();
    const items = hidden.map((id) => {
      const btn = this.queryOne(`[data-action="${id}"]`);
      return btn && { label: this._label(btn), run: () => btn.click() };
    }).filter(Boolean);
    items.push('-', { label: 'Show all buttons', run: () => this._setHidden([]) });
    this._openMenu(r.left, r.bottom + 4, items);
  }

  _updateTabs() {
    const active = this.props.activeView || 'tree';
    this.queryAll('.view-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === active);
    });
    // Expand, Collapse, levels and Wrap act on the Tree only; elsewhere they would be buttons that do nothing
    this.classList.toggle('not-tree', active !== 'tree');
    // When the tab row is cut short by a narrow window, keep the open view's tab in sight
    this.queryOne('.view-tab.active')?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }

  _copyJson() {
    const data = Structra.state.jsonData;
    if (!data) { Structra.toast('Open a file first'); return; }
    const text = JSON.stringify(data, null, 2);
    Structra.sharedHelpers.copyToClipboard(text, 'JSON copied');
  }
}

customElements.define('structra-canvas-header', StructraCanvasHeader);
