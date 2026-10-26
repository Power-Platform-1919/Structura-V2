/* ============================================================
   STRUCTRA V2 - Loading Overlay Component
   <structra-loading> - full-screen loading spinner with card UI
   Uses g-loading styles (backdrop-filter, card-style inner container).
   ============================================================ */

class StructraLoading extends StructraElement {
  static get observedAttributes() { return ['active', 'message']; }

  init() {
    this.on('loading:show', (msg) => this.show(msg));
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

  show(msg) {
    Structra.log.info('Loading', 'show: ' + (msg || 'Loading…'));
    const overlay = this.$('#loadingOverlay');
    const msgEl = this.$('#loadingMsg');
    if (msgEl) msgEl.textContent = msg || 'Loading…';
    if (overlay) overlay.classList.add('show');
  }

  hide() {
    Structra.log.info('Loading', 'hide');
    const overlay = this.$('#loadingOverlay');
    if (overlay) overlay.classList.remove('show');
  }

  update(name) {
    if (name === 'active') {
      const isActive = this.props.active !== null && this.props.active !== 'false';
      isActive ? this.show(this.props.message) : this.hide();
    }
    if (name === 'message') {
      const msgEl = this.$('#loadingMsg');
      if (msgEl) msgEl.textContent = this.props.message || 'Loading…';
    }
  }
}

customElements.define('structra-loading', StructraLoading);
