/* ============================================================
   STRUCTRA V2 — Workspace Export/Import Component
   <structra-workspace> — Serialize and restore full workspace
   state (tabs, bookmarks, settings, query history, undo stack).
   ============================================================ */

class StructraWorkspace extends StructraOverlay {
  init() {
    super.init();
    this.on('workspace:export', () => this._export());
    this.on('workspace:import', () => this._showImport());
    this.on('workspace:open', () => this.open());
  }

  render() {
    this.mount({ title: 'Workspace', size: 'md', body: `<div class="ws-body">
          <div class="ws-section">
            <h3>Export Workspace</h3>
            <p class="ws-desc">Save every open tab with its data, plus settings, bookmarks, query history and snippets, to one file.</p>
            <div class="ws-options">
              <label class="ws-opt"><input type="checkbox" id="wsExpData" checked> Include all open tabs and their data</label>
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
            <p class="ws-desc">Open the tabs from a saved workspace file as new tabs. Nothing you have open is replaced.</p>
            <input type="file" id="wsImportFile" accept=".structra,.json" class="ws-file-input">
            <button class="btn btn-primary" data-action="import">Import</button>
          </div>
        </div>` });

    this.addEventListener('click', (e) => {
      const action = e.target.closest('[data-action]');
      if (!action) return;
      const a = action.dataset.action;
      if (a === 'close') this.close();
      else if (a === 'export') this._export();
      else if (a === 'import') this._import();
    });
  }

  /** Every open tab: its name, its data, where you were looking */
  _tabsSnapshot() {
    return Structra.tabs.list.map((t) => {
      const ds = Structra.engine.datasets.get(t.id);
      if (!ds || ds.raw === undefined || ds.raw === null) return null;
      const active = t.id === Structra.tabs.activeId;
      return {
        label: t.label,
        fileName: ds.meta.fileName,
        data: ds.raw,
        view: active ? Structra.state.activeView : t.view,
        path: active ? Structra.state.currentPath : t.path,
        active,
      };
    }).filter(Boolean);
  }

  _export() {
    const ws = { version: 3, exportedAt: new Date().toISOString(), type: 'structra-workspace' };

    if (this.$('#wsExpData')?.checked !== false) {
      ws.tabs = this._tabsSnapshot();
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
    const parts = [];
    if (ws.tabs) parts.push(`${ws.tabs.length} tab${ws.tabs.length === 1 ? '' : 's'}`);
    if (ws.bookmarks) parts.push(`${ws.bookmarks.length} bookmark${ws.bookmarks.length === 1 ? '' : 's'}`);
    if (ws.snippets) parts.push(`${ws.snippets.length} snippet${ws.snippets.length === 1 ? '' : 's'}`);
    Structra.toast('Workspace saved' + (parts.length ? ': ' + parts.join(', ') : ''));
  }

  _showImport() { this.open(); }

  async _import() {
    const fileInput = this.$('#wsImportFile');
    const file = fileInput?.files?.[0];
    if (!file) { Structra.toast('Choose a workspace file first', 'warning'); return; }

    try {
      const text = await file.text();
      const ws = JSON.parse(text);
      if (ws.type !== 'structra-workspace') { Structra.toast('This is not a Structra workspace file', 'error'); return; }

      // Documents open as new tabs, so nothing you have open is replaced
      const tabs = ws.tabs || (ws.data ? [{ label: ws.fileName || 'Imported', fileName: ws.fileName, data: ws.data }] : []);
      this.close();
      const panel = document.querySelector('structra-input-panel');
      let opened = 0;
      for (const t of tabs) {
        if (Structra.state.jsonData) Structra.events.emit('tabs:add');
        await panel._loadSuccess(t.data, JSON.stringify(t.data), t.label || t.fileName || 'Imported');
        if (t.view && t.view !== 'overview') Structra.set('activeView', t.view);
        if (t.path) Structra.set('currentPath', t.path);
        opened++;
      }

      if (ws.bookmarks) {
        localStorage.setItem('structra_bookmarks', JSON.stringify(ws.bookmarks));
        Structra.events.emit('bookmarks:changed');
      }
      if (ws.settings) {
        for (const [k, v] of Object.entries(ws.settings)) localStorage.setItem(k, v);
      }
      if (ws.theme) Structra.theme.restore(ws.theme);
      if (ws.fontSize) Structra.set('fontSize', ws.fontSize);
      if (ws.queryHistory) localStorage.setItem('structra_query_history', JSON.stringify(ws.queryHistory));
      if (ws.snippets) localStorage.setItem('structra_snippets', JSON.stringify(ws.snippets));

      const parts = [];
      if (opened) parts.push(`${opened} tab${opened === 1 ? '' : 's'} opened`);
      if (ws.bookmarks) parts.push(`${ws.bookmarks.length} bookmark${ws.bookmarks.length === 1 ? '' : 's'}`);
      if (ws.snippets) parts.push(`${ws.snippets.length} snippet${ws.snippets.length === 1 ? '' : 's'}`);
      if (ws.settings || ws.theme) parts.push('settings and theme');
      Structra.toast('Workspace restored: ' + (parts.join(', ') || 'nothing to restore'));
    } catch (e) {
      Structra.toast('Could not restore the workspace: ' + e.message, 'error');
    }
  }
}

customElements.define('structra-workspace', StructraWorkspace);
