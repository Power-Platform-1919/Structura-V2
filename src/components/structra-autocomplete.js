/* ============================================================
   STRUCTRA V2 - Path Autocomplete
   <structra-autocomplete> - suggestions for the path bar.

   Completes against the open document itself: it resolves everything
   before the last separator and lists the keys (or array indexes) found
   there. Nothing is precomputed, so it stays fast on large files.

   Keys:  ArrowUp / ArrowDown move, Enter or Tab accept, Escape closes.

   Wiring (generated from the code below; update it when you add or remove an event):
     Listens to: autocomplete:hide
     Emits: tree:navigate-path
     Sets state: currentPath
   ============================================================ */

class StructraAutocomplete extends StructraComponent {
  static get MAX_SUGGESTIONS() { return 12; }

  init() {
    this._items = [];          // [{ path, type }]
    this._selected = -1;
    this._input = null;
    this.on('autocomplete:hide', () => this._hide());
  }

  render() {
    this.innerHTML = '<div class="ac-dropdown" id="acDropdown" role="listbox" style="display:none"></div>';
    // The path bar lives in <structra-header>, which may mount after this element
    requestAnimationFrame(() => this._bindInput());
  }

  _bindInput() {
    this._input = document.getElementById('pathInput');
    if (!this._input) return;
    this._input.addEventListener('input', () => this._update());
    this._input.addEventListener('focus', () => this._update());
    this._input.addEventListener('blur', () => setTimeout(() => this._hide(), 150));
    // Capture phase: when a suggestion is accepted, the header must not also run its own Enter handler
    this._input.addEventListener('keydown', (event) => this._onKeydown(event), true);
  }

  /* ---------- suggestions ---------- */

  _typeOf(value) { return Structra.sharedHelpers.jsonTypeOf(value); }

  _joinPath(parent, key) {
    return Structra.dataPaths.child(parent, key);
  }

  _suggest(raw) {
    const data = Structra.state.jsonData;
    if (!data) return [];
    const text = Structra.dataPaths.strip(raw.trim());

    // Split into the part that must already exist, and the part being typed
    let parent, partial;
    let inBracket = false;
    const lastDot = text.lastIndexOf('.');
    const lastBracket = text.lastIndexOf('[');
    if (text.endsWith(']')) { parent = text; partial = ''; }
    else if (lastBracket > lastDot) { parent = text.slice(0, lastBracket); partial = text.slice(lastBracket + 1); inBracket = true; }
    else { parent = lastDot < 0 ? '' : text.slice(0, lastDot); partial = text.slice(lastDot + 1); }

    const node = parent ? Structra.dataPaths.resolve(data, parent) : data;
    if (node === null || typeof node !== 'object') return [];

    const query = partial.toLowerCase();
    const out = [];

    if (Array.isArray(node)) {
      // Typing a name after an array ("items.na") has nothing to complete
      if (partial && !inBracket) return [];
      const count = Math.min(node.length, 10);
      for (let i = 0; i < count; i++) {
        if (!query || String(i).startsWith(query)) out.push({ path: `${parent}[${i}]`, type: this._typeOf(node[i]) });
      }
      if (!query) out.push({ path: `${parent}[*]`, type: 'all items' });
      return out;
    }

    // Object: keys that start with the text first, then keys that only contain it
    const keys = Object.keys(node);
    for (const key of keys) {
      if (key.toLowerCase().startsWith(query)) out.push({ path: this._joinPath(parent, key), type: this._typeOf(node[key]) });
    }
    if (query) {
      for (const key of keys) {
        const lower = key.toLowerCase();
        if (!lower.startsWith(query) && lower.includes(query)) out.push({ path: this._joinPath(parent, key), type: this._typeOf(node[key]) });
      }
    }
    return out;
  }

  _update() {
    if (!this._input) return;
    if (document.activeElement !== this._input) { this._hide(); return; }
    const raw = this._input.value;
    this._items = raw.trim() ? this._suggest(raw).slice(0, StructraAutocomplete.MAX_SUGGESTIONS) : [];
    this._selected = -1;
    if (!this._items.length) { this._hide(); return; }
    this._show();
  }

  /* ---------- interaction ---------- */

  _onKeydown(event) {
    const open = this.queryOne('#acDropdown').style.display !== 'none';
    if (!open) return;
    if (event.key === 'ArrowDown') { event.preventDefault(); this._moveSelection(1); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); this._moveSelection(-1); }
    else if (event.key === 'Escape') { this._hide(); }
    else if (event.key === 'Tab' || (event.key === 'Enter' && this._selected >= 0)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this._accept(this._selected >= 0 ? this._selected : 0);
    }
  }

  _moveSelection(step) {
    this._selected = (this._selected + step + this._items.length) % this._items.length;
    this._paint();
  }

  _accept(i) {
    const item = this._items[i];
    if (!item) return;
    const path = Structra.dataPaths.canonical(item.path);
    this._input.value = path;
    this._hide();
    Structra.setState('currentPath', path);
    Structra.events.emit('tree:navigate-path', path);
  }

  _show() {
    const dropdown = this.queryOne('#acDropdown');
    dropdown.style.display = '';
    const rect = this._input.getBoundingClientRect();
    dropdown.style.top = rect.bottom + 2 + 'px';
    dropdown.style.left = rect.left + 'px';
    dropdown.style.width = rect.width + 'px';
    this._paint();
  }

  _hide() {
    const dropdown = this.queryOne('#acDropdown');
    if (dropdown) dropdown.style.display = 'none';
  }

  _paint() {
    const escapeHtml = Structra.sharedHelpers.escapeHtml;
    const dropdown = this.queryOne('#acDropdown');
    dropdown.innerHTML = this._items.map((item, i) =>
      `<div class="ac-item${i === this._selected ? ' ac-selected' : ''}" role="option" data-ac-idx="${i}">
        <span class="ac-path">${escapeHtml(item.path)}</span><span class="ac-type">${escapeHtml(item.type)}</span>
      </div>`).join('');
    dropdown.onmousedown = (event) => {
      const element = event.target.closest('[data-ac-idx]');
      if (!element) return;
      event.preventDefault();               // keep focus in the input
      this._accept(parseInt(element.dataset.acIdx, 10));
    };
  }
}

customElements.define('structra-autocomplete', StructraAutocomplete);
