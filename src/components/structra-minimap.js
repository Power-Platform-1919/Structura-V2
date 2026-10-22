/* ============================================================
   STRUCTRA V2 — Minimap Component
   <structra-minimap> — Bird's-eye canvas overview of JSON
   structure with viewport indicator and click-to-scroll.
   ============================================================ */

class StructraMinimap extends StructraElement {
  init() {
    this._canvas = null;
    this._ctx = null;
    this._visible = false;
    this._data = null;

    this.on('state:jsonData', () => { this._data = Structra.state.jsonData; if (this._visible) this._paint(); });
    this.on('minimap:toggle', () => this._toggle());
    this.on('view:switched', () => { if (this._visible) this._paint(); });
  }

  render() {
    this.innerHTML = `<div class="minimap-container" id="minimapContainer" style="display:none">
      <canvas class="minimap-canvas" id="minimapCanvas" width="100" height="400"></canvas>
      <div class="minimap-viewport" id="minimapViewport"></div>
    </div>`;

    this._canvas = this.$('#minimapCanvas');
    this._ctx = this._canvas.getContext('2d');

    this._canvas.addEventListener('click', (e) => this._onCanvasClick(e));
    this._canvas.addEventListener('mousedown', (e) => this._startDrag(e));
  }

  _toggle() {
    this._visible = !this._visible;
    this.$('#minimapContainer').style.display = this._visible ? '' : 'none';
    if (this._visible) this._paint();
  }

  _paint() {
    const data = this._data || Structra.state.jsonData;
    if (!data) return;

    const canvas = this._canvas;
    const ctx = this._ctx;
    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);

    // Generate structure map
    const lines = this._structureLines(data, 0);
    const lineH = Math.max(1, H / Math.max(lines.length, 1));

    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      const y = i * lineH;
      const indent = Math.min(ln.depth * 8, W - 10);
      const barW = Math.max(4, (W - indent) * ln.density);

      ctx.fillStyle = this._colorForType(ln.type);
      ctx.globalAlpha = 0.7;
      ctx.fillRect(indent, y, barW, Math.max(lineH, 1));
    }
    ctx.globalAlpha = 1;

    // Update viewport indicator
    this._updateViewport();
  }

  _structureLines(data, depth) {
    const lines = [];
    const walk = (val, d) => {
      if (d > 30) return; // Safety
      if (val === null) { lines.push({ depth: d, type: 'null', density: 0.2 }); return; }
      if (typeof val !== 'object') {
        const len = typeof val === 'string' ? Math.min(val.length / 100, 1) : 0.3;
        lines.push({ depth: d, type: typeof val, density: len });
        return;
      }
      if (Array.isArray(val)) {
        lines.push({ depth: d, type: 'array', density: Math.min(val.length / 50, 1) });
        // Show first 200 items
        const limit = Math.min(val.length, 200);
        for (let i = 0; i < limit; i++) walk(val[i], d + 1);
      } else {
        lines.push({ depth: d, type: 'object', density: Math.min(Object.keys(val).length / 20, 1) });
        for (const k of Object.keys(val)) walk(val[k], d + 1);
      }
    };
    walk(data, depth);
    return lines.slice(0, 2000); // Cap for performance
  }

  _colorForType(type) {
    const colors = {
      string: '#3b82f6', number: '#8b5cf6', boolean: '#f59e0b',
      null: '#ef4444', object: '#10b981', array: '#06b6d4'
    };
    return colors[type] || '#6b7280';
  }

  _updateViewport() {
    const main = document.querySelector('.json-view') || document.querySelector('.table-scroll');
    if (!main) return;
    const vp = this.$('#minimapViewport');
    const ratio = this._canvas.height / Math.max(main.scrollHeight, 1);
    const top = main.scrollTop * ratio;
    const height = Math.max(20, main.clientHeight * ratio);
    vp.style.top = `${top}px`;
    vp.style.height = `${height}px`;
  }

  _onCanvasClick(e) {
    const rect = this._canvas.getBoundingClientRect();
    const ratio = e.clientY - rect.top;
    const pct = ratio / rect.height;
    const main = document.querySelector('.json-view') || document.querySelector('.table-scroll');
    if (main) main.scrollTop = pct * main.scrollHeight;
  }

  _startDrag(e) {
    e.preventDefault();
    const onMove = (ev) => {
      const rect = this._canvas.getBoundingClientRect();
      const pct = (ev.clientY - rect.top) / rect.height;
      const main = document.querySelector('.json-view') || document.querySelector('.table-scroll');
      if (main) main.scrollTop = pct * main.scrollHeight;
      this._updateViewport();
    };
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }
}

customElements.define('structra-minimap', StructraMinimap);
