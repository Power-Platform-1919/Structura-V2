/* ============================================================
   STRUCTRA V2 — Rail Component
   <structra-rail> — left icon sidebar
   ============================================================ */

class StructraRail extends StructraElement {
  static get observedAttributes() { return ['active']; }

  render() {
    this.innerHTML = `
      <button class="rail-btn active" data-rail="explorer" title="Explorer">
        ${Structra.icons.svg('file')}
      </button>
      <button class="rail-btn" data-rail="query" title="Query & Filter">
        ${Structra.icons.svg('search')}
      </button>
      <button class="rail-btn" data-rail="power" title="Power Platform">
        ${Structra.icons.svg('zap')}
      </button>
      <button class="rail-btn" data-rail="stats" title="Stats">
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

      // Toggle active state
      this.$$('.rail-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      this.props.active = action;

      // Emit rail action
      Structra.events.emit('rail:action', action);

      // Handle specific actions
      if (action === 'query') {
        const open = !Structra.state.queryPanelOpen;
        Structra.set('queryPanelOpen', open);
      } else if (action === 'stats') {
        Structra.set('activeView', 'stats');
      } else if (action === 'settings') {
        Structra.toast('Settings');
      }
    });
  }
}

customElements.define('structra-rail', StructraRail);
