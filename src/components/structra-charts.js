/* ============================================================
   STRUCTRA V2 - Charts
   <structra-charts> - look at one column of an array.
   Numbers: summary, histogram and a trend line.
   Text and booleans: the most common values.
   Drawn as inline SVG, no chart library.

   Wiring (generated from the code below; update it when you add or remove an event):
     Listens to: charts:open
   ============================================================ */

class StructraCharts extends StructraDialog {
  static get MAX_BARS() { return 12; }
  static get BINS() { return 20; }
  static get TREND_POINTS() { return 300; }
  static get VALUE_COLUMN() { return '(value)'; }

  init() {
    super.init();
    this._sources = [];       // [{ path, label, rows }]
    this.on('charts:open', (pathData) => this._open(pathData || {}));
  }

  render() {
    this.mount({
      title: 'Charts',
      size: 'lg',
      head: `
        <label class="ch-field">List <select id="chSource"></select></label>
        <label class="ch-field">Column <select id="chColumn"></select></label>`,
      body: '<div class="ch-body" id="chBody"></div>',
    });
    this.root.addEventListener('change', (event) => {
      if (event.target.id === 'chSource') { this._fillColumns(); this._draw(); }
      else if (event.target.id === 'chColumn') this._draw();
    });
  }

  /* ---------- open / sources ---------- */

  _open({ path, column }) {
    const data = Structra.state.jsonData;
    if (!data) { Structra.toast('Open a file first'); return; }

    this._sources = Structra.dataEngine.findAllArrays(data, '')
      .filter((list) => Array.isArray(list.data) && list.data.length > 0)
      .map((list) => ({ path: list.path, label: `${list.path === '(root)' || list.path === '$' ? 'The whole list' : list.path} (${list.data.length.toLocaleString()} ${list.data.length === 1 ? 'item' : 'items'})`, rows: list.data }));
    if (!this._sources.length) { Structra.toast('No arrays to chart in this document'); return; }

    const esc = Structra.sharedHelpers.escapeHtml;
    this.queryOne('#chSource').innerHTML = this._sources
      .map((source, i) => `<option value="${i}">${esc(source.label)}</option>`).join('');

    // Prefer the requested array, then the first array of objects
    let index = this._sources.findIndex((source) => source.path === (path || '(root)') || source.path === path);
    if (index < 0) index = this._sources.findIndex((source) => this._isObjectRows(source.rows));
    this.queryOne('#chSource').value = String(Math.max(0, index));

    this._fillColumns(column);
    this.open();
    this._draw();
  }

  _isObjectRows(rows) {
    const first = rows.find((row) => row !== null && row !== undefined);
    return !!first && typeof first === 'object' && !Array.isArray(first);
  }

  _fillColumns(preferred) {
    const source = this._sources[parseInt(this.queryOne('#chSource').value, 10)];
    const selection = this.queryOne('#chColumn');
    const esc = Structra.sharedHelpers.escapeHtml;
    let columns;
    if (this._isObjectRows(source.rows)) {
      const seen = new Map();
      for (const row of source.rows.slice(0, 300)) {
        if (!row || typeof row !== 'object') continue;
        for (const [label, value] of Object.entries(row)) {
          if (value !== null && typeof value === 'object') continue;      // nested values are not chartable here
          seen.set(label, (seen.get(label) || 0) + 1);
        }
      }
      columns = [...seen.keys()];
    } else {
      columns = [StructraCharts.VALUE_COLUMN];
    }
    selection.innerHTML = columns.map((count) => `<option value="${esc(count)}">${esc(count)}</option>`).join('');
    if (preferred && columns.includes(preferred)) selection.value = preferred;
  }

  /* ---------- drawing ---------- */

  _values(source, column) {
    if (column === StructraCharts.VALUE_COLUMN) return source.rows;
    const out = new Array(source.rows.length);
    for (let i = 0; i < source.rows.length; i++) {
      const row = source.rows[i];
      out[i] = row && typeof row === 'object' ? row[column] : undefined;
    }
    return out;
  }

