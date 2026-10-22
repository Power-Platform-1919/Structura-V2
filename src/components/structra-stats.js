/* ============================================================
   STRUCTRA V2 — Stats View Component (Read-Only Full View)
   <structra-stats> — comprehensive data analytics dashboard

   Sections:
   1. Hero cards (rows, keys, gaps, depth, nulls, size)
   2. Type distribution (bar chart pills)
   3. Data quality score (donut + completeness/consistency/uniqueness)
   4. Arrays found (clickable paths, drill-into)
   5. Key coverage table (present/empty/missing %, nested drill)
   6. Field profiler (type, coverage, min/max/avg, top values)

   All data from Structra.engine — zero window.App, zero DOM queries
   ============================================================ */

class StructraStats extends StructraElement {
  static get observedAttributes() { return ['compact']; }

  init() {
    this._stale = false;
    this._currentArr = null;  // {path, rows} — active array for coverage
    this._drillStack = [];    // for drill-back

    this.on('state:jsonData', () => {
      this._stale = true;
      this._drillStack = [];
      if (Structra.state.activeView === 'stats') this.renderStats();
    });
    this.on('view:switched', (view) => {
      if (view === 'stats' && this._stale) this.renderStats();
    });
    this.on('engine:ingested', () => {
      this._stale = true;
      this._drillStack = [];
      if (Structra.state.activeView === 'stats') this.renderStats();
    });
    this.on('engine:duckdb-registered', () => {
      this._stale = true;
      if (Structra.state.activeView === 'stats') this.renderStats();
    });
  }

  render() {
    this.innerHTML = '<div class="stats-view" id="statsContainer"></div>';
    this.renderStats();

    // Single event-delegated click handler
    this.addEventListener('click', (e) => this._onClick(e));
  }

  /* ====================================================
     RENDER
     ==================================================== */

  async renderStats() {
    this._stale = false;
    const t0 = performance.now();
    const container = this.$('#statsContainer');
    if (!container) return;

    const dataset = Structra.engine.getActive();
    const data = dataset ? dataset.raw : Structra.state.jsonData;
    if (!data) {
      container.innerHTML = '<p style="color:var(--text-muted);padding:var(--sp-4)">Load JSON to see stats</p>';
      return;
    }

    // Prefer DuckDB-powered analyze (falls back to in-memory internally)
    const s = await Structra.engine.analyzeDb() || Structra.engine.analyze(data);
    const fileSize = Structra.engine.formatSize(dataset ? dataset.meta.fileSize : Structra.state.fileSize);
    let html = '';

    // Source badge
    const src = s.source === 'duckdb' ? '🦆 DuckDB' : '🧠 In-Memory';
    html += `<div class="stats-source-badge" style="text-align:right;padding:4px 12px;font-size:11px;color:var(--text-muted)">Engine: ${src}</div>`;

    // 1. Hero cards
    html += this._renderHero(s, fileSize);

    // 2. Type distribution
    html += this._renderTypes(s);

    // 3. Data quality (for array datasets)
    const firstArr = Structra.engine.findFirstObjectArray(data);
    if (firstArr) {
      this._currentArr = firstArr;
      const profile = await Structra.engine.profileFields(firstArr.rows);
      if (profile) {
        html += this._renderQuality(profile.quality);
      }

      // 4. Arrays found
      html += this._renderArraysFound(s.arraysDetail);

      // 5. Key coverage
      html += this._renderKeyCoverage(firstArr.path, firstArr.rows, []);

      // 6. Field profiler table
      if (profile) {
        html += this._renderProfiler(profile);
      }

      // 7. Distribution analysis (column value distribution)
      html += await this._renderDistribution(firstArr.rows);
    } else {
      html += this._renderArraysFound(s.arraysDetail);
    }

    container.innerHTML = html;
    Structra.log.perf('Stats', 'renderStats()', performance.now() - t0);
    // Signal that analysis + rendering is complete (used by loading overlay)
    Structra.events.emit('engine:analysisComplete');
  }

