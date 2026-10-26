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
    this.on('zoom:fit', () => this._fitToScreen());

    // Listen globally for Ctrl+/- keyboard shortcuts
    document.addEventListener('keydown', (event) => {
      if (!event.ctrlKey && !event.metaKey) return;
      if (event.key === '=' || event.key === '+') { event.preventDefault(); this._zoom(1); }
      else if (event.key === '-') { event.preventDefault(); this._zoom(-1); }
      else if (event.key === '0') { event.preventDefault(); this._reset(); }
    });
  }

  render() {
    this.innerHTML = `<div class="zoom-indicator" id="zoomIndicator" style="display:none">
      <span class="zoom-label" id="zoomLabel">100%</span>
    </div>`;
  }

  _zoom(direction) {
    this._size = Math.max(this._min, Math.min(this._max, this._size + direction));
    this._applySize();
    this._showIndicator();
  }

  /** Pick the text size at which the widest line of the open view just fits the window */
  _fitToScreen() {
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
    const percent = Math.round((this._size / 14) * 100);
    const ind = this.queryOne('#zoomIndicator');
    const label = this.queryOne('#zoomLabel');
    label.textContent = `${percent}%`;
    ind.style.display = '';
    Structra.toast(`Zoom: ${percent}% (${this._size}px)`, 'info');
    clearTimeout(this._hideTimer);
    this._hideTimer = setTimeout(() => { ind.style.display = 'none'; }, 2000);
  }
}

customElements.define('structra-zoom', StructraZoom);
