/* ============================================================
   STRUCTRA V2 — Null/Empty Finder Component
   <structra-nullfinder> — Locate all null, empty, and missing
   values with navigation. Uses DuckDB WHERE col IS NULL queries
   when available.
   ============================================================ */

class StructraNullfinder extends StructraElement {
  init() {
    this._results = [];
    this._idx = -1;

    this.on('nullfinder:open', () => this._open());
    this.on('overlay:close', () => this._close());
  }

  render() {
    this.innerHTML = `<div class="nf-overlay" id="nfOverlay" style="display:none">
      <div class="nf-panel">
        <div class="nf-header">
          <span class="nf-title">Null & Empty Finder</span>
          <button class="nf-close" data-action="close">${Structra.icons.svg('x', { size: 14 })}</button>
        </div>
        <div class="nf-options">
          <label class="nf-opt"><input type="checkbox" id="nfNull" checked> null</label>
          <label class="nf-opt"><input type="checkbox" id="nfEmpty" checked> empty string</label>
          <label class="nf-opt"><input type="checkbox" id="nfUndef" checked> missing keys</label>
          <label class="nf-opt"><input type="checkbox" id="nfZero"> zero</label>
          <label class="nf-opt"><input type="checkbox" id="nfFalse"> false</label>
          <button class="btn btn-primary nf-scan-btn" data-action="scan">Scan</button>
        </div>
        <div class="nf-results" id="nfResults">
          <div class="nf-placeholder">Click Scan to find null/empty values</div>
        </div>
        <div class="nf-nav" id="nfNav" style="display:none">
          <button class="nf-nav-btn" data-action="prev">◀ Prev</button>
          <span class="nf-nav-count" id="nfNavCount">0/0</span>
          <button class="nf-nav-btn" data-action="next">Next ${Structra.icons.svg('chevron-right', { size: 14 })}</button>
        </div>
      </div>
    </div>`;

    this.addEventListener('click', (e) => {
      const action = e.target.closest('[data-action]');
      if (!action) return;
      const a = action.dataset.action;
      if (a === 'close') this._close();
      else if (a === 'scan') this._scan();
      else if (a === 'prev') this._navigate(-1);
      else if (a === 'next') this._navigate(1);

      const item = e.target.closest('[data-nf-path]');
      if (item) {
        Structra.set('currentPath', item.dataset.nfPath);
        Structra.events.emit('tree:navigate-path', item.dataset.nfPath);
      }
    });
  }

  _open() {
    this.$('#nfOverlay').style.display = '';
  }

  _close() {
    this.$('#nfOverlay').style.display = 'none';
  }

  async _scan() {
    const data = Structra.state.jsonData;
    if (!data) { Structra.toast('No data loaded', 'warning'); return; }

    const opts = {
      nulls: this.$('#nfNull').checked,
      empty: this.$('#nfEmpty').checked,
      undef: this.$('#nfUndef').checked,
      zero: this.$('#nfZero').checked,
      falsy: this.$('#nfFalse').checked,
    };

    // Try DuckDB approach for flat arrays
    let results = null;
    const ds = Structra.engine.getActive();
    if (ds && ds.meta.shape === 'flat-array' && Structra.engine.duckReady) {
      results = await this._scanDuckDb(ds, opts);
    }

    // Fallback: in-memory walk
    if (!results) {
      results = this._scanInMemory(data, opts);
    }

    this._results = results;
    this._idx = -1;
    this._renderResults();
  }

  async _scanDuckDb(ds, opts) {
    try {
      const cols = ds.indexes.columns ? ds.indexes.columns.map(c => c.name) : [];
      if (cols.length === 0) return null;

      const conditions = [];
      for (const col of cols) {
        const parts = [];
        if (opts.nulls) parts.push(`"${col}" IS NULL`);
        if (opts.empty) parts.push(`"${col}" = ''`);
        if (opts.zero) parts.push(`CAST("${col}" AS VARCHAR) = '0'`);
        if (parts.length > 0) conditions.push({ col, sql: parts.join(' OR ') });
      }

      const results = [];
      for (const { col, sql } of conditions) {
        const query = `SELECT rowid FROM (SELECT ROW_NUMBER() OVER () - 1 as rowid, "${col}" FROM data) WHERE ${sql}`;
        try {
          const r = await Structra.engine.runSql(query);
          if (r && r.rows) {
            for (const row of r.rows) {
              results.push({ path: `$[${row.rowid}].${col}`, type: 'null/empty', value: null, field: col, idx: row.rowid });
            }
          }
        } catch {}
      }
      return results.length > 0 ? results : null;
    } catch { return null; }
  }

