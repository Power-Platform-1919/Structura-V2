/* ============================================================
   STRUCTRA V2 - Command Palette Component
   <structra-command> - searchable command palette overlay

   Wiring (generated from the code below; update it when you add or remove an event):
     Listens to: command-palette:toggle, overlay:close, command:run, tree:inline-edit
     Emits: find:open, drawer:show, validate:open, charts:open, theme:open, theme:toggle,
          welcome:open, diff:open, nullfinder:open, pivot:open, minimap:toggle,
          snippets:open, workspace:open, heatmap:toggle, zoom:in, zoom:out, zoom:reset,
          toolbar:reset, zoom:fit, tree:expand-all, tree:collapse-all, tree:collapse-depth,
          tree:toggle-wrap, tabs:add, input:show-tab, command:exec, tabs:changed,
          typedef:open, shortcuts:open
     Sets state: activeView, findBarOpen, filterBarOpen, duplicateKeys, jsonData, fileSize,
          fileName, currentPath
   ============================================================ */

class StructraCommand extends StructraComponent {
  static get observedAttributes() { return ['open']; }

  init() {
    this._selectedIdx = 0;
    this._commands = [
      // Views
      { id: 'tree',       label: 'Tree View',                    kbd: 'Ctrl+1',       cat: 'Views',    icon: 'list-tree' },
      { id: 'table',      label: 'Table View',                   kbd: 'Ctrl+2',       cat: 'Views',    icon: 'table' },
      { id: 'graph',      label: 'Graph View',                   kbd: 'Ctrl+3',       cat: 'Views',    icon: 'network' },
      { id: 'schema',     label: 'Schema View',                  kbd: 'Ctrl+4',       cat: 'Views',    icon: 'braces' },
      { id: 'editor',     label: 'Editor',                       kbd: 'Ctrl+E',       cat: 'Views',    icon: 'pencil' },
      { id: 'overview',   label: 'Overview',             kbd: 'Ctrl+5',       cat: 'Views',    icon: 'chart-column' },
      // Power Platform
      { id: 'pp-expressions', label: 'Power Platform: expressions for the selected value', kbd: '', cat: 'Power Platform', icon: 'zap', keys: 'power automate power fx expression apply to each items body' },
      { id: 'pp-copy-pa', label: 'Power Platform: copy the Power Automate expression', kbd: '', cat: 'Power Platform', icon: 'copy', keys: 'copy power automate expression body outputs' },
      { id: 'pp-copy-fx', label: 'Power Platform: copy the Power Fx formula', kbd: '', cat: 'Power Platform', icon: 'copy', keys: 'copy power fx formula parsejson canvas' },
      { id: 'pp-schema', label: 'Power Platform: copy the Parse JSON schema', kbd: '', cat: 'Power Platform', icon: 'braces', keys: 'parse json schema copy action' },
      { id: 'pp-flow', label: 'Power Platform: flow actions (Select, Filter array, Apply to each)', kbd: '', cat: 'Power Platform', icon: 'workflow', keys: 'select filter array apply to each flow actions compose' },
      { id: 'pp-columns', label: 'Power Platform: choose the columns for typed tables and Select', kbd: '', cat: 'Power Platform', icon: 'columns-3', keys: 'columns typed table select choose fields' },
      // Data operations
      { id: 'sort',       label: 'Sort Keys A→Z',                kbd: 'Ctrl+Shift+S', cat: 'Tools',    icon: 'arrow-down-a-z' },
      { id: 'flatten',    label: 'Flatten (dot notation)',        kbd: '',             cat: 'Tools',    icon: 'layers' },
      { id: 'unflatten',  label: 'Unflatten (restore nested)',    kbd: '',             cat: 'Tools',    icon: 'unfold-vertical' },
      { id: 'mask',       label: 'Mask Sensitive Data (PII)',     kbd: 'Ctrl+Shift+P', cat: 'Tools',    icon: 'eye-off' },
      { id: 'mock',       label: 'Generate Mock Data',            kbd: '',             cat: 'Tools',    icon: 'dices' },
      { id: 'sample',     label: 'Sample Random Rows',            kbd: '',             cat: 'Tools',    icon: 'shuffle' },
      // Code generation
      { id: 'types-ts',   label: 'Generate TypeScript Interfaces',kbd: '',             cat: 'Code Gen', icon: 'code-xml' },
      { id: 'types-py',   label: 'Generate Python Dataclasses',   kbd: '',             cat: 'Code Gen', icon: 'code-xml' },
      { id: 'types-go',   label: 'Generate Go Structs',           kbd: '',             cat: 'Code Gen', icon: 'code-xml' },
      { id: 'types-csharp',label:'Generate C# Classes',           kbd: '',             cat: 'Code Gen', icon: 'code-xml' },
      { id: 'types-rust',  label:'Generate Rust Structs',         kbd: '',             cat: 'Code Gen', icon: 'code-xml' },
      { id: 'types-sql',   label:'Generate SQL CREATE TABLE',     kbd: '',             cat: 'Code Gen', icon: 'database' },
      // Export / Convert
      { id: 'export-csv', label: 'Export as CSV',                  kbd: 'Ctrl+Shift+E', cat: 'Export',   icon: 'download' },
      { id: 'export-yaml',label: 'Convert to YAML',               kbd: '',             cat: 'Export',   icon: 'download' },
      { id: 'export-xml', label: 'Convert to XML',                kbd: '',             cat: 'Export',   icon: 'download' },
      // Search & Filter
      { id: 'share-url',  label: 'Copy Share Link',                 kbd: '',             cat: 'Export',   icon: 'link' },
      { id: 'export-image', label: 'Export View as Image',         kbd: '',             cat: 'Export',   icon: 'image' },
      { id: 'repair',     label: 'Repair JSON (in Editor)',        kbd: '',             cat: 'Tools',    icon: 'wrench' },
      { id: 'format-json', label: 'Format JSON (in Editor)',       kbd: '',             cat: 'Tools',    icon: 'align-left' },
      { id: 'minify-json', label: 'Minify JSON (in Editor)',       kbd: '',             cat: 'Tools',    icon: 'minus' },
      { id: 'charts',     label: 'Charts for a Column',              kbd: '',             cat: 'Analysis', icon: 'chart-column' },
      { id: 'dup-keys',  label: 'Find Duplicate Keys',              kbd: '',             cat: 'Analysis', icon: 'copy' },
      { id: 'appearance', label: 'Appearance and Themes',          kbd: '',             cat: 'UI',       icon: 'palette' },
      { id: 'find',       label: 'Find in JSON',                   kbd: 'Ctrl+F',       cat: 'Search',   icon: 'search' },
      { id: 'filter',     label: 'Filter Data',                   kbd: 'Ctrl+Shift+F', cat: 'Search',   icon: 'filter' },
      { id: 'fuzzy',      label: 'Fuzzy search (finds close matches)', kbd: '',         cat: 'Search',   icon: 'search' },
      { id: 'sql',        label: 'Ask the data with SQL',          kbd: '',             cat: 'Search',   icon: 'database', keys: 'run sql query select' },
      // Analysis
      { id: 'validate',   label: 'Validate JSON Schema',           kbd: '',             cat: 'Analysis', icon: 'shield-check' },
      // Undo/Redo
      { id: 'undo',       label: 'Undo',                           kbd: 'Ctrl+Z',       cat: 'Edit',     icon: 'undo-2' },
      { id: 'redo',       label: 'Redo',                           kbd: 'Ctrl+Y',       cat: 'Edit',     icon: 'redo-2' },
      // UI
      { id: 'theme',      label: 'Switch Light / Dark',             kbd: 'Alt+T',        cat: 'UI',       icon: 'sun-moon' },
      { id: 'welcome',    label: 'Welcome',                         kbd: '',             cat: 'Help',     icon: 'circle-help' },
      { id: 'expand-all', label: 'Expand All Nodes',                  kbd: '',             cat: 'View',     icon: 'maximize-2' },
      { id: 'collapse-all', label: 'Collapse All Nodes',               kbd: '',             cat: 'View',     icon: 'minimize-2' },
      { id: 'depth-3',    label: 'Collapse to Depth 3',              kbd: '',             cat: 'View',     icon: 'chevrons-down-up' },
      { id: 'wrap',       label: 'Toggle Word Wrap',                 kbd: '',             cat: 'View',     icon: 'wrap-text' },
      { id: 'zoom-fit',   label: 'Zoom to Fit Window',               kbd: '',             cat: 'UI',       icon: 'scan' },
      { id: 'unmask',     label: 'Unmask (restore the original)',    kbd: '',             cat: 'Tools',    icon: 'eye' },
      { id: 'copy-path',  label: 'Copy Current Path',                kbd: '',             cat: 'Navigation', icon: 'copy' },
      { id: 'bookmark',   label: 'Bookmark Current Path',            kbd: 'Ctrl+B',       cat: 'Navigation', icon: 'bookmark' },
      { id: 'back',       label: 'Navigate Back',                    kbd: 'Alt+Left',     cat: 'Navigation', icon: 'arrow-left' },
      { id: 'forward',    label: 'Navigate Forward',                 kbd: 'Alt+Right',    cat: 'Navigation', icon: 'arrow-right' },
      { id: 'new-tab',    label: 'New Tab',                          kbd: 'Alt+N',        cat: 'File',     icon: 'plus' },
      { id: 'load-url',   label: 'Load from URL',                    kbd: '',             cat: 'File',     icon: 'globe' },
      { id: 'toolbar-reset', label: 'Show All Toolbar Buttons',        kbd: '',             cat: 'UI',       icon: 'panel-top' },
      { id: 'shortcuts',  label: 'Keyboard Shortcuts',             kbd: '?',            cat: 'Help',     icon: 'keyboard' },
      // Phase 5 features
      { id: 'diff',       label: 'Diff / Compare JSON',            kbd: 'Ctrl+D',       cat: 'Analysis', icon: 'git-compare' },
      { id: 'nullfinder', label: 'Find Null & Empty Values',       kbd: '',             cat: 'Analysis', icon: 'circle-alert' },
      { id: 'pivot',      label: 'Pivot Table',                    kbd: '',             cat: 'Analysis', icon: 'table-properties' },
      { id: 'minimap',    label: 'Toggle Minimap',                 kbd: '',             cat: 'UI',       icon: 'map' },
      { id: 'snippets',   label: 'Snippet Library',                kbd: '',             cat: 'Tools',    icon: 'clipboard-list' },
      { id: 'workspace',  label: 'Export/Import Workspace',        kbd: '',             cat: 'Tools',    icon: 'package' },
      { id: 'heatmap',    label: 'Toggle Size Heatmap',            kbd: '',             cat: 'UI',       icon: 'flame' },
      { id: 'zoom-in',    label: 'Zoom In',                        kbd: 'Ctrl+=',       cat: 'UI',       icon: 'zoom-in' },
      { id: 'zoom-out',   label: 'Zoom Out',                       kbd: 'Ctrl+-',       cat: 'UI',       icon: 'zoom-out' },
      { id: 'zoom-reset', label: 'Reset Zoom',                     kbd: 'Ctrl+0',       cat: 'UI',       icon: 'scan-search' },
    ];

    this.on('command-palette:toggle', () => this._toggle());
    this.on('overlay:close', () => this._close());
    this.on('command:run', (cmdId) => this._runCommand(cmdId));
    this.on('tree:inline-edit', ({ path, value }) => {
      const before = Structra.state.jsonData;
      if (!before) return;
      const after = typeof structuredClone === 'function' ? structuredClone(before) : JSON.parse(JSON.stringify(before));
      Structra.dataPaths.setNested(after, Structra.dataPaths.canonical(path), value);
      this._edit('Edit value', before, after, 'Value changed');
    });
  }