  /* ====================================================
     HERO CARDS
     ==================================================== */

  _renderHero(s, fileSize) {
    const gap = this._currentArr ? Structra.engine.countGaps(this._currentArr.rows) : 0;
    let longest = 0;
    if (s.arraysDetail && s.arraysDetail.length > 0) {
      for (let i = 0; i < s.arraysDetail.length; i++) {
        if (s.arraysDetail[i].count > longest) longest = s.arraysDetail[i].count;
      }
    }
    return `<div class="stats-hero">
      ${this._heroCard(s.totalNodes, 'Total Nodes', 'all values')}
      ${this._heroCard(s.keys, 'Total Keys', 'across objects')}
      ${this._heroCard(s.depth, 'Max Depth', 'nesting levels')}
      ${this._heroCard(s.arrays, 'Arrays', s.arraysDetail.length > 0 ? `longest: ${longest}` : 'none')}
      ${this._heroCard(s.nulls, 'Nulls', s.nulls > 0 ? '⚠ found' : 'none')}
      ${this._heroCard(fileSize, 'Size', 'file size')}
    </div>`;
  }

  _heroCard(value, label, sub) {
    return `<div class="hero-card"><div class="hc-value">${value}</div><div class="hc-label">${label}</div><div class="hc-sub">${sub}</div></div>`;
  }

  /* ====================================================
     TYPE DISTRIBUTION
     ==================================================== */

  _renderTypes(s) {
    const types = [
      { label: 'Strings',  count: s.strings,  color: 'var(--info)' },
      { label: 'Numbers',  count: s.numbers,  color: '#8b5cf6' },
      { label: 'Booleans', count: s.booleans, color: 'var(--warning)' },
      { label: 'Nulls',    count: s.nulls,    color: 'var(--danger)' },
      { label: 'Objects',  count: s.objects,   color: 'var(--success)' },
      { label: 'Arrays',   count: s.arrays,   color: '#0891b2' },
    ];
    let maxType = 1;
    for (let i = 0; i < types.length; i++) { if (types[i].count > maxType) maxType = types[i].count; }
    let html = '<div class="stats-section"><div class="stats-section-title">Type Distribution</div><div class="type-pills">';
    types.forEach(t => {
      if (t.count > 0) {
        const pct = Math.round(t.count / maxType * 100);
        html += `<div class="type-pill"><span class="tp-count">${t.count.toLocaleString()}</span> ${t.label}<span class="tp-bar"><span class="tp-fill" style="width:${pct}%;background:${t.color}"></span></span></div>`;
      }
    });
    html += '</div></div>';
    return html;
  }

  /* ====================================================
     DATA QUALITY SCORE
     ==================================================== */

  _renderQuality(q) {
    if (!q) return '';
    const color = q.overall >= 80 ? '#22c55e' : q.overall >= 50 ? '#f59e0b' : '#ef4444';
    const barColor = (v) => v >= 80 ? '#22c55e' : v >= 50 ? '#f59e0b' : '#ef4444';

    let html = `<div class="stats-section"><div class="stats-section-title">Data Quality</div>
      <div class="pf-quality">
        <div class="pf-q-score">
          <svg viewBox="0 0 36 36" class="pf-q-ring">
            <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none" stroke="var(--border)" stroke-width="2.5"/>
            <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none" stroke="${color}" stroke-width="2.5"
              stroke-dasharray="${q.overall}, 100" stroke-linecap="round"/>
          </svg>
          <span class="pf-q-num" style="color:${color}">${q.overall}</span>
        </div>
        <div class="pf-q-bars">
          <div class="pf-q-bar-row"><span class="pf-q-label">Completeness</span>
            <div class="pf-q-track"><div class="pf-q-fill" style="width:${q.completeness}%;background:${barColor(q.completeness)}"></div></div>
            <span class="pf-q-val">${q.completeness}%</span></div>
          <div class="pf-q-bar-row"><span class="pf-q-label">Consistency</span>
            <div class="pf-q-track"><div class="pf-q-fill" style="width:${q.consistency}%;background:${barColor(q.consistency)}"></div></div>
            <span class="pf-q-val">${q.consistency}%</span></div>
          <div class="pf-q-bar-row"><span class="pf-q-label">Uniqueness</span>
            <div class="pf-q-track"><div class="pf-q-fill" style="width:${q.uniqueness}%;background:${barColor(q.uniqueness)}"></div></div>
            <span class="pf-q-val">${q.uniqueness}%</span></div>
        </div>
        ${q.issues.length > 0 ? `<div class="pf-q-issues"><span class="pf-q-issues-title">Top Issues</span>${q.issues.map(i =>
          `<div class="pf-q-issue pf-q-issue-${i.severity}"><span class="pf-q-issue-field">${this._esc(i.field)}</span> ${this._esc(i.msg)}</div>`
        ).join('')}</div>` : ''}
      </div></div>`;
    return html;
  }

