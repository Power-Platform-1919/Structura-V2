/* ============================================================
   STRUCTRA V2 — Editor View Component
   <structra-editor> — raw JSON editor (format/minify/validate/apply)
   ============================================================ */

class StructraEditor extends StructraElement {
  static get observedAttributes() { return ['readonly']; }

  init() {
    this._stale = false;
    this.on('editor:repair', () => this._repair());
    this.on('editor:format', () => this._format());
    this.on('editor:minify', () => this._minify());
    this.on('state:jsonData', () => {
      this._stale = true;
      Structra.log.debug('Editor', 'jsonData changed — stale=true (activeView=' + Structra.state.activeView + ')');
      if (Structra.state.activeView === 'editor') this._loadData();
    });
    this.on('view:switched', (view) => {
      if (view === 'editor' && this._stale) {
        Structra.log.info('Editor', 'View switched to editor — loading data');
        this._loadData();
      }
    });
  }

  render() {
    this.innerHTML = `
      <div class="editor-container">
        <div class="editor-toolbar">
          <button class="toolbar-btn" data-action="apply">${Structra.icons.svg('play', { size: 14 })} Apply</button>
          <button class="toolbar-btn" data-action="format">Format</button>
          <button class="toolbar-btn" data-action="minify">Minify</button>
          <button class="toolbar-btn" data-action="repair" title="Fix trailing commas, quotes, comments and other mistakes">Repair</button>
          <button type="button" class="ed-status valid" id="edStatus" disabled>${Structra.icons.svg('check', { size: 14, color: 'success' })} Valid JSON</button>
        </div>
        <div class="editor-body">
          <div class="editor-gutter" id="edGutter" aria-hidden="true"></div>
          <textarea class="editor-textarea" id="editorArea" spellcheck="false" wrap="off" aria-label="JSON text"></textarea>
        </div>
      </div>`;

    const area = this.$('#editorArea');
    area.addEventListener('input', () => { this._gutter(); this._validate(); });
    area.addEventListener('scroll', () => { this.$('#edGutter').scrollTop = area.scrollTop; });
    // The status names the problem; a click goes to it
    this.$('#edStatus').addEventListener('click', () => {
      if (this._errorAt == null) return;
      area.focus();
      area.setSelectionRange(this._errorAt, Math.min(area.value.length, this._errorAt + 1));
      const line = area.value.slice(0, this._errorAt).split('\n').length;
      area.scrollTop = Math.max(0, (line - 4) * parseFloat(getComputedStyle(area).lineHeight));
    });

    this.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const a = btn.dataset.action;
      if (a === 'apply') this._apply();
      else if (a === 'format') this._format();
      else if (a === 'minify') this._minify();
      else if (a === 'repair') this._repair();
    });

    this._loadData();
  }

  _loadData() {
    this._stale = false;
    const area = this.$('#editorArea');
    if (!area) return;
    const data = Structra.state.jsonData;
    if (!data) { area.value = ''; this._gutter(); return; }
    // Guard: skip JSON.stringify for very large data to avoid "Invalid string length"
    const size = Structra.state.fileSize || 0;
    if (size > 10 * 1024 * 1024) {
      Structra.log.warn('Editor', 'File too large for editor (' + (size / 1048576).toFixed(1) + ' MB) — skipping stringify');
      area.value = '// File too large for editor (' + (size / 1048576).toFixed(1) + ' MB)\n// Use the tree view to explore this data.';
      const status = this.$('#edStatus');
      if (status) { status.innerHTML = Structra.icons.svg('triangle-alert', { size: 14, color: 'warning' }) + ' Too large'; status.className = 'ed-status warn'; }
      return;
    }
    try {
      Structra.log.info('Editor', 'JSON.stringify (' + (size / 1024).toFixed(1) + ' KB)...');
      const t0 = performance.now();
      area.value = JSON.stringify(data, null, 2);
      Structra.log.perf('Editor', 'JSON.stringify', performance.now() - t0);
    } catch (e) {
      Structra.log.error('Editor', 'JSON.stringify failed: ' + e.message, e);
      area.value = '// Could not stringify data: ' + e.message;
    }
    this._gutter();
    this._validate();
  }

  /** Line numbers beside the text (up to 50,000 lines; beyond that the gutter would cost more than it helps) */
  _gutter() {
    const area = this.$('#editorArea');
    const gutter = this.$('#edGutter');
    if (!area || !gutter) return;
    const lines = Math.min(area.value.split('\n').length, 50000);
    if (this._lines !== lines) {
      this._lines = lines;
      let out = '';
      for (let i = 1; i <= lines; i++) out += i + '\n';
      gutter.textContent = out;
    }
    gutter.scrollTop = area.scrollTop;
  }

  async _validate() {
    const status = this.$('#edStatus');
    const area = this.$('#editorArea');
    if (!status || !area) return;
    this._errorAt = null;
    try {
      await Structra.parseJsonAsync(area.value);
      status.innerHTML = Structra.icons.svg('check', { size: 14, color: 'success' }) + ' Valid JSON';
      status.className = 'ed-status valid';
      status.disabled = true;
      status.title = '';
    } catch (e) {
      // Say what is wrong and where: the browser's own parser knows the position
      let why = e.message;
      try { JSON.parse(area.value); } catch (native) { why = native.message; }
      const pos = /position\s+(\d+)/i.exec(why);
      const lc = /line\s+(\d+)\s+column\s+(\d+)/i.exec(why);
      let where = '';
      if (pos) {
        this._errorAt = Number(pos[1]);
        const before = area.value.slice(0, this._errorAt);
        where = `line ${before.split('\n').length}, column ${before.length - before.lastIndexOf('\n')}`;
      } else if (lc) {
        where = `line ${lc[1]}, column ${lc[2]}`;
      }
      const reason = why.replace(/\s*in JSON at position.*$/i, '').replace(/\s*\(line.*\)$/i, '').replace(/^JSON\.parse:\s*/i, '').trim();
      status.innerHTML = `${Structra.icons.svg('x', { size: 14, color: 'danger' })} ${Structra.util.esc(where ? `Line ${where.slice(5)}: ` : '')}${Structra.util.esc(reason.slice(0, 90))}`;
      status.className = 'ed-status error';
      status.disabled = this._errorAt == null;
      status.title = this._errorAt == null ? '' : 'Click to go to the problem';
    }
  }

  async _format() {
    const area = this.$('#editorArea');
    try {
      const data = await Structra.parseJsonAsync(area.value);
      area.value = JSON.stringify(data, null, 2);
      this._gutter();
      this._validate();
      Structra.toast('Formatted');
    } catch (e) {
      Structra.toast('Invalid JSON');
    }
  }

  async _minify() {
    const area = this.$('#editorArea');
    try {
      const data = await Structra.parseJsonAsync(area.value);
      area.value = JSON.stringify(data);
      this._gutter();
      this._validate();
      Structra.toast('Minified');
    } catch (e) {
      Structra.toast('Invalid JSON');
    }
  }

  async _repair() {
    const area = this.$('#editorArea');
    if (!area || !area.value.trim()) { Structra.toast('Nothing to repair'); return; }
    try {
      await Structra.parseJsonAsync(area.value);
      Structra.toast('Already valid JSON');
      return;
    } catch { /* invalid: fall through to repair */ }
    try {
      area.value = await Structra.jsonTools.repair(area.value);
      this._gutter();
      await this._validate();
      Structra.toast('Repaired. Review it, then Apply.');
    } catch (e) {
      Structra.toast('Could not repair: ' + e.message);
    }
  }

  async _apply() {
    const area = this.$('#editorArea');
    try {
      const data = await Structra.parseJsonAsync(area.value);
      // Keep the document as it was, so Ctrl+Z can bring it back, and mark the tab as changed
      const tabId = Structra.tabs.activeId;
      Structra.undoStack.push(Structra.state.jsonData, 'Before editing', tabId);
      Structra.set('jsonData', data);
      Structra.undoStack.push(data, 'Edited in the Editor', tabId);
      const tab = Structra.tabs.list.find((t) => t.id === tabId);
      if (tab) { tab.modified = true; Structra.events.emit('tabs:changed'); }
      Structra.toast('Changes applied. Ctrl+Z (outside this box) undoes them.');
    } catch (e) {
      this._validate();
      Structra.toast('These changes cannot be applied yet: ' + (this.$('#edStatus').textContent || 'the JSON is not valid').trim());
    }
  }
}

customElements.define('structra-editor', StructraEditor);
