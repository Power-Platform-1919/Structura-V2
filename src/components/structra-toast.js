/* ============================================================
   STRUCTRA V2 - Toast Component
   <structra-toast> - floating notification

   Wiring (generated from the code below; update it when you add or remove an event):
     Listens to: toast
   ============================================================ */

class StructraToast extends StructraComponent {
  static get observedAttributes() { return ['duration']; }

  init() {
    this.on('toast', (t) => this.show(t));
    // A message with a button needs time to be clicked: hovering keeps it open
    this.addEventListener('mouseenter', () => clearTimeout(this._timer));
    this.addEventListener('mouseleave', () => this._arm());
  }

  render() {
    this.innerHTML = `
      <div class="toast" id="toast" role="status" aria-live="polite">
        ${Structra.icons.svg('check')}
        <span id="toastMsg"></span>
        <button type="button" class="toast-action" id="toastAction" hidden></button>
      </div>`;
    this.$('#toastAction').addEventListener('click', () => {
      const run = this._action;
      this.$('.toast').classList.remove('show');
      if (run) run();
    });
  }

  show(t) {
    const note = typeof t === 'string' ? { msg: t } : t;
    const el = this.$('.toast');
    this.$('#toastMsg').textContent = note.msg;
    const btn = this.$('#toastAction');
    this._action = note.action ? note.action.run : null;
    btn.hidden = !note.action;
    if (note.action) btn.textContent = note.action.label;
    el.classList.add('show');
    // Long messages (advice, steps) stay on screen long enough to be read
    this._duration = note.duration || parseInt(this.props.duration, 10) || Math.min(8000, Math.max(2200, 1200 + String(note.msg).length * 45 + (note.action ? 2500 : 0)));
    this._arm();
  }

  _arm() {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.$('.toast').classList.remove('show'), this._duration || 2200);
  }
}

customElements.define('structra-toast', StructraToast);
