/* ============================================================
   STRUCTRA V2 - Input Panel Component
   <structra-input-panel> - shared input card (overlay & in-canvas)
   Same card everywhere. Wrap in .io-overlay div for fullscreen mode.
   5 tabs: Upload File | Paste JSON | Import CSV | Load URL | Recent

   Wiring (generated from the code below; update it when you add or remove an event):
     Listens to: input:show-tab
     Emits: loading:show, loading:hide, tabs:add
     Sets state: jsonData, fileName, fileSize, currentPath, activeView, duplicateKeys
   ============================================================ */

class StructraInputPanel extends StructraComponent {
  init() {
    this._activeTab = 'file';
    // Ctrl+V anywhere on an empty tab loads what was copied, as long as it looks like data and the focus is not in a field
    if (!Structra._pasteBound) document.addEventListener('paste', (event) => {
      if (Structra.state.jsonData || !this.isConnected) return;
      const target = event.target;
      if (target && target.closest && target.closest('input, textarea, select, [contenteditable]')) return;
      const text = event.clipboardData && event.clipboardData.getData('text');
      if (!text || !/^\s*[\[{<\w"-]/.test(text)) return;
      event.preventDefault();
      this._loadText(text, 'Pasted ' + this._detectFormat(text, '').toUpperCase());
    });
    Structra._pasteBound = true;
    this.on('input:show-tab', (tab) => { const button = this.queryOne(`.io-tab[data-tab="${tab}"]`); if (button) button.click(); });
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
          <div class="io-features">
            <div class="io-feature">
              ${Structra.icons.svg('chart-column')}
              <div><strong>Overview first</strong><span>A plain summary of what the file holds and what to look at first.</span></div>
            </div>
            <div class="io-feature">
              ${Structra.icons.svg('layout-grid')}
              <div><strong>Five ways to look</strong><span>Tree, Table, Graph, Schema and Overview. Switch with Ctrl+1 to Ctrl+5.</span></div>
            </div>
            <div class="io-feature">
              ${Structra.icons.svg('zap')}
              <div><strong>Made for Power Platform</strong><span>Click any value to copy its Power Automate expression, Power Fx formula or Parse JSON schema.</span></div>
            </div>
            <div class="io-feature">
              ${Structra.icons.svg('lock')}
              <div><strong>Private by design</strong><span>Your data stays in this browser. Nothing is uploaded.</span></div>
            </div>
          </div>
          <p class="io-tips">Tip: press <kbd class="io-kbd">Ctrl</kbd> + <kbd class="io-kbd">K</kbd> for every command, <kbd class="io-kbd">?</kbd> for all shortcuts, or use <strong>Themes</strong> on the left to change the colours.</p>
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
    this.queryAll('.io-tab').forEach(button => {
      button.addEventListener('click', () => {
        this._activeTab = button.dataset.tab;
        this.queryAll('.io-tab').forEach(tabButton => tabButton.classList.toggle('active', tabButton === button));
        this.queryAll('.io-panel').forEach(panel => panel.classList.toggle('active', panel.dataset.panel === this._activeTab));
        this._clearError();
        if (this._activeTab === 'recent') this._renderRecent();
      });
    });

    // File upload
    const dropArea = this.queryOne('[data-role="drop-area"]');
    const fileInput = this.queryOne('[data-role="file-input"]');
    dropArea.addEventListener('click', () => fileInput.click());
    dropArea.addEventListener('dragover', (event) => { event.preventDefault(); dropArea.classList.add('dragover'); });
    dropArea.addEventListener('dragleave', () => dropArea.classList.remove('dragover'));
    dropArea.addEventListener('drop', (event) => {
      event.preventDefault(); dropArea.classList.remove('dragover');
      if (event.dataTransfer.files.length) this._readFiles(event.dataTransfer.files);
    });
    fileInput.addEventListener('change', () => {
      if (fileInput.files.length) this._readFiles(fileInput.files);
    });

    // Paste & parse (unified)
    this.queryOne('[data-action="parse-text"]').addEventListener('click', () => this._parseText());
    this.queryOne('[data-role="paste-input"]').addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); this._parseText(); }
    });
    const helpSample = this.queryOne('[data-role="help-sample"]');
    if (helpSample) helpSample.addEventListener('click', () => this._loadSample());

    // Sample
    const sampleButton = this.queryOne('[data-action="sample"]');
    if (sampleButton) sampleButton.addEventListener('click', () => this._loadSample());
    const sampleLink = this.queryOne('[data-role="sample-link"]');
    if (sampleLink) sampleLink.addEventListener('click', (event) => { event.stopPropagation(); this._loadSample(); });

    // URL / API
    this.queryOne('[data-role="api-url"]').addEventListener('keydown', (event) => { if (event.key === 'Enter') this._apiSend(); });
    this.queryOne('[data-role="api-send"]').addEventListener('click', () => this._apiSend());

    // API sub-tabs
    this.queryAll('.io-api-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.queryAll('.io-api-tab').forEach(apiTab => apiTab.classList.toggle('active', apiTab === tab));
        this.queryAll('.io-api-panel').forEach(panel => panel.classList.toggle('active', panel.dataset.appanel === tab.dataset.aptab));
      });
    });

    // Auth type
    this.queryOne('[data-role="auth-type"]').addEventListener('change', () => this._renderAuthFields());

    // Add header
    this.queryOne('[data-action="add-header"]').addEventListener('click', () => this._addHeaderRow());

    // Remove header (delegation)
    this.queryOne('[data-role="headers-list"]').addEventListener('click', (event) => {
      if (event.target.closest('.io-kv-remove')) event.target.closest('.io-kv-row').remove();
    });

    // Body type
    this.queryOne('[data-role="body-type"]').addEventListener('change', () => {
      const type = this.queryOne('[data-role="body-type"]').value;
      const editor = this.queryOne('[data-role="body-editor"]');
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
    const depth = Structra.sharedHelpers.limitDepth(data, 200);
    Structra.parseNotes = Object.assign(Structra.parseNotes || {}, { deepest: depth.capped ? depth.deepest : 0 });
    const unopenable = Structra.describeUnopenable(data);
    if (unopenable) {
      const message = name + ' contains only ' + unopenable + ', so there is nothing to explore.';
      Structra.toast(message);
      this._showError(message, '');
      return;
    }
    // The next document starts with an empty paste box and automatic format
    const pasteBox = this.queryOne('[data-role="paste-input"]');
    if (pasteBox) pasteBox.value = '';
    const pasteFormat = this.queryOne('[data-role="paste-format"]');
    if (pasteFormat) pasteFormat.value = 'auto';
    Structra.log.info('InputPanel', '_loadSuccess: ' + name + ' (' + (text.length / 1024).toFixed(1) + ' KB text)');
    const startTime = performance.now();

    // Show loading overlay - message updates at each step
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
    await Structra.dataEngine.ingest(tabId, data, {
      fileName: name,
      fileSize: byteSize,
      rawSource,
    });

    // Fire state events - triggers view rendering
    Structra.events.emit('loading:show', 'Rendering views…');
    Structra.log.debug('InputPanel', 'Setting jsonData...');
    Structra.setState('jsonData', data);
    Structra.log.perf('InputPanel', 'set(jsonData) + all listeners', performance.now() - startTime);
    Structra.setState('fileName', name);
    Structra.setState('fileSize', byteSize);
    Structra.setState('currentPath', '$');
    // A new document opens on its overview, unless it is so big that computing it would make the first view wait (measured: 88 MB is ready in under 2 s)
    if (byteSize <= 120 * 1048576) Structra.setState('activeView', 'overview');
    this._tipOnce();

    // Duplicate keys are invisible after parsing (JSON.parse keeps the last one), so scan the text
    // This runs in the background and yields to the page, so it never delays the first paint.
    Structra.setState('duplicateKeys', []);
    if (/^\s*[\[{]/.test(text) && text.length <= 8 * 1048576) {
      Structra.jsonRepairAndValidation.findDuplicateKeys(text).then((dupes) => {
        if (Structra.state.fileName !== name) return;            // another file was opened meanwhile
        Structra.setState('duplicateKeys', dupes);
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
    const notes = Structra.parseNotes || {};
    const mixedColumns = Object.entries(notes.mixed || {});
    const csvTab = (Structra.tabs.list || []).find((tab) => tab.id === Structra.tabs.activeId);
    if (csvTab) csvTab.decimals = notes.decimals || null;
    Structra.toast('Loaded ' + name + (big ? `. ${big} very large number${big === 1 ? ' was' : 's were'} kept as text so no digit is lost.` : '') + (mixedColumns.length ? `. ${mixedColumns[0][0]} has text among its numbers (row ${mixedColumns[0][1].row}: "${String(mixedColumns[0][1].value).slice(0, 20)}")` + (mixedColumns.length > 1 ? ` and ${mixedColumns.length - 1} more column${mixedColumns.length > 2 ? 's' : ''}` : '') : '') + (deep ? `. It is nested ${deep.toLocaleString()} levels deep: only the first 200 levels are shown.` : ''));
    Structra.parseNotes = {};
    // Auto-hide overlay wrapper if present
    const overlay = this.closest('.io-overlay');
    if (overlay) overlay.classList.remove('show');
    Structra.log.perf('InputPanel', '_loadSuccess total', performance.now() - startTime);
  }

  /* ======== FORMAT DETECTION ======== */
  _detectFormat(text, extension) {
    // Extension-based
    if (extension === 'csv' || extension === 'tsv') return 'csv';
    if (extension === 'xml') return 'xml';
    if (extension === 'yaml' || extension === 'yml') return 'yaml';
    if (extension === 'toml') return 'toml';
    if (extension === 'ndjson' || extension === 'jsonl') return 'ndjson';
    if (extension === 'json') return this._looksLikeLines(text) ? 'ndjson' : 'json';
    // Content-based heuristics
    const trimmed = text.trimStart();
    if (this._looksLikeLines(trimmed)) return 'ndjson';
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json';
    if (trimmed.startsWith('<?xml') || trimmed.startsWith('<')) return 'xml';
    if (/^\[\w+\]/m.test(trimmed) && trimmed.includes('=')) return 'toml';
    if (/^---\s*$/m.test(trimmed) || /^\w[\w\s]*:/m.test(trimmed)) return 'yaml';
    // Fallback: rows of values separated by a comma, semicolon, tab or bar (Excel in many countries writes semicolons)
    const lines = trimmed.split(/\r?\n/).filter((part) => part.trim()).slice(0, 5);
    if (lines.length >= 2 && [',', ';', '\t', '|'].some((delimiter) => lines[0].includes(delimiter) && lines.every((line) => line.split(delimiter).length === lines[0].split(delimiter).length))) return 'csv';
    if (trimmed.includes(',') && trimmed.includes('\n')) return 'csv';
    return 'json';
  }

  /** JSON Lines: one complete object per line (a common export format) */
  _looksLikeLines(text) {
    const match = /^\s*(\{[^\n]*\})[ \t\r]*\n\s*\{/.exec(String(text).slice(0, 20000));
    if (!match) return false;
    try { const first = JSON.parse(match[1]); return first !== null && typeof first === 'object'; } catch { return false; }
  }

  /* ======== FILE UPLOAD ======== */
  _readFile(file) {
    Structra.log.info('InputPanel', '_readFile: ' + file.name + ' (' + (file.size / 1048576).toFixed(2) + ' MB)');
    this._knownBytes = file.size;
    this._currentFile = file;
    return new Promise((resolve) => {
    const reader = new FileReader();
    const extension = (file.name || '').split('.').pop().toLowerCase();
    reader.onload = async () => {
      const text = reader.result;
      this._fileText = text;
      Structra.log.info('InputPanel', 'FileReader done - ' + text.length + ' chars (' + extension + ')');
      const format = this._detectFormat(text, extension);
      Structra.log.info('InputPanel', 'Detected format: ' + format);
      try {
        await this._parseByFormat(text, format, file.name);
      } catch (error) {
        Structra.log.error('InputPanel', 'Parse failed:', error);
        this._showError(format.toUpperCase() + ' parse error: ' + error.message, text);
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
    const extension = (name || '').split('.').pop().toLowerCase();
    await this._parseByFormat(text, this._detectFormat(text, extension), name || 'Restored');
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
    const badCharacters = (head.match(/�/g) || []).length;
    if (head.length > 200 && badCharacters / head.length > 0.05) return 'a binary file';
    return '';
  }

  async _parseByFormat(text, format, name) {
    const binary = this._binaryKind(text);
    if (binary) {
      const advice = /Excel/.test(binary) ? ' In Excel, use File > Save As > CSV, then open that file here.' : ' Open a JSON, CSV, XML, YAML or TOML file instead.';
      const message = `${name} looks like ${binary}, not data.${advice}`;
      this._showError(advice.trim(), '', `${name} looks like ${binary}, not data`);
      Structra.toast(message, 'warning');
      return;
    }
    Structra.parseNotes = {};
    this._clearError();
    const startTime = performance.now();
    Structra.log.info('InputPanel', '_parseByFormat: ' + format + ' - ' + name + ' (' + (text.length / 1024).toFixed(1) + ' KB)');
    let data;
    switch (format) {
      case 'csv': {
        const result = await Structra.parseCsvAsync(text);
        if (result.data.length === 0) { Structra.toast('The CSV has no rows of data'); return; }
        if (result.errors.length > 0) {
          Structra.toast('The CSV opened with ' + result.errors.length + ' warning' + (result.errors.length === 1 ? '' : 's'));
        }
        data = result.data;
        Structra.parseNotes = Object.assign(Structra.parseNotes || {}, { decimals: (result.meta && result.meta.decimals) || {}, mixed: (result.meta && result.meta.mixed) || {} });
        name = name + ' (' + result.data.length + ' rows)';
        break;
      }
      case 'ndjson': {
        const lines = text.split(/\r?\n/).filter((part) => part.trim());
        try {
          data = await Structra.parseJsonAsync('[' + lines.join(',') + ']');
        } catch (error) {
          // Find the line that is not valid, so the message can name it
          for (let i = 0; i < lines.length; i++) {
            try { JSON.parse(lines[i]); } catch (error) { throw new Error('JSON parse error: line ' + (i + 1) + ' of ' + lines.length + ' is not valid JSON (' + error.message + ')'); }
          }
          throw error;
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
    Structra.log.perf('InputPanel', format + ' parse', performance.now() - startTime);
    const jsonText = (format === 'json') ? text : JSON.stringify(data, null, 2);
    this._loadSuccess(data, jsonText, name);
  }

  async _loadText(text, name) {
    this._clearError();
    const format = this._detectFormat(text, '');
    try {
      await this._parseByFormat(text, format, name);
    } catch (error) {
      Structra.log.error('InputPanel', '_loadText failed: ' + error.message, error);
      this._showError(format.toUpperCase() + ' parse error: ' + error.message, text);
    }
  }

  /* ======== PASTE & PARSE (unified) ======== */
  async _parseText() {
    this._clearError();
    const text = this.queryOne('[data-role="paste-input"]').value.trim();
    if (!text) { Structra.toast('Paste some data first'); return; }
    const formatSel = this.queryOne('[data-role="paste-format"]').value;
    const format = formatSel === 'auto' ? this._detectFormat(text, '') : formatSel;
    Structra.log.info('InputPanel', '_parseText: format=' + format + ' (selected=' + formatSel + ')');
    try {
      await this._parseByFormat(text, format, 'Pasted ' + format.toUpperCase());
    } catch (error) {
      this._showError(format.toUpperCase() + ' parse error: ' + error.message, text);
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
    const url = this.queryOne('[data-role="api-url"]').value.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      this.queryOne('[data-role="url-error"]').textContent = 'A web address starts with http:// or https://. Check it and try again.';
      return;
    }

    const sendButton = this.queryOne('[data-role="api-send"]');
    const statusElement = this.queryOne('[data-role="api-status"]');
    const errorElement = this.queryOne('[data-role="url-error"]');
    errorElement.textContent = '';
    statusElement.innerHTML = '';
    sendButton.textContent = 'Sending...';
    sendButton.disabled = true;

    try {
      const options = this._buildFetchOpts();
      // What Recent remembers about this request: the address, the method and the headers, never the credentials
      const kept = {};
      Object.entries(options.headers || {}).forEach(([key, value]) => { if (!/^(authorization|x-api-key|api-key|cookie|proxy-authorization)$/i.test(key)) kept[key] = value; });
      this._pendingRequest = { url, method: options.method || 'GET', headers: kept };
      const startTime = performance.now();
      const resp = await fetch(url, options);
      const elapsed = Math.round(performance.now() - startTime);
      const text = await resp.text();
      const size = new Blob([text]).size;

      const className = resp.status < 300 ? 'ok' : resp.status < 400 ? 'redirect' : 'error';
      statusElement.innerHTML =
        `<span class="io-status-badge io-status-${className}">${resp.status} ${resp.statusText}</span>` +
        `<span class="io-status-meta">${elapsed}ms \xB7 ${Structra.sharedHelpers.formatBytes(size)}</span>`;

      if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
      // Detect format from content-type header or URL extension
      const contentType = (resp.headers.get('content-type') || '').toLowerCase();
      let format = 'json';
      if (contentType.includes('xml')) format = 'xml';
      else if (contentType.includes('yaml') || contentType.includes('yml')) format = 'yaml';
      else if (contentType.includes('toml')) format = 'toml';
      else if (contentType.includes('csv') || contentType.includes('tab-separated')) format = 'csv';
      else {
        const urlExt = (url.split('?')[0].split('.').pop() || '').toLowerCase();
        format = this._detectFormat(text, urlExt);
      }
      const name = url.split('/').pop().split('?')[0] || 'API Response';
      await this._parseByFormat(text, format, name);
    } catch (error) {
      errorElement.textContent = error instanceof TypeError
        ? 'The browser could not read this address. Either it is not reachable, or the site does not allow other pages to read it (CORS). Save the file from the address and use Upload File instead.'
        : error.message;
    } finally {
      sendButton.textContent = '\u25B6 Send';
      sendButton.disabled = false;
    }
  }

  _buildFetchOpts() {
    const method = this.queryOne('[data-role="api-method"]').value;
    const headers = {};

    this.queryAll('[data-role="headers-list"] .io-kv-row').forEach(row => {
      const key = row.querySelector('.io-kv-key').value.trim();
      const value = row.querySelector('.io-kv-val').value.trim();
      if (key) headers[key] = value;
    });

    const authType = this.queryOne('[data-role="auth-type"]').value;
    const fields = this.queryOne('[data-role="auth-fields"]');
    if (authType === 'bearer') {
      let token = (fields.querySelector('[data-role="token"]')?.value || '').trim().replace(/^bearer\s+/i, '');
      if (token) headers['Authorization'] = 'Bearer ' + token;
    } else if (authType === 'basic') {
      const user = (fields.querySelector('[data-role="user"]')?.value || '').trim();
      const pass = (fields.querySelector('[data-role="pass"]')?.value || '').trim();
      if (user) headers['Authorization'] = 'Basic ' + btoa(user + ':' + pass);
    } else if (authType === 'apikey') {
      const name = (fields.querySelector('[data-role="keyname"]')?.value || '').trim();
      const value = (fields.querySelector('[data-role="keyval"]')?.value || '').trim();
      if (name && value) headers[name] = value;
    }

    const options = { method, headers };

    const bodyType = this.queryOne('[data-role="body-type"]').value;
    if (method !== 'GET' && method !== 'DELETE' && bodyType !== 'none') {
      const raw = this.queryOne('[data-role="body-editor"]').value;
      if (bodyType === 'json') { headers['Content-Type'] = 'application/json'; options.body = raw; }
      else if (bodyType === 'form') { headers['Content-Type'] = 'application/x-www-form-urlencoded'; options.body = raw; }
      else { headers['Content-Type'] = 'text/plain'; options.body = raw; }
    }

    return options;
  }

  _renderAuthFields() {
    const type = this.queryOne('[data-role="auth-type"]').value;
    const fields = this.queryOne('[data-role="auth-fields"]');
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
    const raw = (this.queryOne('[data-role="token"]')?.value || '').trim().replace(/^bearer\s+/i, '');
    const claimsElement = this.queryOne('[data-role="claims"]');
    if (!raw) { claimsElement.innerHTML = '<div class="io-jwt-error">No token entered</div>'; return; }
    try {
      const parts = raw.split('.');
      if (parts.length !== 3) throw new Error('Not a valid JWT (expected 3 parts, got ' + parts.length + ')');
      const decode = async (text) => { text = text.replace(/-/g, '+').replace(/_/g, '/'); while (text.length % 4) text += '='; return Structra.parseJsonAsync(atob(text)); };
      const header = await decode(parts[0]);
      const payload = await decode(parts[1]);

      let html = `<div class="io-jwt-bar"><span class="io-jwt-title">Decoded Token</span><button class="io-jwt-close" data-action="close-jwt" type="button">\u2715</button></div>`;
      html += this._jwtSection('Header', header, 'header');
      html += this._jwtSection('Payload', payload, 'payload');

      if (payload.exp) {
        const expiry = new Date(payload.exp * 1000);
        const expired = expiry < new Date();
        html += `<div class="io-jwt-meta">${expired ? '\u26d4 Expired' : '\u2705 Valid'} | Expires: ${expiry.toLocaleString()}</div>`;
      }
      if (payload.iat) {
        html += `<div class="io-jwt-meta">Issued: ${new Date(payload.iat * 1000).toLocaleString()}</div>`;
      }
      html += `<button class="io-api-add-row" data-copy="all" type="button">Copy Full Decoded Token</button>`;

      claimsElement.innerHTML = html;
      claimsElement.querySelectorAll('pre[data-colorize]').forEach((pre) => Structra.codeView.colorize(pre, pre.textContent, pre.dataset.colorize));
      claimsElement.querySelector('[data-action="close-jwt"]').addEventListener('click', () => { claimsElement.innerHTML = ''; });
      claimsElement.querySelectorAll('[data-copy]').forEach(element => {
        element.addEventListener('click', () => {
          let text;
          if (element.dataset.copy === 'header') text = JSON.stringify(header, null, 2);
          else if (element.dataset.copy === 'payload') text = JSON.stringify(payload, null, 2);
          else text = JSON.stringify({ header, payload }, null, 2);
          Structra.sharedHelpers.copyToClipboard(text, null).then(() => {
            const orig = element.textContent;
            element.textContent = 'Copied!';
            setTimeout(() => element.textContent = orig, 1500);
          });
        });
      });
    } catch (error) {
      claimsElement.innerHTML = `<div class="io-jwt-error">${Structra.sharedHelpers.escapeHtml(error.message)}</div>`;
    }
  }

  _jwtSection(label, object, copyKey) {
    return `<div class="io-jwt-section">
      <div class="io-jwt-section-header"><span class="io-jwt-label">${label}</span><button class="io-jwt-copy" data-copy="${copyKey}" type="button">Copy</button></div>
      <pre class="io-jwt-json" data-colorize="json">${Structra.sharedHelpers.escapeHtml(JSON.stringify(object, null, 2))}</pre>
    </div>`;
  }

  /** Fill the Load URL tab with a remembered request, ready to send again (credentials are never remembered) */
  _fillRequest(request) {
    const tab = this.queryOne('.io-tab[data-tab="url"]');
    if (tab) tab.click();
    this.queryOne('[data-role="api-url"]').value = request.url;
    this.queryOne('[data-role="api-method"]').value = request.method || 'GET';
    this.queryOne('[data-role="headers-list"]').innerHTML = '';
    Object.entries(request.headers || {}).forEach(([key, value]) => {
      this._addHeaderRow();
      const rows = this.queryAll('[data-role="headers-list"] .io-kv-row');
      const row = rows[rows.length - 1];
      row.querySelector('.io-kv-key').value = key;
      row.querySelector('.io-kv-val').value = value;
    });
    Structra.toast('Address and headers filled in. Add your sign-in again if it needs one, then press Send.');
  }

  _addHeaderRow() {
    const list = this.queryOne('[data-role="headers-list"]');
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
    const list = this.queryOne('[data-role="recent-list"]');
    const recent = await this._getRecent();
    if (recent.length === 0) {
      list.innerHTML = '<div class="io-recent-empty">No recent files</div>';
      return;
    }
    list.innerHTML = recent.map((entry, i) => `
      <div class="io-recent-item" data-idx="${i}" role="button" tabindex="0" aria-label="Open ${Structra.sharedHelpers.escapeHtml(entry.name)}">
        <button class="io-recent-remove" type="button" data-remove="${i}" aria-label="Remove ${Structra.sharedHelpers.escapeHtml(entry.name)} from Recent" title="Remove from Recent">${Structra.icons.svg('x', { size: 12 })}</button>
        <div class="io-recent-name">${Structra.sharedHelpers.escapeHtml(entry.name)}</div>
        <div class="io-recent-meta">${Structra.sharedHelpers.formatBytes(entry.size)} &middot; ${Structra.sharedHelpers.timeAgo(entry.ts)}${entry.request ? ' &middot; from ' + Structra.sharedHelpers.escapeHtml(entry.request.url.replace(/^https?:\/\//, '').slice(0, 40)) : ''}</div>
        <div class="io-recent-preview">${Structra.sharedHelpers.escapeHtml(entry.preview)}</div>
      </div>`).join('') +
      '<div class="io-recent-clear"><p class="io-recent-note">Recent files are kept in this browser only, with their content, so you can reopen them. Remove one with the x, or clear them all.</p><button class="io-btn-clear" data-action="clear-recent">Clear History</button></div>';

    list.querySelectorAll('.io-recent-item').forEach(item => {
      item.addEventListener('keydown', (event) => { if ((event.key === 'Enter' || event.key === ' ') && event.target === item) { event.preventDefault(); item.click(); } });
      item.addEventListener('click', async (event) => {
        const removeButton = event.target.closest('[data-remove]');
        if (removeButton) {
          event.stopPropagation();
          const keep = recent.filter((_, j) => j !== parseInt(removeButton.dataset.remove, 10));
          try { localStorage.setItem('structra_recent', JSON.stringify(keep)); } catch { /* storage blocked */ }
          this._renderRecent();
          return;
        }
        const entry = recent[parseInt(item.dataset.idx, 10)];
        if (entry && !entry.data && entry.request) { this._fillRequest(entry.request); return; }
        if (entry && !entry.data) { Structra.toast(`${entry.name} is not kept in Recent (it was too large, or keeping contents is off in Settings). Open the file again to use it.`); return; }
        if (entry && entry.data) {
          try {
            const data = await Structra.parseJsonAsync(entry.data);
            this._loadSuccess(data, entry.data, entry.name);
          } catch { Structra.toast('Could not open the saved data'); }
        }
      });
    });

    const clearButton = list.querySelector('[data-action="clear-recent"]');
    if (clearButton) {
      clearButton.addEventListener('click', () => {
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
        const keys = [...new Set([...text.substring(0, 600).matchAll(/"([^"\r\n]{1,30})"\s*:/g)].map((match) => match[1]))].slice(0, 6);
        return keys.length ? 'Fields: ' + keys.join(', ') : text.substring(0, 20).replace(/\s+/g, ' ') + '…';
      })(),
      // The content is kept so the file can be reopened; Settings can turn that off (then only the name and size are kept)
      data: text.length <= 200000 && Structra.appSettings.get('keepRecentContent') !== false ? text : null,
      request: this._pendingRequest || null,
    };
    this._pendingRequest = null;
    const filtered = recent.filter(entry => entry.name !== name);
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
        const trimmed = text.trim();
        if ((trimmed[0] !== '{' && trimmed[0] !== '[') || trimmed === lastHash) return;
        await Structra.parseJsonAsync(trimmed);
        lastHash = trimmed;
        this._showClipBanner(trimmed);
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
      <span>\ud83d\udccb JSON on clipboard: <em>${Structra.sharedHelpers.escapeHtml(preview)}...</em></span>
      <button class="io-clip-load">Load</button>
      <button class="io-clip-dismiss">\u2715</button>`;
    banner.style.display = 'flex';

    banner.querySelector('.io-clip-load').addEventListener('click', async () => {
      banner.style.display = 'none';
      try {
        const data = await Structra.parseJsonAsync(text);
        this._loadSuccess(data, text, 'Clipboard');
      } catch (error) { Structra.toast('This is not valid JSON: ' + error.message); }
    });
    banner.querySelector('.io-clip-dismiss').addEventListener('click', () => { banner.style.display = 'none'; });
    setTimeout(() => { if (banner.style.display !== 'none') banner.style.display = 'none'; }, 8000);
  }

  /* ======== ERROR ======== */
  /** "JSON parse error: JSON parse error (40B): Unexpected token x at position 12" → { what, where } in plain words */
  _explainError(message, rawText) {
    let detail = String(message).replace(/^(?:(?:JSON|CSV|XML|YAML|TOML)\s+)?parse error(?:\s*\([^)]*\))?:\s*/i, '').replace(/^(?:(?:JSON|CSV|XML|YAML|TOML)\s+)?parse error(?:\s*\([^)]*\))?:\s*/i, '');
    let where = '';
    const position = /position\s+(\d+)/i.exec(detail);
    if (position && rawText) {
      const before = rawText.slice(0, Number(position[1]));
      const line = before.split('\n').length;
      const column = before.length - before.lastIndexOf('\n');
      where = `Around line ${line}, character ${column}.`;
      detail = detail.replace(/\s*\(?at position\s+\d+[^)]*\)?/i, '').replace(/\s*in JSON at position\s+\d+/i, '');
    }
    return { detail: detail.trim(), where };
  }

  _showError(message, rawText, title) {
    const element = this.queryOne('[data-role="error"]');
    const escapeHtml = Structra.sharedHelpers.escapeHtml;
    const kind = (/^(\w+) parse error/i.exec(message) || [])[1] || 'JSON';
    const { detail, where } = this._explainError(message, rawText);
    const canRepair = !!rawText && /^json$/i.test(kind);
    element.innerHTML = `
      <div class="io-error-title">${escapeHtml(title || 'This is not valid ' + kind)}</div>
      <div class="io-error-detail">${escapeHtml(detail)}${where ? ' ' + escapeHtml(where) : ''}</div>
      ${canRepair ? `<div class="io-error-actions">
        <button class="io-btn-repair" data-action="repair">${Structra.icons.svg('wrench', { size: 14 })} Fix it for me</button>
        <span class="io-error-hint">Fixes trailing commas, single quotes, comments and True, False or None.</span>
      </div>` : ''}`;
    const repair = element.querySelector('[data-action="repair"]');
    if (repair) {
      repair.addEventListener('click', async () => {
        try {
          const fixed = await Structra.jsonRepairAndValidation.repair(rawText);
          const data = await Structra.parseJsonAsync(fixed);
          this._clearError();
          Structra.toast('Fixed: the data now opens');
          this._loadSuccess(data, fixed, 'Repaired JSON');
        } catch (error) {
          element.innerHTML = `<div class="io-error-title">It could not be fixed automatically</div><div class="io-error-detail">${escapeHtml(this._explainError(error.message, rawText).detail)}</div>`;
        }
      });
    }
    element.classList.add('show');
  }

  _clearError() {
    const element = this.queryOne('[data-role="error"]');
    element.classList.remove('show');
    element.textContent = '';
  }

  /* ======== UTILS ======== */


}

customElements.define('structra-input-panel', StructraInputPanel);
