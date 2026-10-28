/* ============================================================
   STRUCTRA V2 - Graph View Component
   <structra-graph> - SVG node graph with zoom/pan/expand

   Wiring (generated from the code below; update it when you add or remove an event):
     Listens to: state:currentPath, state:jsonData, view:switched, engine:ingested,
          engine:filter-changed
     Emits: tree:node-selected
     Sets state: currentPath
   ============================================================ */

class StructraGraph extends StructraComponent {
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

    this.on('state:currentPath', (change) => this._markSelected(change.value));
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
    this._containerEl = this.queryOne('#graphContainer');
    this._setupToolbar();
    this._setupInteraction();
    // The view changes size after it opens (the drawer, a window resize): until the person moves the graph, keep it fitted
    if (window.ResizeObserver) new ResizeObserver(() => { if (!this._userMoved && this._rootTree && this._containerEl.clientWidth) this._zoomToFit(1); }).observe(this._containerEl);
    this.renderGraph();
  }

  _markSelected(path) {
    if (!this._svgEl) return;
    this._svgEl.querySelectorAll('.graph-node-selected').forEach((element) => element.classList.remove('graph-node-selected'));
    const group = [...this._svgEl.querySelectorAll('g[data-path]')].find((element) => element.dataset.path === path);
    if (group) group.querySelector('rect').classList.add('graph-node-selected');
  }

  /* ---- Public ---- */
  renderGraph() {
    this._stale = false;
    const query = Structra.dataEngine.getQuery();
    const dataset = Structra.dataEngine.getActive();
    const data = query ? Structra.dataEngine.getQueryData() : (dataset ? dataset.raw : Structra.state.jsonData);
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
    return Structra.dataPaths.child(path, key);
  }

  _buildTree(value, key, depth, maxDepth, path = '$') {
    const node = { key, children: [], x: 0, y: 0, depth, sourceVal: value, path };

    if (value === null) {
      node.type = 'null'; node.label = key + ': null';
    } else if (Array.isArray(value)) {
      node.type = 'array';
      node.label = `${key} [${value.length}]`;
      if (depth < maxDepth) {
        const max = Math.min(value.length, 5);
        for (let i = 0; i < max; i++) node.children.push(this._buildTree(value[i], `[${i}]`, depth + 1, maxDepth, `${path}[${i}]`));
        if (value.length > 5) {
          node.children.push({ key: `+${value.length - 5}`, type: 'ellipsis', label: `+${value.length - 5} more`, children: [], x: 0, y: 0, depth: depth + 1, parentNode: node, expandFrom: max, expandSource: value });
        }
      } else {
        node.collapsed = true;
        node.label += ' ▸';
      }
    } else if (typeof value === 'object') {
      node.type = 'object';
      const keys = Object.keys(value);
      node.label = `${key} {${keys.length}}`;
      if (depth < maxDepth) {
        const max = Math.min(keys.length, 8);
        for (let i = 0; i < max; i++) node.children.push(this._buildTree(value[keys[i]], keys[i], depth + 1, maxDepth, this._childPath(path, keys[i])));
        if (keys.length > 8) {
          node.children.push({ key: `+${keys.length - 8}`, type: 'ellipsis', label: `+${keys.length - 8} more`, children: [], x: 0, y: 0, depth: depth + 1, parentNode: node, expandFrom: max, expandSource: value, expandKeys: keys });
        }
      } else {
        node.collapsed = true;
        node.label += ' ▸';
      }
    } else {
      node.type = typeof value;
      node.label = `${key}: ${String(value).slice(0, 20)}`;
    }
    return node;
  }

  /* ---- Layout ---- */
  _layoutTree(node, x, y) {
    const Graph = StructraGraph;
    node.x = x; node.y = y;
    if (!node.children.length) { node.height = Graph.NODE_H; return; }
    let childY = y;
    const childX = x + Graph.NODE_W + Graph.H_GAP;
    for (const child of node.children) { this._layoutTree(child, childX, childY); childY += this._subtreeH(child) + Graph.V_GAP; }
    const first = node.children[0], last = node.children[node.children.length - 1];
    node.y = (first.y + last.y) / 2;
  }

  _subtreeH(node) {
    const Graph = StructraGraph;
    if (!node.children.length) return Graph.NODE_H;
    let total = 0;
    for (let i = 0; i < node.children.length; i++) { total += this._subtreeH(node.children[i]); if (i < node.children.length - 1) total += Graph.V_GAP; }
    return total;
  }

  _getBounds(node) {
    let maxX = node.x, maxY = node.y;
    for (const child of node.children) { const bounds = this._getBounds(child); maxX = Math.max(maxX, bounds.mx); maxY = Math.max(maxY, bounds.my); }
    return { mx: maxX, my: maxY };
  }

  /* ---- Drawing ---- */
  _redraw() {
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

    const group = svg.querySelector('.graph-group');
    this._drawEdges(group, this._rootTree);
    this._drawNodes(group, this._rootTree);
  }

  /** A new graph opens centred and sized to the view, never magnified past its natural size */
  _fitIfVisible() {
    const container = this._containerEl;
    if (!this._needsFit || !container || !container.clientWidth || !container.clientHeight) return;
    this._needsFit = false;
    this._zoomToFit(1, 0.55);        // opening never shrinks below a readable 55 percent: the rest scrolls
  }

  _drawEdges(group, node) {
    const Graph = StructraGraph;
    for (const child of node.children) {
      const startX = node.x + Graph.NODE_W, startY = node.y + Graph.NODE_H / 2;
      const endX = child.x, endY = child.y + Graph.NODE_H / 2;
      const middleX = (startX + endX) / 2;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M${startX},${startY} C${middleX},${startY} ${middleX},${endY} ${endX},${endY}`);
      path.setAttribute('class', 'graph-edge-line');
      group.appendChild(path);
      this._drawEdges(group, child);
    }
  }

  _drawNodes(groupElement, node) {
    const Graph = StructraGraph;
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.setAttribute('transform', `translate(${node.x},${node.y})`);

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('width', Graph.NODE_W);
    rect.setAttribute('height', Graph.NODE_H);
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
    group.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); group.dispatchEvent(new MouseEvent('click', { bubbles: true })); } });
    if (node.type === 'ellipsis') {
      group.style.cursor = 'pointer';
      group.addEventListener('click', event => { event.stopPropagation(); this._expandEllipsis(node); });
    } else {
      group.style.cursor = 'pointer';
      group.addEventListener('click', event => {
        event.stopPropagation();
        Structra.setState('currentPath', node.path);
        Structra.events.emit('tree:node-selected', node.path);
        if (node.collapsed) this._expandCollapsed(node);
      });
    }
    if (node.path && node.path === Structra.state.currentPath) rect.classList.add('graph-node-selected');

    groupElement.appendChild(group);
    for (const child of node.children) this._drawNodes(groupElement, child);
  }

  /* ---- Expand ---- */
  _expandEllipsis(eNode) {
    const parent = eNode.parentNode;
    if (!parent) return;
    const source = eNode.expandSource;
    const from = eNode.expandFrom;
    const maxDepth = parseInt(this.props.maxDepth, 10) || 4;
    parent.children = parent.children.filter(node => node !== eNode);

    if (Array.isArray(source)) {
      for (let i = from; i < source.length; i++) parent.children.push(this._buildTree(source[i], `[${i}]`, parent.depth + 1, maxDepth, `${parent.path}[${i}]`));
    } else {
      const keys = eNode.expandKeys || Object.keys(source);
      for (let i = from; i < keys.length; i++) parent.children.push(this._buildTree(source[keys[i]], keys[i], parent.depth + 1, maxDepth, this._childPath(parent.path, keys[i])));
    }
    this._redraw();
  }

  _expandCollapsed(node) {
    const value = node.sourceVal;
    if (!value || typeof value !== 'object') return;
    const maxDepth = parseInt(this.props.maxDepth, 10) || 4;
    node.collapsed = false;
    node.label = node.label.replace(' ▸', '');

    if (Array.isArray(value)) {
      const max = Math.min(value.length, 5);
      for (let i = 0; i < max; i++) node.children.push(this._buildTree(value[i], `[${i}]`, node.depth + 1, maxDepth, `${node.path}[${i}]`));
      if (value.length > 5) node.children.push({ key: `+${value.length - 5}`, type: 'ellipsis', label: `+${value.length - 5} more`, children: [], x: 0, y: 0, depth: node.depth + 1, parentNode: node, expandFrom: max, expandSource: value });
    } else {
      const keys = Object.keys(value);
      const max = Math.min(keys.length, 8);
      for (let i = 0; i < max; i++) node.children.push(this._buildTree(value[keys[i]], keys[i], node.depth + 1, maxDepth, this._childPath(node.path, keys[i])));
      if (keys.length > 8) node.children.push({ key: `+${keys.length - 8}`, type: 'ellipsis', label: `+${keys.length - 8} more`, children: [], x: 0, y: 0, depth: node.depth + 1, parentNode: node, expandFrom: max, expandSource: value, expandKeys: keys });
    }
    this._redraw();
  }

  /* ---- Zoom / Pan ---- */
  _setupInteraction() {
    const container = this._containerEl;
    const Graph = StructraGraph;

    container.addEventListener('wheel', event => {
      event.preventDefault();
      this._userMoved = true;
      const delta = event.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.max(Graph.ZOOM_MIN, Math.min(Graph.ZOOM_MAX, this._scale * delta));
      const rect = container.getBoundingClientRect();
      const mouseX = event.clientX - rect.left, mouseY = event.clientY - rect.top;
      this._panX = mouseX - (mouseX - this._panX) * (newScale / this._scale);
      this._panY = mouseY - (mouseY - this._panY) * (newScale / this._scale);
      this._scale = newScale;
      this._updateTransform();
    }, { passive: false });

    container.addEventListener('mousedown', event => {
      if (event.button !== 0) return;
      if (event.target.closest('[style*="cursor: pointer"]') || event.target.closest('.gz-btn')) return;
      this._dragging = true;
      this._userMoved = true;
      this._dragStartX = event.clientX - this._panX;
      this._dragStartY = event.clientY - this._panY;
      container.style.cursor = 'grabbing';
    });
    container.addEventListener('mousemove', event => {
      if (!this._dragging) return;
      this._panX = event.clientX - this._dragStartX;
      this._panY = event.clientY - this._dragStartY;
      this._updateTransform();
    });
    const stopDrag = () => { this._dragging = false; container.style.cursor = ''; };
    container.addEventListener('mouseup', stopDrag);
    container.addEventListener('mouseleave', stopDrag);
  }

  _updateTransform() {
    const group = this._svgEl?.querySelector('.graph-group');
    if (group) group.setAttribute('transform', `translate(${this._panX},${this._panY}) scale(${this._scale})`);
    this._updateZoomLabel();
  }

  _updateZoomLabel() {
    const element = this._containerEl?.querySelector('.gz-level');
    if (element) element.textContent = Math.round(this._scale * 100) + '%';
  }

  _zoomIn() { this._userMoved = true; const Graph = StructraGraph; this._scale = Math.min(Graph.ZOOM_MAX, this._scale + Graph.ZOOM_STEP); this._updateTransform(); }
  _zoomOut() { this._userMoved = true; const Graph = StructraGraph; this._scale = Math.max(Graph.ZOOM_MIN, this._scale - Graph.ZOOM_STEP); this._updateTransform(); }
  _zoomReset() { this._userMoved = true; this._scale = 1; this._panX = 20; this._panY = 20; this._updateTransform(); }

  _zoomToFit(maxScale, readableFloor) {
    const Graph = StructraGraph;
    const container = this._containerEl;
    if (!container || !this._treeBounds) return;
    const containerWidth = container.clientWidth, containerHeight = container.clientHeight;
    const contentW = this._treeBounds.mx + Graph.NODE_W + 40;
    const contentH = this._treeBounds.my + Graph.NODE_H + 40;
    if (!contentW || !contentH) return;
    const scaleX = containerWidth / contentW, scaleY = containerHeight / contentH;
    this._scale = Math.max(readableFloor || Graph.ZOOM_MIN, Graph.ZOOM_MIN, Math.min(maxScale || Graph.ZOOM_MAX, Math.min(scaleX, scaleY) * 0.9));
    // Content larger than the view starts at its top left; smaller content is centred
    this._panX = contentW * this._scale > containerWidth ? 20 : (containerWidth - contentW * this._scale) / 2;
    this._panY = contentH * this._scale > containerHeight ? 20 : (containerHeight - contentH * this._scale) / 2;
    this._updateTransform();
  }

  _setupToolbar() {
    this._containerEl.querySelector('.graph-zoom-toolbar').addEventListener('click', event => {
      const button = event.target.closest('.gz-btn');
      if (!button) return;
      const action = button.dataset.action;
      if (action === 'fit') this._zoomToFit();
      else if (action === 'in') this._zoomIn();
      else if (action === 'out') this._zoomOut();
      else if (action === 'reset') this._zoomReset();
    });
  }
}

customElements.define('structra-graph', StructraGraph);
