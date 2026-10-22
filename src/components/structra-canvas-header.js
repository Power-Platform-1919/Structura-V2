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
          ${Structra.icons.svg('maximize-2')}
          +All
        </button>
        <button class="toolbar-btn" data-action="collapse-all" title="Collapse All">
          ${Structra.icons.svg('minimize-2')}
          −All
        </button>
        <button class="toolbar-btn" data-action="depth-1">D1</button>
        <button class="toolbar-btn" data-action="depth-2">D2</button>
      </div>
      <span class="sep"></span>
      <div class="canvas-right">
        <button class="toolbar-btn" data-action="find" title="Find (Ctrl+F)">
          ${Structra.icons.svg('search')}
          Find
        </button>
        <button class="toolbar-btn" data-action="filter" title="Filter (Ctrl+Shift+F)">
          ${Structra.icons.svg('filter')}
          Filter
        </button>
        <button class="toolbar-btn" data-action="wrap">Wrap</button>
        <button class="toolbar-btn" data-action="edit">
          ${Structra.icons.svg('pencil')}
          Edit
        </button>
        <button class="toolbar-btn" data-action="copy-json">
          ${Structra.icons.svg('copy')}
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
    Structra.util.copy(text, 'JSON copied');
  }
}

customElements.define('structra-canvas-header', StructraCanvasHeader);
