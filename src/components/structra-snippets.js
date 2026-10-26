/* ============================================================
   STRUCTRA V2 - Snippet Library Component
   <structra-snippets> - Save/load reusable JSON fragments.
   Stored in localStorage. Integrates with engine for validation.

   Wiring (generated from the code below; update it when you add or remove an event):
     Listens to: snippets:open, snippets:save
   ============================================================ */

class StructraSnippets extends StructraDialog {
  init() {
    super.init();
    this._snippets = this._load();
    this.on('snippets:open', () => this.open());
    this.on('snippets:save', (draft) => this._saveFromEvent(draft));
  }

  render() {
    this.mount({ title: 'Snippet Library', size: 'md', body: `<p class="dlg-intro">Snippets are pieces of JSON you keep for later, such as a sample request. Open one to use it in a new tab.</p><div class="snip-toolbar">
          <button class="btn btn-primary" data-action="save-current">+ Save Current Selection</button>
          <input type="text" class="snip-search" id="snipSearch" placeholder="Search snippets…">
        </div>
        <div class="snip-list" id="snipList"></div>
        <div class="snip-save-form" id="snipSaveForm" style="display:none">
          <input type="text" class="snip-name-input" id="snipName" placeholder="Snippet name…">
          <textarea class="snip-content" id="snipContent" rows="4" placeholder="JSON content…"></textarea>
          <div class="snip-form-actions">
            <button class="btn btn-primary" data-action="confirm-save">Save</button>
            <button class="btn" data-action="cancel-save">Cancel</button>
          </div>
        </div>` });

    this._renderList();

    this.addEventListener('click', (event) => {
      const action = event.target.closest('[data-action]');
      if (!action) return;
      const actionName = action.dataset.action;
      if (actionName === 'close') this.close();
      else if (actionName === 'save-current') this._showSaveForm();
      else if (actionName === 'confirm-save') this._confirmSave();
      else if (actionName === 'cancel-save') this._hideSaveForm();
      else if (actionName === 'use-snippet') this._useSnippet(action.dataset.idx);
      else if (actionName === 'delete-snippet') this._deleteSnippet(action.dataset.idx);
      else if (actionName === 'copy-snippet') this._copySnippet(action.dataset.idx);
    });

    this.queryOne('#snipSearch').addEventListener('input', (event) => this._filterList(event.target.value));
  }

  onOpen() { this._renderList(); }

  _load() {
    try {
      const list = JSON.parse(localStorage.getItem('structra_snippets') || '[]');
      // Only well-formed entries: a damaged or imported value must not stop the library from opening
      return Array.isArray(list) ? list.filter((x) => x && typeof x.name === 'string' && typeof x.content === 'string').map((x) => ({ ...x, size: Number(x.size) || x.content.length })) : [];
    } catch { return []; }
  }

  _save() {
    try { localStorage.setItem('structra_snippets', JSON.stringify(this._snippets)); } catch { Structra.toast('Could not save: this browser is not allowing storage.', 'warning'); }
  }

  _showSaveForm() {
    const form = this.queryOne('#snipSaveForm');
    form.style.display = '';
    const path = Structra.state.currentPath || '$';
    const data = Structra.state.jsonData;
    // Pre-fill with current selection
    if (data && path !== '$') {
      const value = Structra.dataPaths.resolve(data, path);
      this.queryOne('#snipContent').value = JSON.stringify(value, null, 2);
    } else if (data) {
      this.queryOne('#snipContent').value = JSON.stringify(data, null, 2).slice(0, 2000);
    }
    this.queryOne('#snipName').focus();
  }

  _hideSaveForm() { this.queryOne('#snipSaveForm').style.display = 'none'; }

