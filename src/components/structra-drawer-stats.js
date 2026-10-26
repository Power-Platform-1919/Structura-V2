/* ============================================================
   STRUCTRA V2 - Drawer Stats Component (Edit-Mode Compact Strip)
   <structra-drawer-stats> - mini stats panel inside drawer "Analyze" tab

   Shows: mini-grid (rows/keys/gaps), quick quality bar, clickable
   field list. Renders into the drawer's #dp-analyze panel.

   Wiring (generated from the code below; update it when you add or remove an event):
     Listens to: engine:ingested, state:jsonData, engine:active, engine:data-modified,
          drawer:tab-switched
     Sets state: activeView
   ============================================================ */

class StructraDrawerStats extends StructraComponent {
  init() {
    this._stale = true;
    this._renderTimer = null;
    this.on('engine:ingested', () => { this._stale = true; this._debouncedRender(); });
    this.on('state:jsonData', () => { this._stale = true; this._debouncedRender(); });
    this.on('engine:active', () => { this._stale = true; this._debouncedRender(); });
    this.on('engine:data-modified', () => { this._stale = true; this._debouncedRender(); });
    this.on('drawer:tab-switched', (id) => {
      if (id === 'analyze' && this._stale) this._renderContent();
    });
  }

  render() {
    this.innerHTML = '<div class="ds-root" id="dsRoot"></div>';
    this._tryRender();
  }

  _debouncedRender() {
    if (this._renderTimer) clearTimeout(this._renderTimer);
    this._renderTimer = setTimeout(() => this._tryRender(), 16);
  }

  _tryRender() {
    // Only render if the analyze tab is active (or first load)
    const panel = this.closest('.drawer-panel');
    if (panel && !panel.classList.contains('active')) return;
    this._renderContent();
  }

  async _renderContent() {
    this._stale = false;
    const root = this.queryOne('#dsRoot');
    if (!root) return;

    const dataset = Structra.dataEngine.getActive();
    const data = dataset ? dataset.raw : Structra.state.jsonData;
    if (!data) {
      root.innerHTML = '<p class="ds-empty">Load data to see analysis</p>';
      return;
    }

    const analysis = await Structra.dataEngine.getAnalysis();
    if (!analysis) return;
    const { stats, firstArr: firstArray, profile, gaps } = analysis;
    const quality = profile ? profile.quality : null;
    const rows = firstArray ? firstArray.rows.length : 0;

    let html = '';

    // Mini grid
    html += `<div class="ds-mini-grid">
      <div class="ds-mini"><span class="ds-mini-val">${stats.totalNodes.toLocaleString()}</span><span class="ds-mini-label">Nodes</span></div>
      <div class="ds-mini"><span class="ds-mini-val">${stats.keys.toLocaleString()}</span><span class="ds-mini-label">Keys</span></div>
      <div class="ds-mini"><span class="ds-mini-val">${rows}</span><span class="ds-mini-label">Rows</span></div>
      <div class="ds-mini"><span class="ds-mini-val">${gaps}</span><span class="ds-mini-label">Gaps</span></div>
      <div class="ds-mini"><span class="ds-mini-val">${stats.nulls}</span><span class="ds-mini-label">Nulls</span></div>
      <div class="ds-mini"><span class="ds-mini-val">${stats.depth}</span><span class="ds-mini-label">Depth</span></div>
    </div>`;

    // Quality bar (if available)
    if (quality) {
      const color = quality.overall >= 80 ? 'var(--success-ink)' : quality.overall >= 50 ? 'var(--warning-ink)' : 'var(--danger-ink)';       // readable on the panel in every theme
      html += `<div class="ds-quality">
        <div class="ds-q-header"><span>Data Quality</span><span class="ds-q-score" style="color:${color}">${quality.overall}%</span></div>
        <div class="ds-q-track"><div class="ds-q-fill" style="width:${quality.overall}%;background:${color}"></div></div>
        <div class="ds-q-detail">
          <span>Completeness ${quality.completeness}%</span>
          <span>Consistency ${quality.consistency}%</span>
          <span>Uniqueness ${quality.uniqueness}%</span>
        </div>
      </div>`;
    }

    // Type summary (compact)
    const types = [
      { l: 'str', c: stats.strings, cl: 'var(--syn-string)' },
      { l: 'num', c: stats.numbers, cl: 'var(--syn-number)' },
      { l: 'bool', c: stats.booleans, cl: 'var(--syn-boolean)' },
      { l: 'null', c: stats.nulls, cl: 'var(--syn-null)' },
      { l: 'obj', c: stats.objects, cl: 'var(--syn-key)' },
      { l: 'arr', c: stats.arrays, cl: 'var(--accent)' },
    ].filter(tile => tile.c > 0);
    if (types.length > 0) {
      html += '<div class="ds-types">';
      for (const tile of types) {
        html += `<span class="ds-type-tag" style="border-color:${tile.cl}"><span style="color:${tile.cl}">${tile.c}</span> ${tile.l}</span>`;
      }
      html += '</div>';
    }

    // Quick actions
    html += `<div class="ds-actions">
      <button class="ds-action-btn" data-action="open-profiler">Field Profiler ↗</button>
    </div>`;

    root.innerHTML = html;
  }

  connectedCallback() {
    super.connectedCallback();
    this.addEventListener('click', (event) => {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      if (button.dataset.action === 'open-overview') {
        Structra.setState('activeView', 'overview');
      } else if (button.dataset.action === 'open-profiler') {
        Structra.setState('activeView', 'overview');
        // Scroll to profiler section after view switch
        requestAnimationFrame(() => {
          const profile = document.querySelector('.profiler-table');
          if (profile) profile.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
    });
  }

}

customElements.define('structra-drawer-stats', StructraDrawerStats);
