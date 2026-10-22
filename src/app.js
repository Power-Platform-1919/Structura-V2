/* ============================================================
   STRUCTRA V2 - App Bootstrap
   Initializes the application after all components are loaded
   ============================================================ */

(function () {
  'use strict';

  if (window.__splashStep) window.__splashStep('Initializing core…');

  Structra.log.info('App', '=== Structra V2 Bootstrap ===');
  Structra.log.info('App', 'Log mode: ' + Structra.log.getMode() + ' (change via Structra.log.setMode("dev"))');

  // Apply saved theme
  Structra.applyTheme();

  // Create initial tab
  Structra.log.info('App', 'Creating initial tab');
  Structra.tabs.list.push({
    id: 1,
    label: 'Untitled 1',
    data: null,
    path: '$',
    view: 'tree',
    modified: false,
  });
  Structra.tabs.activeId = 1;
  Structra.tabs.nextId = 2;
  Structra.events.emit('tabs:changed');

  // Tab-state coordination: sync global state <-> tab objects
  Structra.events.on('tabs:switched', (tab) => {
    Structra.log.info('App', 'Tab switched: ' + tab.label + ' (id=' + tab.id + ')');
    // Clear active query so stale results don't bleed into new tab
    Structra.engine.clearQuery();
    Structra.set('jsonData', tab.data || null);
    Structra.set('fileName', tab.fileName || '');
    Structra.set('fileSize', tab.fileSize || 0);
    Structra.set('currentPath', tab.path || '$');
  });

  // Mirror global state changes back to the active tab object
  Structra.events.on('state:jsonData', (d) => {
    const tab = Structra.tabs.list.find(t => t.id === Structra.tabs.activeId);
    if (tab) tab.data = d.value;
  });
  Structra.events.on('state:fileName', (d) => {
    const tab = Structra.tabs.list.find(t => t.id === Structra.tabs.activeId);
    if (tab) {
      tab.fileName = d.value;
      if (d.value) tab.label = d.value;
      Structra.events.emit('tabs:changed');
    }
  });
  Structra.events.on('state:fileSize', (d) => {
    const tab = Structra.tabs.list.find(t => t.id === Structra.tabs.activeId);
    if (tab) tab.fileSize = d.value;
  });

  // Theme toggle on overlay (kept for when overlay is manually opened)
  document.getElementById('overlayThemeToggle').addEventListener('click', () => Structra.toggleTheme());

  // Canvas data-dependent visibility: views vs empty input panel
  function _updateCanvasVisibility(hasData) {
    const header = document.getElementById('canvasHeader');
    const views = document.getElementById('viewPanel');
    const empty = document.getElementById('canvasEmpty');
    if (header) header.style.display = hasData ? '' : 'none';
    if (views) views.style.display = hasData ? '' : 'none';
    if (empty) empty.style.display = hasData ? 'none' : '';
  }
  _updateCanvasVisibility(false); // start hidden

  Structra.events.on('state:jsonData', (d) => {
    _updateCanvasVisibility(!!d.value);
  });

  // Place view components inside view-switcher panels
  if (window.__splashStep) window.__splashStep('Mounting components…');
  Structra.log.info('App', 'Mounting view components into switcher panels');
  const viewSwitcher = document.querySelector('structra-view-switcher');
  if (viewSwitcher) {
    const views = {
      tree:   '<structra-tree></structra-tree>',
      table:  '<structra-table></structra-table>',
      graph:  '<structra-graph></structra-graph>',
      schema: '<structra-schema></structra-schema>',
      editor: '<structra-editor></structra-editor>',
      stats:  '<structra-stats></structra-stats>',
    };
    Object.entries(views).forEach(([id, html]) => {
      const panel = viewSwitcher.querySelector(`[data-view="${id}"]`);
      if (panel) panel.innerHTML = html;
    });
  }

  // Panel toggling is handled by the components themselves via state events

  // Global keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    const key = [];
    if (e.ctrlKey || e.metaKey) key.push('ctrl');
    if (e.shiftKey) key.push('shift');
    if (e.altKey) key.push('alt');

    const k = e.key.toLowerCase();
    if (k !== 'control' && k !== 'shift' && k !== 'alt' && k !== 'meta') {
      key.push(k);
    }
    const combo = key.join('+');
    const action = Structra.constants.SHORTCUTS[combo];
    if (!action) return;

    e.preventDefault();
    Structra.events.emit('shortcut', action);

    switch (action) {
      case 'command-palette':
        Structra.events.emit('command-palette:toggle');
        break;
      case 'find':
        Structra.set('findBarOpen', true);
        break;
      case 'find-replace':
        Structra.set('findBarOpen', true);
        // Toggle replace row open
        setTimeout(() => Structra.events.emit('find:toggle-replace'), 50);
        break;
      case 'filter':
        Structra.set('filterBarOpen', !Structra.state.filterBarOpen);
        break;
      case 'focus-path':
        document.getElementById('pathInput')?.focus();
        break;
      case 'new-tab':
        Structra.events.emit('tabs:add');
        break;
      case 'close-tab':
        Structra.events.emit('tabs:close-active');
        break;
      case 'close-overlay':
        Structra.events.emit('overlay:close');
        break;
      case 'bookmark': {
        const path = Structra.state.currentPath;
        if (!path || path === '$') { Structra.toast('Select a path to bookmark'); break; }
        Structra.toast(Structra.bookmarks.toggle(path) ? 'Bookmarked ' + path : 'Bookmark removed');
        break;
      }
      case 'nav-back':    Structra.nav.back(); break;
      case 'nav-forward': Structra.nav.forward(); break;
      // View shortcuts
      case 'view-tree':   Structra.set('activeView', 'tree'); break;
      case 'view-table':  Structra.set('activeView', 'table'); break;
      case 'view-graph':  Structra.set('activeView', 'graph'); break;
      case 'view-schema': Structra.set('activeView', 'schema'); break;
      case 'view-stats':  Structra.set('activeView', 'stats'); break;
      case 'view-editor': Structra.set('activeView', 'editor'); break;
      // Tool shortcuts → delegate to command palette exec
      case 'sort':
      case 'export-csv':
      case 'mask':
      case 'compare':
      case 'undo':
      case 'redo':
      case 'theme':
        Structra.events.emit('command:run', action);
        break;
    }
  });

  // File drop support
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;

    const ext = file.name.split('.').pop().toLowerCase();
    if (!['json', 'txt', 'csv', 'tsv'].includes(ext)) {
      Structra.log.warn('App', 'Dropped file ignored (unsupported extension): ' + ext);
      return;
    }

    Structra.log.info('App', 'File dropped: ' + file.name + ' (' + (file.size / 1048576).toFixed(2) + ' MB, ext=' + ext + ')');

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        let data;
        if (ext === 'csv' || ext === 'tsv') {
          Structra.log.info('App', 'Parsing dropped CSV/TSV...');
          const result = await Structra.parseCsvAsync(reader.result);
          if (result.data.length === 0) { Structra.toast('No data found in CSV'); return; }
          if (result.errors.length > 0) {
            Structra.log.warn('App', 'CSV parse warnings: ' + result.errors.length);
            Structra.toast('CSV parsed with ' + result.errors.length + ' warning(s)');
          }
          data = result.data;
        } else {
          Structra.log.info('App', 'Parsing dropped JSON (' + (reader.result.length / 1024).toFixed(1) + ' KB)...');
          data = await Structra.parseJsonAsync(reader.result);
        }
        Structra.log.info('App', 'Drop parse success — setting state');
        Structra.set('jsonData', data);
        Structra.set('fileName', file.name);
        Structra.set('fileSize', file.size);
        Structra.set('currentPath', '$');
        Structra.toast('Loaded ' + file.name);
      } catch (err) {
        Structra.log.error('App', 'Drop parse failed: ' + err.message, err);
        Structra.toast(ext === 'csv' || ext === 'tsv' ? 'CSV parse failed: ' + err.message : 'Invalid JSON file');
      }
    };
    reader.onerror = () => {
      Structra.log.error('App', 'FileReader error on drop:', reader.error);
    };
    reader.readAsText(file);
  });

  /* --- Engine Integration --- */

  // Wire tab events to engine
  Structra.events.on('tabs:switched', (tab) => {
    Structra.engine.setActive(tab.id);
  });

  Structra.events.on('tabs:closed', (tabId) => {
    Structra.engine.remove(tabId);
  });

  // When jsonData is set from sources other than input panel (e.g., file drop),
  // ingest into engine if not already ingested
  Structra.events.on('state:jsonData', async (d) => {
    if (!d.value) return;
    const activeTab = Structra.tabs.list.find(t => t.id === Structra.tabs.activeId);
    if (!activeTab) return;
    // Skip if engine already has this dataset (input-panel already ingested)
    const existing = Structra.engine.getActive();
    if (existing && existing.id === activeTab.id && existing.raw === d.value) return;
    await Structra.engine.ingest(activeTab.id, d.value, {
      fileName: activeTab.fileName || 'untitled',
      fileSize: activeTab.fileSize || 0,
    });
  });

  // Start DuckDB async initialization (non-blocking)
  const splashMsg = document.getElementById('splashMsg');
  if (splashMsg) splashMsg.textContent = 'Initializing DuckDB…';

  // Safety cap: 90s for first-time WASM download + compile on slow networks
  const _splashTimeout = setTimeout(() => {
    Structra.log.warn('App', 'DuckDB init exceeded 90s — showing app without SQL engine');
    _hideSplash('DuckDB loading slowly — SQL available when ready');
  }, 90000);

  Structra.duckdb.init().then(() => {
    clearTimeout(_splashTimeout);
    _hideSplash();
    Structra.toast('DuckDB SQL engine ready', 'success');
  }).catch((err) => {
    Structra.log.error('App', 'DuckDB init failed', err);
    _hideSplash('DuckDB failed to load — running without SQL engine');
  });

  function _hideSplash(errorMsg) {
    clearTimeout(_splashTimeout);
    const splash = document.getElementById('appSplash');
    const appRoot = document.getElementById('appRoot');
    if (splash && !splash.classList.contains('hidden')) {
      if (appRoot) appRoot.style.visibility = 'visible';
      if (errorMsg) {
        // Show error briefly before dismissing
        const msg = document.getElementById('splashMsg');
        if (msg) {
          msg.textContent = errorMsg;
          msg.style.color = '#ef4444';
        }
        setTimeout(() => {
          splash.classList.add('hidden');
          setTimeout(() => splash.remove(), 400);
          Structra.toast(errorMsg);
        }, 2000);
      } else {
        splash.classList.add('hidden');
        setTimeout(() => splash.remove(), 400);
      }
    }
  }

  // Restore session from IndexedDB (non-blocking)
  Structra.persistence.session.load().then(session => {
    if (!session) return;
    Structra.log.info('App', 'Session restored (tabs: ' + (session.tabs ? session.tabs.length : 0) + ')');
    // Session restore logic will be expanded in future phases
  }).catch(err => {
    Structra.log.warn('App', 'Session restore failed', err.message);
  });

  // Open a document shared through the URL hash (#share=...)
  Structra.share.readHash().then((shared) => {
    if (!shared) return;
    Structra.set('jsonData', shared.data);
    Structra.set('fileName', 'Shared JSON');
    Structra.set('fileSize', JSON.stringify(shared.data).length);
    Structra.set('currentPath', '$');
    Structra.share.clearHash();
    Structra.toast('Opened shared JSON');
  }).catch((err) => {
    Structra.log.warn('App', 'Share link could not be read', err.message);
    Structra.toast('This share link could not be read');
  });

  // Persist session on unload
  window.addEventListener('beforeunload', () => {
    const session = {
      tabs: Structra.tabs.list.map(t => ({
        id: t.id, label: t.label, fileName: t.fileName,
        path: t.path, view: t.view,
      })),
      activeId: Structra.tabs.activeId,
      timestamp: Date.now(),
    };
    // Best-effort save (no await in beforeunload)
    Structra.persistence.session.save(session);
  });

  Structra.log.info('App', '=== Bootstrap complete ===');
})();
