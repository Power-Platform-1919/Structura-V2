/* ============================================================
   STRUCTRA V2 - App Bootstrap
   Initializes the application after all components are loaded
   ============================================================ */

(function () {
  'use strict';

  if (window.__splashStep) window.__splashStep('Initializing core…');

  Structra.log.info('App', '=== Structra V2 Bootstrap ===');
  Structra.log.info('App', 'Log mode: ' + Structra.log.getMode() + ' (change via Structra.log.setMode("dev"))');

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
    // The engine must point at this tab before any view reacts to the new state below.
    // Views read the active dataset (analysis, columns, SQL table) while they render.
    Structra.engine.setActive(tab.id);
    // Clear active query so stale results don't bleed into new tab
    Structra.engine.clearQuery();
    Structra.set('jsonData', tab.data || null);
    Structra.set('fileName', tab.fileName || '');
    Structra.set('fileSize', tab.fileSize || 0);
    Structra.set('currentPath', tab.path || '$');
    Structra.set('activeView', Structra.constants.VIEWS.includes(tab.view) ? tab.view : 'tree');
    if (!tab.data && tab.hash) openSavedTab(tab);
  });

  // Mirror global state changes back to the active tab object
  Structra.events.on('state:currentPath', (d) => {
    const tab = Structra.tabs.list.find(t => t.id === Structra.tabs.activeId);
    if (tab) tab.path = d.value;
  });
  Structra.events.on('state:activeView', (d) => {
    const tab = Structra.tabs.list.find(t => t.id === Structra.tabs.activeId);
    if (tab) tab.view = d.value;
  });
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
      overview: '<structra-overview></structra-overview>',
    };
    Object.entries(views).forEach(([id, html]) => {
      const panel = viewSwitcher.querySelector(`[data-view="${id}"]`);
      if (panel) panel.innerHTML = html;
    });
  }

  // Drag handles on the side panels (width is remembered)
  Structra.resizer.attach(document.getElementById('queryPanel'),
    { name: 'query', edge: 'right', cssVar: '--query-panel-w', min: 200, max: 560 });
  Structra.resizer.attach(document.getElementById('contextPanel'),
    { name: 'context', edge: 'left', cssVar: '--context-panel-w', min: 220, max: 560 });

  // Panel toggling is handled by the components themselves via state events

  // Edits (Mask, Sort, Editor changes...) live in the open tab only. A reload brings back the file as it was opened,
  // so ask before leaving with changes that would be lost.
  window.addEventListener('beforeunload', (e) => {
    if (Structra.tabs.list.some((t) => t.modified)) { e.preventDefault(); e.returnValue = ''; }
  });

  // Global keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // While typing in a box, keys belong to the box (its own undo, and "?" is a character)
    const t = e.target;
    const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    if (e.key === '?' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      Structra.events.emit('command:run', 'shortcuts');
      return;
    }
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
    if ((action === 'undo' || action === 'redo') && typing) return;

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
      case 'view-overview':  Structra.set('activeView', 'overview'); break;
      case 'view-editor': Structra.set('activeView', 'editor'); break;
      // Tool shortcuts → delegate to command palette exec
      case 'sort':
      case 'export-csv':
      case 'mask':
      case 'undo':
      case 'redo':
      case 'theme':
        Structra.events.emit('command:run', action);
        break;
      case 'compare':
        Structra.events.emit('command:run', 'diff');
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
        const unopenable = Structra.describeUnopenable(data);
        if (unopenable) { Structra.toast(file.name + ' contains only ' + unopenable + ', so there is nothing to explore'); return; }
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

  // Wire tab close to engine (the engine follows tab switches in the handler above)
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

  // Reveal the app now. The SQL engine (DuckDB) is large, so it starts on first use instead of
  // delaying the first paint and competing with file parsing.
  (() => {
    const splash = document.getElementById('appSplash');
    const appRoot = document.getElementById('appRoot');
    if (appRoot) appRoot.style.visibility = 'visible';
    if (splash) {
      splash.classList.add('hidden');
      setTimeout(() => splash.remove(), 400);
    }
  })();

  // Open a document shared through the URL hash (#share=...)
  Structra.share.readHash().then((shared) => {
    if (!shared) return;
    if (Structra.describeUnopenable(shared.data)) { Structra.toast('This share link holds an empty document'); return; }
    Structra.set('jsonData', shared.data);
    Structra.set('fileName', shared.name || 'Shared JSON');
    Structra.set('fileSize', JSON.stringify(shared.data).length);
    Structra.set('currentPath', '$');
    // The link stays in the address bar, so refreshing the page opens the same document again
    Structra.toast('Opened ' + (shared.name || 'shared JSON'));
  }).catch((err) => {
    Structra.log.warn('App', 'Share link could not be read', err.message);
    Structra.toast('This share link could not be read');
  });

  /* --- Session: tabs, their view and path, and the stored original of each document --- */

  let _sessionTimer = null;
  function saveSession() {
    const tabs = Structra.tabs.list.map((t) => {
      const ds = Structra.engine.getDataset(t.id);
      return {
        id: t.id, label: t.label, fileName: t.fileName, fileSize: t.fileSize,
        path: t.path, view: t.view, hash: (ds && ds.meta.hash) || t.hash || null,
      };
    });
    Structra.persistence.session.save({
      tabs, activeId: Structra.tabs.activeId, nextId: Structra.tabs.nextId, timestamp: Date.now(),
    }).catch((err) => Structra.log.warn('App', 'Session save failed', err.message));
  }
  const scheduleSessionSave = () => {
    clearTimeout(_sessionTimer);
    _sessionTimer = setTimeout(saveSession, 1500);
  };
  ['tabs:changed', 'tabs:closed', 'state:currentPath', 'state:activeView', 'engine:persisted']
    .forEach((ev) => Structra.events.on(ev, scheduleSessionSave));
  window.addEventListener('pagehide', saveSession);                 // best effort on the way out

  /** Load the stored original of a restored tab */
  async function openSavedTab(tab) {
    try {
      const text = await Structra.persistence.raw.getText(tab.hash);
      if (!text) throw new Error('the stored copy is missing');
      const panel = document.querySelector('structra-input-panel');
      await panel.loadText(text, tab.fileName || tab.label);
      Structra.set('currentPath', tab.path || '$');
      Structra.set('activeView', tab.view || 'tree');
    } catch (err) {
      Structra.log.warn('App', 'Could not restore ' + tab.label, err.message);
      Structra.toast('Could not restore ' + tab.label);
    }
  }

  async function restoreSession() {
    if (/^#share=/.test(location.hash)) return;                     // an explicit link wins
    const session = await Structra.persistence.session.load();
    if (!session || !Array.isArray(session.tabs) || !session.tabs.some((t) => t.hash)) return;

    Structra.tabs.list.length = 0;
    for (const t of session.tabs) {
      Structra.tabs.list.push({
        id: t.id, label: t.label, data: null, fileName: t.fileName, fileSize: t.fileSize,
        path: t.path || '$', view: t.view || 'tree', modified: false, hash: t.hash,
      });
    }
    Structra.tabs.nextId = session.nextId || Math.max(...session.tabs.map((t) => t.id)) + 1;
    const active = Structra.tabs.list.find((t) => t.id === session.activeId) || Structra.tabs.list[0];
    Structra.tabs.activeId = active.id;
    Structra.events.emit('tabs:changed');
    Structra.events.emit('tabs:switched', active);                  // loads the active tab's document
    Structra.log.info('App', 'Session restored (' + session.tabs.length + ' tab(s))');
  }
  restoreSession().catch((err) => Structra.log.warn('App', 'Session restore failed', err.message));

  Structra.log.info('App', '=== Bootstrap complete ===');
})();
