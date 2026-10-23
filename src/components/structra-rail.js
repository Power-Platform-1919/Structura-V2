/* ============================================================
   STRUCTRA V2 — Rail Component
   <structra-rail> — left icon sidebar
   ============================================================ */

class StructraRail extends StructraElement {
  static get observedAttributes() { return ['active']; }

  render() {
    this.innerHTML = `
      <button class="rail-btn" data-rail="explorer" title="Open a file, paste data or pick a recent one" aria-label="Open">
        ${Structra.icons.svg('file')}<span class="rail-label">Open</span>
      </button>
      <button class="rail-btn" data-rail="query" title="Search the data with a path, pattern or JavaScript" aria-label="Query">
        ${Structra.icons.svg('search')}<span class="rail-label">Query</span>
      </button>
      <button class="rail-btn" data-rail="transform" title="Reshape the data: pick fields, sort, group, total" aria-label="Transform">
        ${Structra.icons.svg('package')}<span class="rail-label">Transform</span>
      </button>
      <button class="rail-btn" data-rail="power" title="Power Automate and Power Fx expressions for the selected value" aria-label="Power Platform">
        ${Structra.icons.svg('zap')}<span class="rail-label">Power</span>
      </button>
      <button class="rail-btn" data-rail="overview" title="A summary of what is in the file and what to look at first" aria-label="Overview">
        ${Structra.icons.svg('chart-column')}<span class="rail-label">Overview</span>
      </button>
      <div style="flex:1"></div>
      <button class="rail-btn" data-rail="settings" title="Settings: appearance, shortcuts and saved data" aria-label="Settings">
        ${Structra.icons.svg('settings')}<span class="rail-label">Settings</span>
      </button>`;

    this.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-rail]');
      if (!btn) return;
      const action = btn.dataset.rail;
      Structra.events.emit('rail:action', action);

      switch (action) {
        case 'explorer': {    // the Open screen: reuse a tab that is still empty instead of piling up new ones
          const empty = Structra.tabs.list.find((t) => !t.data && !t.hash);
          if (empty && empty.id !== Structra.tabs.activeId) {
            Structra.tabs.activeId = empty.id;
            Structra.events.emit('tabs:changed');
            Structra.events.emit('tabs:switched', empty);
          } else if (!empty) {
            Structra.events.emit('tabs:add');
          }
          setTimeout(() => Structra.events.emit('input:show-tab', 'file'), 50);
          break;
        }
        case 'query':
          Structra.set('queryPanelOpen', !Structra.state.queryPanelOpen);
          break;
        case 'power': {        // the Power Platform tools: expressions for the selected value; a second click folds them away
          const showing = Structra.state.drawerState !== 'collapsed' && !!document.querySelector('structra-drawer .drawer-tabs .tab.active[data-tab="expressions"]');
          if (showing) Structra.set('drawerState', 'collapsed');
          else Structra.events.emit('drawer:show', 'expressions');
          break;
        }
        case 'overview':
          Structra.set('activeView', 'overview');
          break;
        case 'transform':
          Structra.set('queryPanelOpen', true);
          Structra.events.emit('query:show-tab', 'transform');
          break;
        case 'settings':
          Structra.events.emit('settings:open');
          break;
      }
    });

    // The highlight shows what is open, not what was clicked last
    // Each button is lit by one thing only: the panel or view it opens
    let qTab = 'query';
    let drawerTab = 'analyze';
    const sync = () => {
      const panel = !!Structra.state.queryPanelOpen;
      const drawerOpen = Structra.state.drawerState !== 'collapsed';
      const lit = {
        explorer: !Structra.state.jsonData,
        query: panel && qTab === 'query',
        transform: panel && qTab === 'transform',
        power: drawerOpen && drawerTab === 'expressions' && !!Structra.state.jsonData,
        overview: Structra.state.activeView === 'overview' && !!Structra.state.jsonData,
      };
      this.$$('.rail-btn').forEach((b) => b.classList.toggle('active', !!lit[b.dataset.rail]));
    };
    this.on('state:activeView', sync);
    this.on('state:queryPanelOpen', sync);
    this.on('state:jsonData', sync);
    this.on('state:drawerState', sync);
    this.on('tabs:switched', sync);
    this.on('query:tab-switched', (t) => { qTab = t; sync(); });
    this.on('drawer:tab-switched', (t) => { drawerTab = t; sync(); });
    sync();
  }
}

customElements.define('structra-rail', StructraRail);