  _draw() {
    const body = this.queryOne('#chBody');
    const source = this._sources[parseInt(this.queryOne('#chSource').value, 10)];
    const column = this.queryOne('#chColumn').value;
    if (!source || !column) { body.innerHTML = '<p class="ch-note">Pick a list and a column.</p>'; return; }

    const all = this._values(source, column);
    const present = all.filter((value) => value !== null && value !== undefined);
    const nulls = all.length - present.length;
    if (!present.length) { body.innerHTML = '<p class="ch-note">This column has no values.</p>'; return; }

    const numeric = present.every((value) => typeof value === 'number' && Number.isFinite(value));
    body.innerHTML = numeric ? this._numeric(present, nulls) : this._categorical(present, nulls);
  }

  _statLine(label, value) {
    return `<div class="ch-stat"><span class="ch-stat-v">${Structra.sharedHelpers.escapeHtml(value)}</span><span class="ch-stat-l">${Structra.sharedHelpers.escapeHtml(label)}</span></div>`;
  }

  _formatNumber(number) {
    if (!Number.isFinite(number)) return String(number);
    return Math.abs(number) >= 1000 || Number.isInteger(number) ? number.toLocaleString() : number.toPrecision(4).replace(/\.?0+$/, '');
  }

  _numeric(values, nulls) {
    const count = values.length;
    let min = values[0], max = values[0], sum = 0;
    for (const value of values) { if (value < min) min = value; if (value > max) max = value; sum += value; }
    const sorted = [...values].sort((list, second) => list - second);
    const median = count % 2 ? sorted[(count - 1) / 2] : (sorted[count / 2 - 1] + sorted[count / 2]) / 2;

    const stats = [
      this._statLine('values', count.toLocaleString()), this._statLine('empty', nulls.toLocaleString()),
      this._statLine('min', this._formatNumber(min)), this._statLine('median', this._formatNumber(median)),
      this._statLine('mean', this._formatNumber(sum / count)), this._statLine('max', this._formatNumber(max)),
    ].join('');

    return `<div class="ch-stats">${stats}</div>
      <h4 class="ch-sub">Distribution</h4>${this._histogram(values, min, max)}
      <h4 class="ch-sub">In file order</h4>${this._trend(values, min, max)}`;
  }

  _histogram(values, min, max) {
    const width = 640, height = 170, paddingLeft = 8, paddingBottom = 22, paddingTop = 8;
    const bins = max === min ? 1 : StructraCharts.BINS;
    const counts = new Array(bins).fill(0);
    const span = (max - min) || 1;
    for (const value of values) counts[Math.min(bins - 1, Math.floor(((value - min) / span) * bins))]++;
    const peak = Math.max(...counts);
    const barWidth = (width - paddingLeft * 2) / bins;
    const bars = counts.map((count, i) => {
      const barHeight = peak ? (count / peak) * (height - paddingBottom - paddingTop) : 0;
      const low = min + (span * i) / bins, high = min + (span * (i + 1)) / bins;
      return `<rect class="ch-bar" x="${(paddingLeft + i * barWidth + 1).toFixed(1)}" y="${(height - paddingBottom - barHeight).toFixed(1)}" width="${Math.max(1, barWidth - 2).toFixed(1)}" height="${barHeight.toFixed(1)}"><title>${this._formatNumber(low)} to ${this._formatNumber(high)}: ${count.toLocaleString()}</title></rect>`;
    }).join('');
    return `<svg class="ch-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Histogram from ${this._formatNumber(min)} to ${this._formatNumber(max)}, tallest bar ${peak.toLocaleString()} values">
      ${bars}
      <line class="ch-axisline" x1="${paddingLeft}" y1="${height - paddingBottom}" x2="${width - paddingLeft}" y2="${height - paddingBottom}"/>
      <text class="ch-axis" x="${paddingLeft}" y="${height - 6}">${this._formatNumber(min)}</text>
      <text class="ch-axis" x="${width - paddingLeft}" y="${height - 6}" text-anchor="end">${this._formatNumber(max)}</text>
    </svg>
    <p class="ch-note">Each bar counts the values in one range, from ${this._formatNumber(min)} to ${this._formatNumber(max)}. The tallest bar holds ${peak.toLocaleString()} ${peak === 1 ? 'value' : 'values'}.</p>`;
  }