  render() {
    this.innerHTML = `
      <div class="cmd-overlay" id="cmdOverlay">
        <div class="cmd-box">
          <div class="cmd-search">
            ${Structra.icons.svg('search')}
            <input type="text" class="cmd-input" id="cmdInput" placeholder="Type a command..." autocomplete="off">
          </div>
          <div class="cmd-group-title">Commands</div>
          <div class="cmd-list" id="cmdList"></div>
          <div class="cmd-footer">
            <span><kbd>↑↓</kbd> Navigate</span>
            <span><kbd>↵</kbd> Run</span>
            <span><kbd>Esc</kbd> Close</span>
          </div>
        </div>
      </div>`;

    this._renderList('');

    // Filter on input
    this.queryOne('#cmdInput').addEventListener('input', (event) => {
      this._selectedIdx = 0;
      this._renderList(event.target.value);
    });

    // Keyboard nav
    this.queryOne('#cmdInput').addEventListener('keydown', (event) => {
      const items = this.queryAll('.cmd-item:not([hidden])');
      if (event.key === 'ArrowDown') { event.preventDefault(); this._selectedIdx = Math.min(this._selectedIdx + 1, items.length - 1); this._highlightItem(items); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); this._selectedIdx = Math.max(this._selectedIdx - 1, 0); this._highlightItem(items); }
      else if (event.key === 'Enter') { event.preventDefault(); if (items[this._selectedIdx]) this._runCommand(items[this._selectedIdx].dataset.cmd); }
      else if (event.key === 'Escape') { this._close(); }
    });

