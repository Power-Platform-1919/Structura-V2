/* ============================================================
   STRUCTRA V2 — Canvas Header Component
   <structra-canvas-header> — view tabs + tree toolbar buttons
   ============================================================ */

class StructraCanvasHeader extends StructraElement {
  static get observedAttributes() { return ['active-view']; }

  init() {
    this.on('state:activeView', (d) => {
      this.props.activeView = d.value;
      this._updateTabs();
    });
  }

  render() {
    const views = Structra.constants.VIEWS;
    const active = this.props.activeView || Structra.state.activeView || 'tree';

    const viewTabs = views.map(v =>
      `<button class="view-tab ${v === active ? 'active' : ''}" data-view="${v}">${v.charAt(0).toUpperCase() + v.slice(1)}</button>`
    ).join('');

    this.innerHTML = `
      <div class="view-tabs">${viewTabs}</div>
      <span class="sep"></span>
      <div class="toolbar-group">
        <button class="toolbar-btn" data-action="expand-all" title="Expand All">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
          +All
        </button>
        <button class="toolbar-btn" data-action="collapse-all" title="Collapse All">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
          −All
        </button>
        <button class="toolbar-btn" data-action="depth-1">D1</button>
        <button class="toolbar-btn" data-action="depth-2">D2</button>
      </div>
      <span class="sep"></span>
      <div class="canvas-right">
        <button class="toolbar-btn" data-action="find" title="Find (Ctrl+F)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          Find
        </button>
        <button class="toolbar-btn" data-action="filter" title="Filter (Ctrl+Shift+F)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
          Filter
        </button>
        <button class="toolbar-btn" data-action="wrap">Wrap</button>
        <button class="toolbar-btn" data-action="edit">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
          Edit
        </button>
        <button class="toolbar-btn" data-action="copy-json">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          Copy
        </button>
      </div>`;

    this.addEventListener('click', (e) => {
      const viewBtn = e.target.closest('[data-view]');
      if (viewBtn) {
        Structra.set('activeView', viewBtn.dataset.view);
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
        case 'wrap':         Structra.log.info('CanvasHeader', 'Action: wrap'); Structra.events.emit('tree:toggle-wrap'); Structra.toast('Word wrap toggled'); break;
        case 'edit':         Structra.log.info('CanvasHeader', 'Action: edit'); Structra.set('activeView', 'editor'); break;
        case 'copy-json':    Structra.log.info('CanvasHeader', 'Action: copy-json'); this._copyJson(); break;
        case 'find':         Structra.set('findBarOpen', true); break;
        case 'filter':       Structra.set('filterBarOpen', !Structra.state.filterBarOpen); break;
      }
    });
  }

  _updateTabs() {
    const active = this.props.activeView || 'tree';
    this.$$('.view-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === active);
    });
  }

  _copyJson() {
    const data = Structra.state.jsonData;
    if (!data) { Structra.toast('No data to copy'); return; }
    const text = JSON.stringify(data, null, 2);
    navigator.clipboard.writeText(text).then(() => Structra.toast('JSON copied'));
  }
}

customElements.define('structra-canvas-header', StructraCanvasHeader);