  /* ====================================================
     ARRAYS FOUND — Tabbed with Virtual Scroll
     ==================================================== */

  _renderArraysFound(arraysDetail) {
    if (!arraysDetail || arraysDetail.length === 0) return '';

    // Group by schema path (normalize indices → [*])
    const groups = this._groupArraysBySchema(arraysDetail);
    const total = arraysDetail.length;

    // Cache for tab switching
    this._arraysDetail = arraysDetail;
    this._arraysGroups = groups;

    let html = `<div class="stats-section" id="arraysSection">
      <div class="stats-section-title">Arrays Found (${total.toLocaleString()})</div>
      <div class="arr-tabs">
        <button class="arr-tab arr-tab-active" data-action="arr-tab" data-arr-tab="summary">Summary (${groups.length})</button>
        <button class="arr-tab" data-action="arr-tab" data-arr-tab="top">Top by Size</button>
        <button class="arr-tab" data-action="arr-tab" data-arr-tab="all">All Instances</button>
      </div>
      <div class="arr-tab-content" id="arrTabContent">
        ${this._renderArraysSummary(groups)}
      </div>
    </div>`;
    return html;
  }

  /** Normalize $[0].foo → $[*].foo and group */
  _groupArraysBySchema(arraysDetail) {
    const map = new Map();
    for (const a of arraysDetail) {
      const schema = a.path.replace(/\[\d+\]/g, '[*]');
      if (!map.has(schema)) {
        map.set(schema, { path: schema, occurrences: 0, totalItems: 0, min: Infinity, max: 0, types: {} });
      }
      const g = map.get(schema);
      g.occurrences++;
      g.totalItems += a.count;
      if (a.count < g.min) g.min = a.count;
      if (a.count > g.max) g.max = a.count;
      g.types[a.sample] = (g.types[a.sample] || 0) + 1;
    }
    return [...map.values()].map(g => ({
      ...g,
      avg: (g.totalItems / g.occurrences).toFixed(1),
      primaryType: Object.entries(g.types).sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown',
      min: g.min === Infinity ? 0 : g.min,
    })).sort((a, b) => b.totalItems - a.totalItems);
  }

  /** Summary tab — one row per unique schema path */
  _renderArraysSummary(groups) {
    let html = '<table class="arr-table"><thead><tr>';
    html += '<th>Schema Path</th><th>Occurrences</th><th>Total Items</th><th>Avg</th><th>Min</th><th>Max</th><th>Type</th>';
    html += '</tr></thead><tbody>';
    for (const g of groups) {
      const isPrim = g.primaryType !== 'object';
      html += `<tr>
        <td class="arr-path${isPrim ? ' arr-prim' : ''}">${this._esc(g.path)}${isPrim ? ' <span class="stat-prim-tag">primitive</span>' : ''}</td>
        <td class="arr-count">${g.occurrences.toLocaleString()}</td>
        <td class="arr-count">${g.totalItems.toLocaleString()}</td>
        <td class="arr-count">${g.avg}</td>
        <td class="arr-count">${g.min.toLocaleString()}</td>
        <td class="arr-count">${g.max.toLocaleString()}</td>
        <td>${this._esc(g.primaryType)}</td>
      </tr>`;
    }
    html += '</tbody></table>';
    return html;
  }

