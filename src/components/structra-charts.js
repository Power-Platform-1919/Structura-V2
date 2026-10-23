/* ============================================================
   STRUCTRA V2 — Charts
   <structra-charts> — look at one column of an array.
   Numbers: summary, histogram and a trend line.
   Text and booleans: the most common values.
   Drawn as inline SVG, no chart library.
   ============================================================ */

class StructraCharts extends StructraOverlay {
  static get MAX_BARS() { return 12; }
  static get BINS() { return 20; }
  static get TREND_POINTS() { return 300; }
  static get VALUE_COLUMN() { return '(value)'; }

  init() {
    super.init();
    this._sources = [];       // [{ path, label, rows }]
    this.on('charts:open', (d) => this._open(d || {}));
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
    this.root.addEventListener('change', (e) => {
      if (e.target.id === 'chSource') { this._fillColumns(); this._draw(); }
      else if (e.target.id === 'chColumn') this._draw();
    });
  }

  /* ---------- open / sources ---------- */

  _open({ path, column }) {
    const data = Structra.state.jsonData;
    if (!data) { Structra.toast('Load JSON first'); return; }

    this._sources = Structra.engine.findAllArrays(data, '')
      .filter((a) => Array.isArray(a.data) && a.data.length > 0)
      .map((a) => ({ path: a.path, label: `${a.path === '(root)' || a.path === '$' ? 'The whole list' : a.path} (${a.data.length.toLocaleString()} ${a.data.length === 1 ? 'item' : 'items'})`, rows: a.data }));
    if (!this._sources.length) { Structra.toast('No arrays to chart in this document'); return; }

    const esc = Structra.util.esc;
    this.$('#chSource').innerHTML = this._sources
      .map((s, i) => `<option value="${i}">${esc(s.label)}</option>`).join('');

    // Prefer the requested array, then the first array of objects
    let idx = this._sources.findIndex((s) => s.path === (path || '(root)') || s.path === path);
    if (idx < 0) idx = this._sources.findIndex((s) => this._isObjectRows(s.rows));
    this.$('#chSource').value = String(Math.max(0, idx));

    this._fillColumns(column);
    this.open();
    this._draw();
  }

  _isObjectRows(rows) {
    const first = rows.find((r) => r !== null && r !== undefined);
    return !!first && typeof first === 'object' && !Array.isArray(first);
  }

  _fillColumns(preferred) {
    const src = this._sources[parseInt(this.$('#chSource').value, 10)];
    const sel = this.$('#chColumn');
    const esc = Structra.util.esc;
    let cols;
    if (this._isObjectRows(src.rows)) {
      const seen = new Map();
      for (const r of src.rows.slice(0, 300)) {
        if (!r || typeof r !== 'object') continue;
        for (const [k, v] of Object.entries(r)) {
          if (v !== null && typeof v === 'object') continue;      // nested values are not chartable here
          seen.set(k, (seen.get(k) || 0) + 1);
        }
      }
      cols = [...seen.keys()];
    } else {
      cols = [StructraCharts.VALUE_COLUMN];
    }
    sel.innerHTML = cols.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    if (preferred && cols.includes(preferred)) sel.value = preferred;
  }

  /* ---------- drawing ---------- */

  _values(src, col) {
    if (col === StructraCharts.VALUE_COLUMN) return src.rows;
    const out = new Array(src.rows.length);
    for (let i = 0; i < src.rows.length; i++) {
      const r = src.rows[i];
      out[i] = r && typeof r === 'object' ? r[col] : undefined;
    }
    return out;
  }

  _draw() {
    const body = this.$('#chBody');
    const src = this._sources[parseInt(this.$('#chSource').value, 10)];
    const col = this.$('#chColumn').value;
    if (!src || !col) { body.innerHTML = '<p class="ch-note">Pick a list and a column.</p>'; return; }

    const all = this._values(src, col);
    const present = all.filter((v) => v !== null && v !== undefined);
    const nulls = all.length - present.length;
    if (!present.length) { body.innerHTML = '<p class="ch-note">This column has no values.</p>'; return; }

    const numeric = present.every((v) => typeof v === 'number' && Number.isFinite(v));
    body.innerHTML = numeric ? this._numeric(present, nulls) : this._categorical(present, nulls);
  }

  _stat(label, value) {
    return `<div class="ch-stat"><span class="ch-stat-v">${Structra.util.esc(value)}</span><span class="ch-stat-l">${Structra.util.esc(label)}</span></div>`;
  }

  _fmt(n) {
    if (!Number.isFinite(n)) return String(n);
    return Math.abs(n) >= 1000 || Number.isInteger(n) ? n.toLocaleString() : n.toPrecision(4).replace(/\.?0+$/, '');
  }

  _numeric(values, nulls) {
    const n = values.length;
    let min = values[0], max = values[0], sum = 0;
    for (const v of values) { if (v < min) min = v; if (v > max) max = v; sum += v; }
    const sorted = [...values].sort((a, b) => a - b);
    const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;

    const stats = [
      this._stat('values', n.toLocaleString()), this._stat('empty', nulls.toLocaleString()),
      this._stat('min', this._fmt(min)), this._stat('median', this._fmt(median)),
      this._stat('mean', this._fmt(sum / n)), this._stat('max', this._fmt(max)),
    ].join('');

    return `<div class="ch-stats">${stats}</div>
      <h4 class="ch-sub">Distribution</h4>${this._histogram(values, min, max)}
      <h4 class="ch-sub">In file order</h4>${this._trend(values, min, max)}`;
  }