    // Click on overlay to close
    this.queryOne('#cmdOverlay').addEventListener('click', (event) => {
      if (event.target === event.currentTarget) this._close();
    });

    // Click on item to run
    this.queryOne('#cmdList').addEventListener('click', (event) => {
      const item = event.target.closest('.cmd-item');
      if (item) this._runCommand(item.dataset.cmd);
    });
  }

  /** Commands that need a document, or the Tree, or something to undo, are left out when that is not the case */
  _available(command) {
    const hasData = !!Structra.state.jsonData;
    const ALWAYS = ['new-tab', 'load-url', 'welcome', 'shortcuts', 'appearance', 'theme', 'toolbar-reset', 'zoom-in', 'zoom-out', 'zoom-reset', 'zoom-fit', 'snippets', 'workspace', 'back', 'forward'];
    if (ALWAYS.includes(command.id)) return true;
    if (!hasData) return false;
    if (['expand-all', 'collapse-all', 'depth-3', 'wrap'].includes(command.id)) return Structra.state.activeView === 'tree';
    if (command.id === 'undo') return Structra.undoStack.canUndo();
    if (command.id === 'redo') return Structra.undoStack.canRedo();
    if (command.id === 'unmask') return !!(this._maskBackups && this._maskBackups.has(Structra.tabs.activeId));
    if (['pp-copy-pa', 'pp-copy-fx'].includes(command.id)) return !!Structra.state.currentPath && Structra.state.currentPath !== '$';
    return true;
  }

  _renderList(query) {
    const searchText = query.toLowerCase().trim();
    const list = this.queryOne('#cmdList');
    const filtered = this._commands.filter(command => this._available(command)
      && (!searchText || command.label.toLowerCase().includes(searchText) || command.id.includes(searchText) || (command.cat && command.cat.toLowerCase().includes(searchText)) || (command.keys && command.keys.includes(searchText))));
    if (!filtered.length) {
      list.innerHTML = `<div class="cmd-empty">No command matches <strong>${Structra.sharedHelpers.escapeHtml(query)}</strong>. Try a word like sort, mask, export, table or power.</div>`;
      return;
    }
    list.innerHTML = filtered
      .map((command, i) =>
        `<div class="cmd-item ${i === this._selectedIdx ? 'selected' : ''}" data-cmd="${command.id}">
          ${Structra.icons.svg(command.icon)}
          <span class="cmd-text">${Structra.sharedHelpers.escapeHtml(command.label)}</span>
          <span class="cmd-cat">${command.cat || ''}</span>
          ${command.kbd ? `<kbd>${command.kbd}</kbd>` : ''}
        </div>`
      ).join('');
  }

  _highlightItem(items) {
    items.forEach((item, i) => item.classList.toggle('selected', i === this._selectedIdx));
    if (items[this._selectedIdx]) items[this._selectedIdx].scrollIntoView({ block: 'nearest' });
  }

  _toggle() {
    const overlay = this.queryOne('#cmdOverlay');
    const isOpen = overlay.classList.contains('show');
    if (isOpen) { this._close(); }
    else {
      overlay.classList.add('show');
      const input = this.queryOne('#cmdInput');
      input.value = '';
      this._selectedIdx = 0;
      this._renderList('');
      input.focus();
    }
  }

  _close() {
    this.queryOne('#cmdOverlay').classList.remove('show');
  }

  _runCommand(cmdId) {
    Structra.log.info('Command', 'Execute: ' + cmdId);
    this._close();
    const views = Structra.constants.VIEWS;

    // View switching
    if (views.includes(cmdId)) {
      Structra.setState('activeView', cmdId);
      return;
    }

    const dataset = Structra.dataEngine.getActive();
    const data = dataset ? dataset.raw : Structra.state.jsonData;

    switch (cmdId) {
      /* ---- Data Operations ---- */
      case 'sort': {
        if (!data || typeof data !== 'object') { Structra.toast('Open a file first'); return; }
        this._edit('Sort keys A→Z', data, this._sortKeysDeep(data), 'Keys sorted A→Z');
        break;
      }
      case 'flatten': {
        if (!data || typeof data !== 'object') { Structra.toast('Open a file first'); return; }
        const clash = [];
        const flat = this._flattenObj(data, '', {}, clash);
        if (clash.length) { Structra.toast(`Not flattened, because it would lose data: "${clash[0]}" would be written twice${clash.length > 1 ? ` (and ${clash.length - 1} more)` : ''}. Rename one of them first.`, 'warning'); return; }
        this._edit('Flatten', data, flat, 'JSON flattened to dot notation');
        break;
      }
      case 'unflatten': {
        if (!data || typeof data !== 'object') { Structra.toast('Open a file first'); return; }
        const rebuilt = this._unflattenObj(data);
        if (rebuilt.problem) { Structra.toast('Could not unflatten: ' + rebuilt.problem, 'warning'); return; }
        this._edit('Unflatten', data, rebuilt.data, 'JSON unflattened');
        break;
      }
      case 'mask': {
        if (!data) { Structra.toast('Open a file first'); return; }
        const masked = Structra.personalDataMasker.maskData(data);
        if (!masked.count) { Structra.toast('Nothing to mask: no emails, phone numbers or other personal values found'); return; }
        // Keep the original of this tab, so Unmask can bring it back even after other edits
        if (!this._maskBackups) this._maskBackups = new Map();
        const tabId = Structra.tabs.activeId;
        if (!this._maskBackups.has(tabId)) this._maskBackups.set(tabId, data);
        this._edit('Mask personal data', data, masked.data, `Masked ${masked.count} sensitive value${masked.count !== 1 ? 's' : ''}`);
        break;
      }
      case 'mock': {
        if (!data) { Structra.toast('Open a file first. Sample data is made from its structure.'); return; }
        const mockData = Structra.mockDataGenerator.generate(data);
        const rows = Array.isArray(mockData) ? mockData.length : 1;
        this._openInNewTab(mockData, this._baseName() + ' (mock)')
          .then((opened) => { if (opened) Structra.toast(`Mock data made from the structure: ${rows} ${rows === 1 ? 'record' : 'records'}, opened in a new tab`); });
        break;
      }
      case 'sample': {
        if (!Array.isArray(data)) { Structra.toast('A random sample needs a list of records'); return; }
        const count = Math.min(10, data.length);
        const open = (rows) => this._openInNewTab(rows, this._baseName() + ' (sample)')
          .then((opened) => { if (opened) Structra.toast(`${rows.length} random rows, opened in a new tab`); });
        const shuffle = () => [...data].sort(() => Math.random() - 0.5).slice(0, count);
        Structra.dataEngine.sampleData(count).then((sampled) => open(sampled && sampled.length ? sampled : shuffle())).catch(() => open(shuffle()));
        break;
      }

      /* ---- Code Generation ---- */
      case 'types-ts':     this._showCodeGen('typescript'); break;
      case 'types-py':     this._showCodeGen('python'); break;
      case 'types-go':     this._showCodeGen('go'); break;
      case 'types-csharp': this._showCodeGen('csharp'); break;
      case 'types-rust':   this._showCodeGen('rust'); break;
      case 'types-sql':    this._showCodeGen('sql'); break;

      /* ---- Export / Convert ---- */
      case 'export-csv': {
        if (!data) { Structra.toast('Open a file first'); return; }
        Structra.dataEngine.exportData('csv').then(csv => {
          Structra.sharedHelpers.downloadFile(csv, this._baseName() + '.csv', 'text/csv');
          Structra.toast('CSV downloaded');
        }).catch(() => {
          // JS fallback for non-array data
          const rows = Array.isArray(data) ? data : [data];
          const keys = [...new Set(rows.flatMap(row => Object.keys(row)))];
          const csv = [keys.join(','), ...rows.map(row => keys.map(key => JSON.stringify(row[key] ?? '')).join(','))].join('\n');
          Structra.sharedHelpers.downloadFile(csv, this._baseName() + '.csv', 'text/csv');
          Structra.toast('CSV downloaded');
        });
        break;
      }
      case 'export-yaml': {
        if (!data) { Structra.toast('Open a file first'); return; }
        Structra.formatConversion.jsonToYaml(data).then(yaml => {
          Structra.sharedHelpers.downloadFile(yaml, this._baseName() + '.yaml', 'text/yaml');
          Structra.toast('YAML downloaded');
        }).catch(error => Structra.toast('Could not convert to YAML: ' + error.message));
        break;
      }
      case 'export-xml': {
        if (!data) { Structra.toast('Open a file first'); return; }
        try {
          const xml = Structra.formatConversion.jsonToXml(data);
          Structra.sharedHelpers.downloadFile(xml, this._baseName() + '.xml', 'text/xml');
          Structra.toast('XML downloaded');
        } catch (error) { Structra.toast('Could not convert to XML: ' + error.message); }
        break;
      }

      /* ---- Search & Filter ---- */
      case 'find':   Structra.setState('findBarOpen', !Structra.state.findBarOpen); break;
      case 'filter': Structra.setState('filterBarOpen', !Structra.state.filterBarOpen); break;
      case 'fuzzy':
        Structra.events.emit('find:open', { mode: 'fuzzy' });
        break;
      case 'sql':
        // SQL is typed in the Find bar (anything that starts with SELECT runs as SQL); `data` is the open document
        Structra.events.emit('find:open', { mode: 'text', text: 'SELECT * FROM data LIMIT 100', run: false });
        break;

      /* ---- Power Platform ---- */
      case 'pp-expressions': Structra.events.emit('drawer:show', 'expressions'); break;
      case 'pp-flow':
        Structra.events.emit('drawer:show', 'expressions');
        setTimeout(() => document.querySelector('.expr-subtab[data-sub="flow"]')?.click(), 60);
        break;
      case 'pp-columns':
        Structra.events.emit('drawer:show', 'expressions');
        setTimeout(() => document.querySelector('.expr-subtab[data-sub="canvas"]')?.click(), 60);
        Structra.toast('Choose the columns at the top of the Canvas app and Flow actions tabs. Select a list first.');
        break;
      case 'pp-copy-pa':
      case 'pp-copy-fx': {
        const path = Structra.state.currentPath;
        const value = Structra.dataPaths.resolve(Structra.state.jsonData, path);
        if (!path || path === '$') {
          // The Table and Overview have no selected value: the Tree is where one is picked
          if (Structra.state.activeView !== 'tree') Structra.setState('activeView', 'tree');
          Structra.toast('Select a value in the Tree, then run this again');
          return;
        }
        const rows = Structra.powerPlatformExpressions.quick(path, value).filter((row) => row.app === (cmdId === 'pp-copy-pa' ? 'Power Automate' : 'Power Fx'));
        if (rows[0]) Structra.sharedHelpers.copyToClipboard(rows[0].code, rows[0].label + ' copied');
        break;
      }
      case 'pp-schema': {
        if (!data) { Structra.toast('Open a file first'); return; }
        Structra.sharedHelpers.copyToClipboard(JSON.stringify(Structra.parseJsonSchemaGenerator.smart(data, { integers: true, required: true }), null, 2), 'Parse JSON schema copied');
        break;
      }

      /* ---- Analysis ---- */
      case 'validate':
        Structra.events.emit('validate:open');
        break;
      case 'dup-keys': {
        const source = Structra.dataEngine.getActive() && Structra.dataEngine.getActive()._rawSource;
        if (!source) { Structra.toast('No duplicate keys. This document was not read from JSON text (CSV, edited or generated data), so a key cannot repeat.'); return; }
        Structra.toast('Checking for duplicate keys...');
        // Duplicates only exist in the original text (parsing keeps the last value)
        (typeof source === 'string' ? Promise.resolve(source) : source.text())
          .then((text) => Structra.jsonRepairAndValidation.findDuplicateKeys(text))
          .then((dupes) => {
            Structra.setState('duplicateKeys', dupes);
            Structra.toast(dupes.length ? dupes.length + ' duplicate key' + (dupes.length === 1 ? '' : 's') + ' found' : 'No duplicate keys');
          });
        break;
      }
      case 'charts':
        Structra.events.emit('charts:open');
        break;
      case 'share-url': {
        if (!data) { Structra.toast('Open a file first'); return; }
        Structra.shareLink.createUrl(data, Structra.state.fileName)
          .then(({ url, bytes }) => Structra.sharedHelpers.copyToClipboard(url, `Share link copied (${bytes < 1000 ? bytes + ' characters' : Math.round(bytes / 1000) + ' KB'}). The data is inside the link, nothing is uploaded, and anyone with the link can read it.`))
          .catch((error) => Structra.toast(error.message));
        break;
      }
      case 'export-image': {
        const panel = document.querySelector('.view-panel.active');
        const view = Structra.state.activeView;
        const base = (Structra.state.fileName || 'structra').replace(/\.[^.]+$/, '');
        Structra.toast('Creating image...');
        Structra.imageCapture.png(panel, base + '-' + view + '.png')
          .then(() => Structra.toast('Image saved'))
          .catch((error) => Structra.toast('Could not save the image: ' + error.message));
        break;
      }
      case 'repair':
      case 'format-json':
      case 'minify-json': {
        Structra.setState('activeView', 'editor');
        const event = { 'repair': 'editor:repair', 'format-json': 'editor:format', 'minify-json': 'editor:minify' }[cmdId];
        setTimeout(() => Structra.events.emit(event), 80);
        break;
      }

      /* ---- Undo/Redo ---- */
      case 'undo': {
        const label = Structra.undoStack.nextUndoLabel();
        const previous = Structra.undoStack.undo();
        if (previous) this._reingest(previous).then(() => { this._syncModified(); Structra.toast('Undid: ' + label); });
        else Structra.toast('Nothing to undo in this tab');
        break;
      }
      case 'redo': {
        const label = Structra.undoStack.nextRedoLabel();
        const next = Structra.undoStack.redo();
        if (next) this._reingest(next).then(() => { this._syncModified(); Structra.toast('Redid: ' + label); });
        else Structra.toast('Nothing to redo in this tab');
        break;
      }

      /* ---- UI ---- */
      case 'appearance':
        Structra.events.emit('theme:open');
        break;
      case 'theme':
        Structra.events.emit('theme:toggle');
        break;
      case 'shortcuts':
        this._showShortcuts();
        break;
      case 'welcome':
        Structra.events.emit('welcome:open');
        break;

      /* ---- Phase 5 ---- */
      case 'diff':       Structra.events.emit('diff:open'); break;
      case 'nullfinder': Structra.events.emit('nullfinder:open'); break;
      case 'pivot':      Structra.events.emit('pivot:open'); break;
      case 'minimap':    Structra.events.emit('minimap:toggle'); break;
      case 'snippets':   Structra.events.emit('snippets:open'); break;
      case 'workspace':  Structra.events.emit('workspace:open'); break;
      case 'heatmap':    Structra.events.emit('heatmap:toggle'); break;
      case 'zoom-in':    Structra.events.emit('zoom:in'); break;
      case 'zoom-out':   Structra.events.emit('zoom:out'); break;
      case 'zoom-reset': Structra.events.emit('zoom:reset'); break;
      case 'toolbar-reset': Structra.events.emit('toolbar:reset'); break;
      case 'zoom-fit':   Structra.events.emit('zoom:fit'); break;
      case 'expand-all':   Structra.events.emit('tree:expand-all'); break;
      case 'collapse-all': Structra.events.emit('tree:collapse-all'); break;
      case 'depth-3':      Structra.events.emit('tree:collapse-depth', 3); break;
      case 'wrap':         Structra.events.emit('tree:toggle-wrap'); break;
      case 'copy-path':    Structra.sharedHelpers.copyToClipboard(Structra.state.currentPath || '$', 'Path copied'); break;
      case 'bookmark': {
        const path = Structra.state.currentPath;
        if (!path || path === '$') { Structra.toast('Select a path to bookmark'); break; }
        Structra.toast(Structra.bookmarks.toggle(path) ? 'Bookmarked ' + path : 'Bookmark removed');
        break;
      }
      case 'back':         Structra.pathHistory.back(); break;
      case 'forward':      Structra.pathHistory.forward(); break;
      case 'new-tab':      Structra.events.emit('tabs:add'); break;
      case 'load-url':
        Structra.events.emit('tabs:add');
        setTimeout(() => Structra.events.emit('input:show-tab', 'url'), 50);
        break;
      case 'unmask': {
        const tabId = Structra.tabs.activeId;
        const backup = this._maskBackups && this._maskBackups.get(tabId);
        if (!backup) { Structra.toast('Nothing masked in this tab'); break; }
        this._maskBackups.delete(tabId);
        this._edit('Unmask', data, backup, 'Original values restored');
        break;
      }

      default:
        Structra.events.emit('command:exec', cmdId);
    }
  }

  /* ---- Helpers ---- */
  /** Show new data in the open tab: the engine and every view (Tree, Table, Overview...) switch to it together */
  async _reingest(data) {
    const dataset = Structra.dataEngine.getActive();
    const tabId = dataset ? dataset.id : Structra.tabs.activeId;
    const size = JSON.stringify(data).length;
    await Structra.dataEngine.ingest(tabId, data, {
      fileName: (dataset && dataset.meta.fileName) || Structra.state.fileName || 'data.json',
      fileSize: size,
    });
    Structra.setState('jsonData', data);
    Structra.setState('fileSize', size);
    const tab = Structra.tabs.list.find((tab) => tab.id === tabId);
    if (tab) { tab.modified = true; Structra.events.emit('tabs:changed'); }
  }

  /** After Undo or Redo: the tab counts as changed only while the history is past its first step (the original) */
  _syncModified() {
    const tab = Structra.tabs.list.find((tab) => tab.id === Structra.tabs.activeId);
    const current = Structra.undoStack.current();
    if (tab) { tab.modified = !!current && current.index > 0; Structra.events.emit('tabs:changed'); }
  }

  /**
   * Change the open document in a way that can be undone: the original is kept first, then the result.
   * @param {string} label  what the change is called in Undo messages
   */
  async _edit(label, before, after, message) {
    const tabId = Structra.tabs.activeId;
    const kept = Structra.undoStack.push(before, 'Before ' + label, tabId);
    await this._reingest(after);
    if (kept) Structra.undoStack.push(after, label, tabId);
    if (kept) Structra.toast(message + '.', { action: { label: 'Undo', run: () => this._runCommand('undo') } });
    else Structra.toast(message + ' (too large to undo)');
  }

  /** The name of the open file without its extension, for naming files made from it */
  _baseName() {
    return (Structra.state.fileName || 'data').replace(/\.[^.]+$/, '');
  }

  /** Open generated data in a new tab, so the user's own file is never replaced. Resolves false when no tab could be made. */
  async _openInNewTab(data, name) {
    const before = Structra.tabs.list.length;
    Structra.events.emit('tabs:add');
    if (Structra.tabs.list.length === before) return false;           // the tab limit was reached (the tab bar already said so)
    const tabId = Structra.tabs.activeId;
    const size = JSON.stringify(data).length;
    await Structra.dataEngine.ingest(tabId, data, { fileName: name, fileSize: size });
    Structra.setState('jsonData', data);
    Structra.setState('fileName', name);
    Structra.setState('fileSize', size);
    Structra.setState('currentPath', '$');
    Structra.setState('activeView', 'tree');
    return true;
  }

  _showCodeGen(lang) {
    const dataset = Structra.dataEngine.getActive();
    const data = dataset ? dataset.raw : Structra.state.jsonData;
    if (!data) { Structra.toast('Open a file first'); return; }
    Structra.events.emit('typedef:open', { lang, name: 'Root' });
  }

  _showShortcuts() {
    Structra.events.emit('shortcuts:open');
  }

  _sortKeysDeep(object) {
    if (Array.isArray(object)) return object.map(item => this._sortKeysDeep(item));
    if (object && typeof object === 'object') {
      const sorted = {};
      for (const key of Object.keys(object).sort()) sorted[key] = this._sortKeysDeep(object[key]);
      return sorted;
    }
    return object;
  }

  /** Dot notation. Two paths that give the same name are recorded in `clash` instead of one overwriting the other. */
  _flattenObj(object, prefix = '', result = {}, clash = []) {
    const addEntry = (key, value) => {
      if (Object.prototype.hasOwnProperty.call(result, key)) clash.push(key);
      else result[key] = value;
    };
    if (Array.isArray(object)) {
      if (!object.length) addEntry(prefix, []);
      object.forEach((item, i) => this._flattenObj(item, prefix ? `${prefix}[${i}]` : `[${i}]`, result, clash));
    } else if (object && typeof object === 'object') {
      const entries = Object.entries(object);
      if (!entries.length) addEntry(prefix, {});
      for (const [key, item] of entries) this._flattenObj(item, prefix ? `${prefix}.${key}` : key, result, clash);
    } else {
      addEntry(prefix, object);
    }
    return result;
  }

  /** Rebuild nesting from dot notation. Returns { data } or { problem } when it cannot be rebuilt without losing something. */
  _unflattenObj(flat) {
    const result = {};
    const unsafe = new Set(['__proto__', 'constructor', 'prototype']);
    for (const [path, value] of Object.entries(flat)) {
      const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');
      if (parts.some((part) => unsafe.has(part))) return { problem: `"${path}" uses a name that cannot be rebuilt safely.` };
      let current = result;
      for (let i = 0; i < parts.length - 1; i++) {
        const key = parts[i];
        const next = parts[i + 1];
        if (!Object.prototype.hasOwnProperty.call(current, key)) current[key] = /^\d+$/.test(next) ? [] : {};
        else if (current[key] === null || typeof current[key] !== 'object') return { problem: `"${parts.slice(0, i + 1).join('.')}" is both a value and a group of values.` };
        current = current[key];
      }
      const last = parts[parts.length - 1];
      if (Object.prototype.hasOwnProperty.call(current, last)) return { problem: `"${path}" appears twice after rebuilding.` };
      current[last] = value;
    }
    return { data: result };
  }

}

customElements.define('structra-command', StructraCommand);
