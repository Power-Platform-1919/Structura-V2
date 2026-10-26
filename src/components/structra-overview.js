/* ============================================================
   STRUCTRA V2 - Overview
   <structra-overview> - what this document is, what to look at first, and the details

   Sections:
   0. Summary: one-sentence description, headline figures, findings worth a look, biggest lists
      (all of it computed by Structra.overviewInsights)
   2. Type distribution (bar chart pills)
   3. Data quality score (donut + completeness/consistency/uniqueness)
   4. Arrays found (clickable paths, drill-into)
   5. Key coverage table (present/empty/missing %, nested drill)
   6. Field profiler (type, coverage, min/max/avg, top values)

   All data from Structra.dataEngine - zero window.App, zero DOM queries

   Wiring (generated from the code below; update it when you add or remove an event):
     Listens to: state:jsonData, view:switched, tabs:switched, state:duplicateKeys,
          engine:ingested
     Emits: engine:analysisComplete, tree:node-selected, drawer:show, tree:search-key
     Sets state: currentPath, activeView
   ============================================================ */

class StructraOverview extends StructraComponent {
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
    this.addEventListener('click', (event) => this._onClick(event));
  }

  /* ====================================================
     RENDER
     ==================================================== */

  /** A new document starts at its headline, not where the last one was scrolled to */
  _toTop() {
    for (let element = this; element; element = element.parentElement) { if (element.scrollTop) element.scrollTop = 0; if (element.classList && element.classList.contains('view-panel')) break; }
    const container = this.queryOne('#statsContainer'); if (container) container.scrollTop = 0;
  }

  async renderStats() {
    this._stale = false;
    const startTime = performance.now();
    const container = this.queryOne('#statsContainer');
    if (!container) return;

    const dataset = Structra.dataEngine.getActive();
    const data = dataset ? dataset.raw : Structra.state.jsonData;
    if (!data) {
      container.innerHTML = '<p style="color:var(--text-muted);padding:var(--sp-4)">Open a file to see an overview of it.</p>';
      return;
    }

    const analysis = await Structra.dataEngine.getAnalysis();
    if (!analysis) return;
    const { stats, firstArr: firstArray, profile } = analysis;
    let html = '';

    this._insights = Structra.overviewInsights.build({
      analysis,
      meta: { fileSize: dataset ? dataset.meta.fileSize : Structra.state.fileSize },
      data,
      duplicateKeys: Structra.state.duplicateKeys || [],
    });
    html += this._renderSummary(this._insights);
    html += '<h2 class="ovw-details-title">Details</h2>';
    html += this._renderTypes(stats);

    if (firstArray) {
      this._currentArr = firstArray;
      if (profile) html += this._renderQuality(profile.quality);
      html += this._renderArraysFound(stats.arraysDetail);
      html += this._renderKeyCoverage(firstArray.path, firstArray.rows, [], profile ? profile.coverage : null);
      if (profile) html += this._renderProfiler(profile);
      if (profile) html += this._renderDistribution(profile);
    } else {
      html += this._renderArraysFound(stats.arraysDetail);
    }

    container.innerHTML = html;
    Structra.log.perf('Stats', 'renderStats()', performance.now() - startTime);
    // Signal that analysis + rendering is complete (used by loading overlay)
    Structra.events.emit('engine:analysisComplete');
  }

  /* ====================================================
     SUMMARY (Structra.overviewInsights)
     ==================================================== */

  _renderSummary(insertion) {
    const escapeHtml = Structra.sharedHelpers.escapeHtml;
    const icons = Structra.icons;
    const facts = insertion.facts.map((fact) => `<div class="ovw-fact"><dt>${escapeHtml(fact.label)}</dt><dd>${escapeHtml(fact.value)}</dd></div>`).join('');

    const findings = insertion.findings.length
      ? `<ul class="ovw-findings">${insertion.findings.map((finding, i) => `
          <li><button class="ovw-find sev-${finding.severity}" type="button" data-action="go" data-i="${i}">
            ${icons.svg(finding.severity === 'info' ? 'info' : 'triangle-alert', { size: 18, color: finding.severity === 'high' ? 'danger' : finding.severity === 'med' ? 'warning' : 'info' })}
            <span class="ovw-find-text"><strong>${escapeHtml(finding.title)}</strong>${finding.detail ? `<span>${escapeHtml(finding.detail)}</span>` : ''}</span>
            ${icons.svg('chevron-right', { size: 16 })}
          </button></li>`).join('')}</ul>`
      : `<p class="ovw-clear">${icons.svg('check', { size: 18, color: 'success' })} Nothing unusual found. Missing values, mixed types and repeated keys all look fine.</p>`;

    const arrays = insertion.arrays.length
      ? `<ul class="ovw-lists">${insertion.arrays.map((list) => `
          <li><button class="ovw-list" type="button" data-action="go-list" data-path="${escapeHtml(list.path)}">
            <code>${escapeHtml(list.pattern.replace(/^\$\.?/, '') || 'the whole document')}</code>
            <span>${list.lists > 1 ? `${list.lists.toLocaleString()} lists, ${list.items.toLocaleString()} items` : `${list.items.toLocaleString()} ${list.items === 1 ? 'item' : 'items'}`}</span>
          </button></li>`).join('')}</ul>`
      : '<p class="ovw-clear">This document has no lists.</p>';

    return `
      <section class="ovw-summary">
        <h2 class="ovw-headline">${escapeHtml(insertion.headline)}</h2>
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
  _goToFinding(target) {
    if (target.path) {
      Structra.setState('currentPath', target.path);
      Structra.setState('activeView', 'tree');
      Structra.events.emit('tree:node-selected', target.path);
    } else if (target.view) {
      Structra.setState('activeView', target.view);
    }
    if (target.drawer) Structra.events.emit('drawer:show', target.drawer);
  }

  /* ====================================================
     TYPE DISTRIBUTION
     ==================================================== */

  _renderTypes(stats) {
    const types = [
      { label: 'Strings',  count: stats.strings,  color: 'var(--syn-string)' },
      { label: 'Numbers',  count: stats.numbers,  color: 'var(--syn-number)' },
      { label: 'Booleans', count: stats.booleans, color: 'var(--syn-boolean)' },
      { label: 'Nulls',    count: stats.nulls,    color: 'var(--syn-null)' },
      { label: 'Objects',  count: stats.objects,   color: 'var(--syn-key)' },
      { label: 'Arrays',   count: stats.arrays,   color: 'var(--accent)' },
    ];
    let maxType = 1;
    for (let i = 0; i < types.length; i++) { if (types[i].count > maxType) maxType = types[i].count; }
    let html = '<div class="stats-section"><div class="stats-section-title">Type Distribution</div><div class="type-pills">';
    types.forEach(type => {
      if (type.count > 0) {
        const percent = Math.round(type.count / maxType * 100);
        html += `<div class="type-pill"><span class="tp-count">${type.count.toLocaleString()}</span> ${type.label}<span class="tp-bar"><span class="tp-fill" style="width:${percent}%;background:${type.color}"></span></span></div>`;
      }
    });
    html += '</div></div>';
    return html;
  }

  /* ====================================================
     DATA QUALITY SCORE
     ==================================================== */

  _renderQuality(quality) {
    if (!quality) return '';
    const color = quality.overall >= 80 ? 'var(--success)' : quality.overall >= 50 ? 'var(--warning)' : 'var(--danger)';
    const barColor = (score) => score >= 80 ? 'var(--success)' : score >= 50 ? 'var(--warning)' : 'var(--danger)';

    let html = `<div class="stats-section"><div class="stats-section-title">Data Quality</div>
      <div class="pf-quality">
        <div class="pf-q-score">
          <svg viewBox="0 0 36 36" class="pf-q-ring">
            <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none" stroke="var(--border)" stroke-width="2.5"/>
            <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none" stroke="${color}" stroke-width="2.5"
              stroke-dasharray="${quality.overall}, 100" stroke-linecap="round"/>
          </svg>
          <span class="pf-q-num" style="color:${color}">${quality.overall}</span>
        </div>
        <div class="pf-q-bars">
          <div class="pf-q-bar-row"><span class="pf-q-label">Completeness</span>
            <div class="pf-q-track"><div class="pf-q-fill" style="width:${quality.completeness}%;background:${barColor(quality.completeness)}"></div></div>
            <span class="pf-q-val">${quality.completeness}%</span></div>
          <div class="pf-q-bar-row"><span class="pf-q-label">Consistency</span>
            <div class="pf-q-track"><div class="pf-q-fill" style="width:${quality.consistency}%;background:${barColor(quality.consistency)}"></div></div>
            <span class="pf-q-val">${quality.consistency}%</span></div>
          <div class="pf-q-bar-row"><span class="pf-q-label">Uniqueness</span>
            <div class="pf-q-track"><div class="pf-q-fill" style="width:${quality.uniqueness}%;background:${barColor(quality.uniqueness)}"></div></div>
            <span class="pf-q-val">${quality.uniqueness}%</span></div>
        </div>
        ${quality.issues.length > 0 ? `<div class="pf-q-issues"><span class="pf-q-issues-title">Top Issues</span>${quality.issues.map(issue =>
          `<div class="pf-q-issue pf-q-issue-${issue.severity}"><span class="pf-q-issue-field">${Structra.sharedHelpers.escapeHtml(issue.field)}</span> ${Structra.sharedHelpers.escapeHtml(issue.msg)}</div>`
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
    for (const list of arraysDetail) {
      const schema = list.path.replace(/\[\d+\]/g, '[*]');
      if (!map.has(schema)) {
        map.set(schema, { path: schema, occurrences: 0, totalItems: 0, min: Infinity, max: 0, types: {} });
      }
      const group = map.get(schema);
      group.occurrences++;
      group.totalItems += list.count;
      if (list.count < group.min) group.min = list.count;
      if (list.count > group.max) group.max = list.count;
      group.types[list.sample] = (group.types[list.sample] || 0) + 1;
    }
    return [...map.values()].map(group => ({
      ...group,
      avg: (group.totalItems / group.occurrences).toFixed(1),
      primaryType: Object.entries(group.types).sort((first, second) => second[1] - first[1])[0]?.[0] || 'unknown',
      min: group.min === Infinity ? 0 : group.min,
    })).sort((first, second) => second.totalItems - first.totalItems);
  }

  /** Summary tab - one row per unique schema path */
  _renderArraysSummary(groups) {
    let html = '<table class="arr-table"><thead><tr>';
    html += '<th>Schema Path</th><th>Occurrences</th><th>Total Items</th><th>Avg</th><th>Min</th><th>Max</th><th>Type</th>';
    html += '</tr></thead><tbody>';
    for (const group of groups) {
      const isPrim = group.primaryType !== 'object';
      html += `<tr>
        <td class="arr-path${isPrim ? ' arr-prim' : ''}">${Structra.sharedHelpers.escapeHtml(group.path)}${isPrim ? ' <span class="stat-prim-tag">primitive</span>' : ''}</td>
        <td class="arr-count">${group.occurrences.toLocaleString()}</td>
        <td class="arr-count">${group.totalItems.toLocaleString()}</td>
        <td class="arr-count">${group.avg}</td>
        <td class="arr-count">${group.min.toLocaleString()}</td>
        <td class="arr-count">${group.max.toLocaleString()}</td>
        <td>${Structra.sharedHelpers.escapeHtml(group.primaryType)}</td>
      </tr>`;
    }
    html += '</tbody></table>';
    return html;
  }

  /** Top by Size tab - top 100 largest arrays */
  _renderArraysTop(arraysDetail) {
    const sorted = [...arraysDetail].sort((first, second) => second.count - first.count).slice(0, 100);
    let html = '<table class="arr-table"><thead><tr><th>#</th><th>Path</th><th>Items</th><th>Element Type</th></tr></thead><tbody>';
    for (let i = 0; i < sorted.length; i++) {
      const item = sorted[i];
      const isPrim = item.sample !== 'object';
      const className = isPrim ? 'arr-path arr-prim' : 'arr-path';
      html += `<tr>
        <td class="arr-count" style="color:var(--text-muted)">${i + 1}</td>
        <td class="${className}" data-action="drill-array" data-path="${Structra.sharedHelpers.escapeHtml(item.path)}">${Structra.sharedHelpers.escapeHtml(item.path)}${isPrim ? ' <span class="stat-prim-tag">primitive</span>' : ''}</td>
        <td class="arr-count">${item.count.toLocaleString()}</td>
        <td>${Structra.sharedHelpers.escapeHtml(item.sample)}</td>
      </tr>`;
    }
    html += '</tbody></table>';
    return html;
  }

  /** All Instances tab - virtual-scrolled table */
  _renderArraysAll(arraysDetail) {
    const ROW_HEIGHT = 32;
    const VISIBLE_HEIGHT = 400;
    const totalH = arraysDetail.length * ROW_HEIGHT;

    return `<div class="arr-virtual-wrap" id="arrVirtualWrap" style="max-height:${VISIBLE_HEIGHT}px;overflow-y:auto;position:relative">
      <table class="arr-table arr-virtual-table">
        <thead style="position:sticky;top:0;z-index:1"><tr><th>Path</th><th>Items</th><th>Element Type</th></tr></thead>
        <tbody id="arrVirtualBody">
          <tr class="arr-vpad-top"><td colspan="3" style="height:0;padding:0;border:0"></td></tr>
          <tr class="arr-vpad-bot"><td colspan="3" style="height:${Math.max(0, totalH - VISIBLE_HEIGHT)}px;padding:0;border:0"></td></tr>
        </tbody>
      </table>
    </div>
    <div class="arr-virtual-info" style="text-align:center;font-size:11px;color:var(--text-muted);padding:4px">
      ${arraysDetail.length.toLocaleString()} instances. Scroll to browse
    </div>`;
  }

  /** Set up scroll-driven rendering for virtual table */
  _setupVirtualScroll() {
    const wrap = this.queryOne('#arrVirtualWrap');
    if (!wrap || !this._arraysDetail) return;

    const data = this._arraysDetail;
    const ROW_HEIGHT = 32;
    const EXTRA_ROWS = 10;
    const self = this;

    const render = () => {
      const scrollTop = wrap.scrollTop;
      const viewH = wrap.clientHeight;
      const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - EXTRA_ROWS);
      const endIndex = Math.min(data.length, Math.ceil((scrollTop + viewH) / ROW_HEIGHT) + EXTRA_ROWS);

      const topPad = startIndex * ROW_HEIGHT;
      const botPad = Math.max(0, (data.length - endIndex) * ROW_HEIGHT);

      let rows = '';
      for (let i = startIndex; i < endIndex; i++) {
        const item = data[i];
        const isPrim = item.sample !== 'object';
        const className = isPrim ? 'arr-path arr-prim' : 'arr-path';
        rows += `<tr>
          <td class="${className}" data-action="drill-array" data-path="${Structra.sharedHelpers.escapeHtml(item.path)}">${Structra.sharedHelpers.escapeHtml(item.path)}${isPrim ? ' <span class="stat-prim-tag">primitive</span>' : ''}</td>
          <td class="arr-count">${item.count.toLocaleString()}</td>
          <td>${Structra.sharedHelpers.escapeHtml(item.sample)}</td>
        </tr>`;
      }

      const body = self.queryOne('#arrVirtualBody');
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
    const coverage = precomputed || Structra.dataEngine.analyzeKeys(rows);
    if (coverage.length === 0) return '';

    const backButton = drillStack.length > 0
      ? ` <span class="stat-drill-back" data-action="drill-back" title="Go back">↑ Back</span>`
      : '';

    let html = `<div class="stats-section" id="covSection"><div class="stats-section-title">Key Coverage: ${Structra.sharedHelpers.escapeHtml(path)} (${rows.length} rows)${backButton}</div>`;
    html += '<table class="cov-table"><thead><tr><th>Key</th><th>Present</th><th>Empty</th><th>Missing</th><th title="Rows where the key is there and not empty">Has a value</th><th></th></tr></thead><tbody>';

    const sorted = [...coverage].sort((first, second) => second.missing - first.missing || second.empty - first.empty || first.key.localeCompare(second.key));
    for (const key of sorted) {
      // "Has a value": present and not empty (a key that is there but null is not a value)
      const hasValue = rows.length ? Math.round(Math.max(0, key.present - key.empty) / rows.length * 100) : 0;
      const color = hasValue === 100 ? 'var(--success)' : hasValue >= 80 ? 'var(--warning)' : 'var(--danger)';
      const missStyle = key.missing > 0 ? 'class="stat-missing-cell" data-action="show-missing" data-keyname="' + Structra.sharedHelpers.escapeHtml(key.key) + '"' : '';
      const emptyStyle = key.empty > 0 ? 'class="stat-empty-cell" data-action="show-empty" data-keyname="' + Structra.sharedHelpers.escapeHtml(key.key) + '"' : '';

      // Detect nested type for drill tags
      let typeTag = '';
      if (key.types && key.types.has('object')) {
        typeTag = ` <span class="stat-nested-tag" data-action="toggle-nested" data-keyname="${Structra.sharedHelpers.escapeHtml(key.key)}">${Structra.icons.svg('chevron-right', { size: 12 })} {…}</span>`;
      } else if (key.types && key.types.has('array')) {
        typeTag = ` <span class="stat-nested-tag" data-action="drill-nested-array" data-keyname="${Structra.sharedHelpers.escapeHtml(key.key)}">[…]</span>`;
      }

      html += `<tr>
        <td class="cov-key" data-action="highlight-key" data-keyname="${Structra.sharedHelpers.escapeHtml(key.key)}">${Structra.sharedHelpers.escapeHtml(key.key)}${typeTag}</td>
        <td>${key.present}</td>
        <td ${emptyStyle}>${key.empty || '-'}</td>
        <td ${missStyle} style="${key.missing > 0 ? 'color:var(--danger);font-weight:700;cursor:pointer' : ''}">${key.missing || '-'}</td>
        <td class="cov-pct" style="color:${color}">${hasValue}%</td>
        <td><div class="cov-bar"><div class="cov-bar-fill" style="width:${hasValue}%;background:${color}"></div></div></td>
      </tr>`;

      // Nested object keys (hidden by default, toggled)
      if (key.types && key.types.has('object')) {
        const nestedCoverage = Structra.dataEngine.analyzeNestedKeys(rows, key.key);
        for (const nested of nestedCoverage) {
          const color = nested.pct === 100 ? 'var(--success)' : nested.pct >= 80 ? 'var(--warning)' : 'var(--danger)';
          html += `<tr class="stat-nested-row" data-parent="${Structra.sharedHelpers.escapeHtml(key.key)}" style="display:none">
            <td class="cov-key" style="padding-left:24px;color:var(--text-sec)"><span style="color:var(--text-muted)">└ </span>${Structra.sharedHelpers.escapeHtml(nested.key)}</td>
            <td>${nested.present}</td><td>${nested.empty || '-'}</td>
            <td style="${nested.missing > 0 ? 'color:var(--danger);font-weight:700' : ''}">${nested.missing || '-'}</td>
            <td class="cov-pct" style="color:${color}">${nested.pct}%</td>
            <td><div class="cov-bar"><div class="cov-bar-fill" style="width:${nested.pct}%;background:${color}"></div></div></td>
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

    for (const field of profileData.fields) {
      const topText = field.topValues ? field.topValues.map(topValue => `${Structra.sharedHelpers.escapeHtml(topValue.val)} (${topValue.cnt})`).join(', ') : '-';
      html += `<tr>
        <td class="pf-key">${Structra.sharedHelpers.escapeHtml(field.key)}</td>
        <td><span class="pf-type pf-type-${field.primaryType}">${field.primaryType}</span></td>
        <td>${field.coverage}%</td>
        <td style="${parseFloat(field.nullPct) > 20 ? 'color:var(--danger);font-weight:600' : ''}">${field.nullPct}%</td>
        <td>${field.uniqueCapped ? '\u2265 ' : ''}${field.unique} <small>(${field.uniquePct}%)</small></td>
        <td>${field.min != null ? field.min : '-'}</td>
        <td>${field.max != null ? field.max : '-'}</td>
        <td>${field.avg != null ? field.avg : '-'}</td>`;
      html += `<td class="pf-top">${topText}</td>
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
    const fields = profile.fields.filter((field) => (field.histogram || field.distTop) && !NOISE.test(field.key));
    if (!fields.length) return '';

    let html = '<div class="stats-section"><div class="stats-section-title">Value Distribution</div><div class="dist-grid">';
    for (const field of fields) {
      html += `<div class="dist-card">
        <div class="dist-card-title">${Structra.sharedHelpers.escapeHtml(field.key)} <span class="dist-card-type">${field.histogram ? 'numeric' : 'categorical'}</span></div>`;
      if (field.histogram) {
        const maxBin = Math.max(...field.histogram.map((bin) => bin.count), 1);
        html += '<div class="dist-histogram">';
        for (const bin of field.histogram) {
          html += `<div class="dist-bin">
            <span class="dist-bin-label">${bin.label}</span>
            <div class="dist-bin-bar"><div class="dist-bin-fill" style="width:${Math.round(bin.count / maxBin * 100)}%"></div></div>
            <span class="dist-bin-count">${bin.count}</span>
          </div>`;
        }
        html += '</div>';
      } else {
        const maxValue = Math.max(...field.distTop.map((entry) => entry.count), 1);
        html += '<div class="dist-categorical">';
        for (const topEntry of field.distTop) {
          html += `<div class="dist-cat-row">
            <span class="dist-cat-label" title="${Structra.sharedHelpers.escapeHtml(String(topEntry.value))}">${Structra.sharedHelpers.escapeHtml(String(topEntry.value).slice(0, 24))}</span>
            <div class="dist-cat-bar"><div class="dist-cat-fill" style="width:${Math.round(topEntry.count / maxValue * 100)}%"></div></div>
            <span class="dist-cat-count">${topEntry.count}</span>
          </div>`;
        }
        if (field.distUnique > field.distTop.length) html += `<div class="dist-cat-more">+${field.distUnique - field.distTop.length} more unique values</div>`;
        html += '</div>';
      }
      html += '</div>';
    }
    return html + '</div></div>';
  }

  /* ====================================================
     EVENT HANDLER (delegated)
     ==================================================== */

  _onClick(event) {
    const action = event.target.closest('[data-action]');
    if (!action) return;
    const actionName = action.dataset.action;

    switch (actionName) {
      case 'go': {
        const finding = this._insights && this._insights.findings[Number(action.dataset.i)];
        if (finding) this._goToFinding(finding.go);
        break;
      }
      case 'go-list': {
        this._goToFinding({ path: action.dataset.path });
        break;
      }
      case 'arr-tab': {
        const tab = action.dataset.arrTab;
        const content = this.queryOne('#arrTabContent');
        if (!content || !this._arraysDetail) break;

        // Update active tab styling
        this.querySelectorAll('.arr-tab').forEach(button => button.classList.remove('arr-tab-active'));
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
        const dataset = Structra.dataEngine.getActive();
        const data = dataset ? dataset.raw : Structra.state.jsonData;
        const resolved = Structra.dataPaths.resolve(data, path);
        if (Array.isArray(resolved) && resolved.length > 0 && typeof resolved[0] === 'object') {
          this._drillStack = [];
          this._currentArr = { path, rows: resolved };
          this._refreshCoverage();
        } else if (Array.isArray(resolved)) {
          Structra.toast(`Simple list with ${resolved.length} values`);
        }
        Structra.setState('currentPath', path);
        break;
      }
      case 'drill-back': {
        if (this._drillStack.length > 0) {
          const previous = this._drillStack.pop();
          this._currentArr = previous;
          this._refreshCoverage();
        }
        break;
      }
      case 'toggle-nested': {
        const keyName = action.dataset.keyname;
        const container = this.queryOne('#statsContainer');
        const rows = container.querySelectorAll(`.stat-nested-row[data-parent="${keyName}"]`);
        const isOpen = rows[0]?.style.display !== 'none';
        rows.forEach(row => row.style.display = isOpen ? 'none' : '');
        action.innerHTML = Structra.icons.svg(isOpen ? 'chevron-right' : 'chevron-down', { size: 12 }) + ' {…}';
        break;
      }
      case 'drill-nested-array': {
        if (!this._currentArr) break;
        const keyName = action.dataset.keyname;
        const merged = Structra.dataEngine.collectArrayItems(this._currentArr.rows, keyName);
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
            const value = row[keyName];
            if (value === null || value === undefined || value === '') indices.push(i);
          }
        });
        this._showIndicesPopup(`Empty "${keyName}"`, indices, action);
        break;
      }
      case 'goto-index': {
        const path = action.dataset.path;
        Structra.setState('currentPath', path);
        Structra.setState('activeView', 'tree');
        break;
      }
      case 'close-popup': {
        const popup = this.queryOne('.missing-panel');
        if (popup) popup.remove();
        break;
      }
    }
  }

  /** Re-render only the key coverage section */
  _refreshCoverage() {
    const section = this.queryOne('#covSection');
    if (!section || !this._currentArr) return;
    const fragment = document.createElement('div');
    fragment.innerHTML = this._renderKeyCoverage(this._currentArr.path, this._currentArr.rows, this._drillStack);
    section.replaceWith(fragment.firstElementChild);
  }

  /** Show indices popup near an anchor element */
  _showIndicesPopup(title, indices, anchor) {
    // Remove existing
    const existing = this.queryOne('.missing-panel');
    if (existing) existing.remove();
    if (indices.length === 0) return;

    const basePath = this._currentArr ? this._currentArr.path : '$';
    const maxShow = 50;
    const showing = indices.slice(0, maxShow);

    let html = `<div class="missing-panel"><div class="missing-header"><span>${Structra.sharedHelpers.escapeHtml(title)} (${indices.length})</span><span class="missing-close" data-action="close-popup">&times;</span></div><div class="missing-list">`;
    for (const index of showing) {
      const path = `${basePath}[${index}]`;
      html += `<span class="missing-item" data-action="goto-index" data-path="${Structra.sharedHelpers.escapeHtml(path)}">[${index}]</span>`;
    }
    if (indices.length > maxShow) html += `<span class="missing-more">…and ${indices.length - maxShow} more</span>`;
    html += '</div></div>';

    anchor.closest('td').insertAdjacentHTML('beforeend', html);
  }

  /* ====================================================
     UTILS - all analysis delegated to Structra.dataEngine
     ==================================================== */

}

customElements.define('structra-overview', StructraOverview);
