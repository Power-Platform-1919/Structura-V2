/* ============================================================
   STRUCTRA V2 — Snippet Library Component
   <structra-snippets> — Save/load reusable JSON fragments.
   Stored in localStorage. Integrates with engine for validation.
   ============================================================ */

class StructraSnippets extends StructraOverlay {
  init() {
    super.init();
    this._snippets = this._load();
    this.on('snippets:open', () => this.open());
    this.on('snippets:save', (d) => this._saveFromEvent(d));
  }

  render() {
    this.mount({ title: 'Snippet Library', size: 'md', body: `<div class="snip-toolbar">
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

    this.addEventListener('click', (e) => {
      const action = e.target.closest('[data-action]');
      if (!action) return;
      const a = action.dataset.action;
      if (a === 'close') this.close();
      else if (a === 'save-current') this._showSaveForm();
      else if (a === 'confirm-save') this._confirmSave();
      else if (a === 'cancel-save') this._hideSaveForm();
      else if (a === 'use-snippet') this._useSnippet(action.dataset.idx);
      else if (a === 'delete-snippet') this._deleteSnippet(action.dataset.idx);
      else if (a === 'copy-snippet') this._copySnippet(action.dataset.idx);
    });

    this.$('#snipSearch').addEventListener('input', (e) => this._filterList(e.target.value));
  }

  onOpen() { this._renderList(); }

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
    const problem = (field, msg) => {
      const el = this.$(field);
      el.setAttribute('aria-invalid', 'true');
      el.classList.add('snip-invalid');
      el.focus();
      let note = this.$('#snipError');
      if (!note) { note = document.createElement('div'); note.id = 'snipError'; note.className = 'snip-error'; note.setAttribute('role', 'alert'); this.$('.snip-form-actions').before(note); }
      note.textContent = msg;
    };
    this.$$('#snipSaveForm [aria-invalid]').forEach((el) => { el.removeAttribute('aria-invalid'); el.classList.remove('snip-invalid'); });
    const old = this.$('#snipError');
    if (old) old.remove();
    if (!name) { problem('#snipName', 'Give the snippet a name so you can find it again.'); return; }
    if (!content) { problem('#snipContent', 'Add the JSON to save.'); return; }
    try { JSON.parse(content); } catch (e) { problem('#snipContent', 'This is not valid JSON: ' + e.message); return; }

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
      this.close();
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
    if (snip) Structra.util.copy(snip.content, 'Copied');
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
          <span class="snip-item-name">${Structra.util.esc(s.name)}</span>
          <span class="snip-item-size">${Structra.util.formatBytes(s.size)}</span>
        </div>
        <div class="snip-item-preview">${Structra.util.esc(s.content.slice(0, 80))}</div>
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


}

customElements.define('structra-snippets', StructraSnippets);
