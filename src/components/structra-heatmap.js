/* ============================================================
   STRUCTRA V2 — Size Heatmap Component
   <structra-heatmap> — Toggle heatmap coloring on tree/table
   based on byte size of values. Uses engine data for sizing.
   ============================================================ */

class StructraHeatmap extends StructraElement {
  init() {
    this._active = false;
    this._sizeMap = null;

    this.on('heatmap:toggle', () => this._toggle());
    this.on('state:jsonData', () => { if (this._active) this._recalc(); });
  }

  render() {
    this.innerHTML = `<div class="heatmap-indicator" id="heatmapIndicator" style="display:none">
      <span class="heatmap-badge">Heatmap ON</span>
      <div class="heatmap-legend">
        <span class="heatmap-lg" style="background:var(--success)">Small</span>
        <span class="heatmap-lg" style="background:var(--warning)">Medium</span>
        <span class="heatmap-lg" style="background:var(--danger)">Large</span>
      </div>
    </div>`;
  }

  _toggle() {
    this._active = !this._active;
    this.$('#heatmapIndicator').style.display = this._active ? '' : 'none';
    document.body.classList.toggle('structra-heatmap-active', this._active);

    if (this._active) {
      this._recalc();
    } else {
      this._clearStyles();
    }
    Structra.toast(this._active ? 'Heatmap enabled' : 'Heatmap disabled');
  }

  async _recalc() {
    const data = Structra.state.jsonData;
    if (!data) return;

    // Calculate sizes
    this._sizeMap = new Map();
    this._walkSizes(data, '$');

    // Get max for normalization
    const sizes = [...this._sizeMap.values()];
    const maxSize = Math.max(...sizes, 1);

    // Apply heatmap CSS variables to tree nodes
    this._applyStyles(maxSize);
  }

  _walkSizes(val, path) {
    const size = this._estimateSize(val);
    this._sizeMap.set(path, size);

    if (val && typeof val === 'object') {
      if (Array.isArray(val)) {
        for (let i = 0; i < val.length; i++) this._walkSizes(val[i], `${path}[${i}]`);
      } else {
        for (const k of Object.keys(val)) this._walkSizes(val[k], `${path}.${k}`);
      }
    }
  }

  _estimateSize(val) {
    if (val === null) return 4;
    if (typeof val === 'string') return val.length + 2;
    if (typeof val === 'number') return String(val).length;
    if (typeof val === 'boolean') return val ? 4 : 5;
    if (Array.isArray(val)) return JSON.stringify(val).length;
    if (typeof val === 'object') return JSON.stringify(val).length;
    return 0;
  }

  _applyStyles(maxSize) {
    // Apply to tree nodes via data-path attribute
    document.querySelectorAll('[data-path]').forEach(el => {
      const path = el.dataset.path;
      const size = this._sizeMap.get(path) || 0;
      const ratio = size / maxSize;
      el.style.setProperty('--heatmap-color', this._getColor(ratio));
      el.style.setProperty('--heatmap-opacity', '1');
    });

    // Apply to JSON lines in tree view
    document.querySelectorAll('.jt-row').forEach((el, idx) => {
      const path = el.dataset?.path;
      if (path && this._sizeMap.has(path)) {
        const ratio = this._sizeMap.get(path) / maxSize;
        el.style.borderLeft = `3px solid ${this._getColor(ratio)}`;
      }
    });
  }

  _clearStyles() {
    document.querySelectorAll('[data-path]').forEach(el => {
      el.style.removeProperty('--heatmap-color');
      el.style.removeProperty('--heatmap-opacity');
      el.style.borderLeft = '';
    });
    document.querySelectorAll('.jt-row').forEach(el => { el.style.borderLeft = ''; });
  }

  _getColor(ratio) {
    // Green (small) → Yellow (medium) → Red (large)
    if (ratio < 0.33) {
      const t = ratio / 0.33;
      return `rgb(${Math.round(16 + t * 229)}, ${Math.round(185 - t * 27)}, ${Math.round(129 - t * 50)})`;
    } else if (ratio < 0.66) {
      const t = (ratio - 0.33) / 0.33;
      return `rgb(${Math.round(245 - t * 6)}, ${Math.round(158 - t * 100)}, ${Math.round(79 - t * 60)})`;
    } else {
      const t = (ratio - 0.66) / 0.34;
      return `rgb(${Math.round(239 - t * 30)}, ${Math.round(58 - t * 20)}, ${Math.round(19 + t * 30)})`;
    }
  }
}

customElements.define('structra-heatmap', StructraHeatmap);
