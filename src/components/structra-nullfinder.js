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

    this.addEventListener('click', (event) => {
      const item = event.target.closest('[data-nf-path]');
      if (item) { this._goToPath(item.dataset.nfPath); return; }
      const action = event.target.closest('[data-action]');
      if (!action) return;
      const actionName = action.dataset.action;
      if (actionName === 'close') this.close();
      else if (actionName === 'scan') this._scan();
      else if (actionName === 'prev') this._navigate(-1);
      else if (actionName === 'next') this._navigate(1);

    });
  }


  /** Show a result in the Tree (the other views have no place to show a path) */
  _goToPath(path) {
    const canonicalPath = Structra.dataPaths.canonical(path);
    if (!['tree', 'table', 'graph', 'schema'].includes(Structra.state.activeView)) Structra.setState('activeView', 'tree');
    Structra.setState('currentPath', canonicalPath);
    setTimeout(() => Structra.events.emit('tree:navigate-path', canonicalPath), 80);
  }

  _scan() {
    const data = Structra.state.jsonData;
    if (!data) { Structra.toast('Open a file first', 'warning'); return; }
    const options = {
      nulls: this.queryOne('#nfNull').checked,
      empty: this.queryOne('#nfEmpty').checked,
      undef: this.queryOne('#nfUndef').checked,
      zero: false,
      falsy: false,
    };
    this._results = this._scanInMemory(data, options);
    this._idx = -1;
    this._renderResults();
  }

  /**
   * Walk the whole document. null, empty, zero and false are reported wherever they are.
   * A key counts as missing only against the other records of the same list: records that have it, one that does not.
   */
  _scanInMemory(data, options) {
    const results = [];
    const key = (path, key) => (/^[A-Za-z_$][\w$]*$/.test(key) ? `${path}.${key}` : `${path}['${key}']`);
    const walk = (value, path) => {
      if (value === null) { if (options.nulls) results.push({ path, type: 'null' }); return; }
      if (value === '') { if (options.empty) results.push({ path, type: 'empty' }); return; }
      if (value === 0) { if (options.zero) results.push({ path, type: 'zero' }); return; }
      if (value === false) { if (options.falsy) results.push({ path, type: 'false' }); return; }
      if (typeof value !== 'object') return;
      if (Array.isArray(value)) {
        const records = value.filter((record) => record && typeof record === 'object' && !Array.isArray(record));
        if (options.undef && records.length > 1) {
          const all = new Set();
          records.forEach((record) => Object.keys(record).forEach((key) => all.add(key)));
          value.forEach((record, i) => {
            if (!record || typeof record !== 'object' || Array.isArray(record)) return;
            for (const columnKey of all) if (!(columnKey in record)) results.push({ path: key(`${path}[${i}]`, columnKey), type: 'missing' });
          });
        }
        value.forEach((child, i) => walk(child, `${path}[${i}]`));
      } else {
        for (const columnKey of Object.keys(value)) walk(value[columnKey], key(path, columnKey));
      }
    };
    walk(data, '$');
    return results;
  }

  _renderResults() {
    const container = this.queryOne('#nfResults');
    const navigation = this.queryOne('#nfNav');
    if (this._results.length === 0) {
      container.innerHTML = '<div class="nf-placeholder">None found. Nothing is null, empty or missing with these options.</div>';
      navigation.style.display = 'none';
      return;
    }

    navigation.style.display = '';
    this.queryOne('#nfNavCount').textContent = `${this._results.length.toLocaleString()} found`;

    // One line per field (value[*].Notes), with how many of each kind, so a column that is mostly empty stands out
    const groups = new Map();
    this._results.forEach((result, i) => {
      const pattern = result.path.replace(/\[\d+\]/g, '[*]');
      if (!groups.has(pattern)) groups.set(pattern, { pattern, first: result.path, counts: {}, total: 0, firstIdx: i });
      const group = groups.get(pattern);
      group.counts[result.type] = (group.counts[result.type] || 0) + 1;
      group.total++;
    });
    const rows = [...groups.values()].sort((action, second) => second.total - action.total);
    const esc = Structra.sharedHelpers.escapeHtml;
    container.innerHTML = rows.slice(0, 200).map((group) => `
      <div class="nf-item" data-nf-path="${esc(group.first)}" data-nf-idx="${group.firstIdx}" title="Show the first one">
        <span class="nf-path">${esc(group.pattern)}</span>
        <span class="nf-kinds">${Object.entries(group.counts).map(([key, value]) => `<span class="nf-badge nf-badge-${key}">${value.toLocaleString()} ${key}</span>`).join('')}</span>
      </div>`).join('') + (rows.length > 200 ? `<div class="nf-more">…and ${rows.length - 200} more fields</div>` : '');
  }

  _navigate(direction) {
    if (this._results.length === 0) return;
    this._idx = (this._idx + direction + this._results.length) % this._results.length;
    this.queryOne('#nfNavCount').textContent = `${this._idx + 1} of ${this._results.length.toLocaleString()}`;
    const result = this._results[this._idx];
    this._goToPath(result.path);
    const pattern = result.path.replace(/\[\d+\]/g, '[*]');
    this.querySelectorAll('.nf-item').forEach((element) => element.classList.toggle('nf-active', element.querySelector('.nf-path').textContent === pattern));
  }

}

customElements.define('structra-nullfinder', StructraNullfinder);