  /** Top by Size tab — top 100 largest arrays */
  _renderArraysTop(arraysDetail) {
    const sorted = [...arraysDetail].sort((a, b) => b.count - a.count).slice(0, 100);
    let html = '<table class="arr-table"><thead><tr><th>#</th><th>Path</th><th>Items</th><th>Element Type</th></tr></thead><tbody>';
    for (let i = 0; i < sorted.length; i++) {
      const a = sorted[i];
      const isPrim = a.sample !== 'object';
      const cls = isPrim ? 'arr-path arr-prim' : 'arr-path';
      html += `<tr>
        <td class="arr-count" style="color:var(--text-muted)">${i + 1}</td>
        <td class="${cls}" data-action="drill-array" data-path="${this._esc(a.path)}">${this._esc(a.path)}${isPrim ? ' <span class="stat-prim-tag">primitive</span>' : ''}</td>
        <td class="arr-count">${a.count.toLocaleString()}</td>
        <td>${this._esc(a.sample)}</td>
      </tr>`;
    }
    html += '</tbody></table>';
    return html;
  }

  /** All Instances tab — virtual-scrolled table */
  _renderArraysAll(arraysDetail) {
    const ROW_H = 32;
    const VISIBLE_H = 400;
    const totalH = arraysDetail.length * ROW_H;

    return `<div class="arr-virtual-wrap" id="arrVirtualWrap" style="max-height:${VISIBLE_H}px;overflow-y:auto;position:relative">
      <table class="arr-table arr-virtual-table">
        <thead style="position:sticky;top:0;z-index:1"><tr><th>Path</th><th>Items</th><th>Element Type</th></tr></thead>
        <tbody id="arrVirtualBody">
          <tr class="arr-vpad-top"><td colspan="3" style="height:0;padding:0;border:0"></td></tr>
          <tr class="arr-vpad-bot"><td colspan="3" style="height:${Math.max(0, totalH - VISIBLE_H)}px;padding:0;border:0"></td></tr>
        </tbody>
      </table>
    </div>
    <div class="arr-virtual-info" style="text-align:center;font-size:11px;color:var(--text-muted);padding:4px">
      ${arraysDetail.length.toLocaleString()} instances — scroll to browse
    </div>`;
  }

  /** Set up scroll-driven rendering for virtual table */
  _setupVirtualScroll() {
    const wrap = this.$('#arrVirtualWrap');
    if (!wrap || !this._arraysDetail) return;

    const data = this._arraysDetail;
    const ROW_H = 32;
    const BUFFER = 10;
    const self = this;

    const render = () => {
      const scrollTop = wrap.scrollTop;
      const viewH = wrap.clientHeight;
      const startIdx = Math.max(0, Math.floor(scrollTop / ROW_H) - BUFFER);
      const endIdx = Math.min(data.length, Math.ceil((scrollTop + viewH) / ROW_H) + BUFFER);

      const topPad = startIdx * ROW_H;
      const botPad = Math.max(0, (data.length - endIdx) * ROW_H);

      let rows = '';
      for (let i = startIdx; i < endIdx; i++) {
        const a = data[i];
        const isPrim = a.sample !== 'object';
        const cls = isPrim ? 'arr-path arr-prim' : 'arr-path';
        rows += `<tr>
          <td class="${cls}" data-action="drill-array" data-path="${self._esc(a.path)}">${self._esc(a.path)}${isPrim ? ' <span class="stat-prim-tag">primitive</span>' : ''}</td>
          <td class="arr-count">${a.count.toLocaleString()}</td>
          <td>${self._esc(a.sample)}</td>
        </tr>`;
      }

      const body = self.$('#arrVirtualBody');
      if (body) {
        body.innerHTML =
          `<tr class="arr-vpad-top"><td colspan="3" style="height:${topPad}px;padding:0;border:0"></td></tr>` +
          rows +
          `<tr class="arr-vpad-bot"><td colspan="3" style="height:${botPad}px;padding:0;border:0"></td></tr>`;
      }
    };

    // Initial render
    render();

    // Throttled scroll handler
    let ticking = false;
    wrap.addEventListener('scroll', () => {
      if (!ticking) {
        requestAnimationFrame(() => { render(); ticking = false; });
        ticking = true;
      }
    });
  }

