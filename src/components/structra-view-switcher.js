/* ============================================================
   STRUCTRA V2 - View Switcher Component
   <structra-view-switcher> - manages view panels (tree/table/graph/schema/editor/stats)

   Wiring (generated from the code below; update it when you add or remove an event):
     Listens to: state:activeView
     Emits: view:switched
   ============================================================ */

class StructraViewSwitcher extends StructraComponent {
  static get observedAttributes() { return ['active']; }

  init() {
    this.on('state:activeView', (change) => this._switch(change.value));
  }

  render() {
    const views = Structra.constants.VIEWS;
    this.innerHTML = views.map(view =>
      `<div class="view-panel ${view === 'tree' ? 'active' : ''}" data-view="${view}" id="view-${view}"></div>`
    ).join('');
  }

  _switch(view) {
    Structra.log.info('ViewSwitcher', 'Switching to: ' + view);
    this.queryAll('.view-panel').forEach(element => {
      element.classList.toggle('active', element.dataset.view === view);
    });
    Structra.events.emit('view:switched', view);
  }

  /** Get the active view panel element */
  getPanel(view) {
    return this.queryOne(`[data-view="${view}"]`);
  }
}

customElements.define('structra-view-switcher', StructraViewSwitcher);