  _trend(values, min, max) {
    const width = 640, height = 120, paddingLeft = 46, paddingRight = 8, paddingTop = 8, paddingBottom = 20;
    const target = StructraCharts.TREND_POINTS;
    const stride = Math.max(1, Math.ceil(values.length / target));
    const pts = [];
    for (let i = 0; i < values.length; i += stride) pts.push(values[i]);
    const span = (max - min) || 1;
    const pathData = pts.map((point, i) => {
      const x = pts.length === 1 ? (paddingLeft + width - paddingRight) / 2 : paddingLeft + (i / (pts.length - 1)) * (width - paddingLeft - paddingRight);
      const y = height - paddingBottom - ((point - min) / span) * (height - paddingTop - paddingBottom);
      return (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
    }).join(' ');
    return `<svg class="ch-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Values in file order, ${values.length.toLocaleString()} values${stride > 1 ? ', every ' + stride + 'th shown' : ''}">
      <line class="ch-axisline" x1="${paddingLeft}" y1="${paddingTop}" x2="${paddingLeft}" y2="${height - paddingBottom}"/>
      <line class="ch-axisline" x1="${paddingLeft}" y1="${height - paddingBottom}" x2="${width - paddingRight}" y2="${height - paddingBottom}"/>
      <path class="ch-line" d="${pathData}"/>
      <text class="ch-axis" x="${paddingLeft - 6}" y="${paddingTop + 8}" text-anchor="end">${this._formatNumber(max)}</text>
      <text class="ch-axis" x="${paddingLeft - 6}" y="${height - paddingBottom}" text-anchor="end">${this._formatNumber(min)}</text>
      <text class="ch-axis" x="${paddingLeft}" y="${height - 5}">first row</text>
      <text class="ch-axis" x="${width - paddingRight}" y="${height - 5}" text-anchor="end">row ${values.length.toLocaleString()}</text>
    </svg>${stride > 1 ? `<p class="ch-note">Showing every ${stride}th value.</p>` : ''}`;
  }

  _categorical(values, nulls) {
    const frequency = new Map();
    for (const value of values) {
      const text = typeof value === 'string' ? value : String(value);
      frequency.set(text, (frequency.get(text) || 0) + 1);
    }
    const ranked = [...frequency.entries()].sort((list, second) => second[1] - list[1]);
    const top = ranked.slice(0, StructraCharts.MAX_BARS);
    const peak = top[0][1];
    const esc = Structra.sharedHelpers.escapeHtml;

    const stats = [
      this._statLine('values', values.length.toLocaleString()), this._statLine('empty', nulls.toLocaleString()),
      this._statLine('distinct', ranked.length.toLocaleString()),
    ].join('');

    const rows = top.map(([label, count]) => `
      <div class="ch-hrow" title="${esc(label)}: ${count.toLocaleString()}">
        <span class="ch-hlabel">${esc(label.length > 40 ? label.slice(0, 39) + '…' : label)}</span>
        <span class="ch-htrack"><span class="ch-hbar" style="width:${((count / peak) * 100).toFixed(1)}%"></span></span>
        <span class="ch-hcount">${count.toLocaleString()}</span>
      </div>`).join('');

    return `<div class="ch-stats">${stats}</div>
      <h4 class="ch-sub">Most common values</h4>
      <div class="ch-hbars">${rows}</div>
      ${ranked.length > top.length ? `<p class="ch-note">${(ranked.length - top.length).toLocaleString()} more distinct values not shown.</p>` : ''}`;
  }
}

customElements.define('structra-charts', StructraCharts);
