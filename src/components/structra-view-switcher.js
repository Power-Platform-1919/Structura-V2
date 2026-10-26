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
    this.on('state:activeView', (d) => this._switch(d.value));
  }

  render() {
    const views = Structra.constants.VIEWS;
    this.innerHTML = views.map(v =>
      `<div class="view-panel ${v === 'tree' ? 'active' : ''}" data-view="${v}" id="view-${v}"></div>`
    ).join('');
  }

  _switch(view) {
    Structra.log.info('ViewSwitcher', 'Switching to: ' + view);
    this.queryAll('.view-panel').forEach(el => {
      el.classList.toggle('active', el.dataset.view === view);
    });
    Structra.events.emit('view:switched', view);
  }

  /** Get the active view panel element */
  getPanel(view) {
    return this.queryOne(`[data-view="${view}"]`);
  }
}

customElements.define('structra-view-switcher', StructraViewSwitcher);
