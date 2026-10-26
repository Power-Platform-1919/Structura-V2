/* ============================================================
   STRUCTRA V2 - Graph View Component
   <structra-graph> - SVG node graph with zoom/pan/expand

   Wiring (generated from the code below; update it when you add or remove an event):
     Listens to: state:currentPath, state:jsonData, view:switched, engine:ingested,
          engine:filter-changed
     Emits: tree:node-selected
     Sets state: currentPath
   ============================================================ */

class StructraGraph extends StructraElement {
  static get observedAttributes() { return ['max-depth']; }

  /* ---- Constants ---- */
  static NODE_W = 140;
  static NODE_H = 28;
  static H_GAP = 30;
  static V_GAP = 8;
  static ZOOM_MIN = 0.1;
  static ZOOM_MAX = 3;
  static ZOOM_STEP = 0.1;

  init() {
    this._stale = false;
    this._scale = 1;
    this._panX = 20;
    this._panY = 20;
    this._dragging = false;
    this._rootTree = null;
    this._svgEl = null;
    this._containerEl = null;

    this.on('state:currentPath', (d) => this._markSelected(d.value));
    this.on('state:jsonData', () => { this._stale = true; if (Structra.state.activeView === 'graph') this.renderGraph(); });
    this.on('view:switched', (view) => { if (view !== 'graph') return; if (this._stale) this.renderGraph(); else this._fitIfVisible(); });
    this.on('engine:ingested', () => { this._stale = true; if (Structra.state.activeView === 'graph') this.renderGraph(); });
    this.on('engine:filter-changed', () => { this._stale = true; if (Structra.state.activeView === 'graph') this.renderGraph(); });
  }

  render() {
    this.innerHTML = `
      <div class="graph-container" id="graphContainer">
        <div class="graph-zoom-toolbar">
          <button class="gz-btn" data-action="fit" title="Zoom to fit">
            ${Structra.icons.svg('scan', { size: 16 })}
          </button>
          <span class="gz-sep"></span>
          <button class="gz-btn" data-action="out" title="Zoom out">
            ${Structra.icons.svg('minus', { size: 16 })}
          </button>
          <span class="gz-level">100%</span>
          <button class="gz-btn" data-action="in" title="Zoom in">
            ${Structra.icons.svg('plus', { size: 16 })}
          </button>
          <span class="gz-sep"></span>
          <button class="gz-btn" data-action="reset" title="Reset to 100%">
            ${Structra.icons.svg('refresh-cw', { size: 16 })}
          </button>
        </div>
      </div>`;
    this._containerEl = this.$('#graphContainer');
    this._setupToolbar();
    this._setupInteraction();
    // The view changes size after it opens (the drawer, a window resize): until the person moves the graph, keep it fitted
    if (window.ResizeObserver) new ResizeObserver(() => { if (!this._userMoved && this._rootTree && this._containerEl.clientWidth) this._zoomToFit(1); }).observe(this._containerEl);
    this.renderGraph();
  }

  _markSelected(path) {
    if (!this._svgEl) return;
    this._svgEl.querySelectorAll('.graph-node-selected').forEach((r) => r.classList.remove('graph-node-selected'));
    const g = [...this._svgEl.querySelectorAll('g[data-path]')].find((n) => n.dataset.path === path);
    if (g) g.querySelector('rect').classList.add('graph-node-selected');
  }

  /* ---- Public ---- */
  renderGraph() {
    this._stale = false;
    const query = Structra.engine.getQuery();
    const dataset = Structra.engine.getActive();
    const data = query ? Structra.engine.getQueryData() : (dataset ? dataset.raw : Structra.state.jsonData);
    const container = this._containerEl;
    if (!container) return;

    // Remove old SVG
    const old = container.querySelector('.graph-svg');
    if (old) old.remove();

    if (!data) {
      container.insertAdjacentHTML('beforeend', '<p class="graph-empty" style="color:var(--text-muted);padding:var(--sp-4);position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)">Load JSON to see graph</p>');
      return;
    }
    const empty = container.querySelector('.graph-empty');
    if (empty) empty.remove();

    const maxDepth = parseInt(this.props.maxDepth, 10) || 4;
    this._rootTree = this._buildTree(data, 'root', 0, maxDepth);
    this._needsFit = true;
    this._userMoved = false;
    this._redraw();
    this._fitIfVisible();
  }

