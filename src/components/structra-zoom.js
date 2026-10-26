/* ============================================================
   STRUCTRA V2 - Font Zoom Component
   <structra-zoom> - Ctrl+/- zoom with persistent preference.
   Uses CSS custom property --structra-font-size.

   Wiring (generated from the code below; update it when you add or remove an event):
     Listens to: zoom:in, zoom:out, zoom:reset, zoom:fit
     Sets state: fontSize
   ============================================================ */

class StructraZoom extends StructraComponent {
  init() {
    this._size = parseInt(localStorage.getItem('structra_setting_fontSize') || '14');
    this._min = 10;
    this._max = 24;

    this._applySize();
    this.on('zoom:in', () => this._zoom(1));
    this.on('zoom:out', () => this._zoom(-1));
    this.on('zoom:reset', () => this._reset());
    this.on('zoom:fit', () => this._fit());

    // Listen globally for Ctrl+/- keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      if (e.key === '=' || e.key === '+') { e.preventDefault(); this._zoom(1); }
      else if (e.key === '-') { e.preventDefault(); this._zoom(-1); }
      else if (e.key === '0') { e.preventDefault(); this._reset(); }
    });
  }

  render() {
    this.innerHTML = `<div class="zoom-indicator" id="zoomIndicator" style="display:none">
      <span class="zoom-label" id="zoomLabel">100%</span>
    </div>`;
  }

  _zoom(dir) {
    this._size = Math.max(this._min, Math.min(this._max, this._size + dir));
    this._applySize();
    this._showIndicator();
  }

  /** Pick the text size at which the widest line of the open view just fits the window */
  _fit() {
    const view = document.querySelector('.json-view, .j-scroll, structra-tree [class*="scroll"]') || document.querySelector('.app-view');
    if (!view || !view.scrollWidth || !view.clientWidth) { Structra.toast('Nothing to fit yet'); return; }
    const fitted = Math.floor(this._size * (view.clientWidth / view.scrollWidth));
    this._size = Math.max(this._min, Math.min(this._max, fitted));
    this._applySize();
    this._showIndicator();
  }

  _reset() {
    this._size = 14;
    this._applySize();
    this._showIndicator();
  }

  _applySize() {
    document.documentElement.style.setProperty('--structra-font-size', this._size + 'px');
    localStorage.setItem('structra_setting_fontSize', String(this._size));
    Structra.setState('fontSize', this._size);
  }

  _showIndicator() {
    const pct = Math.round((this._size / 14) * 100);
    const ind = this.$('#zoomIndicator');
    const label = this.$('#zoomLabel');
    label.textContent = `${pct}%`;
    ind.style.display = '';
    Structra.toast(`Zoom: ${pct}% (${this._size}px)`, 'info');
    clearTimeout(this._hideTimer);
    this._hideTimer = setTimeout(() => { ind.style.display = 'none'; }, 2000);
  }
}

customElements.define('structra-zoom', StructraZoom);
