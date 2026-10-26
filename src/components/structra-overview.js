/* ============================================================
   STRUCTRA V2 - Overview
   <structra-overview> - what this document is, what to look at first, and the details

   Sections:
   0. Summary: one-sentence description, headline figures, findings worth a look, biggest lists
      (all of it computed by Structra.insights)
   2. Type distribution (bar chart pills)
   3. Data quality score (donut + completeness/consistency/uniqueness)
   4. Arrays found (clickable paths, drill-into)
   5. Key coverage table (present/empty/missing %, nested drill)
   6. Field profiler (type, coverage, min/max/avg, top values)

   All data from Structra.engine - zero window.App, zero DOM queries
   ============================================================ */

class StructraOverview extends StructraElement {
  static get observedAttributes() { return ['compact']; }

  init() {
    this._stale = false;
    this._currentArr = null;  // {path, rows} - active array for coverage
    this._drillStack = [];    // for drill-back

    this.on('state:jsonData', () => {
      this._stale = true;
      this._drillStack = [];
      this._toTop();
      if (Structra.state.activeView === 'overview') this.renderStats();
    });
    this.on('view:switched', (view) => {
      if (view === 'overview' && this._stale) this.renderStats();
    });
    this.on('tabs:switched', () => this._toTop());
    this.on('state:duplicateKeys', () => { if (Structra.state.activeView === 'overview' && this._insights) this.renderStats(); });
    this.on('engine:ingested', () => {
      this._stale = true;
      this._drillStack = [];
      this._toTop();
      if (Structra.state.activeView === 'overview') this.renderStats();
    });
  }

  render() {
    // tabindex: the page can be scrolled with the keyboard (arrows, Page Down, End) once it is clicked or tabbed to
    this.innerHTML = '<div class="stats-view" id="statsContainer" tabindex="0" role="region" aria-label="Overview"></div>';
    this.renderStats();

    // Single event-delegated click handler
    this.addEventListener('click', (e) => this._onClick(e));
  }

  /* ====================================================
     RENDER
     ==================================================== */

  /** A new document starts at its headline, not where the last one was scrolled to */
  _toTop() {
    for (let el = this; el; el = el.parentElement) { if (el.scrollTop) el.scrollTop = 0; if (el.classList && el.classList.contains('view-panel')) break; }
    const c = this.$('#statsContainer'); if (c) c.scrollTop = 0;
  }

  async renderStats() {
    this._stale = false;
    const t0 = performance.now();
    const container = this.$('#statsContainer');
    if (!container) return;

    const dataset = Structra.engine.getActive();
    const data = dataset ? dataset.raw : Structra.state.jsonData;
    if (!data) {
      container.innerHTML = '<p style="color:var(--text-muted);padding:var(--sp-4)">Open a file to see an overview of it.</p>';
      return;
    }

    const analysis = await Structra.engine.getAnalysis();
    if (!analysis) return;
    const { stats: s, firstArr, profile, gaps } = analysis;
    const fileSize = Structra.util.formatBytes(dataset ? dataset.meta.fileSize : Structra.state.fileSize);
    let html = '';

    this._insights = Structra.insights.build({
      analysis,
      meta: { fileSize: dataset ? dataset.meta.fileSize : Structra.state.fileSize },
      data,
      duplicateKeys: Structra.state.duplicateKeys || [],
    });
    html += this._renderSummary(this._insights);
    html += '<h2 class="ovw-details-title">Details</h2>';
    html += this._renderTypes(s);

    if (firstArr) {
      this._currentArr = firstArr;
      if (profile) html += this._renderQuality(profile.quality);
      html += this._renderArraysFound(s.arraysDetail);
      html += this._renderKeyCoverage(firstArr.path, firstArr.rows, [], profile ? profile.coverage : null);
      if (profile) html += this._renderProfiler(profile);
      if (profile) html += this._renderDistribution(profile);
    } else {
      html += this._renderArraysFound(s.arraysDetail);
    }

    container.innerHTML = html;
    Structra.log.perf('Stats', 'renderStats()', performance.now() - t0);
    // Signal that analysis + rendering is complete (used by loading overlay)
    Structra.events.emit('engine:analysisComplete');
  }

