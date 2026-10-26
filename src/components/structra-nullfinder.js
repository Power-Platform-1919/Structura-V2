/* ============================================================
   STRUCTRA V2 - Null/Empty Finder Component
   <structra-nullfinder> - Locate all null, empty, and missing
   values with navigation. Uses DuckDB WHERE col IS NULL queries
   when available.

   Wiring (generated from the code below; update it when you add or remove an event):
     Listens to: nullfinder:open
     Emits: tree:navigate-path
     Sets state: activeView, currentPath
   ============================================================ */

class StructraNullfinder extends StructraDialog {
  init() {
    super.init();
    this._results = [];
    this._idx = -1;

    this.on('nullfinder:open', () => { this.open(); this._scan(); });
  }

  render() {
    this.mount({ title: 'Null & Empty Finder', size: 'md', body: `<div class="nf-options">
          <label class="nf-opt"><input type="checkbox" id="nfNull" checked> empty (null)</label>
          <label class="nf-opt"><input type="checkbox" id="nfEmpty" checked> blank text</label>
          <label class="nf-opt" title="A key that other records in the same list have, and this one does not"><input type="checkbox" id="nfUndef" checked> missing from some records</label>
          <button class="btn nf-scan-btn" data-action="scan">Scan again</button>
        </div>
        <div class="nf-results" id="nfResults">
          <div class="nf-placeholder">Looking for empty values…</div>
        </div>
        <div class="nf-nav" id="nfNav" style="display:none">
          <button class="nf-nav-btn" data-action="prev">${Structra.icons.svg('chevron-left', { size: 14 })} Previous</button>
          <span class="nf-nav-count" id="nfNavCount">0/0</span>
          <button class="nf-nav-btn" data-action="next">Next ${Structra.icons.svg('chevron-right', { size: 14 })}</button>
        </div>` });

    this.addEventListener('click', (e) => {
      const item = e.target.closest('[data-nf-path]');
      if (item) { this._goToPath(item.dataset.nfPath); return; }
      const action = e.target.closest('[data-action]');
      if (!action) return;
      const a = action.dataset.action;
      if (a === 'close') this.close();
      else if (a === 'scan') this._scan();
      else if (a === 'prev') this._navigate(-1);
      else if (a === 'next') this._navigate(1);

    });
  }


  /** Show a result in the Tree (the other views have no place to show a path) */
  _goToPath(path) {
    const p = Structra.dataPaths.canonical(path);
    if (!['tree', 'table', 'graph', 'schema'].includes(Structra.state.activeView)) Structra.setState('activeView', 'tree');
    Structra.setState('currentPath', p);
    setTimeout(() => Structra.events.emit('tree:navigate-path', p), 80);
  }

  _scan() {
    const data = Structra.state.jsonData;
    if (!data) { Structra.toast('Open a file first', 'warning'); return; }
    const opts = {
      nulls: this.queryOne('#nfNull').checked,
      empty: this.queryOne('#nfEmpty').checked,
      undef: this.queryOne('#nfUndef').checked,
      zero: false,
      falsy: false,
    };
    this._results = this._scanInMemory(data, opts);
    this._idx = -1;
    this._renderResults();
  }

  /**
   * Walk the whole document. null, empty, zero and false are reported wherever they are.
   * A key counts as missing only against the other records of the same list: records that have it, one that does not.
   */
  _scanInMemory(data, opts) {
    const results = [];
    const key = (path, k) => (/^[A-Za-z_$][\w$]*$/.test(k) ? `${path}.${k}` : `${path}['${k}']`);
    const walk = (val, path) => {
      if (val === null) { if (opts.nulls) results.push({ path, type: 'null' }); return; }
      if (val === '') { if (opts.empty) results.push({ path, type: 'empty' }); return; }
      if (val === 0) { if (opts.zero) results.push({ path, type: 'zero' }); return; }
      if (val === false) { if (opts.falsy) results.push({ path, type: 'false' }); return; }
      if (typeof val !== 'object') return;
      if (Array.isArray(val)) {
        const records = val.filter((r) => r && typeof r === 'object' && !Array.isArray(r));
        if (opts.undef && records.length > 1) {
          const all = new Set();
          records.forEach((r) => Object.keys(r).forEach((k) => all.add(k)));
          val.forEach((r, i) => {
            if (!r || typeof r !== 'object' || Array.isArray(r)) return;
            for (const k of all) if (!(k in r)) results.push({ path: key(`${path}[${i}]`, k), type: 'missing' });
          });
        }
        val.forEach((v, i) => walk(v, `${path}[${i}]`));
      } else {
        for (const k of Object.keys(val)) walk(val[k], key(path, k));
      }
    };
    walk(data, '$');
    return results;
  }

  _renderResults() {
    const container = this.queryOne('#nfResults');
    const nav = this.queryOne('#nfNav');
    if (this._results.length === 0) {
      container.innerHTML = '<div class="nf-placeholder">None found. Nothing is null, empty or missing with these options.</div>';
      nav.style.display = 'none';
      return;
    }

    nav.style.display = '';
    this.queryOne('#nfNavCount').textContent = `${this._results.length.toLocaleString()} found`;

    // One line per field (value[*].Notes), with how many of each kind, so a column that is mostly empty stands out
    const groups = new Map();
    this._results.forEach((r, i) => {
      const pattern = r.path.replace(/\[\d+\]/g, '[*]');
      if (!groups.has(pattern)) groups.set(pattern, { pattern, first: r.path, counts: {}, total: 0, firstIdx: i });
      const g = groups.get(pattern);
      g.counts[r.type] = (g.counts[r.type] || 0) + 1;
      g.total++;
    });
    const rows = [...groups.values()].sort((a, b) => b.total - a.total);
    const esc = Structra.sharedHelpers.escapeHtml;
    container.innerHTML = rows.slice(0, 200).map((g) => `
      <div class="nf-item" data-nf-path="${esc(g.first)}" data-nf-idx="${g.firstIdx}" title="Show the first one">
        <span class="nf-path">${esc(g.pattern)}</span>
        <span class="nf-kinds">${Object.entries(g.counts).map(([t, n]) => `<span class="nf-badge nf-badge-${t}">${n.toLocaleString()} ${t}</span>`).join('')}</span>
      </div>`).join('') + (rows.length > 200 ? `<div class="nf-more">…and ${rows.length - 200} more fields</div>` : '');
  }

  _navigate(dir) {
    if (this._results.length === 0) return;
    this._idx = (this._idx + dir + this._results.length) % this._results.length;
    this.queryOne('#nfNavCount').textContent = `${this._idx + 1} of ${this._results.length.toLocaleString()}`;
    const r = this._results[this._idx];
    this._goToPath(r.path);
    const pattern = r.path.replace(/\[\d+\]/g, '[*]');
    this.querySelectorAll('.nf-item').forEach((el) => el.classList.toggle('nf-active', el.querySelector('.nf-path').textContent === pattern));
  }

}

customElements.define('structra-nullfinder', StructraNullfinder);
