/* ============================================================
   STRUCTRA V2 — Path Autocomplete Component
   <structra-autocomplete> — Dropdown suggestions for the path
   bar input. Uses engine key metadata and DuckDB column queries.
   ============================================================ */

class StructraAutocomplete extends StructraElement {
  init() {
    this._suggestions = [];
    this._selected = -1;
    this._visible = false;
    this._input = null;
    this._cachedKeys = [];

    this.on('engine:ingested', () => this._refreshCache());
    this.on('state:jsonData', () => this._refreshCache());
  }

  render() {
    this.innerHTML = `<div class="ac-dropdown" id="acDropdown" style="display:none"></div>`;

    // Bind to path input after DOM is ready
    requestAnimationFrame(() => this._bindInput());
  }

  _bindInput() {
    this._input = document.getElementById('pathInput');
    if (!this._input) return;

    this._input.addEventListener('input', () => this._onInput());
    this._input.addEventListener('keydown', (e) => this._onKeydown(e));
    this._input.addEventListener('blur', () => { setTimeout(() => this._hide(), 150); });
    this._input.addEventListener('focus', () => { if (this._input.value) this._onInput(); });
  }

  async _refreshCache() {
    // Try DuckDB columns first
    const ds = Structra.engine.getActive();
    if (ds && ds.indexes.columns) {
      this._cachedKeys = ds.indexes.columns.map(c => c.name);
      return;
    }

    // Fallback: walk data structure
    const data = Structra.state.jsonData;
    if (!data) return;
    this._cachedKeys = this._collectPaths(data);
  }

  _collectPaths(data, prefix = '$', depth = 0) {
    const paths = [prefix];
    if (depth > 5 || !data) return paths;

    if (Array.isArray(data)) {
      paths.push(`${prefix}[0]`);
      if (data.length > 0 && typeof data[0] === 'object' && data[0] !== null) {
        for (const k of Object.keys(data[0])) {
          paths.push(`${prefix}[*].${k}`);
          const nested = this._collectPaths(data[0][k], `${prefix}[*].${k}`, depth + 1);
          paths.push(...nested.slice(1));
        }
      }
    } else if (typeof data === 'object') {
      for (const k of Object.keys(data)) {
        const p = `${prefix}.${k}`;
        paths.push(p);
        const nested = this._collectPaths(data[k], p, depth + 1);
        paths.push(...nested.slice(1));
      }
    }
    return paths;
  }

  _onInput() {
    const val = this._input.value.trim();
    if (!val) { this._hide(); return; }

    // Filter suggestions
    const q = val.toLowerCase();
    this._suggestions = this._cachedKeys
      .filter(k => k.toLowerCase().includes(q) || `$[*].${k}`.toLowerCase().includes(q))
      .slice(0, 20)
      .map(k => k.startsWith('$') ? k : `$[*].${k}`);

    // Also add direct path completions
    if (val.startsWith('$') || val.startsWith('[')) {
      const exact = this._cachedKeys.filter(k => k.startsWith(val));
      for (const e of exact) { if (!this._suggestions.includes(e)) this._suggestions.unshift(e); }
    }

    this._suggestions = [...new Set(this._suggestions)].slice(0, 15);
    this._selected = -1;
    this._show();
  }

  _onKeydown(e) {
    if (!this._visible) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); this._move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); this._move(-1); }
    else if (e.key === 'Enter' && this._selected >= 0) {
      e.preventDefault();
      this._select(this._selected);
    }
    else if (e.key === 'Escape') { this._hide(); }
  }

  _move(dir) {
    this._selected = (this._selected + dir + this._suggestions.length) % this._suggestions.length;
    this._renderList();
  }

  _select(idx) {
    const val = this._suggestions[idx];
    if (!val) return;
    this._input.value = val;
    this._hide();
    Structra.set('currentPath', val);
    Structra.events.emit('tree:navigate-path', val);
  }

  _show() {
    if (this._suggestions.length === 0) { this._hide(); return; }
    this._visible = true;
    const dd = this.$('#acDropdown');
    dd.style.display = '';

    // Position below path input
    if (this._input) {
      const rect = this._input.getBoundingClientRect();
      dd.style.top = `${rect.bottom + 2}px`;
      dd.style.left = `${rect.left}px`;
      dd.style.width = `${rect.width}px`;
    }
    this._renderList();
  }

  _hide() {
    this._visible = false;
    this.$('#acDropdown').style.display = 'none';
  }

  _renderList() {
    const dd = this.$('#acDropdown');
    dd.innerHTML = this._suggestions.map((s, i) =>
      `<div class="ac-item${i === this._selected ? ' ac-selected' : ''}" data-ac-idx="${i}">${this._esc(s)}</div>`
    ).join('');

    dd.querySelectorAll('.ac-item').forEach(el => {
      el.addEventListener('mousedown', (e) => { e.preventDefault(); this._select(parseInt(el.dataset.acIdx)); });
    });
  }

  _esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
}

customElements.define('structra-autocomplete', StructraAutocomplete);