  _histogram(values, min, max) {
    const W = 640, H = 170, padL = 8, padB = 22, padT = 8;
    const bins = max === min ? 1 : StructraCharts.BINS;
    const counts = new Array(bins).fill(0);
    const span = (max - min) || 1;
    for (const v of values) counts[Math.min(bins - 1, Math.floor(((v - min) / span) * bins))]++;
    const peak = Math.max(...counts);
    const bw = (W - padL * 2) / bins;
    const bars = counts.map((c, i) => {
      const h = peak ? (c / peak) * (H - padB - padT) : 0;
      const lo = min + (span * i) / bins, hi = min + (span * (i + 1)) / bins;
      return `<rect class="ch-bar" x="${(padL + i * bw + 1).toFixed(1)}" y="${(H - padB - h).toFixed(1)}" width="${Math.max(1, bw - 2).toFixed(1)}" height="${h.toFixed(1)}"><title>${this._fmt(lo)} to ${this._fmt(hi)}: ${c.toLocaleString()}</title></rect>`;
    }).join('');
    return `<svg class="ch-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Histogram from ${this._fmt(min)} to ${this._fmt(max)}, tallest bar ${peak.toLocaleString()} values">
      ${bars}
      <line class="ch-axisline" x1="${padL}" y1="${H - padB}" x2="${W - padL}" y2="${H - padB}"/>
      <text class="ch-axis" x="${padL}" y="${H - 6}">${this._fmt(min)}</text>
      <text class="ch-axis" x="${W - padL}" y="${H - 6}" text-anchor="end">${this._fmt(max)}</text>
    </svg>
    <p class="ch-note">Each bar counts the values in one range, from ${this._fmt(min)} to ${this._fmt(max)}. The tallest bar holds ${peak.toLocaleString()} ${peak === 1 ? 'value' : 'values'}.</p>`;
  }

  _trend(values, min, max) {
    const W = 640, H = 120, padL = 46, padR = 8, padT = 8, padB = 20;
    const target = StructraCharts.TREND_POINTS;
    const stride = Math.max(1, Math.ceil(values.length / target));
    const pts = [];
    for (let i = 0; i < values.length; i += stride) pts.push(values[i]);
    const span = (max - min) || 1;
    const d = pts.map((v, i) => {
      const x = pts.length === 1 ? (padL + W - padR) / 2 : padL + (i / (pts.length - 1)) * (W - padL - padR);
      const y = H - padB - ((v - min) / span) * (H - padT - padB);
      return (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
    }).join(' ');
    return `<svg class="ch-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Values in file order, ${values.length.toLocaleString()} values${stride > 1 ? ', every ' + stride + 'th shown' : ''}">
      <line class="ch-axisline" x1="${padL}" y1="${padT}" x2="${padL}" y2="${H - padB}"/>
      <line class="ch-axisline" x1="${padL}" y1="${H - padB}" x2="${W - padR}" y2="${H - padB}"/>
      <path class="ch-line" d="${d}"/>
      <text class="ch-axis" x="${padL - 6}" y="${padT + 8}" text-anchor="end">${this._fmt(max)}</text>
      <text class="ch-axis" x="${padL - 6}" y="${H - padB}" text-anchor="end">${this._fmt(min)}</text>
      <text class="ch-axis" x="${padL}" y="${H - 5}">first row</text>
      <text class="ch-axis" x="${W - padR}" y="${H - 5}" text-anchor="end">row ${values.length.toLocaleString()}</text>
    </svg>${stride > 1 ? `<p class="ch-note">Showing every ${stride}th value.</p>` : ''}`;
  }

  _categorical(values, nulls) {
    const freq = new Map();
    for (const v of values) {
      const k = typeof v === 'string' ? v : String(v);
      freq.set(k, (freq.get(k) || 0) + 1);
    }
    const ranked = [...freq.entries()].sort((a, b) => b[1] - a[1]);
    const top = ranked.slice(0, StructraCharts.MAX_BARS);
    const peak = top[0][1];
    const esc = Structra.util.esc;

    const stats = [
      this._stat('values', values.length.toLocaleString()), this._stat('empty', nulls.toLocaleString()),
      this._stat('distinct', ranked.length.toLocaleString()),
    ].join('');

    const rows = top.map(([k, c]) => `
      <div class="ch-hrow" title="${esc(k)}: ${c.toLocaleString()}">
        <span class="ch-hlabel">${esc(k.length > 40 ? k.slice(0, 39) + '…' : k)}</span>
        <span class="ch-htrack"><span class="ch-hbar" style="width:${((c / peak) * 100).toFixed(1)}%"></span></span>
        <span class="ch-hcount">${c.toLocaleString()}</span>
      </div>`).join('');

    return `<div class="ch-stats">${stats}</div>
      <h4 class="ch-sub">Most common values</h4>
      <div class="ch-hbars">${rows}</div>
      ${ranked.length > top.length ? `<p class="ch-note">${(ranked.length - top.length).toLocaleString()} more distinct values not shown.</p>` : ''}`;
  }
}

customElements.define('structra-charts', StructraCharts);
