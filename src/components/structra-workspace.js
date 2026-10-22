/* ============================================================
   STRUCTRA V2 — Workspace Export/Import Component
   <structra-workspace> — Serialize and restore full workspace
   state (tabs, bookmarks, settings, query history, undo stack).
   ============================================================ */

class StructraWorkspace extends StructraElement {
  init() {
    this.on('workspace:export', () => this._export());
    this.on('workspace:import', () => this._showImport());
    this.on('workspace:open', () => this._open());
    this.on('overlay:close', () => this._close());
  }

  render() {
    this.innerHTML = `<div class="ws-overlay" id="wsOverlay" style="display:none">
      <div class="ws-panel">
        <div class="ws-header">
          <span class="ws-title">Workspace</span>
          <button class="ws-close" data-action="close">${Structra.icons.svg('x', { size: 14 })}</button>
        </div>
        <div class="ws-body">
          <div class="ws-section">
            <h3>Export Workspace</h3>
            <p class="ws-desc">Save your current session including settings, bookmarks, query history, and snippets to a file.</p>
            <div class="ws-options">
              <label class="ws-opt"><input type="checkbox" id="wsExpData" checked> Include current data</label>
              <label class="ws-opt"><input type="checkbox" id="wsExpBookmarks" checked> Bookmarks</label>
              <label class="ws-opt"><input type="checkbox" id="wsExpSettings" checked> Settings</label>
              <label class="ws-opt"><input type="checkbox" id="wsExpHistory" checked> Query history</label>
              <label class="ws-opt"><input type="checkbox" id="wsExpSnippets" checked> Snippets</label>
              <label class="ws-opt"><input type="checkbox" id="wsExpUndo"> Undo history</label>
            </div>
            <button class="btn btn-primary" data-action="export">Export Workspace</button>
          </div>
          <div class="ws-divider"></div>
          <div class="ws-section">
            <h3>Import Workspace</h3>
            <p class="ws-desc">Restore a previously exported workspace file.</p>
            <input type="file" id="wsImportFile" accept=".structra,.json" class="ws-file-input">
            <button class="btn btn-primary" data-action="import">Import</button>
          </div>
        </div>
      </div>
    </div>`;

    this.addEventListener('click', (e) => {
      const action = e.target.closest('[data-action]');
      if (!action) return;
      const a = action.dataset.action;
      if (a === 'close') this._close();
      else if (a === 'export') this._export();
      else if (a === 'import') this._import();
    });
  }

  _open() { this.$('#wsOverlay').style.display = ''; }
  _close() { this.$('#wsOverlay').style.display = 'none'; }

  _export() {
    const ws = { version: 2, exportedAt: new Date().toISOString(), type: 'structra-workspace' };

    if (this.$('#wsExpData')?.checked !== false) {
      ws.data = Structra.state.jsonData;
      ws.fileName = Structra.state.fileName;
    }
    if (this.$('#wsExpBookmarks')?.checked !== false) {
      ws.bookmarks = JSON.parse(localStorage.getItem('structra_bookmarks') || '[]');
    }
    if (this.$('#wsExpSettings')?.checked !== false) {
      ws.settings = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith('structra_setting_')) ws.settings[key] = localStorage.getItem(key);
      }
      ws.theme = Structra.theme.snapshot();
      ws.fontSize = Structra.state.fontSize;
    }
    if (this.$('#wsExpHistory')?.checked !== false) {
      ws.queryHistory = JSON.parse(localStorage.getItem('structra_query_history') || '[]');
    }
    if (this.$('#wsExpSnippets')?.checked !== false) {
      ws.snippets = JSON.parse(localStorage.getItem('structra_snippets') || '[]');
    }
    if (this.$('#wsExpUndo')?.checked) {
      ws.undoHistory = Structra.undoStack.getHistory();
    }

    const json = JSON.stringify(ws, null, 2);
    Structra.util.download(json, `structra-workspace-${new Date().toISOString().slice(0, 10)}.structra`, 'application/json');
    Structra.toast('Workspace exported');
  }

  _showImport() { this._open(); }

  async _import() {
    const fileInput = this.$('#wsImportFile');
    const file = fileInput?.files?.[0];
    if (!file) { Structra.toast('Select a file', 'warning'); return; }

    try {
      const text = await file.text();
      const ws = JSON.parse(text);
      if (ws.type !== 'structra-workspace') { Structra.toast('Not a valid workspace file', 'error'); return; }

      // Restore data
      if (ws.data) {
        Structra.set('jsonData', ws.data);
        Structra.set('fileName', ws.fileName || 'imported.json');
        Structra.set('rawText', JSON.stringify(ws.data));
        Structra.set('fileSize', JSON.stringify(ws.data).length);
        Structra.engine.ingest(ws.data, ws.fileName || 'imported.json', JSON.stringify(ws.data).length);
      }

      // Restore bookmarks
      if (ws.bookmarks) {
        localStorage.setItem('structra_bookmarks', JSON.stringify(ws.bookmarks));
        Structra.events.emit('bookmarks:changed');
      }

      // Restore settings
      if (ws.settings) {
        for (const [k, v] of Object.entries(ws.settings)) localStorage.setItem(k, v);
      }
      if (ws.theme) Structra.theme.restore(ws.theme);
      if (ws.fontSize) Structra.set('fontSize', ws.fontSize);

      // Restore query history
      if (ws.queryHistory) {
        localStorage.setItem('structra_query_history', JSON.stringify(ws.queryHistory));
      }

      // Restore snippets
      if (ws.snippets) {
        localStorage.setItem('structra_snippets', JSON.stringify(ws.snippets));
      }

      this._close();
      Structra.toast('Workspace imported successfully');
    } catch (e) {
      Structra.toast('Import failed: ' + e.message, 'error');
    }
  }
}

customElements.define('structra-workspace', StructraWorkspace);
