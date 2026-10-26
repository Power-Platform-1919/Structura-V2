/* ============================================================
   STRUCTRA V2 - Workspace Export/Import Component
   <structra-workspace> - Serialize and restore full workspace
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

      // Check the shape before anything is written: a damaged or hand-made file must not damage saved data
      const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
      if (ws.tabs !== undefined && !Array.isArray(ws.tabs)) { Structra.toast('This workspace file is damaged: its tabs are not a list.', 'error'); return; }
      const rawTabs = ws.tabs || (ws.data ? [{ label: ws.fileName || 'Imported', fileName: ws.fileName, data: ws.data }] : []);
      const tabs = rawTabs.filter((t) => isObj(t) && t.data !== null && typeof t.data === 'object');
      const skipped = rawTabs.length - tabs.length;
      const okList = (v) => (Array.isArray(v) ? v : null);
      const bookmarks = okList(ws.bookmarks) ? ws.bookmarks.filter((b) => isObj(b) && typeof b.path === 'string') : null;
      const snippets = okList(ws.snippets) ? ws.snippets.filter((x) => isObj(x) && typeof x.name === 'string' && typeof x.content === 'string') : null;
      const history = okList(ws.queryHistory);
      const settings = isObj(ws.settings) ? Object.fromEntries(Object.entries(ws.settings).filter(([k, v]) => /^structra_setting_\w+$/.test(k) && typeof v === 'string' && v.length < 200)) : null;
      this.close();
      const panel = document.querySelector('structra-input-panel');
      let opened = 0;
      for (const t of tabs) {
        if (Structra.state.jsonData) {
          const before = Structra.tabs.list.length;
          Structra.events.emit('tabs:add');
          if (Structra.tabs.list.length === before) break;              // the tab limit was reached
        }
        const label = String(t.label || t.fileName || 'Imported').slice(0, 80);
        await panel._loadSuccess(t.data, JSON.stringify(t.data), label);
        if (typeof t.view === 'string' && t.view !== 'overview') Structra.set('activeView', t.view);
        if (typeof t.path === 'string') Structra.set('currentPath', t.path);
        opened++;
      }

      const store = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage not available */ } };
      if (bookmarks) { store('structra_bookmarks', bookmarks); Structra.events.emit('bookmarks:changed'); }
      if (settings) for (const [k, v] of Object.entries(settings)) { try { localStorage.setItem(k, v); } catch { /* storage not available */ } }
      if (ws.theme) Structra.theme.restore(ws.theme);
      if (typeof ws.fontSize === 'number') Structra.set('fontSize', Math.max(10, Math.min(24, ws.fontSize)));
      if (history) store('structra_query_history', history);
      if (snippets) store('structra_snippets', snippets);

      const parts = [];
      if (opened) parts.push(`${opened} tab${opened === 1 ? '' : 's'} opened`);
      if (bookmarks) parts.push(`${bookmarks.length} bookmark${bookmarks.length === 1 ? '' : 's'}`);
      if (snippets) parts.push(`${snippets.length} snippet${snippets.length === 1 ? '' : 's'}`);
      if (settings || ws.theme) parts.push('settings and theme');
      if (skipped) parts.push(`${skipped} tab${skipped === 1 ? '' : 's'} skipped (no data)`);
      Structra.toast('Workspace restored: ' + (parts.join(', ') || 'nothing to restore'));
    } catch (e) {
      Structra.toast('Could not restore the workspace: ' + e.message, 'error');
    }
  }
}

customElements.define('structra-workspace', StructraWorkspace);
