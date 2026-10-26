/* ============================================================
   STRUCTRA V2 - Minimap Component
   <structra-minimap> - Bird's-eye canvas overview of JSON
   structure with viewport indicator and click-to-scroll.

   Wiring (generated from the code below; update it when you add or remove an event):
     Listens to: state:jsonData, minimap:toggle, view:switched
   ============================================================ */

class StructraMinimap extends StructraComponent {
  init() {
    this._canvas = null;
    this._ctx = null;
    this._visible = false;
    this._data = null;

    this.on('state:jsonData', () => { this._data = Structra.state.jsonData; if (this._visible) this._paint(); });
    this.on('minimap:toggle', () => this._toggle());
    this.on('view:switched', () => { this._sync(); if (this._visible) this._paint(); });
  }

  render() {
    this.innerHTML = `<div class="minimap-container" id="minimapContainer" role="region" aria-label="Minimap of the document" style="display:none">
      <div class="minimap-head"><span>Minimap</span><button class="minimap-close" type="button" aria-label="Close the minimap" title="Close the minimap">${Structra.icons.svg('x', { size: 12 })}</button></div>
      <canvas class="minimap-canvas" id="minimapCanvas" width="100" height="400"></canvas>
      <div class="minimap-viewport" id="minimapViewport"></div>
    </div>`;

    this._canvas = this.queryOne('#minimapCanvas');
    this._ctx = this._canvas.getContext('2d');

    this.queryOne('.minimap-close').addEventListener('click', () => this._toggle());
    this._canvas.addEventListener('click', (event) => this._onCanvasClick(event));
    this._canvas.addEventListener('mousedown', (event) => this._startDrag(event));
  }

  _toggle() {
    this._visible = !this._visible;
    this._sync();
    if (this._visible) this._paint();
  }

  /** The minimap follows the Tree and the Table; in other views it has nothing to scroll, so it steps aside */
  _sync() {
    const view = Structra.state.activeView;
    const useful = view === 'tree' || view === 'table';
    this.queryOne('#minimapContainer').style.display = this._visible && useful ? '' : 'none';
  }

  _paint() {
    const data = this._data || Structra.state.jsonData;
    if (!data) return;

    const canvas = this._canvas;
    const context = this._ctx;
    const width = canvas.width;
    const height = canvas.height;

    context.clearRect(0, 0, width, height);

    // Generate structure map
    const lines = this._structureLines(data, 0);
    const lineH = Math.max(1, height / Math.max(lines.length, 1));

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const y = i * lineH;
      const indent = Math.min(line.depth * 8, width - 10);
      const barWidth = Math.max(4, (width - indent) * line.density);

      context.fillStyle = this._colorForType(line.type);
      context.globalAlpha = 0.7;
      context.fillRect(indent, y, barWidth, Math.max(lineH, 1));
    }
    context.globalAlpha = 1;

    // Update viewport indicator
    this._updateViewport();
  }

  _structureLines(data, depth) {
    const lines = [];
    const walk = (value, depth) => {
      if (depth > 30) return; // Safety
      if (value === null) { lines.push({ depth, type: 'null', density: 0.2 }); return; }
      if (typeof value !== 'object') {
        const length = typeof value === 'string' ? Math.min(value.length / 100, 1) : 0.3;
        lines.push({ depth, type: typeof value, density: length });
        return;
      }
      if (Array.isArray(value)) {
        lines.push({ depth, type: 'array', density: Math.min(value.length / 50, 1) });
        // Show first 200 items
        const limit = Math.min(value.length, 200);
        for (let i = 0; i < limit; i++) walk(value[i], depth + 1);
      } else {
        lines.push({ depth, type: 'object', density: Math.min(Object.keys(value).length / 20, 1) });
        for (const key of Object.keys(value)) walk(value[key], depth + 1);
      }
    };
    walk(data, depth);
    return lines.slice(0, 2000); // Cap for performance
  }

  _colorForType(type) {
    const colors = {
      string: 'var(--syn-string)', number: 'var(--syn-number)', boolean: 'var(--syn-boolean)',
      null: 'var(--syn-null)', object: 'var(--syn-key)', array: 'var(--accent)'
    };
    // A canvas cannot read CSS variables, so resolve the token to its current colour
    const token = (colors[type] || 'var(--text-muted)').slice(4, -1);
    return getComputedStyle(document.documentElement).getPropertyValue(token).trim() || '#888';
  }

  _updateViewport() {
    const main = document.querySelector('.json-view') || document.querySelector('.table-scroll');
    if (!main) return;
    const viewport = this.queryOne('#minimapViewport');
    const ratio = this._canvas.height / Math.max(main.scrollHeight, 1);
    const top = main.scrollTop * ratio;
    const height = Math.max(20, main.clientHeight * ratio);
    viewport.style.top = `${top}px`;
    viewport.style.height = `${height}px`;
  }

  _onCanvasClick(event) {
    const rect = this._canvas.getBoundingClientRect();
    const ratio = event.clientY - rect.top;
    const percent = ratio / rect.height;
    const main = document.querySelector('.json-view') || document.querySelector('.table-scroll');
    if (main) main.scrollTop = percent * main.scrollHeight;
  }

  _startDrag(event) {
    event.preventDefault();
    const onMove = (event) => {
      const rect = this._canvas.getBoundingClientRect();
      const percent = (event.clientY - rect.top) / rect.height;
      const main = document.querySelector('.json-view') || document.querySelector('.table-scroll');
      if (main) main.scrollTop = percent * main.scrollHeight;
      this._updateViewport();
    };
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }
}

customElements.define('structra-minimap', StructraMinimap);
