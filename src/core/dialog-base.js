/* ============================================================
   STRUCTRA V2 - Dialog base class
   StructraDialog - one implementation of "a dialog on top of the app".
   Dialogs (validate, charts, theme, shortcuts, ...) extend this and only
   describe their content. The base owns:
     - the shell markup (backdrop, box, header, close button, body, footer)
     - open / close, Escape, click on the backdrop
     - focus: moves into the dialog on open, returns to where it was on close
     - keeping Tab inside the dialog
     - the page behind an open dialog cannot be reached by keyboard, pointer or screen reader: the browser's own `inert` on #appRoot
       (older browsers get aria-hidden and the Tab trap below). The native <dialog>.showModal() was tried on paper and not used: it puts the
       dialog in the browser's top layer, which would hide the toast, menus and the command palette that open above a dialog today.
   Styling is in ui.css (.ov, .ov-box, .ov-head ...).

   A dialog class:
     class StructraThing extends StructraDialog {
       init() { super.init(); this.on('thing:open', () => this.open()); }
       render() {
         this.mount({ title: 'Thing', size: 'md', body: '<p>...</p>', foot: '<button ...>' });
         // attach your own listeners to this.body / this.queryOne(...)
       }
       onOpen() { ... }          // optional
       onClose() { ... }         // optional
     }

   sizes: 'sm' | 'md' | 'lg' | 'xl'

   Wiring (generated from the code below; update it when you add or remove an event):
     Listens to: overlay:close
     Emits: command-palette:toggle
     Sets state: findBarOpen, filterBarOpen, contextPanelOpen, queryPanelOpen
   ============================================================ */

/** The dialogs that are open, in the order they were opened */
Structra.openDialogs = [];

/** The page behind the dialogs: out of reach while any dialog is open */
Structra.updatePageBehindDialog = function () {
  const page = document.getElementById('appRoot');
  if (!page) return;
  const open = Structra.openDialogs.length > 0;
  if ('inert' in page) page.inert = open;
  else if (open) page.setAttribute('aria-hidden', 'true');
  else page.removeAttribute('aria-hidden');
};

/**
 * Escape closes one thing: a menu or panel that floats over the page (Structra.popup), otherwise the dialog in front, otherwise the command
 * palette, the Find or Filter bar, the Node panel, or the Query panel, in that order. Returns true when something was closed.
 */
Structra.closeTop = function () {
  if (Structra.popup && Structra.popup.closeTop()) return true;
  const dialog = Structra.openDialogs[Structra.openDialogs.length - 1];
  if (dialog) { dialog.close(); return true; }
  const palette = document.querySelector('#cmdOverlay.show');
  if (palette) { Structra.events.emit('command-palette:toggle'); return true; }
  if (Structra.state.findBarOpen) { Structra.setState('findBarOpen', false); return true; }
  if (Structra.state.filterBarOpen) { Structra.setState('filterBarOpen', false); return true; }
  if (Structra.state.contextPanelOpen) { Structra.setState('contextPanelOpen', false); return true; }
  if (Structra.state.queryPanelOpen) { Structra.setState('queryPanelOpen', false); return true; }
  return false;
};

class StructraDialog extends StructraComponent {
  init() {
    this.on('overlay:close', () => this.close());
  }

  /**
   * Build the dialog. Call from render(); returns the body element.
   * @param {{ title: string, body?: string, foot?: string, head?: string, size?: string }} spec
   */
  mount({ title, body = '', foot = '', head = '', size = 'md' }) {
    const escapeHtml = Structra.sharedHelpers.escapeHtml;
    this.innerHTML = `
      <div class="ov" role="presentation">
        <section class="ov-box ov-${size}" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
          <header class="ov-head">
            <h2 class="ov-title">${escapeHtml(title)}</h2>
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
    root.addEventListener('mousedown', (event) => { this._downOnBackdrop = event.target === root; });
    root.addEventListener('click', (event) => {
      // Only a click that started and ended on the backdrop closes (not a drag that ended there)
      if (event.target === root && this._downOnBackdrop) this.close();
      if (event.target.closest('[data-ov-close]')) this.close();
    });
    root.addEventListener('keydown', (event) => this._onKey(event));
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
    Structra.updatePageBehindDialog();
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
    Structra.updatePageBehindDialog();      // before the focus goes back: an inert page would refuse it
    if (restoreFocus !== false && this._returnFocus && this._returnFocus.focus) this._returnFocus.focus();
    this._returnFocus = null;
    if (this.onClose) this.onClose();
  }

  _onKey(event) {
    if (event.key === 'Escape') { event.stopPropagation(); this.close(); return; }
    if (event.key !== 'Tab') return;
    const focusable = [...this.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
      .filter((element) => !element.disabled && element.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
}