  _confirmSave() {
    const name = this.queryOne('#snipName').value.trim();
    const content = this.queryOne('#snipContent').value.trim();
    const problem = (field, message) => {
      const element = this.queryOne(field);
      element.setAttribute('aria-invalid', 'true');
      element.classList.add('snip-invalid');
      element.focus();
      let note = this.queryOne('#snipError');
      if (!note) { note = document.createElement('div'); note.id = 'snipError'; note.className = 'snip-error'; note.setAttribute('role', 'alert'); this.queryOne('.snip-form-actions').before(note); }
      note.textContent = message;
    };
    this.queryAll('#snipSaveForm [aria-invalid]').forEach((element) => { element.removeAttribute('aria-invalid'); element.classList.remove('snip-invalid'); });
    const old = this.queryOne('#snipError');
    if (old) old.remove();
    if (!name) { problem('#snipName', 'Give the snippet a name so you can find it again.'); return; }
    if (!content) { problem('#snipContent', 'Add the JSON to save.'); return; }
    try { JSON.parse(content); } catch (error) { problem('#snipContent', 'This is not valid JSON: ' + error.message); return; }

    this._snippets.unshift({ name, content, created: Date.now(), size: content.length });
    this._save();
    this._hideSaveForm();
    this._renderList();
    Structra.toast(`Snippet "${name}" saved`);
  }

  _saveFromEvent(draft) {
    if (!draft || !draft.name || !draft.content) return;
    this._snippets.unshift({ name: draft.name, content: draft.content, created: Date.now(), size: draft.content.length });
    this._save();
    Structra.toast(`Snippet "${draft.name}" saved`);
  }

  async _useSnippet(index) {
    const snippet = this._snippets[index];
    if (!snippet) return;
    let data;
    try { data = JSON.parse(snippet.content); } catch (error) { Structra.toast('This snippet is not valid JSON: ' + error.message, 'error'); return; }
    // A snippet opens in its own tab, so the document you are working on stays as it is
    const command = document.querySelector('structra-command');
    const opened = command && command._openInNewTab ? await command._openInNewTab(data, snippet.name) : false;
    if (!opened) { Structra.toast('Close a tab first: the limit of open tabs is reached.', 'warning'); return; }
    this.close();
    Structra.toast(`Opened snippet "${snippet.name}" in a new tab`);
  }

  _deleteSnippet(index) {
    const snippet = this._snippets[index];
    this._snippets.splice(index, 1);
    this._save();
    this._renderList();
    Structra.toast(`Deleted: ${snippet?.name || 'snippet'}`);
  }

  _copySnippet(index) {
    const snippet = this._snippets[index];
    if (snippet) Structra.sharedHelpers.copyToClipboard(snippet.content, 'Copied');
  }

  _renderList() {
    const container = this.queryOne('#snipList');
    if (!container) return;
    if (this._snippets.length === 0) {
      container.innerHTML = '<div class="snip-empty">No snippets saved yet</div>';
      return;
    }
    container.innerHTML = this._snippets.map((snippet, i) => `
      <div class="snip-item" data-snip-idx="${i}">
        <div class="snip-item-top">
          <span class="snip-item-name">${Structra.sharedHelpers.escapeHtml(snippet.name)}</span>
          <span class="snip-item-size">${Structra.sharedHelpers.formatBytes(snippet.size)}</span>
        </div>
        <div class="snip-item-preview">${Structra.sharedHelpers.escapeHtml(snippet.content.slice(0, 80))}</div>
        <div class="snip-item-actions">
          <button class="snip-act" data-action="use-snippet" data-idx="${i}">Load</button>
          <button class="snip-act" data-action="copy-snippet" data-idx="${i}">Copy</button>
          <button class="snip-act snip-act-danger" data-action="delete-snippet" data-idx="${i}">Delete</button>
        </div>
      </div>`).join('');
  }

  _filterList(query) {
    const searchText = query.toLowerCase();
    this.querySelectorAll('.snip-item').forEach(element => {
      const name = element.querySelector('.snip-item-name')?.textContent.toLowerCase() || '';
      element.style.display = name.includes(searchText) ? '' : 'none';
    });
  }


}

customElements.define('structra-snippets', StructraSnippets);
