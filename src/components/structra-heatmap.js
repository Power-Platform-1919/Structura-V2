/* ============================================================
   STRUCTRA V2 - Size Heatmap Component
   <structra-heatmap> - Toggle heatmap coloring on tree/table
   based on byte size of values. Uses engine data for sizing.

   Wiring (generated from the code below; update it when you add or remove an event):
     Listens to: heatmap:toggle, state:jsonData, tree:rendered, view:switched
   ============================================================ */

class StructraHeatmap extends StructraComponent {
  init() {
    this._active = false;
    this._sizeMap = null;

    this.on('heatmap:toggle', () => this._toggle());
    this.on('state:jsonData', () => { if (this._active) this._recalc(); });
    this.on('tree:rendered', () => { if (this._active) this._recalc(); });
    this.on('view:switched', () => { if (this._active) setTimeout(() => this._recalc(), 50); });
  }

  render() {
    this.innerHTML = `<div class="heatmap-indicator" id="heatmapIndicator" style="display:none">
      <span class="heatmap-badge">Size of each value</span>
      <div class="heatmap-legend">
        <span class="heatmap-lg" style="background:var(--success)">Small</span>
        <span class="heatmap-lg" style="background:var(--warning)">Medium</span>
        <span class="heatmap-lg" style="background:var(--danger)">Large</span>
      </div>
      <button class="heatmap-off" type="button" aria-label="Turn the heatmap off" title="Turn the heatmap off">${Structra.icons.svg('x', { size: 12 })}</button>
    </div>`;
    this.queryOne('.heatmap-off').addEventListener('click', () => this._toggle());
  }

  _toggle() {
    this._active = !this._active;
    this.queryOne('#heatmapIndicator').style.display = this._active ? '' : 'none';
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

  _walkSizes(value, path) {
    const size = this._estimateSize(value);
    this._sizeMap.set(path, size);

    if (value && typeof value === 'object') {
      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) this._walkSizes(value[i], `${path}[${i}]`);
      } else {
        for (const key of Object.keys(value)) this._walkSizes(value[key], `${path}.${key}`);
      }
    }
  }

  _estimateSize(value) {
    if (value === null) return 4;
    if (typeof value === 'string') return value.length + 2;
    if (typeof value === 'number') return String(value).length;
    if (typeof value === 'boolean') return value ? 4 : 5;
    if (Array.isArray(value)) return JSON.stringify(value).length;
    if (typeof value === 'object') return JSON.stringify(value).length;
    return 0;
  }

  _applyStyles(maxSize) {
    // The Tree marks each line with a coloured edge; its data-path is the short form (value[0].Title)
    document.querySelectorAll('.j-line[data-path]:not(.j-close)').forEach(element => {
      const size = this._sizeMap.get(Structra.dataPaths.canonical(element.dataset.path));
      if (size === undefined) return;
      element.style.boxShadow = `inset 3px 0 0 ${this._getColor(size / maxSize)}`;
      element.title = `${size.toLocaleString()} characters`;
    });
  }

  _clearStyles() {
    document.querySelectorAll('.j-line[data-path]').forEach(element => { element.style.boxShadow = ''; if (/ characters$/.test(element.title)) element.removeAttribute('title'); });
  }

  _getColor(ratio) {
    // Green (small) → Yellow (medium) → Red (large)
    if (ratio < 0.33) {
      const fraction = ratio / 0.33;
      return `rgb(${Math.round(16 + fraction * 229)}, ${Math.round(185 - fraction * 27)}, ${Math.round(129 - fraction * 50)})`;
    } else if (ratio < 0.66) {
      const fraction = (ratio - 0.33) / 0.33;
      return `rgb(${Math.round(245 - fraction * 6)}, ${Math.round(158 - fraction * 100)}, ${Math.round(79 - fraction * 60)})`;
    } else {
      const fraction = (ratio - 0.66) / 0.34;
      return `rgb(${Math.round(239 - fraction * 30)}, ${Math.round(58 - fraction * 20)}, ${Math.round(19 + fraction * 30)})`;
    }
  }
}

customElements.define('structra-heatmap', StructraHeatmap);
