/* ============================================================
   STRUCTRA V2 — Drawer Component
   <structra-drawer> — bottom drawer with tabs (Stats, Expressions, Schema Gen)
   ============================================================ */

class StructraDrawer extends StructraElement {
  static get observedAttributes() { return ['state']; }

  init() {
    this._stateIdx = 0; // 0=collapsed, 1=medium, 2=expanded
    this.on('state:drawerState', (d) => {
      Structra.log.debug('Drawer', 'drawerState → ' + d.value);
      this._stateIdx = Structra.constants.DRAWER_STATES.indexOf(d.value);
      this._applyState();
    });
    this.on('state:jsonData', (d) => {
      if (d.value && this._stateIdx === 0) {
        Structra.log.debug('Drawer', 'Data loaded — expanding to medium');
        this._stateIdx = 1;
        this._applyState();
      } else if (!d.value) {
        Structra.log.debug('Drawer', 'Data cleared — collapsing');
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
        <button class="drawer-toggle" type="button" data-action="cycle" aria-label="Expand or collapse the panel" title="Expand or collapse">
          <svg class="drawer-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg>
        </button>
        <div class="tabs drawer-tabs" role="tablist">
          ${tabs.map((t, i) => `<button class="tab ${i === 0 ? 'active' : ''}" type="button" role="tab" data-tab="${t.id}">${t.label}</button>`).join('')}
        </div>
      </div>
      <div class="drawer-body">
        ${tabs.map((t, i) => `<div class="drawer-panel ${i === 0 ? 'active' : ''}" data-panel="${t.id}" id="dp-${t.id}">${panelTag[t.id] ? `<${panelTag[t.id]}></${panelTag[t.id]}>` : ''}</div>`).join('')}
      </div>`;

    this._applyState();
    this._initResize();

    this.addEventListener('click', (e) => {
      if (e.target.closest('[data-action="cycle"]')) {
        this._cycle();
        return;
      }
      const navBtn = e.target.closest('[data-tab]');
      if (navBtn) this._switchTab(navBtn.dataset.tab);
    });
  }

  _initResize() {
    const bar = this.$('#drawerResizeBar');
    if (!bar) return;

    let startY, startH;
    const onMove = (e) => {
      const delta = startY - e.clientY;
      const newH = Math.max(36, Math.min(window.innerHeight * 0.8, startH + delta));
      this.style.height = newH + 'px';
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    bar.addEventListener('mousedown', (e) => {
      e.preventDefault();
      // Switch to custom height mode — remove class-driven height
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
      this.classList.remove('resizing');
      this.style.height = '';
      this._stateIdx = 1;
      this._applyState();
    });
  }

  _cycle() {
    const states = Structra.constants.DRAWER_STATES;
    this._stateIdx = (this._stateIdx + 1) % states.length;
    Structra.set('drawerState', states[this._stateIdx]);
    // Exit custom resize mode when cycling
    this.classList.remove('resizing');
    this.style.height = '';
    this._applyState();
  }

  _applyState() {
    const states = Structra.constants.DRAWER_STATES;
    const state = states[this._stateIdx] || 'medium';
    // Remove all state classes, add current (matches layout.css: collapsed/medium/expanded)
    this.classList.remove('collapsed', 'medium', 'expanded');
    this.classList.add(state);
  }

  _switchTab(id) {
    this.$$('.drawer-tabs .tab').forEach(b => b.classList.toggle('active', b.dataset.tab === id));
    // Choosing a tab while the drawer is folded away opens it
    if (this.classList.contains('collapsed')) {
      this._stateIdx = 1;
      Structra.set('drawerState', Structra.constants.DRAWER_STATES[1]);
      this._applyState();
    }
    this.$$('.drawer-panel').forEach(p => p.classList.toggle('active', p.dataset.panel === id));
    Structra.events.emit('drawer:tab-switched', id);
  }

  /** Get a panel element by tab id */
  getPanel(id) {
    return this.$(`[data-panel="${id}"]`);
  }
}

customElements.define('structra-drawer', StructraDrawer);