  /* ====================================================
     SUMMARY (Structra.insights)
     ==================================================== */

  _renderSummary(ins) {
    const esc = Structra.util.esc;
    const icons = Structra.icons;
    const facts = ins.facts.map((f) => `<div class="ovw-fact"><dt>${esc(f.label)}</dt><dd>${esc(f.value)}</dd></div>`).join('');

    const findings = ins.findings.length
      ? `<ul class="ovw-findings">${ins.findings.map((f, i) => `
          <li><button class="ovw-find sev-${f.severity}" type="button" data-action="go" data-i="${i}">
            ${icons.svg(f.severity === 'info' ? 'info' : 'triangle-alert', { size: 18, color: f.severity === 'high' ? 'danger' : f.severity === 'med' ? 'warning' : 'info' })}
            <span class="ovw-find-text"><strong>${esc(f.title)}</strong>${f.detail ? `<span>${esc(f.detail)}</span>` : ''}</span>
            ${icons.svg('chevron-right', { size: 16 })}
          </button></li>`).join('')}</ul>`
      : `<p class="ovw-clear">${icons.svg('check', { size: 18, color: 'success' })} Nothing unusual found. Missing values, mixed types and repeated keys all look fine.</p>`;

    const arrays = ins.arrays.length
      ? `<ul class="ovw-lists">${ins.arrays.map((a) => `
          <li><button class="ovw-list" type="button" data-action="go-list" data-path="${esc(a.path)}">
            <code>${esc(a.pattern.replace(/^\$\.?/, '') || 'the whole document')}</code>
            <span>${a.lists > 1 ? `${a.lists.toLocaleString()} lists, ${a.items.toLocaleString()} items` : `${a.items.toLocaleString()} ${a.items === 1 ? 'item' : 'items'}`}</span>
          </button></li>`).join('')}</ul>`
      : '<p class="ovw-clear">This document has no lists.</p>';

    return `
      <section class="ovw-summary">
        <h2 class="ovw-headline">${esc(ins.headline)}</h2>
        <dl class="ovw-facts">${facts}</dl>
      </section>
      <div class="ovw-columns">
        <section class="stats-section">
          <div class="stats-section-title">Worth a look</div>
          ${findings}
        </section>
        <section class="stats-section">
          <div class="stats-section-title">Biggest lists</div>
          ${arrays}
        </section>
      </div>`;
  }

  /** Take the person from a finding or a list to the place in the data it talks about */
  _go(go) {
    if (go.path) {
      Structra.set('currentPath', go.path);
      Structra.set('activeView', 'tree');
      Structra.events.emit('tree:node-selected', go.path);
    } else if (go.view) {
      Structra.set('activeView', go.view);
    }
    if (go.drawer) Structra.events.emit('drawer:show', go.drawer);
  }

  /* ====================================================
     TYPE DISTRIBUTION
     ==================================================== */