  /* ====================================================
     KEY COVERAGE TABLE (with nested drill)
     ==================================================== */

  _renderKeyCoverage(path, rows, drillStack) {
    const coverage = Structra.engine.analyzeKeys(rows);
    if (coverage.length === 0) return '';

    const backBtn = drillStack.length > 0
      ? ` <span class="stat-drill-back" data-action="drill-back" title="Go back">↑ Back</span>`
      : '';

    let html = `<div class="stats-section" id="covSection"><div class="stats-section-title">Key Coverage — ${this._esc(path)} (${rows.length} rows)${backBtn}</div>`;
    html += '<table class="cov-table"><thead><tr><th>Key</th><th>Present</th><th>Empty</th><th>Missing</th><th>Coverage</th><th></th></tr></thead><tbody>';

    const sorted = [...coverage].sort((a, b) => b.missing - a.missing || b.empty - a.empty || a.key.localeCompare(b.key));
    for (const k of sorted) {
      const color = k.pct === 100 ? 'var(--success)' : k.pct >= 80 ? 'var(--warning)' : 'var(--danger)';
      const missStyle = k.missing > 0 ? 'class="stat-missing-cell" data-action="show-missing" data-keyname="' + this._esc(k.key) + '"' : '';
      const emptyStyle = k.empty > 0 ? 'class="stat-empty-cell" data-action="show-empty" data-keyname="' + this._esc(k.key) + '"' : '';

      // Detect nested type for drill tags
      let typeTag = '';
      if (k.types && k.types.has('object')) {
        typeTag = ` <span class="stat-nested-tag" data-action="toggle-nested" data-keyname="${this._esc(k.key)}">▶ {…}</span>`;
      } else if (k.types && k.types.has('array')) {
        typeTag = ` <span class="stat-nested-tag" data-action="drill-nested-array" data-keyname="${this._esc(k.key)}">[…]</span>`;
      }

      html += `<tr>
        <td class="cov-key" data-action="highlight-key" data-keyname="${this._esc(k.key)}">${this._esc(k.key)}${typeTag}</td>
        <td>${k.present}</td>
        <td ${emptyStyle}>${k.empty || '-'}</td>
        <td ${missStyle} style="${k.missing > 0 ? 'color:var(--danger);font-weight:700;cursor:pointer' : ''}">${k.missing || '-'}</td>
        <td class="cov-pct" style="color:${color}">${k.pct}%</td>
        <td><div class="cov-bar"><div class="cov-bar-fill" style="width:${k.pct}%;background:${color}"></div></div></td>
      </tr>`;

      // Nested object keys (hidden by default, toggled)
      if (k.types && k.types.has('object')) {
        const nestedCoverage = Structra.engine.analyzeNestedKeys(rows, k.key);
        for (const nk of nestedCoverage) {
          const nc = nk.pct === 100 ? 'var(--success)' : nk.pct >= 80 ? 'var(--warning)' : 'var(--danger)';
          html += `<tr class="stat-nested-row" data-parent="${this._esc(k.key)}" style="display:none">
            <td class="cov-key" style="padding-left:24px;color:var(--text-sec)"><span style="color:var(--text-muted)">└ </span>${this._esc(nk.key)}</td>
            <td>${nk.present}</td><td>${nk.empty || '-'}</td>
            <td style="${nk.missing > 0 ? 'color:var(--danger);font-weight:700' : ''}">${nk.missing || '-'}</td>
            <td class="cov-pct" style="color:${nc}">${nk.pct}%</td>
            <td><div class="cov-bar"><div class="cov-bar-fill" style="width:${nk.pct}%;background:${nc}"></div></div></td>
          </tr>`;
        }
      }
    }
    html += '</tbody></table></div>';
    return html;
  }