  /* ---- Tree Building ---- */
  _childPath(path, key) {
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) ? `${path}.${key}` : `${path}["${String(key).replace(/"/g, '\\"')}"]`;
  }

  _buildTree(val, key, depth, maxDepth, path = '$') {
    const C = StructraGraph;
    const node = { key, children: [], x: 0, y: 0, depth, sourceVal: val, path };

    if (val === null) {
      node.type = 'null'; node.label = key + ': null';
    } else if (Array.isArray(val)) {
      node.type = 'array';
      node.label = `${key} [${val.length}]`;
      if (depth < maxDepth) {
        const max = Math.min(val.length, 5);
        for (let i = 0; i < max; i++) node.children.push(this._buildTree(val[i], `[${i}]`, depth + 1, maxDepth, `${path}[${i}]`));
        if (val.length > 5) {
          node.children.push({ key: `+${val.length - 5}`, type: 'ellipsis', label: `+${val.length - 5} more`, children: [], x: 0, y: 0, depth: depth + 1, parentNode: node, expandFrom: max, expandSource: val });
        }
      } else {
        node.collapsed = true;
        node.label += ' ▸';
      }
    } else if (typeof val === 'object') {
      node.type = 'object';
      const keys = Object.keys(val);
      node.label = `${key} {${keys.length}}`;
      if (depth < maxDepth) {
        const max = Math.min(keys.length, 8);
        for (let i = 0; i < max; i++) node.children.push(this._buildTree(val[keys[i]], keys[i], depth + 1, maxDepth, this._childPath(path, keys[i])));
        if (keys.length > 8) {
          node.children.push({ key: `+${keys.length - 8}`, type: 'ellipsis', label: `+${keys.length - 8} more`, children: [], x: 0, y: 0, depth: depth + 1, parentNode: node, expandFrom: max, expandSource: val, expandKeys: keys });
        }
      } else {
        node.collapsed = true;
        node.label += ' ▸';
      }
    } else {
      node.type = typeof val;
      node.label = `${key}: ${String(val).slice(0, 20)}`;
    }
    return node;
  }

  /* ---- Layout ---- */
  _layoutTree(node, x, y) {
    const C = StructraGraph;
    node.x = x; node.y = y;
    if (!node.children.length) { node.height = C.NODE_H; return; }
    let childY = y;
    const childX = x + C.NODE_W + C.H_GAP;
    for (const child of node.children) { this._layoutTree(child, childX, childY); childY += this._subtreeH(child) + C.V_GAP; }
    const first = node.children[0], last = node.children[node.children.length - 1];
    node.y = (first.y + last.y) / 2;
  }

  _subtreeH(node) {
    const C = StructraGraph;
    if (!node.children.length) return C.NODE_H;
    let t = 0;
    for (let i = 0; i < node.children.length; i++) { t += this._subtreeH(node.children[i]); if (i < node.children.length - 1) t += C.V_GAP; }
    return t;
  }

  _getBounds(node) {
    let mx = node.x, my = node.y;
    for (const c of node.children) { const b = this._getBounds(c); mx = Math.max(mx, b.mx); my = Math.max(my, b.my); }
    return { mx, my };
  }

  /* ---- Drawing ---- */
  _redraw() {
    const C = StructraGraph;
    const container = this._containerEl;
    const old = container.querySelector('.graph-svg');
    if (old) old.remove();

    this._layoutTree(this._rootTree, 0, 0);
    this._treeBounds = this._getBounds(this._rootTree);

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.setAttribute('class', 'graph-svg');
    svg.innerHTML = `<g class="graph-group" transform="translate(${this._panX},${this._panY}) scale(${this._scale})"></g>`;
    container.appendChild(svg);
    this._svgEl = svg;

    const g = svg.querySelector('.graph-group');
    this._drawEdges(g, this._rootTree);
    this._drawNodes(g, this._rootTree);
  }

  /** A new graph opens centred and sized to the view, never magnified past its natural size */
  _fitIfVisible() {
    const c = this._containerEl;
    if (!this._needsFit || !c || !c.clientWidth || !c.clientHeight) return;
    this._needsFit = false;
    this._zoomToFit(1, 0.55);        // opening never shrinks below a readable 55 percent: the rest scrolls
  }

  _drawEdges(g, node) {
    const C = StructraGraph;
    for (const child of node.children) {
      const x1 = node.x + C.NODE_W, y1 = node.y + C.NODE_H / 2;
      const x2 = child.x, y2 = child.y + C.NODE_H / 2;
      const mx = (x1 + x2) / 2;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`);
      path.setAttribute('class', 'graph-edge-line');
      g.appendChild(path);
      this._drawEdges(g, child);
    }
  }

  _drawNodes(g, node) {
    const C = StructraGraph;
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.setAttribute('transform', `translate(${node.x},${node.y})`);

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('width', C.NODE_W);
    rect.setAttribute('height', C.NODE_H);
    rect.setAttribute('rx', '4');
    const clickable = node.type === 'ellipsis' || node.collapsed;
    rect.setAttribute('class', `graph-node graph-node-${node.type}${clickable ? ' graph-node-clickable' : ''}`);
    group.appendChild(rect);

    const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    title.textContent = node.label;
    group.appendChild(title);

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', '8');
    text.setAttribute('y', '18');
    text.setAttribute('class', `graph-text${clickable ? ' graph-text-clickable' : ''}`);
    text.textContent = node.label.length > 18 ? node.label.slice(0, 16) + '…' : node.label;
    group.appendChild(text);

    group.dataset.path = node.path || '';
    group.setAttribute('role', 'button');
    group.setAttribute('tabindex', '0');
    group.setAttribute('aria-label', node.label.replace(' ▸', '') + (node.collapsed ? ', collapsed, press Enter to open' : ''));
    group.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); group.dispatchEvent(new MouseEvent('click', { bubbles: true })); } });
    if (node.type === 'ellipsis') {
      group.style.cursor = 'pointer';
      group.addEventListener('click', e => { e.stopPropagation(); this._expandEllipsis(node); });
    } else {
      group.style.cursor = 'pointer';
      group.addEventListener('click', e => {
        e.stopPropagation();
        Structra.set('currentPath', node.path);
        Structra.events.emit('tree:node-selected', node.path);
        if (node.collapsed) this._expandCollapsed(node);
      });
    }
    if (node.path && node.path === Structra.state.currentPath) rect.classList.add('graph-node-selected');

    g.appendChild(group);
    for (const child of node.children) this._drawNodes(g, child);
  }

  /* ---- Expand ---- */
  _expandEllipsis(eNode) {
    const parent = eNode.parentNode;
    if (!parent) return;
    const src = eNode.expandSource;
    const from = eNode.expandFrom;
    const maxDepth = parseInt(this.props.maxDepth, 10) || 4;
    parent.children = parent.children.filter(c => c !== eNode);

    if (Array.isArray(src)) {
      for (let i = from; i < src.length; i++) parent.children.push(this._buildTree(src[i], `[${i}]`, parent.depth + 1, maxDepth, `${parent.path}[${i}]`));
    } else {
      const keys = eNode.expandKeys || Object.keys(src);
      for (let i = from; i < keys.length; i++) parent.children.push(this._buildTree(src[keys[i]], keys[i], parent.depth + 1, maxDepth, this._childPath(parent.path, keys[i])));
    }
    this._redraw();
  }

  _expandCollapsed(node) {
    const val = node.sourceVal;
    if (!val || typeof val !== 'object') return;
    const maxDepth = parseInt(this.props.maxDepth, 10) || 4;
    node.collapsed = false;
    node.label = node.label.replace(' ▸', '');

    if (Array.isArray(val)) {
      const max = Math.min(val.length, 5);
      for (let i = 0; i < max; i++) node.children.push(this._buildTree(val[i], `[${i}]`, node.depth + 1, maxDepth, `${node.path}[${i}]`));
      if (val.length > 5) node.children.push({ key: `+${val.length - 5}`, type: 'ellipsis', label: `+${val.length - 5} more`, children: [], x: 0, y: 0, depth: node.depth + 1, parentNode: node, expandFrom: max, expandSource: val });
    } else {
      const keys = Object.keys(val);
      const max = Math.min(keys.length, 8);
      for (let i = 0; i < max; i++) node.children.push(this._buildTree(val[keys[i]], keys[i], node.depth + 1, maxDepth, this._childPath(node.path, keys[i])));
      if (keys.length > 8) node.children.push({ key: `+${keys.length - 8}`, type: 'ellipsis', label: `+${keys.length - 8} more`, children: [], x: 0, y: 0, depth: node.depth + 1, parentNode: node, expandFrom: max, expandSource: val, expandKeys: keys });
    }
    this._redraw();
  }

  /* ---- Zoom / Pan ---- */
  _setupInteraction() {
    const container = this._containerEl;
    const C = StructraGraph;

    container.addEventListener('wheel', e => {
      e.preventDefault();
      this._userMoved = true;
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.max(C.ZOOM_MIN, Math.min(C.ZOOM_MAX, this._scale * delta));
      const rect = container.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      this._panX = mx - (mx - this._panX) * (newScale / this._scale);
      this._panY = my - (my - this._panY) * (newScale / this._scale);
      this._scale = newScale;
      this._updateTransform();
    }, { passive: false });

    container.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      if (e.target.closest('[style*="cursor: pointer"]') || e.target.closest('.gz-btn')) return;
      this._dragging = true;
      this._userMoved = true;
      this._dragStartX = e.clientX - this._panX;
      this._dragStartY = e.clientY - this._panY;
      container.style.cursor = 'grabbing';
    });
    container.addEventListener('mousemove', e => {
      if (!this._dragging) return;
      this._panX = e.clientX - this._dragStartX;
      this._panY = e.clientY - this._dragStartY;
      this._updateTransform();
    });
    const stopDrag = () => { this._dragging = false; container.style.cursor = ''; };
    container.addEventListener('mouseup', stopDrag);
    container.addEventListener('mouseleave', stopDrag);
  }

  _updateTransform() {
    const g = this._svgEl?.querySelector('.graph-group');
    if (g) g.setAttribute('transform', `translate(${this._panX},${this._panY}) scale(${this._scale})`);
    this._updateZoomLabel();
  }

  _updateZoomLabel() {
    const el = this._containerEl?.querySelector('.gz-level');
    if (el) el.textContent = Math.round(this._scale * 100) + '%';
  }

  _zoomIn() { this._userMoved = true; const C = StructraGraph; this._scale = Math.min(C.ZOOM_MAX, this._scale + C.ZOOM_STEP); this._updateTransform(); }
  _zoomOut() { this._userMoved = true; const C = StructraGraph; this._scale = Math.max(C.ZOOM_MIN, this._scale - C.ZOOM_STEP); this._updateTransform(); }
  _zoomReset() { this._userMoved = true; this._scale = 1; this._panX = 20; this._panY = 20; this._updateTransform(); }

  _zoomToFit(maxScale, readableFloor) {
    const C = StructraGraph;
    const container = this._containerEl;
    if (!container || !this._treeBounds) return;
    const cw = container.clientWidth, ch = container.clientHeight;
    const contentW = this._treeBounds.mx + C.NODE_W + 40;
    const contentH = this._treeBounds.my + C.NODE_H + 40;
    if (!contentW || !contentH) return;
    const scaleX = cw / contentW, scaleY = ch / contentH;
    this._scale = Math.max(readableFloor || C.ZOOM_MIN, C.ZOOM_MIN, Math.min(maxScale || C.ZOOM_MAX, Math.min(scaleX, scaleY) * 0.9));
    // Content larger than the view starts at its top left; smaller content is centred
    this._panX = contentW * this._scale > cw ? 20 : (cw - contentW * this._scale) / 2;
    this._panY = contentH * this._scale > ch ? 20 : (ch - contentH * this._scale) / 2;
    this._updateTransform();
  }

  _setupToolbar() {
    this._containerEl.querySelector('.graph-zoom-toolbar').addEventListener('click', e => {
      const btn = e.target.closest('.gz-btn');
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === 'fit') this._zoomToFit();
      else if (action === 'in') this._zoomIn();
      else if (action === 'out') this._zoomOut();
      else if (action === 'reset') this._zoomReset();
    });
  }
}

customElements.define('structra-graph', StructraGraph);
