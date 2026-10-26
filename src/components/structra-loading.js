/* ============================================================
   STRUCTRA V2 - Loading Overlay Component
   <structra-loading> - full-screen loading spinner with card UI
   Uses g-loading styles (backdrop-filter, card-style inner container).

   Wiring (generated from the code below; update it when you add or remove an event):
     Listens to: loading:show, loading:hide
   ============================================================ */

class StructraLoading extends StructraComponent {
  static get observedAttributes() { return ['active', 'message']; }

  init() {
    this.on('loading:show', (payload) => this.show(payload));
    this.on('loading:hide', () => this.hide());
  }

  render() {
    this.innerHTML = `
      <div class="g-loading" id="loadingOverlay">
        <div class="g-loading-inner">
          <div class="g-loading-spinner"></div>
          <span class="g-loading-msg" id="loadingMsg">Loading…</span>
        </div>
      </div>`;
  }

  show(message) {
    Structra.log.info('Loading', 'show: ' + (message || 'Loading…'));
    const overlay = this.queryOne('#loadingOverlay');
    const msgElement = this.queryOne('#loadingMsg');
    if (msgElement) msgElement.textContent = message || 'Loading…';
    if (overlay) overlay.classList.add('show');
  }

  hide() {
    Structra.log.info('Loading', 'hide');
    const overlay = this.queryOne('#loadingOverlay');
    if (overlay) overlay.classList.remove('show');
  }

  update(name) {
    if (name === 'active') {
      const isActive = this.props.active !== null && this.props.active !== 'false';
      isActive ? this.show(this.props.message) : this.hide();
    }
    if (name === 'message') {
      const msgElement = this.queryOne('#loadingMsg');
      if (msgElement) msgElement.textContent = this.props.message || 'Loading…';
    }
  }
}

customElements.define('structra-loading', StructraLoading);
