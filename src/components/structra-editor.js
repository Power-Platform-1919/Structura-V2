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
          <button class="toolbar-btn" data-action="apply">▶ Apply</button>
          <button class="toolbar-btn" data-action="format">Format</button>
          <button class="toolbar-btn" data-action="minify">Minify</button>
          <button class="toolbar-btn" data-action="repair" title="Fix trailing commas, quotes, comments and other mistakes">Repair</button>
          <span class="ed-status valid" id="edStatus">✓ Valid JSON</span>
        </div>
        <textarea class="editor-textarea" id="editorArea" spellcheck="false"></textarea>
      </div>`;

    this.$('#editorArea').addEventListener('input', () => this._validate());

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
    if (!data) { area.value = ''; return; }
    // Guard: skip JSON.stringify for very large data to avoid "Invalid string length"
    const size = Structra.state.fileSize || 0;
    if (size > 10 * 1024 * 1024) {
      Structra.log.warn('Editor', 'File too large for editor (' + (size / 1048576).toFixed(1) + ' MB) — skipping stringify');
      area.value = '// File too large for editor (' + (size / 1048576).toFixed(1) + ' MB)\n// Use the tree view to explore this data.';
      const status = this.$('#edStatus');
      if (status) { status.textContent = '⚠ Too large'; status.className = 'ed-status warn'; }
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
  }

  async _validate() {
    const status = this.$('#edStatus');
    const area = this.$('#editorArea');
    if (!status || !area) return;
    try {
      await Structra.parseJsonAsync(area.value);
      status.textContent = '✓ Valid JSON';
      status.className = 'ed-status valid';
    } catch (e) {
      status.textContent = '✗ Invalid';
      status.className = 'ed-status error';
    }
  }

  async _format() {
    const area = this.$('#editorArea');
    try {
      const data = await Structra.parseJsonAsync(area.value);
      area.value = JSON.stringify(data, null, 2);
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
      Structra.set('jsonData', data);
      Structra.toast('Changes applied');
    } catch (e) {
      Structra.toast('Invalid JSON — cannot apply');
    }
  }
}

customElements.define('structra-editor', StructraEditor);
