/* ============================================================
   STRUCTRA V2 - Drawer Component
   <structra-drawer> - bottom drawer with tabs (Stats, Expressions, Schema Gen)

   Wiring (generated from the code below; update it when you add or remove an event):
     Listens to: drawer:show, state:drawerState, state:activeView, engine:ingested,
          state:jsonData
     Emits: drawer:tab-switched
     Sets state: drawerState
   ============================================================ */

class StructraDrawer extends StructraComponent {
  static get observedAttributes() { return ['state']; }

  init() {
    this._stateIdx = 0; // 0=collapsed, 1=medium, 2=expanded
    this.on('drawer:show', (id) => this._switchTab(id));
    this.on('state:drawerState', (d) => {
      Structra.log.debug('Drawer', 'drawerState → ' + d.value);
      this._stateIdx = Structra.constants.DRAWER_STATES.indexOf(d.value);
      this._applyState();
    });
    // The Overview already shows what the Analyze tab shows, so the drawer stays folded there and opens in the other views
    const analyzeOpen = () => (this.queryOne('.drawer-tabs .tab.active') || {}).dataset?.tab === 'analyze';
    this.on('state:activeView', (d) => {
      if (!Structra.state.jsonData) return;
      if (d.value === 'overview' && analyzeOpen() && this._stateIdx !== 0) {
        this._autoFolded = true;
        this._stateIdx = 0;
        Structra.setState('drawerState', 'collapsed');
        this._applyState();
      } else if (d.value !== 'overview' && this._autoFolded) {
        this._autoFolded = false;
        this._stateIdx = 1;
        Structra.setState('drawerState', 'medium');
        this._applyState();
      }
    });
    // A newly opened document starts on the Analyze tab: the tab you were on belonged to the previous document
    this.on('engine:ingested', () => { if ((this.queryOne('.drawer-tabs .tab.active') || {}).dataset?.tab !== 'analyze') this._switchTab('analyze'); });
    this.on('state:jsonData', (d) => {
      this.hidden = !d.value;
      if (d.value && this._stateIdx === 0 && Structra.state.activeView === 'overview' && analyzeOpen()) {
        this._autoFolded = true;                    // stays folded on the Overview, opens when another view is chosen
      } else if (d.value && this._stateIdx === 0 && window.innerHeight <= 700) {
        // A short laptop screen keeps the panel folded: the Tree and Table get the height, and the tabs open it on demand
        this._autoFolded = false;
      } else if (d.value && this._stateIdx === 0) {
        Structra.log.debug('Drawer', 'Data loaded - expanding to medium');
        this._stateIdx = 1;
        this._applyState();
      } else if (!d.value) {
        Structra.log.debug('Drawer', 'Data cleared - collapsing');
        this._stateIdx = 0;
        this._applyState();
      }
    });
  }

  render() {
    const tabs = Structra.constants.DRAWER_TABS;
    const panelTag = {
      'analyze': 'structra-drawer-stats',
      'expressions': 'structra-expressions',
      'schema-gen': 'structra-schemagen',
    };

    this.innerHTML = `
      <div class="drawer-resize-bar" id="drawerResizeBar"></div>
      <div class="drawer-bar">
        <button class="drawer-toggle" type="button" data-action="cycle" aria-label="Hide the panel" title="Hide the panel" aria-expanded="true">
          ${Structra.icons.svg('chevron-up', { cls: 'drawer-chevron' })}
        </button>
        <div class="tabs drawer-tabs" role="tablist" aria-label="Panels">
          ${tabs.map((t, i) => `<button class="tab ${i === 0 ? 'active' : ''}" type="button" role="tab" aria-selected="${i === 0}" data-tab="${t.id}">${t.label}</button>`).join('')}
        </div>
        <button class="drawer-max" type="button" data-action="maximise" aria-label="Make the panel taller" title="Make the panel taller or smaller">${Structra.icons.svg('maximize-2', { size: 14 })}</button>
      </div>
      <div class="drawer-body">
        ${tabs.map((t, i) => `<div class="drawer-panel ${i === 0 ? 'active' : ''}" data-panel="${t.id}" id="dp-${t.id}">${panelTag[t.id] ? `<${panelTag[t.id]}></${panelTag[t.id]}>` : ''}</div>`).join('')}
      </div>`;

    this.hidden = !Structra.state.jsonData;
    this._applyState();
    this._initResize();

    this.addEventListener('click', (e) => {
      if (e.target.closest('[data-action="maximise"]')) {
        const states = Structra.constants.DRAWER_STATES;
        this.classList.remove('resizing'); this.style.height = '';
        this._stateIdx = this._stateIdx === 2 ? 1 : 2;
        Structra.setState('drawerState', states[this._stateIdx]);
        this._applyState();
        return;
      }
      if (e.target.closest('[data-action="cycle"]')) {
        this._cycle();
        return;
      }
      const navBtn = e.target.closest('[data-tab]');
      if (navBtn) this._switchTab(navBtn.dataset.tab);
    });
  }