  /* ====================================================
     FIELD PROFILER TABLE
     ==================================================== */

  _renderProfiler(profileData) {
    if (!profileData || !profileData.fields || profileData.fields.length === 0) return '';
    const isDuck = profileData.source === 'duckdb';

    let html = `<div class="stats-section"><div class="stats-section-title">Field Profiler (${profileData.fieldCount} fields, ${profileData.rowCount} rows)`;
    if (isDuck) html += ' <span style="font-size:11px;color:var(--text-muted)">🦆 DuckDB</span>';
    html += '</div>';
    html += '<div class="profiler-scroll"><table class="profiler-table"><thead><tr>';
    html += '<th>Field</th><th>Type</th><th>Coverage</th><th>Null%</th><th>Unique</th><th>Min</th><th>Max</th><th>Avg</th>';
    if (isDuck) html += '<th>Std</th><th>Q25</th><th>Median</th><th>Q75</th>';
    html += '<th>Top Values</th>';
    html += '</tr></thead><tbody>';

    for (const f of profileData.fields) {
      const topStr = f.topValues ? f.topValues.map(t => `${this._esc(t.val)} (${t.cnt})`).join(', ') : '—';
      html += `<tr>
        <td class="pf-key">${this._esc(f.key)}</td>
        <td><span class="pf-type pf-type-${f.primaryType}">${f.primaryType}</span></td>
        <td>${f.coverage}%</td>
        <td style="${parseFloat(f.nullPct) > 20 ? 'color:var(--danger);font-weight:600' : ''}">${f.nullPct}%</td>
        <td>${f.unique} <small>(${f.uniquePct}%)</small></td>
        <td>${f.min != null ? f.min : '—'}</td>
        <td>${f.max != null ? f.max : '—'}</td>
        <td>${f.avg != null ? f.avg : '—'}</td>`;
      if (isDuck) {
        html += `<td>${f.std != null ? f.std : '—'}</td>`;
        html += `<td>${f.q25 != null ? f.q25 : '—'}</td>`;
        html += `<td>${f.q50 != null ? f.q50 : '—'}</td>`;
        html += `<td>${f.q75 != null ? f.q75 : '—'}</td>`;
      }
      html += `<td class="pf-top">${topStr}</td>
      </tr>`;
    }
    html += '</tbody></table></div></div>';
    return html;
  }

  /* ====================================================
     DISTRIBUTION ANALYSIS (histogram per field)
     ==================================================== */