  _scanInMemory(data, opts) {
    const results = [];
    const walk = (val, path, parentKeys) => {
      if (val === null && opts.nulls) {
        results.push({ path, type: 'null', value: null });
      } else if (val === '' && opts.empty) {
        results.push({ path, type: 'empty', value: '' });
      } else if (val === 0 && opts.zero) {
        results.push({ path, type: 'zero', value: 0 });
      } else if (val === false && opts.falsy) {
        results.push({ path, type: 'false', value: false });
      } else if (val && typeof val === 'object') {
        if (Array.isArray(val)) {
          for (let i = 0; i < val.length; i++) walk(val[i], `${path}[${i}]`, null);
        } else {
          const keys = Object.keys(val);
          for (const k of keys) walk(val[k], `${path}.${k}`, keys);
        }
      }

      // Check missing keys (compare against sibling objects in arrays)
      if (opts.undef && parentKeys && val && typeof val === 'object' && !Array.isArray(val)) {
        for (const k of parentKeys) {
          if (!(k in val)) results.push({ path: `${path}.${k}`, type: 'missing', value: undefined });
        }
      }
    };

    // For arrays, collect all keys first
    if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object') {
      const allKeys = new Set();
      data.forEach(row => { if (row) Object.keys(row).forEach(k => allKeys.add(k)); });
      const keyArr = [...allKeys];
      data.forEach((row, i) => {
        if (!row) { if (opts.nulls) results.push({ path: `$[${i}]`, type: 'null', value: null }); return; }
        for (const k of keyArr) {
          const v = row[k];
          if (!(k in row) && opts.undef) results.push({ path: `$[${i}].${k}`, type: 'missing', value: undefined });
          else if (v === null && opts.nulls) results.push({ path: `$[${i}].${k}`, type: 'null', value: null });
          else if (v === '' && opts.empty) results.push({ path: `$[${i}].${k}`, type: 'empty', value: '' });
          else if (v === 0 && opts.zero) results.push({ path: `$[${i}].${k}`, type: 'zero', value: 0 });
          else if (v === false && opts.falsy) results.push({ path: `$[${i}].${k}`, type: 'false', value: false });
        }
      });
    } else {
      walk(data, '$', null);
    }
    return results;
  }

  _renderResults() {
    const container = this.$('#nfResults');
    const nav = this.$('#nfNav');
    if (this._results.length === 0) {
      container.innerHTML = '<div class="nf-placeholder">No null/empty values found</div>';
      nav.style.display = 'none';
      return;
    }

    nav.style.display = '';
    this.$('#nfNavCount').textContent = `${this._results.length} found`;

    const max = 200;
    const showing = this._results.slice(0, max);
    container.innerHTML = showing.map((r, i) => `
      <div class="nf-item" data-nf-path="${Structra.util.esc(r.path)}" data-nf-idx="${i}">
        <span class="nf-badge nf-badge-${r.type}">${r.type}</span>
        <span class="nf-path">${Structra.util.esc(r.path)}</span>
      </div>`).join('') + (this._results.length > max ? `<div class="nf-more">…and ${this._results.length - max} more</div>` : '');
  }

  _navigate(dir) {
    if (this._results.length === 0) return;
    this._idx = (this._idx + dir + this._results.length) % this._results.length;
    this.$('#nfNavCount').textContent = `${this._idx + 1}/${this._results.length}`;
    const r = this._results[this._idx];
    Structra.set('currentPath', r.path);
    Structra.events.emit('tree:navigate-path', r.path);

    // Highlight current in list
    this.querySelectorAll('.nf-item').forEach(el => el.classList.toggle('nf-active', parseInt(el.dataset.nfIdx) === this._idx));
  }

}

customElements.define('structra-nullfinder', StructraNullfinder);