  _initResize() {
    const bar = this.queryOne('#drawerResizeBar');
    if (!bar) return;

    let startY, startH;
    const onMove = (e) => {
      const delta = startY - e.clientY;
      const newH = Math.max(36, Math.min(window.innerHeight * 0.6, startH + delta));
      this.style.height = newH + 'px';
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      // The height you chose is kept for the next time the drawer opens, and the next visit
      try { localStorage.setItem('structra.drawerH', String(Math.round(this.offsetHeight))); } catch { /* storage blocked */ }
    };

    bar.addEventListener('mousedown', (e) => {
      e.preventDefault();
      // Switch to custom height mode - remove class-driven height
      this.classList.add('resizing');
      startY = e.clientY;
      startH = this.offsetHeight;
      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    // Double-click resize bar to reset to medium
    bar.addEventListener('dblclick', () => {
      try { localStorage.removeItem('structra.drawerH'); } catch { /* storage blocked */ }
      this.classList.remove('resizing');
      this.style.height = '';
      this._stateIdx = 1;
      this._applyState();
    });
  }

  _cycle() {
    const states = Structra.constants.DRAWER_STATES;
    // Open ⇄ folded away. (A taller drawer is made by dragging the bar above the tabs.)
    this._stateIdx = this._stateIdx === 0 ? 1 : 0;
    Structra.setState('drawerState', states[this._stateIdx]);
    this._applyState();
  }

  _applyState() {
    const states = Structra.constants.DRAWER_STATES;
    const state = states[this._stateIdx] || 'medium';
    // Remove all state classes, add current (matches layout.css: collapsed/medium/expanded)
    this.classList.remove('collapsed', 'medium', 'expanded');
    this.classList.add(state);
    // A height chosen by dragging applies whenever the drawer is open; folded, it is just the tab strip
    let kept = 0;
    try { kept = parseInt(localStorage.getItem('structra.drawerH') || '0', 10); } catch { /* storage blocked */ }
    if (kept >= 120 && state !== 'collapsed') { this.classList.add('resizing'); this.style.height = Math.min(kept, window.innerHeight * 0.6) + 'px'; }
    else { this.classList.remove('resizing'); this.style.height = ''; }
    const toggle = this.queryOne('.drawer-toggle');
    if (toggle) {
      const label = state === 'collapsed' ? 'Show the panel' : 'Hide the panel';
      toggle.setAttribute('aria-label', label);
      toggle.title = label;
      toggle.setAttribute('aria-expanded', String(state !== 'collapsed'));
    }
  }

  _switchTab(id) {
    this.queryAll('.drawer-tabs .tab').forEach(b => { b.classList.toggle('active', b.dataset.tab === id); b.setAttribute('aria-selected', String(b.dataset.tab === id)); });
    // Choosing a tab while the drawer is folded away opens it
    if (this.classList.contains('collapsed')) {
      this._stateIdx = 1;
      Structra.setState('drawerState', Structra.constants.DRAWER_STATES[1]);
      this._applyState();
    }
    this.queryAll('.drawer-panel').forEach(p => p.classList.toggle('active', p.dataset.panel === id));
    Structra.events.emit('drawer:tab-switched', id);
  }

  /** Get a panel element by tab id */
  getPanel(id) {
    return this.queryOne(`[data-panel="${id}"]`);
  }
}

customElements.define('structra-drawer', StructraDrawer);