  async _renderDistribution(rows) {
    if (!rows || rows.length === 0) return '';
    try {
      // Collect columns from rows
      const keys = [...new Set(rows.flatMap(r => r ? Object.keys(r) : []))];
      const fields = [];

      for (const col of keys) {
        const values = rows.map(r => r ? r[col] : null).filter(v => v != null);
        if (values.length === 0) continue;

        const isNumeric = values.every(v => typeof v === 'number' || (typeof v === 'string' && !isNaN(Number(v)) && v.trim() !== ''));
        if (isNumeric) {
          const nums = values.map(Number).sort((a, b) => a - b);
          const min = nums[0], max = nums[nums.length - 1];
          const binCount = Math.min(8, Math.max(3, Math.ceil(Math.sqrt(nums.length))));
          const binWidth = (max - min) / binCount || 1;
          const histogram = [];
          for (let i = 0; i < binCount; i++) {
            const lo = min + i * binWidth;
            const hi = lo + binWidth;
            const count = nums.filter(n => i === binCount - 1 ? n >= lo && n <= hi : n >= lo && n < hi).length;
            histogram.push({ label: lo.toFixed(1), count });
          }
          fields.push({ name: col, type: 'numeric', histogram });

          // Try DuckDB for richer stats if available
          if (Structra.engine.duckReady) {
            try {
              const dist = await Structra.engine.analyzeDistribution(col);
              if (dist) { fields[fields.length - 1].duckStats = dist; }
            } catch {}
          }
        } else {
          // Categorical
          const freq = {};
          for (const v of values) { const s = String(v); freq[s] = (freq[s] || 0) + 1; }
          const topValues = Object.entries(freq)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([value, count]) => ({ value, count }));
          fields.push({ name: col, type: 'categorical', topValues, uniqueCount: Object.keys(freq).length });
        }
      }

      if (fields.length === 0) return '';

      let html = `<div class="stats-section"><div class="stats-section-title">Value Distribution</div><div class="dist-grid">`;
      for (const field of fields) {
        html += `<div class="dist-card">
          <div class="dist-card-title">${this._esc(field.name)} <span class="dist-card-type">${field.type}</span></div>`;

        if (field.type === 'numeric' && field.histogram) {
          // Horizontal bar histogram
          const maxBin = Math.max(...field.histogram.map(b => b.count), 1);
          html += '<div class="dist-histogram">';
          for (const bin of field.histogram) {
            const pct = Math.round(bin.count / maxBin * 100);
            html += `<div class="dist-bin">
              <span class="dist-bin-label">${bin.label}</span>
              <div class="dist-bin-bar"><div class="dist-bin-fill" style="width:${pct}%"></div></div>
              <span class="dist-bin-count">${bin.count}</span>
            </div>`;
          }
          html += '</div>';
        } else if (field.topValues) {
          // Categorical: top value bars
          const maxVal = Math.max(...field.topValues.map(v => v.count), 1);
          html += '<div class="dist-categorical">';
          for (const tv of field.topValues.slice(0, 8)) {
            const pct = Math.round(tv.count / maxVal * 100);
            html += `<div class="dist-cat-row">
              <span class="dist-cat-label" title="${this._esc(String(tv.value))}">${this._esc(String(tv.value).slice(0, 24))}</span>
              <div class="dist-cat-bar"><div class="dist-cat-fill" style="width:${pct}%"></div></div>
              <span class="dist-cat-count">${tv.count}</span>
            </div>`;
          }
          if (field.uniqueCount > 8) {
            html += `<div class="dist-cat-more">+${field.uniqueCount - 8} more unique values</div>`;
          }
          html += '</div>';
        }
        html += '</div>';
      }
      html += '</div></div>';
      return html;
    } catch (err) {
      Structra.log.warn('Stats', 'Distribution analysis failed', err.message);
      return '';
    }
  }

  /* ====================================================
     EVENT HANDLER (delegated)
     ==================================================== */

  _onClick(e) {
    const action = e.target.closest('[data-action]');
    if (!action) return;
    const act = action.dataset.action;

    switch (act) {
      case 'arr-tab': {
        const tab = action.dataset.arrTab;
        const content = this.$('#arrTabContent');
        if (!content || !this._arraysDetail) break;

        // Update active tab styling
        this.querySelectorAll('.arr-tab').forEach(b => b.classList.remove('arr-tab-active'));
        action.classList.add('arr-tab-active');

        // Render selected tab content
        if (tab === 'summary') {
          content.innerHTML = this._renderArraysSummary(this._arraysGroups);
        } else if (tab === 'top') {
          content.innerHTML = this._renderArraysTop(this._arraysDetail);
        } else if (tab === 'all') {
          content.innerHTML = this._renderArraysAll(this._arraysDetail);
          requestAnimationFrame(() => this._setupVirtualScroll());
        }
        break;
      }
      case 'drill-array': {
        const path = action.dataset.path;
        const dataset = Structra.engine.getActive();
        const data = dataset ? dataset.raw : Structra.state.jsonData;
        const resolved = Structra.path.resolve(data, path);
        if (Array.isArray(resolved) && resolved.length > 0 && typeof resolved[0] === 'object') {
          this._drillStack = [];
          this._currentArr = { path, rows: resolved };
          this._refreshCoverage();
        } else if (Array.isArray(resolved)) {
          Structra.toast(`Simple list with ${resolved.length} values`);
        }
        Structra.set('currentPath', path);
        break;
      }
      case 'drill-back': {
        if (this._drillStack.length > 0) {
          const prev = this._drillStack.pop();
          this._currentArr = prev;
          this._refreshCoverage();
        }
        break;
      }
      case 'toggle-nested': {
        const keyName = action.dataset.keyname;
        const container = this.$('#statsContainer');
        const rows = container.querySelectorAll(`.stat-nested-row[data-parent="${keyName}"]`);
        const isOpen = rows[0]?.style.display !== 'none';
        rows.forEach(r => r.style.display = isOpen ? 'none' : '');
        action.textContent = isOpen ? '▶ {…}' : '▼ {…}';
        break;
      }
      case 'drill-nested-array': {
        if (!this._currentArr) break;
        const keyName = action.dataset.keyname;
        const merged = Structra.engine.collectArrayItems(this._currentArr.rows, keyName);
        if (merged.length > 0 && typeof merged[0] === 'object') {
          this._drillStack.push({ ...this._currentArr });
          const newPath = this._currentArr.path + '[*].' + keyName;
          this._currentArr = { path: newPath, rows: merged };
          this._refreshCoverage();
        } else if (merged.length > 0) {
          Structra.toast(`${keyName}: ${merged.length} values (simple list)`);
        }
        break;
      }
      case 'highlight-key': {
        const keyName = action.dataset.keyname;
        Structra.events.emit('tree:search-key', keyName);
        break;
      }
      case 'show-missing': {
        const keyName = action.dataset.keyname;
        if (!this._currentArr) break;
        const indices = [];
        this._currentArr.rows.forEach((row, i) => {
          if (!row || typeof row !== 'object' || !Object.prototype.hasOwnProperty.call(row, keyName)) indices.push(i);
        });
        this._showIndicesPopup(`Missing "${keyName}"`, indices, action);
        break;
      }
      case 'show-empty': {
        const keyName = action.dataset.keyname;
        if (!this._currentArr) break;
        const indices = [];
        this._currentArr.rows.forEach((row, i) => {
          if (row && Object.prototype.hasOwnProperty.call(row, keyName)) {
            const v = row[keyName];
            if (v === null || v === undefined || v === '') indices.push(i);
          }
        });
        this._showIndicesPopup(`Empty "${keyName}"`, indices, action);
        break;
      }
      case 'goto-index': {
        const path = action.dataset.path;
        Structra.set('currentPath', path);
        Structra.set('activeView', 'tree');
        break;
      }
      case 'close-popup': {
        const popup = this.$('.missing-panel');
        if (popup) popup.remove();
        break;
      }
    }
  }

  /** Re-render only the key coverage section */
  _refreshCoverage() {
    const section = this.$('#covSection');
    if (!section || !this._currentArr) return;
    const frag = document.createElement('div');
    frag.innerHTML = this._renderKeyCoverage(this._currentArr.path, this._currentArr.rows, this._drillStack);
    section.replaceWith(frag.firstElementChild);
  }

  /** Show indices popup near an anchor element */
  _showIndicesPopup(title, indices, anchor) {
    // Remove existing
    const existing = this.$('.missing-panel');
    if (existing) existing.remove();
    if (indices.length === 0) return;

    const basePath = this._currentArr ? this._currentArr.path : '$';
    const maxShow = 50;
    const showing = indices.slice(0, maxShow);

    let html = `<div class="missing-panel"><div class="missing-header"><span>${this._esc(title)} (${indices.length})</span><span class="missing-close" data-action="close-popup">&times;</span></div><div class="missing-list">`;
    for (const idx of showing) {
      const path = `${basePath}[${idx}]`;
      html += `<span class="missing-item" data-action="goto-index" data-path="${this._esc(path)}">[${idx}]</span>`;
    }
    if (indices.length > maxShow) html += `<span class="missing-more">…and ${indices.length - maxShow} more</span>`;
    html += '</div></div>';

    anchor.closest('td').insertAdjacentHTML('beforeend', html);
  }

  /* ====================================================
     UTILS — all analysis delegated to Structra.engine
     ==================================================== */

  _esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}

customElements.define('structra-stats', StructraStats);
