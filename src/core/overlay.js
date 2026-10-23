/* ============================================================
   STRUCTRA V2 — Overlay Base
   StructraOverlay — one implementation of "a dialog on top of the app".
   Dialogs (validate, charts, theme, shortcuts, ...) extend this and only
   describe their content. The base owns:
     - the shell markup (backdrop, box, header, close button, body, footer)
     - open / close, Escape, click on the backdrop
     - focus: moves into the dialog on open, returns to where it was on close
     - keeping Tab inside the dialog
   Styling is in ui.css (.ov, .ov-box, .ov-head ...).

   A dialog class:
     class StructraThing extends StructraOverlay {
       init() { super.init(); this.on('thing:open', () => this.open()); }
       render() {
         this.mount({ title: 'Thing', size: 'md', body: '<p>...</p>', foot: '<button ...>' });
         // attach your own listeners to this.body / this.$(...)
       }
       onOpen() { ... }          // optional
       onClose() { ... }         // optional
     }

   sizes: 'sm' | 'md' | 'lg' | 'xl'
   ============================================================ */

/** The dialogs that are open, in the order they were opened */
Structra.openDialogs = [];

/**
 * Escape closes one thing: the dialog in front, otherwise the command palette, the Find or Filter bar,
 * the Node panel, or the Query panel, in that order. Returns true when something was closed.
 */
Structra.closeTop = function () {
  const dialog = Structra.openDialogs[Structra.openDialogs.length - 1];
  if (dialog) { dialog.close(); return true; }
  const palette = document.querySelector('#cmdOverlay.show');
  if (palette) { Structra.events.emit('command-palette:toggle'); return true; }
  if (Structra.state.findBarOpen) { Structra.set('findBarOpen', false); return true; }
  if (Structra.state.filterBarOpen) { Structra.set('filterBarOpen', false); return true; }
  if (Structra.state.contextPanelOpen) { Structra.set('contextPanelOpen', false); return true; }
  if (Structra.state.queryPanelOpen) { Structra.set('queryPanelOpen', false); return true; }
  return false;
};

class StructraOverlay extends StructraElement {
  init() {
    this.on('overlay:close', () => this.close());
  }

  /**
   * Build the dialog. Call from render(); returns the body element.
   * @param {{ title: string, body?: string, foot?: string, head?: string, size?: string }} spec
   */
  mount({ title, body = '', foot = '', head = '', size = 'md' }) {
    const esc = Structra.util.esc;
    this.innerHTML = `
      <div class="ov" role="presentation">
        <section class="ov-box ov-${size}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
          <header class="ov-head">
            <h2 class="ov-title">${esc(title)}</h2>
            ${head}
            <button class="ov-close btn-icon btn" type="button" data-ov-close aria-label="Close">
              ${Structra.icons.svg('x', { size: 2 })}
            </button>
          </header>
          <div class="ov-body">${body}</div>
          ${foot ? `<footer class="ov-foot">${foot}</footer>` : ''}
        </section>
      </div>`;

    const root = this.querySelector('.ov');
    root.addEventListener('mousedown', (e) => { this._downOnBackdrop = e.target === root; });
    root.addEventListener('click', (e) => {
      // Only a click that started and ended on the backdrop closes (not a drag that ended there)
      if (e.target === root && this._downOnBackdrop) this.close();
      if (e.target.closest('[data-ov-close]')) this.close();
    });
    root.addEventListener('keydown', (e) => this._onKey(e));
    return this.body;
  }

  get root() { return this.querySelector('.ov'); }
  get body() { return this.querySelector('.ov-body'); }
  get isOpen() { return !!this.root && this.root.classList.contains('show'); }

  open() {
    if (!this.root || this.isOpen) return;
    // One dialog at a time: opening a new one closes the one in front of it (without taking focus back)
    for (const other of [...Structra.openDialogs]) if (other !== this) other.close(false);
    Structra.openDialogs.push(this);
    this._returnFocus = document.activeElement;
    this.root.classList.add('show');
    const target = this.querySelector('[autofocus]') || this.querySelector('.ov-body input, .ov-body textarea, .ov-body select, .ov-body button') || this.querySelector('.ov-close');
    if (target) setTimeout(() => target.focus(), 0);
    if (this.onOpen) this.onOpen();
  }

  close(restoreFocus = true) {
    if (!this.isOpen) return;
    this.root.classList.remove('show');
    const i = Structra.openDialogs.indexOf(this);
    if (i >= 0) Structra.openDialogs.splice(i, 1);
    if (restoreFocus !== false && this._returnFocus && this._returnFocus.focus) this._returnFocus.focus();
    this._returnFocus = null;
    if (this.onClose) this.onClose();
  }

  _onKey(e) {
    if (e.key === 'Escape') { e.stopPropagation(); this.close(); return; }
    if (e.key !== 'Tab') return;
    const focusable = [...this.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
      .filter((el) => !el.disabled && el.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
}
