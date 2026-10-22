/* ============================================================
   STRUCTRA V2 — Drawer Stats Component (Edit-Mode Compact Strip)
   <structra-drawer-stats> — mini stats panel inside drawer "Analyze" tab

   Shows: mini-grid (rows/keys/gaps), quick quality bar, clickable
   field list. Renders into the drawer's #dp-analyze panel.
   ============================================================ */

class StructraDrawerStats extends StructraElement {
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
    const root = this.$('#dsRoot');
    if (!root) return;

    const dataset = Structra.engine.getActive();
    const data = dataset ? dataset.raw : Structra.state.jsonData;
    if (!data) {
      root.innerHTML = '<p class="ds-empty">Load data to see analysis</p>';
      return;
    }

    const analysis = await Structra.engine.getAnalysis();
    if (!analysis) return;
    const { stats: s, firstArr, profile, gaps } = analysis;
    const q = profile ? profile.quality : null;
    const rows = firstArr ? firstArr.rows.length : 0;

    let html = '';

    // Mini grid
    html += `<div class="ds-mini-grid">
      <div class="ds-mini"><span class="ds-mini-val">${s.totalNodes.toLocaleString()}</span><span class="ds-mini-label">Nodes</span></div>
      <div class="ds-mini"><span class="ds-mini-val">${s.keys.toLocaleString()}</span><span class="ds-mini-label">Keys</span></div>
      <div class="ds-mini"><span class="ds-mini-val">${rows}</span><span class="ds-mini-label">Rows</span></div>
      <div class="ds-mini"><span class="ds-mini-val">${gaps}</span><span class="ds-mini-label">Gaps</span></div>
      <div class="ds-mini"><span class="ds-mini-val">${s.nulls}</span><span class="ds-mini-label">Nulls</span></div>
      <div class="ds-mini"><span class="ds-mini-val">${s.depth}</span><span class="ds-mini-label">Depth</span></div>
    </div>`;

    // Quality bar (if available)
    if (q) {
      const color = q.overall >= 80 ? 'var(--success)' : q.overall >= 50 ? 'var(--warning)' : 'var(--danger)';
      html += `<div class="ds-quality">
        <div class="ds-q-header"><span>Data Quality</span><span class="ds-q-score" style="color:${color}">${q.overall}%</span></div>
        <div class="ds-q-track"><div class="ds-q-fill" style="width:${q.overall}%;background:${color}"></div></div>
        <div class="ds-q-detail">
          <span>Completeness ${q.completeness}%</span>
          <span>Consistency ${q.consistency}%</span>
          <span>Uniqueness ${q.uniqueness}%</span>
        </div>
      </div>`;
    }

    // Type summary (compact)
    const types = [
      { l: 'str', c: s.strings, cl: 'var(--syn-string)' },
      { l: 'num', c: s.numbers, cl: 'var(--syn-number)' },
      { l: 'bool', c: s.booleans, cl: 'var(--syn-boolean)' },
      { l: 'null', c: s.nulls, cl: 'var(--syn-null)' },
      { l: 'obj', c: s.objects, cl: 'var(--syn-key)' },
      { l: 'arr', c: s.arrays, cl: 'var(--accent)' },
    ].filter(t => t.c > 0);
    if (types.length > 0) {
      html += '<div class="ds-types">';
      for (const t of types) {
        html += `<span class="ds-type-tag" style="border-color:${t.cl}"><span style="color:${t.cl}">${t.c}</span> ${t.l}</span>`;
      }
      html += '</div>';
    }

    // Quick actions
    html += `<div class="ds-actions">
      <button class="ds-action-btn" data-action="open-overview">Open Overview</button>
      <button class="ds-action-btn" data-action="open-profiler">Field Profiler ↗</button>
    </div>`;

    root.innerHTML = html;
  }

  connectedCallback() {
    super.connectedCallback();
    this.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      if (btn.dataset.action === 'open-overview') {
        Structra.set('activeView', 'overview');
      } else if (btn.dataset.action === 'open-profiler') {
        Structra.set('activeView', 'overview');
        // Scroll to profiler section after view switch
        requestAnimationFrame(() => {
          const prof = document.querySelector('.profiler-table');
          if (prof) prof.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
    });
  }

}

customElements.define('structra-drawer-stats', StructraDrawerStats);
