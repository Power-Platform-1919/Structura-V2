/* ============================================================
   STRUCTRA V2 — Snippet Library Component
   <structra-snippets> — Save/load reusable JSON fragments.
   Stored in localStorage. Integrates with engine for validation.
   ============================================================ */

class StructraSnippets extends StructraElement {
  init() {
    this._snippets = this._load();
    this.on('snippets:open', () => this._open());
    this.on('snippets:save', (d) => this._saveFromEvent(d));
    this.on('overlay:close', () => this._close());
  }

  render() {
    this.innerHTML = `<div class="snip-overlay" id="snipOverlay" style="display:none">
      <div class="snip-panel">
        <div class="snip-header">
          <span class="snip-title">Snippet Library</span>
          <button class="snip-close" data-action="close">✕</button>
        </div>
        <div class="snip-toolbar">
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
        </div>
      </div>
    </div>`;

    this._renderList();

    this.addEventListener('click', (e) => {
      const action = e.target.closest('[data-action]');
      if (!action) return;
      const a = action.dataset.action;
      if (a === 'close') this._close();
      else if (a === 'save-current') this._showSaveForm();
      else if (a === 'confirm-save') this._confirmSave();
      else if (a === 'cancel-save') this._hideSaveForm();
      else if (a === 'use-snippet') this._useSnippet(action.dataset.idx);
      else if (a === 'delete-snippet') this._deleteSnippet(action.dataset.idx);
      else if (a === 'copy-snippet') this._copySnippet(action.dataset.idx);
    });

    this.$('#snipSearch').addEventListener('input', (e) => this._filterList(e.target.value));
  }

  _open() { this.$('#snipOverlay').style.display = ''; this._renderList(); }
  _close() { this.$('#snipOverlay').style.display = 'none'; }

  _load() {
    try { return JSON.parse(localStorage.getItem('structra_snippets') || '[]'); }
    catch { return []; }
  }

  _save() {
    localStorage.setItem('structra_snippets', JSON.stringify(this._snippets));
  }

  _showSaveForm() {
    const form = this.$('#snipSaveForm');
    form.style.display = '';
    const path = Structra.state.currentPath || '$';
    const data = Structra.state.jsonData;
    // Pre-fill with current selection
    if (data && path !== '$') {
      const val = Structra.paths.resolve(data, path);
      this.$('#snipContent').value = JSON.stringify(val, null, 2);
    } else if (data) {
      this.$('#snipContent').value = JSON.stringify(data, null, 2).slice(0, 2000);
    }
    this.$('#snipName').focus();
  }

  _hideSaveForm() { this.$('#snipSaveForm').style.display = 'none'; }

  _confirmSave() {
    const name = this.$('#snipName').value.trim();
    const content = this.$('#snipContent').value.trim();
    if (!name) { Structra.toast('Enter a name', 'warning'); return; }
    if (!content) { Structra.toast('Enter content', 'warning'); return; }
    // Validate JSON
    try { JSON.parse(content); } catch { Structra.toast('Invalid JSON', 'error'); return; }

    this._snippets.unshift({ name, content, created: Date.now(), size: content.length });
    this._save();
    this._hideSaveForm();
    this._renderList();
    Structra.toast(`Snippet "${name}" saved`);
  }

  _saveFromEvent(d) {
    if (!d || !d.name || !d.content) return;
    this._snippets.unshift({ name: d.name, content: d.content, created: Date.now(), size: d.content.length });
    this._save();
    Structra.toast(`Snippet "${d.name}" saved`);
  }

  _useSnippet(idx) {
    const snip = this._snippets[idx];
    if (!snip) return;
    try {
      const data = JSON.parse(snip.content);
      Structra.set('jsonData', data);
      Structra.set('rawText', snip.content);
      Structra.set('fileName', snip.name + '.json');
      Structra.set('fileSize', snip.content.length);
      Structra.engine.ingest(data, snip.name + '.json', snip.content.length);
      this._close();
      Structra.toast(`Loaded snippet: ${snip.name}`);
    } catch (e) { Structra.toast('Failed to load: ' + e.message, 'error'); }
  }

  _deleteSnippet(idx) {
    const snip = this._snippets[idx];
    this._snippets.splice(idx, 1);
    this._save();
    this._renderList();
    Structra.toast(`Deleted: ${snip?.name || 'snippet'}`);
  }

  _copySnippet(idx) {
    const snip = this._snippets[idx];
    if (snip) navigator.clipboard.writeText(snip.content).then(() => Structra.toast('Copied'));
  }

  _renderList() {
    const container = this.$('#snipList');
    if (!container) return;
    if (this._snippets.length === 0) {
      container.innerHTML = '<div class="snip-empty">No snippets saved yet</div>';
      return;
    }
    container.innerHTML = this._snippets.map((s, i) => `
      <div class="snip-item" data-snip-idx="${i}">
        <div class="snip-item-top">
          <span class="snip-item-name">${this._esc(s.name)}</span>
          <span class="snip-item-size">${this._formatSize(s.size)}</span>
        </div>
        <div class="snip-item-preview">${this._esc(s.content.slice(0, 80))}</div>
        <div class="snip-item-actions">
          <button class="snip-act" data-action="use-snippet" data-idx="${i}">Load</button>
          <button class="snip-act" data-action="copy-snippet" data-idx="${i}">Copy</button>
          <button class="snip-act snip-act-danger" data-action="delete-snippet" data-idx="${i}">Delete</button>
        </div>
      </div>`).join('');
  }

  _filterList(query) {
    const q = query.toLowerCase();
    this.querySelectorAll('.snip-item').forEach(el => {
      const name = el.querySelector('.snip-item-name')?.textContent.toLowerCase() || '';
      el.style.display = name.includes(q) ? '' : 'none';
    });
  }

  _formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    return (bytes / 1024).toFixed(1) + ' KB';
  }

  _esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
}

customElements.define('structra-snippets', StructraSnippets);