  _renderTypes(s) {
    const types = [
      { label: 'Strings',  count: s.strings,  color: 'var(--syn-string)' },
      { label: 'Numbers',  count: s.numbers,  color: 'var(--syn-number)' },
      { label: 'Booleans', count: s.booleans, color: 'var(--syn-boolean)' },
      { label: 'Nulls',    count: s.nulls,    color: 'var(--syn-null)' },
      { label: 'Objects',  count: s.objects,   color: 'var(--syn-key)' },
      { label: 'Arrays',   count: s.arrays,   color: 'var(--accent)' },
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
    const color = q.overall >= 80 ? 'var(--success)' : q.overall >= 50 ? 'var(--warning)' : 'var(--danger)';
    const barColor = (v) => v >= 80 ? 'var(--success)' : v >= 50 ? 'var(--warning)' : 'var(--danger)';

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
          `<div class="pf-q-issue pf-q-issue-${i.severity}"><span class="pf-q-issue-field">${Structra.util.esc(i.field)}</span> ${Structra.util.esc(i.msg)}</div>`
        ).join('')}</div>` : ''}
      </div></div>`;
    return html;
  }

  /* ====================================================
     ARRAYS FOUND - Tabbed with Virtual Scroll
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

  /** Summary tab - one row per unique schema path */
  _renderArraysSummary(groups) {
    let html = '<table class="arr-table"><thead><tr>';
    html += '<th>Schema Path</th><th>Occurrences</th><th>Total Items</th><th>Avg</th><th>Min</th><th>Max</th><th>Type</th>';
    html += '</tr></thead><tbody>';
    for (const g of groups) {
      const isPrim = g.primaryType !== 'object';
      html += `<tr>
        <td class="arr-path${isPrim ? ' arr-prim' : ''}">${Structra.util.esc(g.path)}${isPrim ? ' <span class="stat-prim-tag">primitive</span>' : ''}</td>
        <td class="arr-count">${g.occurrences.toLocaleString()}</td>
        <td class="arr-count">${g.totalItems.toLocaleString()}</td>
        <td class="arr-count">${g.avg}</td>
        <td class="arr-count">${g.min.toLocaleString()}</td>
        <td class="arr-count">${g.max.toLocaleString()}</td>
        <td>${Structra.util.esc(g.primaryType)}</td>
      </tr>`;
    }
    html += '</tbody></table>';
    return html;
  }

  /** Top by Size tab - top 100 largest arrays */
  _renderArraysTop(arraysDetail) {
    const sorted = [...arraysDetail].sort((a, b) => b.count - a.count).slice(0, 100);
    let html = '<table class="arr-table"><thead><tr><th>#</th><th>Path</th><th>Items</th><th>Element Type</th></tr></thead><tbody>';
    for (let i = 0; i < sorted.length; i++) {
      const a = sorted[i];
      const isPrim = a.sample !== 'object';
      const cls = isPrim ? 'arr-path arr-prim' : 'arr-path';
      html += `<tr>
        <td class="arr-count" style="color:var(--text-muted)">${i + 1}</td>
        <td class="${cls}" data-action="drill-array" data-path="${Structra.util.esc(a.path)}">${Structra.util.esc(a.path)}${isPrim ? ' <span class="stat-prim-tag">primitive</span>' : ''}</td>
        <td class="arr-count">${a.count.toLocaleString()}</td>
        <td>${Structra.util.esc(a.sample)}</td>
      </tr>`;
    }
    html += '</tbody></table>';
    return html;
  }

  /** All Instances tab - virtual-scrolled table */
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
      ${arraysDetail.length.toLocaleString()} instances. Scroll to browse
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
          <td class="${cls}" data-action="drill-array" data-path="${Structra.util.esc(a.path)}">${Structra.util.esc(a.path)}${isPrim ? ' <span class="stat-prim-tag">primitive</span>' : ''}</td>
          <td class="arr-count">${a.count.toLocaleString()}</td>
          <td>${Structra.util.esc(a.sample)}</td>
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

  _renderKeyCoverage(path, rows, drillStack, precomputed) {
    const coverage = precomputed || Structra.engine.analyzeKeys(rows);
    if (coverage.length === 0) return '';

    const backBtn = drillStack.length > 0
      ? ` <span class="stat-drill-back" data-action="drill-back" title="Go back">↑ Back</span>`
      : '';

    let html = `<div class="stats-section" id="covSection"><div class="stats-section-title">Key Coverage: ${Structra.util.esc(path)} (${rows.length} rows)${backBtn}</div>`;
    html += '<table class="cov-table"><thead><tr><th>Key</th><th>Present</th><th>Empty</th><th>Missing</th><th title="Rows where the key is there and not empty">Has a value</th><th></th></tr></thead><tbody>';

    const sorted = [...coverage].sort((a, b) => b.missing - a.missing || b.empty - a.empty || a.key.localeCompare(b.key));
    for (const k of sorted) {
      // "Has a value": present and not empty (a key that is there but null is not a value)
      const hasValue = rows.length ? Math.round(Math.max(0, k.present - k.empty) / rows.length * 100) : 0;
      const color = hasValue === 100 ? 'var(--success)' : hasValue >= 80 ? 'var(--warning)' : 'var(--danger)';
      const missStyle = k.missing > 0 ? 'class="stat-missing-cell" data-action="show-missing" data-keyname="' + Structra.util.esc(k.key) + '"' : '';
      const emptyStyle = k.empty > 0 ? 'class="stat-empty-cell" data-action="show-empty" data-keyname="' + Structra.util.esc(k.key) + '"' : '';

      // Detect nested type for drill tags
      let typeTag = '';
      if (k.types && k.types.has('object')) {
        typeTag = ` <span class="stat-nested-tag" data-action="toggle-nested" data-keyname="${Structra.util.esc(k.key)}">${Structra.icons.svg('chevron-right', { size: 12 })} {…}</span>`;
      } else if (k.types && k.types.has('array')) {
        typeTag = ` <span class="stat-nested-tag" data-action="drill-nested-array" data-keyname="${Structra.util.esc(k.key)}">[…]</span>`;
      }

      html += `<tr>
        <td class="cov-key" data-action="highlight-key" data-keyname="${Structra.util.esc(k.key)}">${Structra.util.esc(k.key)}${typeTag}</td>
        <td>${k.present}</td>
        <td ${emptyStyle}>${k.empty || '-'}</td>
        <td ${missStyle} style="${k.missing > 0 ? 'color:var(--danger);font-weight:700;cursor:pointer' : ''}">${k.missing || '-'}</td>
        <td class="cov-pct" style="color:${color}">${hasValue}%</td>
        <td><div class="cov-bar"><div class="cov-bar-fill" style="width:${hasValue}%;background:${color}"></div></div></td>
      </tr>`;

      // Nested object keys (hidden by default, toggled)
      if (k.types && k.types.has('object')) {
        const nestedCoverage = Structra.engine.analyzeNestedKeys(rows, k.key);
        for (const nk of nestedCoverage) {
          const nc = nk.pct === 100 ? 'var(--success)' : nk.pct >= 80 ? 'var(--warning)' : 'var(--danger)';
          html += `<tr class="stat-nested-row" data-parent="${Structra.util.esc(k.key)}" style="display:none">
            <td class="cov-key" style="padding-left:24px;color:var(--text-sec)"><span style="color:var(--text-muted)">└ </span>${Structra.util.esc(nk.key)}</td>
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

    let html = `<div class="stats-section"><div class="stats-section-title">Field Profiler (${profileData.fieldCount} fields, ${profileData.rowCount} rows)`;
    html += '</div>';
    html += '<div class="profiler-scroll"><table class="profiler-table"><thead><tr>';
    html += '<th>Field</th><th>Type</th><th>Coverage</th><th>Null%</th><th>Unique</th><th>Min</th><th>Max</th><th>Avg</th>';
    html += '<th>Top Values</th>';
    html += '</tr></thead><tbody>';

    for (const f of profileData.fields) {
      const topStr = f.topValues ? f.topValues.map(t => `${Structra.util.esc(t.val)} (${t.cnt})`).join(', ') : '-';
      html += `<tr>
        <td class="pf-key">${Structra.util.esc(f.key)}</td>
        <td><span class="pf-type pf-type-${f.primaryType}">${f.primaryType}</span></td>
        <td>${f.coverage}%</td>
        <td style="${parseFloat(f.nullPct) > 20 ? 'color:var(--danger);font-weight:600' : ''}">${f.nullPct}%</td>
        <td>${f.uniqueCapped ? '\u2265 ' : ''}${f.unique} <small>(${f.uniquePct}%)</small></td>
        <td>${f.min != null ? f.min : '-'}</td>
        <td>${f.max != null ? f.max : '-'}</td>
        <td>${f.avg != null ? f.avg : '-'}</td>`;
      html += `<td class="pf-top">${topStr}</td>
      </tr>`;
    }
    html += '</tbody></table></div></div>';
    return html;
  }

  /* ====================================================
     DISTRIBUTION ANALYSIS (histogram per field)
     ==================================================== */

  _renderDistribution(profile) {
    // Identifiers, tags and time stamps have a different value every row: their "distribution" says nothing
    const NOISE = /^(@|odata)|(^|[_.])(id|guid|uuid|etag)$|^itemInternalId$|^(created|modified|updated|timestamp)(at|on|date|time|by)?$/i;
    const fields = profile.fields.filter((f) => (f.histogram || f.distTop) && !NOISE.test(f.key));
    if (!fields.length) return '';

    let html = '<div class="stats-section"><div class="stats-section-title">Value Distribution</div><div class="dist-grid">';
    for (const f of fields) {
      html += `<div class="dist-card">
        <div class="dist-card-title">${Structra.util.esc(f.key)} <span class="dist-card-type">${f.histogram ? 'numeric' : 'categorical'}</span></div>`;
      if (f.histogram) {
        const maxBin = Math.max(...f.histogram.map((b) => b.count), 1);
        html += '<div class="dist-histogram">';
        for (const bin of f.histogram) {
          html += `<div class="dist-bin">
            <span class="dist-bin-label">${bin.label}</span>
            <div class="dist-bin-bar"><div class="dist-bin-fill" style="width:${Math.round(bin.count / maxBin * 100)}%"></div></div>
            <span class="dist-bin-count">${bin.count}</span>
          </div>`;
        }
        html += '</div>';
      } else {
        const maxVal = Math.max(...f.distTop.map((v) => v.count), 1);
        html += '<div class="dist-categorical">';
        for (const tv of f.distTop) {
          html += `<div class="dist-cat-row">
            <span class="dist-cat-label" title="${Structra.util.esc(String(tv.value))}">${Structra.util.esc(String(tv.value).slice(0, 24))}</span>
            <div class="dist-cat-bar"><div class="dist-cat-fill" style="width:${Math.round(tv.count / maxVal * 100)}%"></div></div>
            <span class="dist-cat-count">${tv.count}</span>
          </div>`;
        }
        if (f.distUnique > f.distTop.length) html += `<div class="dist-cat-more">+${f.distUnique - f.distTop.length} more unique values</div>`;
        html += '</div>';
      }
      html += '</div>';
    }
    return html + '</div></div>';
  }

  /* ====================================================
     EVENT HANDLER (delegated)
     ==================================================== */

  _onClick(e) {
    const action = e.target.closest('[data-action]');
    if (!action) return;
    const act = action.dataset.action;

    switch (act) {
      case 'go': {
        const f = this._insights && this._insights.findings[Number(action.dataset.i)];
        if (f) this._go(f.go);
        break;
      }
      case 'go-list': {
        this._go({ path: action.dataset.path });
        break;
      }
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
        const resolved = Structra.paths.resolve(data, path);
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
        action.innerHTML = Structra.icons.svg(isOpen ? 'chevron-right' : 'chevron-down', { size: 12 }) + ' {…}';
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

    let html = `<div class="missing-panel"><div class="missing-header"><span>${Structra.util.esc(title)} (${indices.length})</span><span class="missing-close" data-action="close-popup">&times;</span></div><div class="missing-list">`;
    for (const idx of showing) {
      const path = `${basePath}[${idx}]`;
      html += `<span class="missing-item" data-action="goto-index" data-path="${Structra.util.esc(path)}">[${idx}]</span>`;
    }
    if (indices.length > maxShow) html += `<span class="missing-more">…and ${indices.length - maxShow} more</span>`;
    html += '</div></div>';

    anchor.closest('td').insertAdjacentHTML('beforeend', html);
  }

  /* ====================================================
     UTILS - all analysis delegated to Structra.engine
     ==================================================== */

}

customElements.define('structra-overview', StructraOverview);
