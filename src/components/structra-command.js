/* ============================================================
   STRUCTRA V2 — Command Palette Component
   <structra-command> — searchable command palette overlay
   ============================================================ */

class StructraCommand extends StructraElement {
  static get observedAttributes() { return ['open']; }

  init() {
    this._selectedIdx = 0;
    this._commands = [
      // Views
      { id: 'tree',       label: 'Tree View',                    kbd: 'Ctrl+1',       cat: 'Views',    icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>' },
      { id: 'table',      label: 'Table View',                   kbd: 'Ctrl+2',       cat: 'Views',    icon: '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>' },
      { id: 'graph',      label: 'Graph View',                   kbd: 'Ctrl+3',       cat: 'Views',    icon: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>' },
      { id: 'schema',     label: 'Schema View',                  kbd: 'Ctrl+4',       cat: 'Views',    icon: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>' },
      { id: 'editor',     label: 'Editor',                       kbd: 'Ctrl+E',       cat: 'Views',    icon: '<path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>' },
      { id: 'stats',      label: 'Stats & Analysis',             kbd: 'Ctrl+5',       cat: 'Views',    icon: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>' },
      // Data operations
      { id: 'sort',       label: 'Sort Keys A→Z',                kbd: 'Ctrl+Shift+S', cat: 'Tools',    icon: '<path d="M11 5h10M11 9h7M11 13h4"/><path d="M3 17l3 3 3-3"/><line x1="6" y1="18" x2="6" y2="7"/>' },
      { id: 'flatten',    label: 'Flatten (dot notation)',        kbd: '',             cat: 'Tools',    icon: '<line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/>' },
      { id: 'unflatten',  label: 'Unflatten (restore nested)',    kbd: '',             cat: 'Tools',    icon: '<polyline points="4 7 4 4 20 4 20 7"/><line x1="12" y1="4" x2="12" y2="20"/>' },
      { id: 'mask',       label: 'Mask Sensitive Data (PII)',     kbd: 'Ctrl+Shift+P', cat: 'Tools',    icon: '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8"/><line x1="1" y1="1" x2="23" y2="23"/>' },
      { id: 'mock',       label: 'Generate Mock Data',            kbd: '',             cat: 'Tools',    icon: '<path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/>' },
      { id: 'sample',     label: 'Sample Random Rows',            kbd: '',             cat: 'Tools',    icon: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8"/>' },
      // Code generation
      { id: 'types-ts',   label: 'Generate TypeScript Interfaces',kbd: '',             cat: 'Code Gen', icon: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>' },
      { id: 'types-py',   label: 'Generate Python Dataclasses',   kbd: '',             cat: 'Code Gen', icon: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>' },
      { id: 'types-go',   label: 'Generate Go Structs',           kbd: '',             cat: 'Code Gen', icon: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>' },
      { id: 'types-csharp',label:'Generate C# Classes',           kbd: '',             cat: 'Code Gen', icon: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>' },
      { id: 'types-rust',  label:'Generate Rust Structs',         kbd: '',             cat: 'Code Gen', icon: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>' },
      { id: 'types-sql',   label:'Generate SQL CREATE TABLE',     kbd: '',             cat: 'Code Gen', icon: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>' },
      // Export / Convert
      { id: 'export-csv', label: 'Export as CSV',                  kbd: 'Ctrl+Shift+E', cat: 'Export',   icon: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>' },
      { id: 'export-yaml',label: 'Convert to YAML',               kbd: '',             cat: 'Export',   icon: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>' },
      { id: 'export-xml', label: 'Convert to XML',                kbd: '',             cat: 'Export',   icon: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>' },
      // Search & Filter
      { id: 'share-url',  label: 'Copy Share Link',                 kbd: '',             cat: 'Export',   icon: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>' },
      { id: 'export-image', label: 'Export View as Image',         kbd: '',             cat: 'Export',   icon: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>' },
      { id: 'repair',     label: 'Repair JSON (in Editor)',        kbd: '',             cat: 'Tools',    icon: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94z"/>' },
      { id: 'format-json', label: 'Format JSON (in Editor)',       kbd: '',             cat: 'Tools',    icon: '<line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="20" y2="12"/><line x1="12" y1="18" x2="20" y2="18"/>' },
      { id: 'minify-json', label: 'Minify JSON (in Editor)',       kbd: '',             cat: 'Tools',    icon: '<line x1="4" y1="12" x2="20" y2="12"/>' },
      { id: 'charts',     label: 'Charts for a Column',              kbd: '',             cat: 'Analysis', icon: '<rect x="4" y="14" width="4" height="6"/><rect x="10" y="8" width="4" height="12"/><rect x="16" y="4" width="4" height="16"/>' },
      { id: 'dup-keys',  label: 'Find Duplicate Keys',              kbd: '',             cat: 'Analysis', icon: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>' },
      { id: 'appearance', label: 'Appearance and Themes',          kbd: '',             cat: 'UI',       icon: '<circle cx="13.5" cy="6.5" r="1.5"/><circle cx="8.5" cy="7.5" r="1.5"/><circle cx="6.5" cy="12.5" r="1.5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c3.31 0 6-2.69 6-6 0-4.96-4.49-9-10-9z"/>' },
      { id: 'find',       label: 'Find in JSON',                   kbd: 'Ctrl+F',       cat: 'Search',   icon: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>' },
      { id: 'filter',     label: 'Filter Data',                   kbd: 'Ctrl+Shift+F', cat: 'Search',   icon: '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>' },
      { id: 'fuzzy',      label: 'Fuzzy Search (DuckDB)',          kbd: '',             cat: 'Search',   icon: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>' },
      { id: 'sql',        label: 'Run SQL Query',                  kbd: '',             cat: 'Search',   icon: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 12h8"/>' },
      // Analysis
      { id: 'validate',   label: 'Validate JSON Schema',           kbd: '',             cat: 'Analysis', icon: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>' },
      { id: 'distribution',label:'Column Distribution (DuckDB)',   kbd: '',             cat: 'Analysis', icon: '<rect x="4" y="14" width="4" height="6"/><rect x="10" y="8" width="4" height="12"/><rect x="16" y="4" width="4" height="16"/>' },
      // Undo/Redo
      { id: 'undo',       label: 'Undo',                           kbd: 'Ctrl+Z',       cat: 'Edit',     icon: '<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>' },
      { id: 'redo',       label: 'Redo',                           kbd: 'Ctrl+Y',       cat: 'Edit',     icon: '<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10"/>' },
      // UI
      { id: 'theme',      label: 'Switch Light / Dark',             kbd: 'Alt+T',        cat: 'UI',       icon: '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/>' },
      { id: 'shortcuts',  label: 'Keyboard Shortcuts',             kbd: '?',            cat: 'Help',     icon: '<rect x="2" y="4" width="20" height="16" rx="2"/><line x1="6" y1="8" x2="6" y2="8"/>' },
      // Phase 5 features
      { id: 'diff',       label: 'Diff / Compare JSON',            kbd: 'Ctrl+D',       cat: 'Analysis', icon: '<rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="18" rx="1"/>' },
      { id: 'nullfinder', label: 'Find Null & Empty Values',       kbd: '',             cat: 'Analysis', icon: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>' },
      { id: 'pivot',      label: 'Pivot Table',                    kbd: '',             cat: 'Analysis', icon: '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="3" x2="9" y2="21"/>' },
      { id: 'minimap',    label: 'Toggle Minimap',                 kbd: '',             cat: 'UI',       icon: '<rect x="15" y="3" width="6" height="18" rx="1"/><rect x="3" y="3" width="9" height="18" rx="1"/>' },
      { id: 'snippets',   label: 'Snippet Library',                kbd: '',             cat: 'Tools',    icon: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/>' },
      { id: 'workspace',  label: 'Export/Import Workspace',        kbd: '',             cat: 'Tools',    icon: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>' },
      { id: 'heatmap',    label: 'Toggle Size Heatmap',            kbd: '',             cat: 'UI',       icon: '<rect x="3" y="3" width="18" height="18" rx="2"/><rect x="7" y="7" width="3" height="9" fill="currentColor" opacity=".3"/><rect x="14" y="5" width="3" height="11" fill="currentColor" opacity=".6"/>' },
      { id: 'zoom-in',    label: 'Zoom In',                        kbd: 'Ctrl+=',       cat: 'UI',       icon: '<circle cx="11" cy="11" r="8"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>' },
      { id: 'zoom-out',   label: 'Zoom Out',                       kbd: 'Ctrl+-',       cat: 'UI',       icon: '<circle cx="11" cy="11" r="8"/><line x1="8" y1="11" x2="14" y2="11"/>' },
      { id: 'zoom-reset', label: 'Reset Zoom',                     kbd: 'Ctrl+0',       cat: 'UI',       icon: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>' },
    ];

    this.on('command-palette:toggle', () => this._toggle());
    this.on('overlay:close', () => this._close());
    this.on('command:run', (cmdId) => this._exec(cmdId));
  }

  render() {
    this.innerHTML = `
      <div class="cmd-overlay" id="cmdOverlay">
        <div class="cmd-box">
          <div class="cmd-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
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
    this.$('#cmdInput').addEventListener('input', (e) => {
      this._selectedIdx = 0;
      this._renderList(e.target.value);
    });

    // Keyboard nav
    this.$('#cmdInput').addEventListener('keydown', (e) => {
      const items = this.$$('.cmd-item:not([hidden])');
      if (e.key === 'ArrowDown') { e.preventDefault(); this._selectedIdx = Math.min(this._selectedIdx + 1, items.length - 1); this._highlightItem(items); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); this._selectedIdx = Math.max(this._selectedIdx - 1, 0); this._highlightItem(items); }
      else if (e.key === 'Enter') { e.preventDefault(); if (items[this._selectedIdx]) this._exec(items[this._selectedIdx].dataset.cmd); }
      else if (e.key === 'Escape') { this._close(); }
    });

    // Click on overlay to close
    this.$('#cmdOverlay').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this._close();
    });

    // Click on item to run
    this.$('#cmdList').addEventListener('click', (e) => {
      const item = e.target.closest('.cmd-item');
      if (item) this._exec(item.dataset.cmd);
    });
  }

  _renderList(query) {
    const q = query.toLowerCase();
    const list = this.$('#cmdList');
    const filtered = this._commands.filter(c => !q || c.label.toLowerCase().includes(q) || c.id.includes(q) || (c.cat && c.cat.toLowerCase().includes(q)));
    list.innerHTML = filtered
      .map((c, i) =>
        `<div class="cmd-item ${i === this._selectedIdx ? 'selected' : ''}" data-cmd="${c.id}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${c.icon}</svg>
          <span class="cmd-text">${Structra.util.esc(c.label)}</span>
          <span class="cmd-cat">${c.cat || ''}</span>
          ${c.kbd ? `<kbd>${c.kbd}</kbd>` : ''}
        </div>`
      ).join('');
  }

  _highlightItem(items) {
    items.forEach((el, i) => el.classList.toggle('selected', i === this._selectedIdx));
    if (items[this._selectedIdx]) items[this._selectedIdx].scrollIntoView({ block: 'nearest' });
  }

  _toggle() {
    const overlay = this.$('#cmdOverlay');
    const isOpen = overlay.classList.contains('show');
    if (isOpen) { this._close(); }
    else {
      overlay.classList.add('show');
      const input = this.$('#cmdInput');
      input.value = '';
      this._selectedIdx = 0;
      this._renderList('');
      input.focus();
    }
  }

  _close() {
    this.$('#cmdOverlay').classList.remove('show');
  }

  _exec(cmdId) {
    Structra.log.info('Command', 'Execute: ' + cmdId);
    this._close();
    const views = Structra.constants.VIEWS;

    // View switching
    if (views.includes(cmdId)) {
      Structra.set('activeView', cmdId);
      return;
    }

    const ds = Structra.engine.getActive();
    const data = ds ? ds.raw : Structra.state.jsonData;

    switch (cmdId) {
      /* ---- Data Operations ---- */
      case 'sort': {
        if (!data || typeof data !== 'object') { Structra.toast('No data to sort'); return; }
        Structra.undoStack.push(data, 'Sort Keys A→Z');
        const sorted = this._sortKeysDeep(data);
        this._reingest(sorted, 'Sorted');
        Structra.toast('Keys sorted A→Z');
        break;
      }
      case 'flatten': {
        if (!data || typeof data !== 'object') { Structra.toast('No data to flatten'); return; }
        Structra.undoStack.push(data, 'Flatten');
        const flat = this._flattenObj(data);
        this._reingest(flat, 'Flattened');
        Structra.toast('JSON flattened to dot notation');
        break;
      }
      case 'unflatten': {
        if (!data || typeof data !== 'object') { Structra.toast('No data'); return; }
        Structra.undoStack.push(data, 'Unflatten');
        const nested = this._unflattenObj(data);
        this._reingest(nested, 'Unflattened');
        Structra.toast('JSON unflattened');
        break;
      }
      case 'mask': {
        if (!data) { Structra.toast('No data to mask'); return; }
        Structra.undoStack.push(data, 'Mask PII');
        const masked = Structra.dataMask.maskData(data);
        this._reingest(masked.data, 'Masked');
        Structra.toast(`Masked ${masked.count} sensitive value${masked.count !== 1 ? 's' : ''}`);
        break;
      }
      case 'mock': {
        if (!data) { Structra.toast('No data — load JSON first to generate mock data from its structure'); return; }
        const mockData = Structra.mockGen.generate(data);
        this._reingest(mockData, 'Mock');
        Structra.toast('Mock data generated from structure');
        break;
      }
      case 'sample': {
        if (!Array.isArray(data)) { Structra.toast('Sample requires an array dataset'); return; }
        const n = Math.min(10, data.length);
        Structra.engine.sampleData(n).then(sampled => {
          if (sampled && sampled.length) {
            this._reingest(sampled, 'Sampled');
            Structra.toast(`Sampled ${sampled.length} random rows`);
          }
        }).catch(() => {
          // JS fallback
          const shuffled = [...data].sort(() => Math.random() - 0.5).slice(0, n);
          this._reingest(shuffled, 'Sampled');
          Structra.toast(`Sampled ${shuffled.length} random rows`);
        });
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
        if (!data) { Structra.toast('No data to export'); return; }
        Structra.engine.exportData('csv').then(csv => {
          Structra.util.download(csv, 'export.csv', 'text/csv');
          Structra.toast('CSV downloaded');
        }).catch(() => {
          // JS fallback for non-array data
          const rows = Array.isArray(data) ? data : [data];
          const keys = [...new Set(rows.flatMap(r => Object.keys(r)))];
          const csv = [keys.join(','), ...rows.map(r => keys.map(k => JSON.stringify(r[k] ?? '')).join(','))].join('\n');
          Structra.util.download(csv, 'export.csv', 'text/csv');
          Structra.toast('CSV downloaded');
        });
        break;
      }
      case 'export-yaml': {
        if (!data) { Structra.toast('No data'); return; }
        Structra.convert.jsonToYaml(data).then(yaml => {
          Structra.util.download(yaml, 'export.yaml', 'text/yaml');
          Structra.toast('YAML downloaded');
        }).catch(e => Structra.toast('YAML conversion failed: ' + e.message));
        break;
      }
      case 'export-xml': {
        if (!data) { Structra.toast('No data'); return; }
        try {
          const xml = Structra.convert.jsonToXml(data);
          Structra.util.download(xml, 'export.xml', 'text/xml');
          Structra.toast('XML downloaded');
        } catch (e) { Structra.toast('XML conversion failed: ' + e.message); }
        break;
      }

      /* ---- Search & Filter ---- */
      case 'find':   Structra.events.emit('find:toggle'); break;
      case 'filter': Structra.events.emit('filter:toggle'); break;
      case 'fuzzy': {
        const term = prompt('Fuzzy search term:');
        if (!term) return;
        Structra.engine.fuzzySearch(term).then(result => {
          Structra.toast(`Fuzzy: ${result.total} matches`);
          Structra.events.emit('engine:filter-changed');
        }).catch(() => Structra.toast('Fuzzy search requires DuckDB'));
        break;
      }
      case 'sql': {
        // Focus the query panel SQL input
        Structra.events.emit('rail:switch', 'query');
        break;
      }

      /* ---- Analysis ---- */
      case 'validate':
        Structra.events.emit('validate:open');
        break;
      case 'dup-keys': {
        const src = Structra.engine.getActive() && Structra.engine.getActive()._rawSource;
        if (!src) { Structra.toast('The original text of this document is not available'); return; }
        Structra.toast('Checking for duplicate keys...');
        // Duplicates only exist in the original text (parsing keeps the last value)
        (typeof src === 'string' ? Promise.resolve(src) : src.text())
          .then((text) => Structra.jsonTools.findDuplicateKeys(text))
          .then((dupes) => {
            Structra.set('duplicateKeys', dupes);
            Structra.toast(dupes.length ? dupes.length + ' duplicate key' + (dupes.length === 1 ? '' : 's') + ' found' : 'No duplicate keys');
          });
        break;
      }
      case 'charts':
        Structra.events.emit('charts:open');
        break;
      case 'share-url': {
        if (!data) { Structra.toast('No data to share'); return; }
        Structra.share.createUrl(data)
          .then((url) => Structra.util.copy(url, 'Share link copied'))
          .catch((e) => Structra.toast(e.message));
        break;
      }
      case 'export-image': {
        const panel = document.querySelector('.view-panel.active');
        const view = Structra.state.activeView;
        const base = (Structra.state.fileName || 'structra').replace(/\.[^.]+$/, '');
        Structra.toast('Creating image...');
        Structra.capture.png(panel, base + '-' + view + '.png')
          .then(() => Structra.toast('Image saved'))
          .catch((e) => Structra.toast('Image export failed: ' + e.message));
        break;
      }
      case 'repair':
      case 'format-json':
      case 'minify-json': {
        Structra.set('activeView', 'editor');
        const evt = { 'repair': 'editor:repair', 'format-json': 'editor:format', 'minify-json': 'editor:minify' }[cmdId];
        setTimeout(() => Structra.events.emit(evt), 80);
        break;
      }
      case 'distribution': {
        if (!Array.isArray(data) || !data.length) { Structra.toast('Need array data for distribution'); return; }
        const col = Object.keys(data[0])[0];
        Structra.engine.analyzeDistribution(col).then(dist => {
          Structra.toast(`${col}: median=${dist.median}, stddev=${dist.stddev?.toFixed(2)}`);
          Structra.log.info('Distribution', dist);
        }).catch(() => Structra.toast('Distribution requires DuckDB'));
        break;
      }

      /* ---- Undo/Redo ---- */
      case 'undo': {
        const prev = Structra.undoStack.undo();
        if (prev) { this._reingest(prev, 'Undo'); Structra.toast('Undo'); }
        else Structra.toast('Nothing to undo');
        break;
      }
      case 'redo': {
        const next = Structra.undoStack.redo();
        if (next) { this._reingest(next, 'Redo'); Structra.toast('Redo'); }
        else Structra.toast('Nothing to redo');
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

      default:
        Structra.events.emit('command:exec', cmdId);
    }
  }

  /* ---- Helpers ---- */
  _reingest(data, label) {
    const ds = Structra.engine.getActive();
    const tabId = ds ? ds.id : Structra.state.activeTab;
    const text = JSON.stringify(data);
    const meta = { filename: (ds?.meta?.filename || 'data.json') + ` (${label})`, size: text.length };
    Structra.engine.ingest(tabId, data, meta);
  }


  _showCodeGen(lang) {
    const ds = Structra.engine.getActive();
    const data = ds ? ds.raw : Structra.state.jsonData;
    if (!data) { Structra.toast('No data — load JSON first'); return; }
    Structra.events.emit('typedef:open', { lang, name: 'Root' });
  }

  _showShortcuts() {
    Structra.events.emit('shortcuts:open');
  }

  _sortKeysDeep(obj) {
    if (Array.isArray(obj)) return obj.map(v => this._sortKeysDeep(v));
    if (obj && typeof obj === 'object') {
      const sorted = {};
      for (const k of Object.keys(obj).sort()) sorted[k] = this._sortKeysDeep(obj[k]);
      return sorted;
    }
    return obj;
  }

  _flattenObj(obj, prefix = '', result = {}) {
    if (Array.isArray(obj)) {
      obj.forEach((v, i) => this._flattenObj(v, prefix ? `${prefix}[${i}]` : `[${i}]`, result));
    } else if (obj && typeof obj === 'object') {
      for (const [k, v] of Object.entries(obj)) {
        this._flattenObj(v, prefix ? `${prefix}.${k}` : k, result);
      }
    } else {
      result[prefix] = obj;
    }
    return result;
  }

  _unflattenObj(flat) {
    const result = {};
    for (const [path, value] of Object.entries(flat)) {
      const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');
      let cur = result;
      for (let i = 0; i < parts.length - 1; i++) {
        const key = parts[i];
        const next = parts[i + 1];
        if (!(key in cur)) cur[key] = /^\d+$/.test(next) ? [] : {};
        cur = cur[key];
      }
      cur[parts[parts.length - 1]] = value;
    }
    return result;
  }

}

customElements.define('structra-command', StructraCommand);
