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
      { id: 'tree',       label: 'Tree View',                    kbd: 'Ctrl+1',       cat: 'Views',    icon: 'list-tree' },
      { id: 'table',      label: 'Table View',                   kbd: 'Ctrl+2',       cat: 'Views',    icon: 'table' },
      { id: 'graph',      label: 'Graph View',                   kbd: 'Ctrl+3',       cat: 'Views',    icon: 'network' },
      { id: 'schema',     label: 'Schema View',                  kbd: 'Ctrl+4',       cat: 'Views',    icon: 'braces' },
      { id: 'editor',     label: 'Editor',                       kbd: 'Ctrl+E',       cat: 'Views',    icon: 'pencil' },
      { id: 'stats',      label: 'Stats & Analysis',             kbd: 'Ctrl+5',       cat: 'Views',    icon: 'chart-column' },
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
      { id: 'fuzzy',      label: 'Fuzzy Search (DuckDB)',          kbd: '',             cat: 'Search',   icon: 'search' },
      { id: 'sql',        label: 'Run SQL Query',                  kbd: '',             cat: 'Search',   icon: 'database' },
      // Analysis
      { id: 'validate',   label: 'Validate JSON Schema',           kbd: '',             cat: 'Analysis', icon: 'shield-check' },
      { id: 'distribution',label:'Column Distribution (DuckDB)',   kbd: '',             cat: 'Analysis', icon: 'chart-column' },
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
    this.on('command:run', (cmdId) => this._exec(cmdId));
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
          ${Structra.icons.svg(c.icon)}
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
        if (!this._maskBackups) this._maskBackups = new Map();
        if (!this._maskBackups.has(Structra.state.activeTab)) this._maskBackups.set(Structra.state.activeTab, data);
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
      case 'wrap':         Structra.events.emit('tree:toggle-wrap'); Structra.toast('Word wrap toggled'); break;
      case 'copy-path':    Structra.util.copy(Structra.state.currentPath || '$', 'Path copied'); break;
      case 'bookmark': {
        const path = Structra.state.currentPath;
        if (!path || path === '$') { Structra.toast('Select a path to bookmark'); break; }
        Structra.toast(Structra.bookmarks.toggle(path) ? 'Bookmarked ' + path : 'Bookmark removed');
        break;
      }
      case 'back':         Structra.nav.back(); break;
      case 'forward':      Structra.nav.forward(); break;
      case 'new-tab':      Structra.events.emit('tabs:add'); break;
      case 'load-url':
        Structra.events.emit('tabs:add');
        setTimeout(() => Structra.events.emit('input:show-tab', 'url'), 50);
        break;
      case 'unmask': {
        const backup = this._maskBackups && this._maskBackups.get(Structra.state.activeTab);
        if (!backup) { Structra.toast('Nothing masked in this tab'); break; }
        this._maskBackups.delete(Structra.state.activeTab);
        this._reingest(backup, 'Unmasked');
        Structra.toast('Original values restored');
        break;
      }

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
