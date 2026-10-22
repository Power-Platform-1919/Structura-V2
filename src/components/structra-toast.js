/* ============================================================
   STRUCTRA V2 — Toast Component
   <structra-toast> — floating notification
   ============================================================ */

class StructraToast extends StructraElement {
  static get observedAttributes() { return ['duration']; }

  init() {
    this.on('toast', (msg) => this.show(msg));
  }

  render() {
    this.innerHTML = `
      <div class="toast" id="toast">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
        <span id="toastMsg"></span>
      </div>`;
  }

  show(msg) {
    const el = this.$('.toast');
    const span = this.$('#toastMsg');
    span.textContent = msg;
    el.classList.add('show');
    const duration = parseInt(this.props.duration, 10) || 2200;
    clearTimeout(this._timer);
    this._timer = setTimeout(() => el.classList.remove('show'), duration);
  }
}

customElements.define('structra-toast', StructraToast);
