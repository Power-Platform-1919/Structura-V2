/* ============================================================
   STRUCTRA V2 — Settings
   <structra-settings> — one place for the things you can change or clear:
   appearance, keyboard shortcuts, the SQL engine, and what is saved in this browser.
   ============================================================ */

class StructraSettings extends StructraOverlay {
  init() {
    super.init();
    this._confirming = null;
    this.on('settings:open', () => this.open());
    this.on('engine:duckdb-ready', () => { if (this.isOpen) this._renderSaved(); });
  }

  render() {
    this.mount({
      title: 'Settings',
      size: 'md',
      body: `
        <section class="th-section">
          <div class="th-row">
            <div><div class="th-label">Appearance</div><div class="hint">Light or dark, colour themes and text size.</div></div>
            <button class="btn btn-sm" type="button" data-set="appearance">Open Appearance</button>
          </div>
        </section>
        <section class="th-section">
          <div class="th-row">
            <div><div class="th-label">Keyboard shortcuts</div><div class="hint">Press ? at any time to see them.</div></div>
            <button class="btn btn-sm" type="button" data-set="shortcuts">Show shortcuts</button>
          </div>
        </section>
        <section class="th-section">
          <div class="th-row">
            <div><div class="th-label">SQL engine</div><div class="hint" id="setSqlHint"></div></div>
            <button class="btn btn-sm" type="button" data-set="sql" id="setSqlBtn">Start SQL now</button>
          </div>
        </section>
        <section class="th-section">
          <div class="th-label">Saved in this browser</div>
          <div class="hint">Nothing leaves your computer. These are kept so your work is there next time.</div>
          <label class="set-keep"><input type="checkbox" id="setKeep"> Keep the content of recent files, so they can be reopened from Recent</label>
          <div id="setSaved" class="set-saved"></div>
        </section>`,
      foot: '<button class="btn btn-primary" type="button" data-ov-close>Done</button>',
    });
    this.root.addEventListener('click', (e) => this._onClick(e));
    this.$('#setKeep').addEventListener('change', (e) => {
      Structra.settings.set('keepRecentContent', e.target.checked);
      Structra.toast(e.target.checked ? 'Recent keeps file contents' : 'Recent keeps only names and sizes from now on. Clear the list to remove contents already kept.');
    });
  }

  onOpen() { this.$('#setKeep').checked = Structra.settings.get('keepRecentContent') !== false; this._confirming = null; this._renderSql(); this._renderSaved(); }

  _read(key) { try { const v = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } }

  _renderSql() {
    const hint = this.$('#setSqlHint');
    const btn = this.$('#setSqlBtn');
    const ready = Structra.engine.duckReady;
    hint.textContent = ready
      ? 'Running. SQL works on this computer only.'
      : Structra.engine.duckFailed
        ? 'It could not start in this browser. Everything else still works.'
        : 'Off until you need it (Find with SELECT, Query with SQL). It takes a few seconds to start.';
    btn.hidden = !!ready || !!Structra.engine.duckFailed;
  }

  _renderSaved() {
    const rows = [
      ['recent', 'Recent files', this._read('structra_recent').length, 'structra_recent'],
      ['snippets', 'Snippets', this._read('structra_snippets').length, 'structra_snippets'],
      ['bookmarks', 'Bookmarks', this._read('structra_bookmarks').length, 'structra_bookmarks'],
      ['history', 'Query history', this._read('structra_query_history').length, 'structra_query_history'],
    ];
    this.$('#setSaved').innerHTML = rows.map(([id, label, n, key]) => `
      <div class="th-row set-row">
        <div>${label} <span class="hint">${n} saved</span></div>
        <button class="btn btn-sm" type="button" data-clear="${key}" ${n ? '' : 'disabled'}>${this._confirming === key ? 'Click again to clear' : 'Clear'}</button>
      </div>`).join('') + `
      <div class="th-row set-row">
        <div>Everything above, plus themes and settings</div>
        <button class="btn btn-sm btn-danger" type="button" data-clear="*">${this._confirming === '*' ? 'Click again to clear everything' : 'Clear everything'}</button>
      </div>`;
  }

  _onClick(e) {
    const act = e.target.closest('[data-set]');
    if (act) {
      const a = act.dataset.set;
      if (a === 'appearance') { this.close(); Structra.events.emit('theme:open'); }
      else if (a === 'shortcuts') { this.close(); Structra.events.emit('shortcuts:open'); }
      else if (a === 'sql') {
        act.disabled = true;
        this.$('#setSqlHint').textContent = 'Starting. This takes a few seconds the first time.';
        Promise.resolve(Structra.engine.enableSql()).finally(() => this._renderSql());
      }
      return;
    }
    const clr = e.target.closest('[data-clear]');
    if (!clr) return;
    const key = clr.dataset.clear;
    if (this._confirming !== key) { this._confirming = key; this._renderSaved(); return; }
    this._confirming = null;
    if (key === '*') {
      const mine = [];
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/^structra[._]/.test(k) && k !== 'structra.welcomeSeen') mine.push(k); }
      mine.forEach((k) => localStorage.removeItem(k));
      Structra.events.emit('bookmarks:changed');
      Structra.toast('Everything saved in this browser was cleared. Reload to see the default theme.');
    } else {
      localStorage.removeItem(key);
      if (key === 'structra_bookmarks') Structra.events.emit('bookmarks:changed');
      Structra.toast('Cleared');
    }
    this._renderSaved();
  }
}

customElements.define('structra-settings', StructraSettings);
