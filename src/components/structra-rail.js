/* ============================================================
   STRUCTRA V2 — Rail Component
   <structra-rail> — left icon sidebar
   ============================================================ */

class StructraRail extends StructraElement {
  static get observedAttributes() { return ['active']; }

  render() {
    this.innerHTML = `
      <button class="rail-btn active" data-rail="explorer" title="Open a file or a recent one">
        ${Structra.icons.svg('file')}
      </button>
      <button class="rail-btn" data-rail="query" title="Query & Filter">
        ${Structra.icons.svg('search')}
      </button>
      <button class="rail-btn" data-rail="power" title="Power Platform">
        ${Structra.icons.svg('zap')}
      </button>
      <button class="rail-btn" data-rail="overview" title="Overview">
        ${Structra.icons.svg('chart-column')}
        <span class="badge"></span>
      </button>
      <button class="rail-btn" data-rail="transform" title="Transform">
        ${Structra.icons.svg('package')}
      </button>
      <div style="flex:1"></div>
      <button class="rail-btn" data-rail="settings" title="Settings">
        ${Structra.icons.svg('settings')}
      </button>`;

    this.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-rail]');
      if (!btn) return;
      const action = btn.dataset.rail;
      Structra.events.emit('rail:action', action);

      switch (action) {
        case 'explorer':      // a new tab on the Recent list
          Structra.events.emit('tabs:add');
          setTimeout(() => Structra.events.emit('input:show-tab', 'recent'), 50);
          break;
        case 'query':
          Structra.set('queryPanelOpen', !Structra.state.queryPanelOpen);
          break;
        case 'power':         // the Power Platform tools: expressions for the selected value
          Structra.events.emit('drawer:show', 'expressions');
          break;
        case 'overview':
          Structra.set('activeView', 'overview');
          break;
        case 'transform':
          Structra.set('queryPanelOpen', true);
          Structra.events.emit('query:show-tab', 'transform');
          break;
        case 'settings':
          Structra.events.emit('theme:open');
          break;
      }
    });

    // The highlight shows what is open, not what was clicked last
    const sync = () => {
      this.$$('.rail-btn').forEach((b) => {
        const on = (b.dataset.rail === 'overview' && Structra.state.activeView === 'overview')
          || (b.dataset.rail === 'query' && !!Structra.state.queryPanelOpen);
        b.classList.toggle('active', on);
      });
    };
    this.on('state:activeView', sync);
    this.on('state:queryPanelOpen', sync);
    sync();
  }
}

customElements.define('structra-rail', StructraRail);
