/* ============================================================
   STRUCTRA V2 - Type Definition Modal
   <structra-typedef> - Code generation overlay with language tabs,
   syntax highlighting preview, and copy/download actions.
   Uses Structra.typeCodeGenerator for all language generation.

   Wiring (generated from the code below; update it when you add or remove an event):
     Listens to: typedef:open
   ============================================================ */

class StructraTypedef extends StructraDialog {
  init() {
    super.init();
    this._lang = 'typescript';
    this._code = '';
    this._rootName = 'Root';

    this.on('typedef:open', (d) => this._open(d));
  }

  render() {
    this.mount({ title: 'Type Definitions', size: 'lg', body: `<div class="typedef-tabs" id="typedefTabs"></div>
        <div class="typedef-options">
          <label class="typedef-opt">
            <span>Name of the main type:</span>
            <input type="text" class="typedef-name-input" id="typedefName" value="Root" placeholder="Root">
            <span class="hint">Types for lists are named after it, for example RootItem.</span>
          </label>
        </div>
        <div class="typedef-code-wrap">
          <pre class="typedef-code" id="typedefCode"></pre>
        </div>
        <div class="typedef-actions">
          <button class="btn btn-primary" data-action="copy">Copy to Clipboard</button>
          <button class="btn" data-action="download">Download File</button>
        </div>` });

    this._renderTabs();

    this.addEventListener('click', (e) => {
      const action = e.target.closest('[data-action]');
      if (!action) return;
      const a = action.dataset.action;
      if (a === 'close') this.close();
      else if (a === 'copy') this._copy();
      else if (a === 'download') this._download();

      const tab = e.target.closest('[data-lang]');
      if (tab) {
        this._lang = tab.dataset.lang;
        this.querySelectorAll('.typedef-tab').forEach(t => t.classList.toggle('active', t.dataset.lang === this._lang));
        this._generate();
      }
    });

    // Also handle tab clicks directly
    this.addEventListener('click', (e) => {
      const tab = e.target.closest('[data-lang]');
      if (tab) {
        this._lang = tab.dataset.lang;
        this.querySelectorAll('.typedef-tab').forEach(t => t.classList.toggle('active', t.dataset.lang === this._lang));
        this._generate();
      }
    });

    this.$('#typedefName').addEventListener('input', (e) => {
      this._rootName = e.target.value.trim() || 'Root';
      this._generate();
    });
  }

  _renderTabs() {
    const raw = Structra.typeCodeGenerator ? Structra.typeCodeGenerator.getLanguages() : [];
    // getLanguages() returns [{id, label}] or string[]
    const languages = raw.map(item => typeof item === 'string' ? { id: item, label: item } : item);
    const container = this.$('#typedefTabs');
    if (!container) return;
    container.innerHTML = languages.map(lang =>
      `<button class="typedef-tab${lang.id === this._lang ? ' active' : ''}" data-lang="${lang.id}">${lang.label}</button>`
    ).join('');
  }

  _open(opts) {
    if (opts && opts.lang) this._lang = opts.lang;
    if (opts && opts.name) {
      this._rootName = opts.name;
      const nameInput = this.$('#typedefName');
      if (nameInput) nameInput.value = opts.name;
    }
    this.querySelectorAll('.typedef-tab').forEach(t => t.classList.toggle('active', t.dataset.lang === this._lang));
    this.open();
    this._generate();
  }


  _generate() {
    const data = Structra.state.jsonData;
    if (!data) {
      this._code = '// No data loaded';
      this._show();
      return;
    }

    try {
      this._code = Structra.typeCodeGenerator.generate(this._lang, data, this._rootName);
      this._show();
    } catch (err) {
      this._code = `// Error generating ${this._lang}: ${err.message}`;
      this._show();
    }
  }

  /** Show the code in colour for its language */
  _show() {
    Structra.codeView.colorize(this.$('#typedefCode'), this._code, this._lang);
  }

  _copy() {
    Structra.sharedHelpers.copy(this._code, 'Copied to clipboard');
  }

  _download() {
    const exts = { typescript: '.ts', python: '.py', csharp: '.cs', go: '.go', rust: '.rs', java: '.java', powerfx: '.fx', sql: '.sql' };
    const ext = exts[this._lang] || '.txt';
    Structra.sharedHelpers.download(this._code, `${this._rootName}${ext}`, 'text/plain');
    Structra.toast(`Downloaded ${this._rootName}${ext}`);
  }
}

customElements.define('structra-typedef', StructraTypedef);
