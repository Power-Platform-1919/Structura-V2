/* ============================================================
   STRUCTRA V2 — Input Panel Component
   <structra-input-panel> — shared input card (overlay & in-canvas)
   Same card everywhere. Wrap in .io-overlay div for fullscreen mode.
   5 tabs: Upload File | Paste JSON | Import CSV | Load URL | Recent
   ============================================================ */

class StructraInputPanel extends StructraElement {
  init() {
    this._activeTab = 'file';
    // Ctrl+V anywhere on an empty tab loads what was copied, as long as it looks like data and the focus is not in a field
    if (!Structra._pasteBound) document.addEventListener('paste', (e) => {
      if (Structra.state.jsonData || !this.isConnected) return;
      const target = e.target;
      if (target && target.closest && target.closest('input, textarea, select, [contenteditable]')) return;
      const text = e.clipboardData && e.clipboardData.getData('text');
      if (!text || !/^\s*[\[{<\w"-]/.test(text)) return;
      e.preventDefault();
      this._loadText(text, 'Pasted ' + this._detectFormat(text, '').toUpperCase());
    });
    Structra._pasteBound = true;
    this.on('input:show-tab', (tab) => { const btn = this.$(`.io-tab[data-tab="${tab}"]`); if (btn) btn.click(); });
  }

  render() {
    this.innerHTML = `
      <div class="io-inline">
        <div class="io-box">
          <h2 class="io-brand">
            ${Structra.icons.svg('box')}
            Structra
          </h2>
          <div class="io-sub">Open a flow run's output, an API response or any data file, see what is in it, and copy the exact Power Automate or Power Fx expression for any value. Everything stays in your browser.</div>
          ${this._innerContent()}
          <details class="io-help">
            <summary>Where do I get JSON?</summary>
            <ul>
              <li><strong>Power Automate:</strong> open a run in the run history, open an action, and copy its <em>Outputs</em> (or <em>Inputs</em>). A "Get items" or "HTTP" output works as it is.</li>
              <li><strong>Canvas app:</strong> use the Monitor tool and copy a response, or put <code>JSON(MyCollection)</code> in a label and copy the text.</li>
              <li><strong>SharePoint or Dataverse:</strong> copy the output of a "Get items" or "List rows" action.</li>
              <li><strong>Any API:</strong> in the browser's developer tools, open the Network tab, click the request, and copy the response.</li>
              <li><strong>No data yet?</strong> Use <button class="io-link" type="button" data-role="help-sample">the sample</button> to see how it works.</li>
            </ul>
          </details>
        </div>
      </div>`;

    this._wireEvents();
  }

  /* ======== SHARED INNER CONTENT ======== */
  _innerContent() {
    return `
      <div class="seg io-tabs">
        <button class="seg-btn io-tab active" type="button" data-tab="file">Upload File</button>
        <button class="seg-btn io-tab" type="button" data-tab="text">Paste Data</button>
        <button class="seg-btn io-tab" type="button" data-tab="url">Load URL</button>
        <button class="seg-btn io-tab" type="button" data-tab="recent">Recent</button>
      </div>

      <div class="io-panel active" data-panel="file">
        <div class="io-drop-area" data-role="drop-area">
          <div class="io-drop-icon">
            ${Structra.icons.svg('file-plus', { stroke: 1.5 })}
          </div>
          <p><strong>Drop file here</strong> or click to browse</p>
          <p class="io-drop-formats">JSON • CSV • XML • YAML • TOML</p>
          <p class="io-drop-tip">Press Ctrl+V anywhere to paste, or <button class="io-link" type="button" data-role="sample-link">open the sample</button></p>
          <input type="file" data-role="file-input" accept=".json,.ndjson,.jsonl,.txt,.csv,.tsv,.xml,.yaml,.yml,.toml" multiple style="display:none">
        </div>
      </div>

      <div class="io-panel" data-panel="text">
        <div class="io-format-row">
          <label class="io-format-label">Format:</label>
          <select class="io-format-select" data-role="paste-format">
            <option value="auto" selected>Auto-detect</option>
            <option value="json">JSON</option>
            <option value="csv">CSV</option>
            <option value="xml">XML</option>
            <option value="yaml">YAML</option>
            <option value="toml">TOML</option>
          </select>
        </div>
        <textarea class="io-textarea" data-role="paste-input" placeholder="Paste JSON, CSV, XML, YAML or TOML here" spellcheck="false"></textarea>
        <div class="io-actions">
          <button class="io-btn-go" data-action="parse-text">${Structra.icons.svg('play', { size: 14 })} Open <kbd class="io-kbd">Ctrl+Enter</kbd></button>
          <button class="io-btn-sec" data-action="sample">Open the sample</button>
        </div>
      </div>

      <div class="io-panel" data-panel="url">
        <p class="io-url-help">Open JSON from a web address. For a public file, paste the address and press Send. Auth, Headers and Body are only for services that need them. Your browser can only read addresses that allow it (CORS): if one is blocked, save the file and use Upload File.</p>
        <div class="io-api-row">
          <select class="io-api-method" data-role="api-method">
            <option value="GET" selected>GET</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="PATCH">PATCH</option>
            <option value="DELETE">DELETE</option>
          </select>
          <input type="text" class="io-api-url" data-role="api-url" placeholder="https://api.example.com/data" autocomplete="off">
          <button class="io-btn-go io-api-send" data-role="api-send">${Structra.icons.svg('play', { size: 14 })} Send</button>
        </div>

        <div class="io-api-options">
          <div class="tabs io-api-tabs">
            <button class="tab io-api-tab active" type="button" data-aptab="auth">Auth</button>
            <button class="tab io-api-tab" type="button" data-aptab="headers">Headers</button>
            <button class="tab io-api-tab" type="button" data-aptab="body">Body</button>
          </div>

          <div class="io-api-panel active" data-appanel="auth">
            <select class="io-api-auth-type" data-role="auth-type">
              <option value="none" selected>No Auth</option>
              <option value="bearer">Bearer Token</option>
              <option value="basic">Basic Auth</option>
              <option value="apikey">API Key</option>
            </select>
            <div class="io-api-auth-fields" data-role="auth-fields"></div>
          </div>

          <div class="io-api-panel" data-appanel="headers">
            <div class="io-api-headers-list" data-role="headers-list"></div>
            <button class="io-api-add-row" data-action="add-header">+ Add Header</button>
          </div>

          <div class="io-api-panel" data-appanel="body">
            <select class="io-api-body-type" data-role="body-type">
              <option value="none" selected>No Body</option>
              <option value="json">JSON</option>
              <option value="text">Plain Text</option>
              <option value="form">Form URL-Encoded</option>
            </select>
            <textarea class="io-textarea io-api-body-editor" data-role="body-editor" placeholder='{"key": "value"}' style="display:none" spellcheck="false"></textarea>
          </div>
        </div>

        <div class="io-api-status" data-role="api-status"></div>
        <div class="io-error" data-role="url-error"></div>
      </div>

      <div class="io-panel" data-panel="recent">
        <div class="io-recent-list" data-role="recent-list">
          <div class="io-recent-empty">No recent files</div>
        </div>
      </div>

      <div class="io-error" data-role="error"></div>`;
  }

  /* ======== EVENT WIRING ======== */
  _wireEvents() {
    // Tab switching
    this.$$('.io-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        this._activeTab = btn.dataset.tab;
        this.$$('.io-tab').forEach(b => b.classList.toggle('active', b === btn));
        this.$$('.io-panel').forEach(p => p.classList.toggle('active', p.dataset.panel === this._activeTab));
        this._clearError();
        if (this._activeTab === 'recent') this._renderRecent();
      });
    });

    // File upload
    const dropArea = this.$('[data-role="drop-area"]');
    const fileInput = this.$('[data-role="file-input"]');
    dropArea.addEventListener('click', () => fileInput.click());
    dropArea.addEventListener('dragover', (e) => { e.preventDefault(); dropArea.classList.add('dragover'); });
    dropArea.addEventListener('dragleave', () => dropArea.classList.remove('dragover'));
    dropArea.addEventListener('drop', (e) => {
      e.preventDefault(); dropArea.classList.remove('dragover');
      if (e.dataTransfer.files.length) this._readFiles(e.dataTransfer.files);
    });
    fileInput.addEventListener('change', () => {
      if (fileInput.files.length) this._readFiles(fileInput.files);
    });

    // Paste & parse (unified)
    this.$('[data-action="parse-text"]').addEventListener('click', () => this._parseText());
    this.$('[data-role="paste-input"]').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); this._parseText(); }
    });
    const helpSample = this.$('[data-role="help-sample"]');
    if (helpSample) helpSample.addEventListener('click', () => this._loadSample());

    // Sample
    const sampleBtn = this.$('[data-action="sample"]');
    if (sampleBtn) sampleBtn.addEventListener('click', () => this._loadSample());
    const sampleLink = this.$('[data-role="sample-link"]');
    if (sampleLink) sampleLink.addEventListener('click', (e) => { e.stopPropagation(); this._loadSample(); });

    // URL / API
    this.$('[data-role="api-url"]').addEventListener('keydown', (e) => { if (e.key === 'Enter') this._apiSend(); });
    this.$('[data-role="api-send"]').addEventListener('click', () => this._apiSend());

    // API sub-tabs
    this.$$('.io-api-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.$$('.io-api-tab').forEach(t => t.classList.toggle('active', t === tab));
        this.$$('.io-api-panel').forEach(p => p.classList.toggle('active', p.dataset.appanel === tab.dataset.aptab));
      });
    });

    // Auth type
    this.$('[data-role="auth-type"]').addEventListener('change', () => this._renderAuthFields());

    // Add header
    this.$('[data-action="add-header"]').addEventListener('click', () => this._addHeaderRow());

    // Remove header (delegation)
    this.$('[data-role="headers-list"]').addEventListener('click', (e) => {
      if (e.target.closest('.io-kv-remove')) e.target.closest('.io-kv-row').remove();
    });

    // Body type
    this.$('[data-role="body-type"]').addEventListener('change', () => {
      const type = this.$('[data-role="body-type"]').value;
      const editor = this.$('[data-role="body-editor"]');
      editor.style.display = type === 'none' ? 'none' : 'block';
      if (type === 'json') editor.placeholder = '{"key": "value"}';
      else if (type === 'form') editor.placeholder = 'key1=value1&key2=value2';
      else editor.placeholder = 'Enter request body...';
    });

    // Clipboard auto-detect (once globally)
    if (!StructraInputPanel._clipInit) {
      StructraInputPanel._clipInit = true;
      this._setupClipboardDetect();
    }
  }

  /* ======== LOAD SUCCESS ======== */
  async _loadSuccess(data, text, name) {
    // Data nested very deeply freezes every view: keep the first 200 levels and say so
    const depth = Structra.util.capDepth(data, 200);
    Structra.parseNotes = Object.assign(Structra.parseNotes || {}, { deepest: depth.capped ? depth.deepest : 0 });
    const unopenable = Structra.describeUnopenable(data);
    if (unopenable) {
      const msg = name + ' contains only ' + unopenable + ', so there is nothing to explore.';
      Structra.toast(msg);
      this._showError(msg, '');
      return;
    }
    // The next document starts with an empty paste box and automatic format
    const pasteBox = this.$('[data-role="paste-input"]');
    if (pasteBox) pasteBox.value = '';
    const pasteFormat = this.$('[data-role="paste-format"]');
    if (pasteFormat) pasteFormat.value = 'auto';
    Structra.log.info('InputPanel', '_loadSuccess: ' + name + ' (' + (text.length / 1024).toFixed(1) + ' KB text)');
    const t0 = performance.now();

    // Show loading overlay — message updates at each step
    Structra.events.emit('loading:show', 'Parsing ' + name + '…');

    // A File already knows its size; copying a huge string into a Blob just to measure it costs ~250 ms
    const byteSize = this._knownBytes || new Blob([text]).size;
    this._knownBytes = 0;
    // Keep the original File for Recents when the text is exactly what it contained (no copy needed)
    const rawSource = this._currentFile && this._fileText === text ? this._currentFile : text;
    this._currentFile = null;
    this._fileText = null;
    Structra.log.info('InputPanel', 'File size: ' + (byteSize / 1048576).toFixed(2) + ' MB');

    // Ingest into engine (indexes + DuckDB registration)
    Structra.events.emit('loading:show', 'Indexing data…');
    const tabId = Structra.tabs.activeId;
    await Structra.engine.ingest(tabId, data, {
      fileName: name,
      fileSize: byteSize,
      rawSource,
    });

    // Fire state events — triggers view rendering
    Structra.events.emit('loading:show', 'Rendering views…');
    Structra.log.debug('InputPanel', 'Setting jsonData...');
    Structra.set('jsonData', data);
    Structra.log.perf('InputPanel', 'set(jsonData) + all listeners', performance.now() - t0);
    Structra.set('fileName', name);
    Structra.set('fileSize', byteSize);
    Structra.set('currentPath', '$');
    // A new document opens on its overview, unless it is so big that computing it would make the first view wait (measured: 88 MB is ready in under 2 s)
    if (byteSize <= 120 * 1048576) Structra.set('activeView', 'overview');
    this._tipOnce();

    // Duplicate keys are invisible after parsing (JSON.parse keeps the last one), so scan the text
    // This runs in the background and yields to the page, so it never delays the first paint.
    Structra.set('duplicateKeys', []);
    if (/^\s*[\[{]/.test(text) && text.length <= 8 * 1048576) {
      Structra.jsonTools.findDuplicateKeys(text).then((dupes) => {
        if (Structra.state.fileName !== name) return;            // another file was opened meanwhile
        Structra.set('duplicateKeys', dupes);
        if (dupes.length) Structra.toast(dupes.length + ' duplicate key' + (dupes.length === 1 ? '' : 's') + ' found');
      });
    }

    this._saveRecent(name, text, byteSize);

    // Hide loading overlay after UI has painted.
    // Double-rAF ensures one full paint cycle has completed.
    // If the overview is active, wait for its async render to finish first (engine:analysisComplete).
    if (Structra.state.activeView === 'overview') {
      Structra.events.emit('loading:show', 'Computing statistics…');
      const _loadingTimeout = setTimeout(() => Structra.events.emit('loading:hide'), 8000);
      Structra.events.once('engine:analysisComplete', () => {
        clearTimeout(_loadingTimeout);
        requestAnimationFrame(() => Structra.events.emit('loading:hide'));
      });
    } else {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => Structra.events.emit('loading:hide'));
      });
    }

    const deep = (Structra.parseNotes && Structra.parseNotes.deepest) || 0;
    const big = (Structra.parseNotes && Structra.parseNotes.bigNumbers) || 0;
    Structra.toast('Loaded ' + name + (big ? `. ${big} very large number${big === 1 ? ' was' : 's were'} kept as text so no digit is lost.` : '') + (deep ? `. It is nested ${deep.toLocaleString()} levels deep: only the first 200 levels are shown.` : ''));
    Structra.parseNotes = {};
    // Auto-hide overlay wrapper if present
    const overlay = this.closest('.io-overlay');
    if (overlay) overlay.classList.remove('show');
    Structra.log.perf('InputPanel', '_loadSuccess total', performance.now() - t0);
  }

  /* ======== FORMAT DETECTION ======== */
  _detectFormat(text, ext) {
    // Extension-based
    if (ext === 'csv' || ext === 'tsv') return 'csv';
    if (ext === 'xml') return 'xml';
    if (ext === 'yaml' || ext === 'yml') return 'yaml';
    if (ext === 'toml') return 'toml';
    if (ext === 'ndjson' || ext === 'jsonl') return 'ndjson';
    if (ext === 'json') return this._looksLikeLines(text) ? 'ndjson' : 'json';
    // Content-based heuristics
    const trimmed = text.trimStart();
    if (this._looksLikeLines(trimmed)) return 'ndjson';
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json';
    if (trimmed.startsWith('<?xml') || trimmed.startsWith('<')) return 'xml';
    if (/^\[\w+\]/m.test(trimmed) && trimmed.includes('=')) return 'toml';
    if (/^---\s*$/m.test(trimmed) || /^\w[\w\s]*:/m.test(trimmed)) return 'yaml';
    // Fallback: rows of values separated by a comma, semicolon, tab or bar (Excel in many countries writes semicolons)
    const lines = trimmed.split(/\r?\n/).filter((l) => l.trim()).slice(0, 5);
    if (lines.length >= 2 && [',', ';', '\t', '|'].some((d) => lines[0].includes(d) && lines.every((l) => l.split(d).length === lines[0].split(d).length))) return 'csv';
    if (trimmed.includes(',') && trimmed.includes('\n')) return 'csv';
    return 'json';
  }

  /** JSON Lines: one complete object per line (a common export format) */
  _looksLikeLines(text) {
    const m = /^\s*(\{[^\n]*\})[ \t\r]*\n\s*\{/.exec(String(text).slice(0, 20000));
    if (!m) return false;
    try { const first = JSON.parse(m[1]); return first !== null && typeof first === 'object'; } catch { return false; }
  }

  /* ======== FILE UPLOAD ======== */
  _readFile(file) {
    Structra.log.info('InputPanel', '_readFile: ' + file.name + ' (' + (file.size / 1048576).toFixed(2) + ' MB)');
    this._knownBytes = file.size;
    this._currentFile = file;
    return new Promise((resolve) => {
    const reader = new FileReader();
    const ext = (file.name || '').split('.').pop().toLowerCase();
    reader.onload = async () => {
      const text = reader.result;
      this._fileText = text;
      Structra.log.info('InputPanel', 'FileReader done — ' + text.length + ' chars (' + ext + ')');
      const format = this._detectFormat(text, ext);
      Structra.log.info('InputPanel', 'Detected format: ' + format);
      try {
        await this._parseByFormat(text, format, file.name);
      } catch (e) {
        Structra.log.error('InputPanel', 'Parse failed:', e);
        this._showError(format.toUpperCase() + ' parse error: ' + e.message, text);
      }
      resolve();
    };
    reader.onerror = () => {
      Structra.log.error('InputPanel', 'FileReader error:', reader.error);
      Structra.toast('Could not read ' + file.name + '.', 'error');
      resolve();
    };
    reader.readAsText(file);
    });
  }

  /** Several files dropped or chosen together: the first opens here, each other one in a tab of its own */
  async _readFiles(files) {
    files = [...files];
    if (!files.length) return;
    await this._readFile(files[0]);
    let opened = 1;
    for (const file of files.slice(1)) {
      const before = Structra.tabs.list.length;
      Structra.events.emit('tabs:add');
      if (Structra.tabs.list.length === before) break;           // the tab limit was reached
      await this._readFile(file);
      opened++;
    }
    if (opened < files.length) Structra.toast(`Opened ${opened} of ${files.length} files. The limit of open tabs was reached: close a tab, then open the rest.`, 'warning');
  }

  /** Open text from somewhere other than the file picker (used by session restore) */
  /** Said once, after the first document: where the Power Platform tools are */
  _tipOnce() {
    const KEY = 'structra.tipExpressions';
    try {
      if (localStorage.getItem(KEY)) return;
      localStorage.setItem(KEY, '1');
    } catch { return; }
    setTimeout(() => Structra.toast('Tip: select a value in the Tree for its expression', { duration: 3500 }), 1500);
  }

  async loadText(text, name) {
    const ext = (name || '').split('.').pop().toLowerCase();
    await this._parseByFormat(text, this._detectFormat(text, ext), name || 'Restored');
  }

  /** What a file really is when it is not text: an image, a PDF, a zip or Excel workbook, or other binary content */
  _binaryKind(text) {
    const head = String(text).slice(0, 4000);
    if (/^�?PNG/.test(head) || head.startsWith('\u0089PNG')) return 'an image (PNG)';
    if (/^GIF8[79]a/.test(head)) return 'an image (GIF)';
    if (/^���[�àá-ï]/.test(head) || head.startsWith('ÿØÿ')) return 'an image (JPEG)';
    if (head.startsWith('%PDF-')) return 'a PDF document';
    if (head.startsWith('PK\u0003\u0004')) return 'a zip file, an Excel workbook (.xlsx) or a Word document';
    if (head.includes('\u0000')) return 'a binary file';
    const bad = (head.match(/�/g) || []).length;
    if (head.length > 200 && bad / head.length > 0.05) return 'a binary file';
    return '';
  }

  async _parseByFormat(text, format, name) {
    const binary = this._binaryKind(text);
    if (binary) {
      const advice = /Excel/.test(binary) ? ' In Excel, use File > Save As > CSV, then open that file here.' : ' Open a JSON, CSV, XML, YAML or TOML file instead.';
      const msg = `${name} looks like ${binary}, not data.${advice}`;
      this._showError(advice.trim(), '', `${name} looks like ${binary}, not data`);
      Structra.toast(msg, 'warning');
      return;
    }
    Structra.parseNotes = {};
    this._clearError();
    const t0 = performance.now();
    Structra.log.info('InputPanel', '_parseByFormat: ' + format + ' — ' + name + ' (' + (text.length / 1024).toFixed(1) + ' KB)');
    let data;
    switch (format) {
      case 'csv': {
        const result = await Structra.parseCsvAsync(text);
        if (result.data.length === 0) { Structra.toast('No data found in CSV'); return; }
        if (result.errors.length > 0) {
          Structra.toast('CSV parsed with ' + result.errors.length + ' warning(s)');
        }
        data = result.data;
        name = name + ' (' + result.data.length + ' rows)';
        break;
      }
      case 'ndjson': {
        const lines = text.split(/\r?\n/).filter((l) => l.trim());
        try {
          data = await Structra.parseJsonAsync('[' + lines.join(',') + ']');
        } catch (e) {
          // Find the line that is not valid, so the message can name it
          for (let i = 0; i < lines.length; i++) {
            try { JSON.parse(lines[i]); } catch (err) { throw new Error('JSON parse error: line ' + (i + 1) + ' of ' + lines.length + ' is not valid JSON (' + err.message + ')'); }
          }
          throw e;
        }
        name = name + ' (' + data.length + ' lines)';
        break;
      }
      case 'xml':
        data = await Structra.parseXmlAsync(text);
        break;
      case 'yaml':
        data = await Structra.parseYamlAsync(text);
        break;
      case 'toml':
        data = await Structra.parseTomlAsync(text);
        break;
      default: // json
        data = await Structra.parseJsonAsync(text);
        break;
    }
    Structra.log.perf('InputPanel', format + ' parse', performance.now() - t0);
    const jsonText = (format === 'json') ? text : JSON.stringify(data, null, 2);
    this._loadSuccess(data, jsonText, name);
  }

  async _loadText(text, name) {
    this._clearError();
    const format = this._detectFormat(text, '');
    try {
      await this._parseByFormat(text, format, name);
    } catch (err) {
      Structra.log.error('InputPanel', '_loadText failed: ' + err.message, err);
      this._showError(format.toUpperCase() + ' parse error: ' + err.message, text);
    }
  }

  /* ======== PASTE & PARSE (unified) ======== */
  async _parseText() {
    this._clearError();
    const text = this.$('[data-role="paste-input"]').value.trim();
    if (!text) { Structra.toast('Paste some data first'); return; }
    const formatSel = this.$('[data-role="paste-format"]').value;
    const format = formatSel === 'auto' ? this._detectFormat(text, '') : formatSel;
    Structra.log.info('InputPanel', '_parseText: format=' + format + ' (selected=' + formatSel + ')');
    try {
      await this._parseByFormat(text, format, 'Pasted ' + format.toUpperCase());
    } catch (err) {
      this._showError(format.toUpperCase() + ' parse error: ' + err.message, text);
    }
  }

  /* ======== SAMPLE DATA ======== */
  _loadSample() {
    const sample = {
      name: "Structra V2", version: "2.0.0", description: "A modern JSON explorer",
      active: true, stars: 2431, metadata: null,
      users: [
        { id: 1, name: "Alice Johnson", email: "alice@example.com", role: "admin", active: true },
        { id: 2, name: "Bob Smith", email: "bob@example.com", role: "editor", active: false }
      ],
      settings: { theme: "dark", language: "en", notifications: true }
    };
    const text = JSON.stringify(sample, null, 2);
    this._loadSuccess(sample, text, 'sample-data.json');
  }



  /* ======== URL / API ======== */
  async _apiSend() {
    const url = this.$('[data-role="api-url"]').value.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      this.$('[data-role="url-error"]').textContent = 'A web address starts with http:// or https://. Check it and try again.';
      return;
    }

    const sendBtn = this.$('[data-role="api-send"]');
    const statusEl = this.$('[data-role="api-status"]');
    const errorEl = this.$('[data-role="url-error"]');
    errorEl.textContent = '';
    statusEl.innerHTML = '';
    sendBtn.textContent = 'Sending...';
    sendBtn.disabled = true;

    try {
      const opts = this._buildFetchOpts();
      // What Recent remembers about this request: the address, the method and the headers, never the credentials
      const kept = {};
      Object.entries(opts.headers || {}).forEach(([k, v]) => { if (!/^(authorization|x-api-key|api-key|cookie|proxy-authorization)$/i.test(k)) kept[k] = v; });
      this._pendingRequest = { url, method: opts.method || 'GET', headers: kept };
      const t0 = performance.now();
      const resp = await fetch(url, opts);
      const elapsed = Math.round(performance.now() - t0);
      const text = await resp.text();
      const size = new Blob([text]).size;

      const cls = resp.status < 300 ? 'ok' : resp.status < 400 ? 'redirect' : 'error';
      statusEl.innerHTML =
        `<span class="io-status-badge io-status-${cls}">${resp.status} ${resp.statusText}</span>` +
        `<span class="io-status-meta">${elapsed}ms \xB7 ${Structra.util.formatBytes(size)}</span>`;

      if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
      // Detect format from content-type header or URL extension
      const ct = (resp.headers.get('content-type') || '').toLowerCase();
      let format = 'json';
      if (ct.includes('xml')) format = 'xml';
      else if (ct.includes('yaml') || ct.includes('yml')) format = 'yaml';
      else if (ct.includes('toml')) format = 'toml';
      else if (ct.includes('csv') || ct.includes('tab-separated')) format = 'csv';
      else {
        const urlExt = (url.split('?')[0].split('.').pop() || '').toLowerCase();
        format = this._detectFormat(text, urlExt);
      }
      const name = url.split('/').pop().split('?')[0] || 'API Response';
      await this._parseByFormat(text, format, name);
    } catch (err) {
      errorEl.textContent = err instanceof TypeError
        ? 'The browser could not read this address. Either it is not reachable, or the site does not allow other pages to read it (CORS). Save the file from the address and use Upload File instead.'
        : err.message;
    } finally {
      sendBtn.textContent = '\u25B6 Send';
      sendBtn.disabled = false;
    }
  }

  _buildFetchOpts() {
    const method = this.$('[data-role="api-method"]').value;
    const headers = {};

    this.$$('[data-role="headers-list"] .io-kv-row').forEach(row => {
      const k = row.querySelector('.io-kv-key').value.trim();
      const v = row.querySelector('.io-kv-val').value.trim();
      if (k) headers[k] = v;
    });

    const authType = this.$('[data-role="auth-type"]').value;
    const fields = this.$('[data-role="auth-fields"]');
    if (authType === 'bearer') {
      let token = (fields.querySelector('[data-role="token"]')?.value || '').trim().replace(/^bearer\s+/i, '');
      if (token) headers['Authorization'] = 'Bearer ' + token;
    } else if (authType === 'basic') {
      const user = (fields.querySelector('[data-role="user"]')?.value || '').trim();
      const pass = (fields.querySelector('[data-role="pass"]')?.value || '').trim();
      if (user) headers['Authorization'] = 'Basic ' + btoa(user + ':' + pass);
    } else if (authType === 'apikey') {
      const name = (fields.querySelector('[data-role="keyname"]')?.value || '').trim();
      const val = (fields.querySelector('[data-role="keyval"]')?.value || '').trim();
      if (name && val) headers[name] = val;
    }

    const opts = { method, headers };

    const bodyType = this.$('[data-role="body-type"]').value;
    if (method !== 'GET' && method !== 'DELETE' && bodyType !== 'none') {
      const raw = this.$('[data-role="body-editor"]').value;
      if (bodyType === 'json') { headers['Content-Type'] = 'application/json'; opts.body = raw; }
      else if (bodyType === 'form') { headers['Content-Type'] = 'application/x-www-form-urlencoded'; opts.body = raw; }
      else { headers['Content-Type'] = 'text/plain'; opts.body = raw; }
    }

    return opts;
  }

  _renderAuthFields() {
    const type = this.$('[data-role="auth-type"]').value;
    const fields = this.$('[data-role="auth-fields"]');
    if (type === 'none') {
      fields.innerHTML = '';
    } else if (type === 'bearer') {
      fields.innerHTML = `
        <input type="text" class="io-input" data-role="token" placeholder="Paste token (with or without Bearer prefix)">
        <button class="io-api-add-row" data-action="decode-jwt" type="button">Decode Token</button>
        <div class="io-jwt-claims" data-role="claims"></div>`;
      fields.querySelector('[data-action="decode-jwt"]').addEventListener('click', () => this._decodeJwt());
    } else if (type === 'basic') {
      fields.innerHTML = `
        <input type="text" class="io-input" data-role="user" placeholder="Username">
        <input type="password" class="io-input" data-role="pass" placeholder="Password">`;
    } else if (type === 'apikey') {
      fields.innerHTML = `
        <input type="text" class="io-input" data-role="keyname" placeholder="Header name (e.g. X-API-Key)">
        <input type="text" class="io-input" data-role="keyval" placeholder="Key value">`;
    }
  }

  async _decodeJwt() {
    const raw = (this.$('[data-role="token"]')?.value || '').trim().replace(/^bearer\s+/i, '');
    const claimsEl = this.$('[data-role="claims"]');
    if (!raw) { claimsEl.innerHTML = '<div class="io-jwt-error">No token entered</div>'; return; }
    try {
      const parts = raw.split('.');
      if (parts.length !== 3) throw new Error('Not a valid JWT (expected 3 parts, got ' + parts.length + ')');
      const decode = async (s) => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Structra.parseJsonAsync(atob(s)); };
      const header = await decode(parts[0]);
      const payload = await decode(parts[1]);

      let html = `<div class="io-jwt-bar"><span class="io-jwt-title">Decoded Token</span><button class="io-jwt-close" data-action="close-jwt" type="button">\u2715</button></div>`;
      html += this._jwtSection('Header', header, 'header');
      html += this._jwtSection('Payload', payload, 'payload');

      if (payload.exp) {
        const d = new Date(payload.exp * 1000);
        const expired = d < new Date();
        html += `<div class="io-jwt-meta">${expired ? '\u26d4 Expired' : '\u2705 Valid'} | Expires: ${d.toLocaleString()}</div>`;
      }
      if (payload.iat) {
        html += `<div class="io-jwt-meta">Issued: ${new Date(payload.iat * 1000).toLocaleString()}</div>`;
      }
      html += `<button class="io-api-add-row" data-copy="all" type="button">Copy Full Decoded Token</button>`;

      claimsEl.innerHTML = html;
      claimsEl.querySelector('[data-action="close-jwt"]').addEventListener('click', () => { claimsEl.innerHTML = ''; });
      claimsEl.querySelectorAll('[data-copy]').forEach(btn => {
        btn.addEventListener('click', () => {
          let text;
          if (btn.dataset.copy === 'header') text = JSON.stringify(header, null, 2);
          else if (btn.dataset.copy === 'payload') text = JSON.stringify(payload, null, 2);
          else text = JSON.stringify({ header, payload }, null, 2);
          Structra.util.copy(text, null).then(() => {
            const orig = btn.textContent;
            btn.textContent = 'Copied!';
            setTimeout(() => btn.textContent = orig, 1500);
          });
        });
      });
    } catch (e) {
      claimsEl.innerHTML = `<div class="io-jwt-error">${Structra.util.esc(e.message)}</div>`;
    }
  }

  _jwtSection(label, obj, copyKey) {
    return `<div class="io-jwt-section">
      <div class="io-jwt-section-header"><span class="io-jwt-label">${label}</span><button class="io-jwt-copy" data-copy="${copyKey}" type="button">Copy</button></div>
      <pre class="io-jwt-json">${Structra.util.esc(JSON.stringify(obj, null, 2))}</pre>
    </div>`;
  }

  /** Fill the Load URL tab with a remembered request, ready to send again (credentials are never remembered) */
  _fillRequest(req) {
    const tab = this.$('.io-tab[data-tab="url"]');
    if (tab) tab.click();
    this.$('[data-role="api-url"]').value = req.url;
    this.$('[data-role="api-method"]').value = req.method || 'GET';
    this.$('[data-role="headers-list"]').innerHTML = '';
    Object.entries(req.headers || {}).forEach(([k, v]) => {
      this._addHeaderRow();
      const rows = this.$$('[data-role="headers-list"] .io-kv-row');
      const row = rows[rows.length - 1];
      row.querySelector('.io-kv-key').value = k;
      row.querySelector('.io-kv-val').value = v;
    });
    Structra.toast('Address and headers filled in. Add your sign-in again if it needs one, then press Send.');
  }

  _addHeaderRow() {
    const list = this.$('[data-role="headers-list"]');
    const row = document.createElement('div');
    row.className = 'io-kv-row';
    row.innerHTML = `
      <input type="text" class="io-input io-kv-key" placeholder="Header name">
      <input type="text" class="io-input io-kv-val" placeholder="Value">
      <button class="io-kv-remove" title="Remove">\u2715</button>`;
    list.appendChild(row);
  }

  /* ======== RECENT ======== */
  async _renderRecent() {
    const list = this.$('[data-role="recent-list"]');
    const recent = await this._getRecent();
    if (recent.length === 0) {
      list.innerHTML = '<div class="io-recent-empty">No recent files</div>';
      return;
    }
    list.innerHTML = recent.map((r, i) => `
      <div class="io-recent-item" data-idx="${i}" role="button" tabindex="0" aria-label="Open ${Structra.util.esc(r.name)}">
        <button class="io-recent-remove" type="button" data-remove="${i}" aria-label="Remove ${Structra.util.esc(r.name)} from Recent" title="Remove from Recent">${Structra.icons.svg('x', { size: 12 })}</button>
        <div class="io-recent-name">${Structra.util.esc(r.name)}</div>
        <div class="io-recent-meta">${Structra.util.formatBytes(r.size)} &middot; ${Structra.util.timeAgo(r.ts)}${r.request ? ' &middot; from ' + Structra.util.esc(r.request.url.replace(/^https?:\/\//, '').slice(0, 40)) : ''}</div>
        <div class="io-recent-preview">${Structra.util.esc(r.preview)}</div>
      </div>`).join('') +
      '<div class="io-recent-clear"><p class="io-recent-note">Recent files are kept in this browser only, with their content, so you can reopen them. Remove one with the x, or clear them all.</p><button class="io-btn-clear" data-action="clear-recent">Clear History</button></div>';

    list.querySelectorAll('.io-recent-item').forEach(item => {
      item.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === item) { e.preventDefault(); item.click(); } });
      item.addEventListener('click', async (e) => {
        const rm = e.target.closest('[data-remove]');
        if (rm) {
          e.stopPropagation();
          const keep = recent.filter((_, j) => j !== parseInt(rm.dataset.remove, 10));
          try { localStorage.setItem('structra_recent', JSON.stringify(keep)); } catch { /* storage blocked */ }
          this._renderRecent();
          return;
        }
        const r = recent[parseInt(item.dataset.idx, 10)];
        if (r && !r.data && r.request) { this._fillRequest(r.request); return; }
        if (r && !r.data) { Structra.toast(`${r.name} is not kept in Recent (it was too large, or keeping contents is off in Settings). Open the file again to use it.`); return; }
        if (r && r.data) {
          try {
            const data = await Structra.parseJsonAsync(r.data);
            this._loadSuccess(data, r.data, r.name);
          } catch { Structra.toast('Failed to load saved data'); }
        }
      });
    });

    const clearBtn = list.querySelector('[data-action="clear-recent"]');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        localStorage.removeItem('structra_recent');
        this._renderRecent();
        Structra.toast('History cleared');
      });
    }
  }

  async _saveRecent(name, text, byteSize) {
    const recent = await this._getRecent();
    const entry = {
      name,
      size: byteSize || new Blob([text]).size,
      ts: Date.now(),
      // The first field names, not the values, so a glance at Recent never shows people's details
      preview: (() => {
        const keys = [...new Set([...text.substring(0, 600).matchAll(/"([^"\r\n]{1,30})"\s*:/g)].map((m) => m[1]))].slice(0, 6);
        return keys.length ? 'Fields: ' + keys.join(', ') : text.substring(0, 20).replace(/\s+/g, ' ') + '…';
      })(),
      // The content is kept so the file can be reopened; Settings can turn that off (then only the name and size are kept)
      data: text.length <= 200000 && Structra.settings.get('keepRecentContent') !== false ? text : null,
      request: this._pendingRequest || null,
    };
    this._pendingRequest = null;
    const filtered = recent.filter(r => r.name !== name);
    filtered.unshift(entry);
    try {
      localStorage.setItem('structra_recent', JSON.stringify(filtered.slice(0, 20)));
    } catch { /* storage full */ }
  }

  async _getRecent() {
    try {
      return await Structra.parseJsonAsync(localStorage.getItem('structra_recent') || '[]');
    } catch { return []; }
  }

  /* ======== CLIPBOARD AUTO-DETECT (overlay only) ======== */
  _setupClipboardDetect() {
    let lastHash = '';
    window.addEventListener('focus', async () => {
      try {
        if (!navigator.clipboard || !navigator.clipboard.readText) return;
        const perm = await navigator.permissions.query({ name: 'clipboard-read' });
        if (perm.state !== 'granted') return;
        const text = await navigator.clipboard.readText();
        if (!text || text.length < 2 || text.length > 500000) return;
        const t = text.trim();
        if ((t[0] !== '{' && t[0] !== '[') || t === lastHash) return;
        await Structra.parseJsonAsync(t);
        lastHash = t;
        this._showClipBanner(t);
      } catch { /* not JSON or no permission */ }
    });
  }

  _showClipBanner(text) {
    let banner = document.getElementById('ioClipBanner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'ioClipBanner';
      banner.className = 'io-clip-banner';
      document.body.appendChild(banner);
    }
    const preview = text.substring(0, 60).replace(/\s+/g, ' ');
    banner.innerHTML = `
      <span>\ud83d\udccb JSON on clipboard: <em>${Structra.util.esc(preview)}...</em></span>
      <button class="io-clip-load">Load</button>
      <button class="io-clip-dismiss">\u2715</button>`;
    banner.style.display = 'flex';

    banner.querySelector('.io-clip-load').addEventListener('click', async () => {
      banner.style.display = 'none';
      try {
        const data = await Structra.parseJsonAsync(text);
        this._loadSuccess(data, text, 'Clipboard');
      } catch (e) { Structra.toast('Invalid JSON: ' + e.message); }
    });
    banner.querySelector('.io-clip-dismiss').addEventListener('click', () => { banner.style.display = 'none'; });
    setTimeout(() => { if (banner.style.display !== 'none') banner.style.display = 'none'; }, 8000);
  }

  /* ======== ERROR ======== */
  /** "JSON parse error: JSON parse error (40B): Unexpected token x at position 12" → { what, where } in plain words */
  _explainError(msg, rawText) {
    let detail = String(msg).replace(/^(?:(?:JSON|CSV|XML|YAML|TOML)\s+)?parse error(?:\s*\([^)]*\))?:\s*/i, '').replace(/^(?:(?:JSON|CSV|XML|YAML|TOML)\s+)?parse error(?:\s*\([^)]*\))?:\s*/i, '');
    let where = '';
    const pos = /position\s+(\d+)/i.exec(detail);
    if (pos && rawText) {
      const before = rawText.slice(0, Number(pos[1]));
      const line = before.split('\n').length;
      const col = before.length - before.lastIndexOf('\n');
      where = `Around line ${line}, character ${col}.`;
      detail = detail.replace(/\s*\(?at position\s+\d+[^)]*\)?/i, '').replace(/\s*in JSON at position\s+\d+/i, '');
    }
    return { detail: detail.trim(), where };
  }

  _showError(msg, rawText, title) {
    const el = this.$('[data-role="error"]');
    const esc = Structra.util.esc;
    const kind = (/^(\w+) parse error/i.exec(msg) || [])[1] || 'JSON';
    const { detail, where } = this._explainError(msg, rawText);
    const canRepair = !!rawText && /^json$/i.test(kind);
    el.innerHTML = `
      <div class="io-error-title">${esc(title || 'This is not valid ' + kind)}</div>
      <div class="io-error-detail">${esc(detail)}${where ? ' ' + esc(where) : ''}</div>
      ${canRepair ? `<div class="io-error-actions">
        <button class="io-btn-repair" data-action="repair">${Structra.icons.svg('wrench', { size: 14 })} Fix it for me</button>
        <span class="io-error-hint">Fixes trailing commas, single quotes, comments and True, False or None.</span>
      </div>` : ''}`;
    const repair = el.querySelector('[data-action="repair"]');
    if (repair) {
      repair.addEventListener('click', async () => {
        try {
          const fixed = await Structra.jsonTools.repair(rawText);
          const data = await Structra.parseJsonAsync(fixed);
          this._clearError();
          Structra.toast('Fixed: the data now opens');
          this._loadSuccess(data, fixed, 'Repaired JSON');
        } catch (e) {
          el.innerHTML = `<div class="io-error-title">It could not be fixed automatically</div><div class="io-error-detail">${esc(this._explainError(e.message, rawText).detail)}</div>`;
        }
      });
    }
    el.classList.add('show');
  }

  _clearError() {
    const el = this.$('[data-role="error"]');
    el.classList.remove('show');
    el.textContent = '';
  }

  /* ======== UTILS ======== */


}

customElements.define('structra-input-panel', StructraInputPanel);
