/* ============================================================
   STRUCTRA V2 — Path Autocomplete
   <structra-autocomplete> — suggestions for the path bar.

   Completes against the open document itself: it resolves everything
   before the last separator and lists the keys (or array indexes) found
   there. Nothing is precomputed, so it stays fast on large files.

   Keys:  ArrowUp / ArrowDown move, Enter or Tab accept, Escape closes.
   ============================================================ */

class StructraAutocomplete extends StructraElement {
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
    this._input.addEventListener('keydown', (e) => this._onKeydown(e), true);
  }

  /* ---------- suggestions ---------- */

  _typeOf(v) { return Structra.util.typeOf(v); }

  _join(parent, key) {
    if (/^[A-Za-z_$][\w$]*$/.test(key)) return parent ? parent + '.' + key : key;
    return `${parent}["${key}"]`;
  }

  _suggest(raw) {
    const data = Structra.state.jsonData;
    if (!data) return [];
    const text = Structra.paths.strip(raw.trim());

    // Split into the part that must already exist, and the part being typed
    let parent, partial;
    let inBracket = false;
    const lastDot = text.lastIndexOf('.');
    const lastBracket = text.lastIndexOf('[');
    if (text.endsWith(']')) { parent = text; partial = ''; }
    else if (lastBracket > lastDot) { parent = text.slice(0, lastBracket); partial = text.slice(lastBracket + 1); inBracket = true; }
    else { parent = lastDot < 0 ? '' : text.slice(0, lastDot); partial = text.slice(lastDot + 1); }

    const node = parent ? Structra.paths.resolve(data, parent) : data;
    if (node === null || typeof node !== 'object') return [];

    const q = partial.toLowerCase();
    const out = [];

    if (Array.isArray(node)) {
      // Typing a name after an array ("items.na") has nothing to complete
      if (partial && !inBracket) return [];
      const count = Math.min(node.length, 10);
      for (let i = 0; i < count; i++) {
        if (!q || String(i).startsWith(q)) out.push({ path: `${parent}[${i}]`, type: this._typeOf(node[i]) });
      }
      if (!q) out.push({ path: `${parent}[*]`, type: 'all items' });
      return out;
    }

    // Object: keys that start with the text first, then keys that only contain it
    const keys = Object.keys(node);
    for (const k of keys) {
      if (k.toLowerCase().startsWith(q)) out.push({ path: this._join(parent, k), type: this._typeOf(node[k]) });
    }
    if (q) {
      for (const k of keys) {
        const lower = k.toLowerCase();
        if (!lower.startsWith(q) && lower.includes(q)) out.push({ path: this._join(parent, k), type: this._typeOf(node[k]) });
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

  _onKeydown(e) {
    const open = this.$('#acDropdown').style.display !== 'none';
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); this._move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); this._move(-1); }
    else if (e.key === 'Escape') { this._hide(); }
    else if (e.key === 'Tab' || (e.key === 'Enter' && this._selected >= 0)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      this._accept(this._selected >= 0 ? this._selected : 0);
    }
  }

  _move(step) {
    this._selected = (this._selected + step + this._items.length) % this._items.length;
    this._paint();
  }

  _accept(i) {
    const item = this._items[i];
    if (!item) return;
    const path = Structra.paths.canonical(item.path);
    this._input.value = path;
    this._hide();
    Structra.set('currentPath', path);
    Structra.events.emit('tree:navigate-path', path);
  }

  _show() {
    const dd = this.$('#acDropdown');
    dd.style.display = '';
    const rect = this._input.getBoundingClientRect();
    dd.style.top = rect.bottom + 2 + 'px';
    dd.style.left = rect.left + 'px';
    dd.style.width = rect.width + 'px';
    this._paint();
  }

  _hide() {
    const dd = this.$('#acDropdown');
    if (dd) dd.style.display = 'none';
  }

  _paint() {
    const esc = Structra.util.esc;
    const dd = this.$('#acDropdown');
    dd.innerHTML = this._items.map((it, i) =>
      `<div class="ac-item${i === this._selected ? ' ac-selected' : ''}" role="option" data-ac-idx="${i}">
        <span class="ac-path">${esc(it.path)}</span><span class="ac-type">${esc(it.type)}</span>
      </div>`).join('');
    dd.onmousedown = (e) => {
      const el = e.target.closest('[data-ac-idx]');
      if (!el) return;
      e.preventDefault();               // keep focus in the input
      this._accept(parseInt(el.dataset.acIdx, 10));
    };
  }
}

customElements.define('structra-autocomplete', StructraAutocomplete);
