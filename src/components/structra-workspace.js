/* ============================================================
   STRUCTRA V2 - Workspace Export/Import Component
   <structra-workspace> - Serialize and restore full workspace
   state (tabs, bookmarks, settings, query history, undo stack).

   Wiring (generated from the code below; update it when you add or remove an event):
     Listens to: workspace:export, workspace:import, workspace:open
     Emits: tabs:add, bookmarks:changed
     Sets state: activeView, currentPath, fontSize
   ============================================================ */

class StructraWorkspace extends StructraDialog {
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

    this.addEventListener('click', (event) => {
      const action = event.target.closest('[data-action]');
      if (!action) return;
      const actionName = action.dataset.action;
      if (actionName === 'close') this.close();
      else if (actionName === 'export') this._export();
      else if (actionName === 'import') this._import();
    });
  }

  /** Every open tab: its name, its data, where you were looking */
  _tabsSnapshot() {
    return Structra.tabs.list.map((tab) => {
      const dataset = Structra.dataEngine.datasets.get(tab.id);
      if (!dataset || dataset.raw === undefined || dataset.raw === null) return null;
      const active = tab.id === Structra.tabs.activeId;
      return {
        label: tab.label,
        fileName: dataset.meta.fileName,
        data: dataset.raw,
        view: active ? Structra.state.activeView : tab.view,
        path: active ? Structra.state.currentPath : tab.path,
        active,
      };
    }).filter(Boolean);
  }

  _export() {
    const workspace = { version: 3, exportedAt: new Date().toISOString(), type: 'structra-workspace' };

    if (this.queryOne('#wsExpData')?.checked !== false) {
      workspace.tabs = this._tabsSnapshot();
    }
    if (this.queryOne('#wsExpBookmarks')?.checked !== false) {
      workspace.bookmarks = JSON.parse(localStorage.getItem('structra_bookmarks') || '[]');
    }
    if (this.queryOne('#wsExpSettings')?.checked !== false) {
      workspace.settings = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith('structra_setting_')) workspace.settings[key] = localStorage.getItem(key);
      }
      workspace.theme = Structra.themeEngine.snapshot();
      workspace.fontSize = Structra.state.fontSize;
    }
    if (this.queryOne('#wsExpHistory')?.checked !== false) {
      workspace.queryHistory = JSON.parse(localStorage.getItem('structra_query_history') || '[]');
    }
    if (this.queryOne('#wsExpSnippets')?.checked !== false) {
      workspace.snippets = JSON.parse(localStorage.getItem('structra_snippets') || '[]');
    }
    if (this.queryOne('#wsExpUndo')?.checked) {
      workspace.undoHistory = Structra.undoStack.getHistory();
    }

    const json = JSON.stringify(workspace, null, 2);
    Structra.sharedHelpers.downloadFile(json, `structra-workspace-${new Date().toISOString().slice(0, 10)}.structra`, 'application/json');
    const parts = [];
    if (workspace.tabs) parts.push(`${workspace.tabs.length} tab${workspace.tabs.length === 1 ? '' : 's'}`);
    if (workspace.bookmarks) parts.push(`${workspace.bookmarks.length} bookmark${workspace.bookmarks.length === 1 ? '' : 's'}`);
    if (workspace.snippets) parts.push(`${workspace.snippets.length} snippet${workspace.snippets.length === 1 ? '' : 's'}`);
    Structra.toast('Workspace saved' + (parts.length ? ': ' + parts.join(', ') : ''));
  }

  _showImport() { this.open(); }

  async _import() {
    const fileInput = this.queryOne('#wsImportFile');
    const file = fileInput?.files?.[0];
    if (!file) { Structra.toast('Choose a workspace file first', 'warning'); return; }

    try {
      const text = await file.text();
      const workspace = JSON.parse(text);
      if (workspace.type !== 'structra-workspace') { Structra.toast('This is not a Structra workspace file', 'error'); return; }

      // Check the shape before anything is written: a damaged or hand-made file must not damage saved data
      const isObject = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
      if (workspace.tabs !== undefined && !Array.isArray(workspace.tabs)) { Structra.toast('This workspace file is damaged: its tabs are not a list.', 'error'); return; }
      const rawTabs = workspace.tabs || (workspace.data ? [{ label: workspace.fileName || 'Imported', fileName: workspace.fileName, data: workspace.data }] : []);
      const tabs = rawTabs.filter((rawTab) => isObject(rawTab) && rawTab.data !== null && typeof rawTab.data === 'object');
      const skipped = rawTabs.length - tabs.length;
      const okList = (value) => (Array.isArray(value) ? value : null);
      const bookmarks = okList(workspace.bookmarks) ? workspace.bookmarks.filter((bookmark) => isObject(bookmark) && typeof bookmark.path === 'string') : null;
      const snippets = okList(workspace.snippets) ? workspace.snippets.filter((x) => isObject(x) && typeof x.name === 'string' && typeof x.content === 'string') : null;
      const history = okList(workspace.queryHistory);
      const settings = isObject(workspace.settings) ? Object.fromEntries(Object.entries(workspace.settings).filter(([key, value]) => /^structra_setting_\w+$/.test(key) && typeof value === 'string' && value.length < 200)) : null;
      this.close();
      const panel = document.querySelector('structra-input-panel');
      let opened = 0;
      for (const tab of tabs) {
        if (Structra.state.jsonData) {
          const before = Structra.tabs.list.length;
          Structra.events.emit('tabs:add');
          if (Structra.tabs.list.length === before) break;              // the tab limit was reached
        }
        const label = String(tab.label || tab.fileName || 'Imported').slice(0, 80);
        await panel._loadSuccess(tab.data, JSON.stringify(tab.data), label);
        if (typeof tab.view === 'string' && tab.view !== 'overview') Structra.setState('activeView', tab.view);
        if (typeof tab.path === 'string') Structra.setState('currentPath', tab.path);
        opened++;
      }

      const store = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage not available */ } };
      if (bookmarks) { store('structra_bookmarks', bookmarks); Structra.events.emit('bookmarks:changed'); }
      if (settings) for (const [key, value] of Object.entries(settings)) { try { localStorage.setItem(key, value); } catch { /* storage not available */ } }
      if (workspace.theme) Structra.themeEngine.restore(workspace.theme);
      if (typeof workspace.fontSize === 'number') Structra.setState('fontSize', Math.max(10, Math.min(24, workspace.fontSize)));
      if (history) store('structra_query_history', history);
      if (snippets) store('structra_snippets', snippets);

      const parts = [];
      if (opened) parts.push(`${opened} tab${opened === 1 ? '' : 's'} opened`);
      if (bookmarks) parts.push(`${bookmarks.length} bookmark${bookmarks.length === 1 ? '' : 's'}`);
      if (snippets) parts.push(`${snippets.length} snippet${snippets.length === 1 ? '' : 's'}`);
      if (settings || workspace.theme) parts.push('settings and theme');
      if (skipped) parts.push(`${skipped} tab${skipped === 1 ? '' : 's'} skipped (no data)`);
      Structra.toast('Workspace restored: ' + (parts.join(', ') || 'nothing to restore'));
    } catch (error) {
      Structra.toast('Could not restore the workspace: ' + error.message, 'error');
    }
  }
}

customElements.define('structra-workspace', StructraWorkspace);
