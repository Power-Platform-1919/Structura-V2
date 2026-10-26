/* ============================================================
   STRUCTRA V2 - App Bootstrap
   Initializes the application after all components are loaded

   Wiring (generated from the code below; update it when you add or remove an event):
     Listens to: tabs:switched, state:currentPath, state:activeView, state:jsonData,
          state:fileName, state:fileSize, tabs:closed
     Emits: tabs:changed, command:run, shortcut, command-palette:toggle, find:toggle-replace,
          tabs:add, tabs:close-active, tabs:switched
     Sets state: jsonData, fileName, fileSize, currentPath, activeView, findBarOpen,
          filterBarOpen
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
    Structra.dataEngine.setActive(tab.id);
    // Clear active query so stale results don't bleed into new tab
    Structra.dataEngine.clearQuery();
    Structra.setState('jsonData', tab.data || null);
    Structra.setState('fileName', tab.fileName || '');
    Structra.setState('fileSize', tab.fileSize || 0);
    Structra.setState('currentPath', tab.path || '$');
    Structra.setState('activeView', Structra.constants.VIEWS.includes(tab.view) ? tab.view : 'tree');
    if (!tab.data && tab.hash) openSavedTab(tab);
  });

  // Mirror global state changes back to the active tab object
  Structra.events.on('state:currentPath', (change) => {
    const tab = Structra.tabs.list.find(candidate => candidate.id === Structra.tabs.activeId);
    if (tab) tab.path = change.value;
  });
  Structra.events.on('state:activeView', (change) => {
    const tab = Structra.tabs.list.find(candidate => candidate.id === Structra.tabs.activeId);
    if (tab) tab.view = change.value;
  });
  Structra.events.on('state:jsonData', (change) => {
    const tab = Structra.tabs.list.find(candidate => candidate.id === Structra.tabs.activeId);
    if (tab) tab.data = change.value;
  });
  Structra.events.on('state:fileName', (change) => {
    const tab = Structra.tabs.list.find(candidate => candidate.id === Structra.tabs.activeId);
    if (tab) {
      tab.fileName = change.value;
      if (change.value && !tab.customLabel) tab.label = change.value;       // a name the user typed is kept
      Structra.events.emit('tabs:changed');
    }
  });
  Structra.events.on('state:fileSize', (change) => {
    const tab = Structra.tabs.list.find(candidate => candidate.id === Structra.tabs.activeId);
    if (tab) tab.fileSize = change.value;
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

  Structra.events.on('state:jsonData', (change) => {
    _updateCanvasVisibility(!!change.value);
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
  Structra.panelResizer.attach(document.getElementById('queryPanel'),
    { name: 'query', edge: 'right', cssVar: '--query-panel-w', min: 200, max: 560 });
  Structra.panelResizer.attach(document.getElementById('contextPanel'),
    { name: 'context', edge: 'left', cssVar: '--context-panel-w', min: 220, max: 560 });

  // Panel toggling is handled by the components themselves via state events

  // Edits (Mask, Sort, Editor changes...) live in the open tab only. A reload brings back the file as it was opened,
  // so ask before leaving with changes that would be lost.
  window.addEventListener('beforeunload', (event) => {
    if (Structra.tabs.list.some((tab) => tab.modified)) { event.preventDefault(); event.returnValue = ''; }
  });

  // Saving is blocked in this browser: say so once, because nothing will be remembered next time
  if (window.__storageBlocked) setTimeout(() => Structra.toast('This browser is not allowing the page to save anything, so your settings, recent files and bookmarks will be gone when you close it.', { duration: 9000 }), 1500);

  // Global keyboard shortcuts
  document.addEventListener('keydown', (event) => {
    // While typing in a box, keys belong to the box (its own undo, and "?" is a character)
    const target = event.target;
    const typing = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
    if (event.key === '?' && !typing && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      Structra.events.emit('command:run', 'shortcuts');
      return;
    }
    const key = [];
    if (event.ctrlKey || event.metaKey) key.push('ctrl');
    if (event.shiftKey) key.push('shift');
    if (event.altKey) key.push('alt');

    const pressedKey = event.key.toLowerCase();
    if (pressedKey !== 'control' && pressedKey !== 'shift' && pressedKey !== 'alt' && pressedKey !== 'meta') {
      key.push(pressedKey);
    }
    const combo = key.join('+');
    const action = Structra.constants.SHORTCUTS[combo];
    if (!action) return;
    if ((action === 'undo' || action === 'redo') && typing) return;

    event.preventDefault();
    Structra.events.emit('shortcut', action);

    switch (action) {
      case 'command-palette':
        Structra.events.emit('command-palette:toggle');
        break;
      case 'find':
        Structra.setState('findBarOpen', true);
        break;
      case 'find-replace':
        Structra.setState('findBarOpen', true);
        // Toggle replace row open
        setTimeout(() => Structra.events.emit('find:toggle-replace'), 50);
        break;
      case 'filter':
        Structra.setState('filterBarOpen', !Structra.state.filterBarOpen);
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
        Structra.closeTop();
        break;
      case 'bookmark': {
        const path = Structra.state.currentPath;
        if (!path || path === '$') { Structra.toast('Select a path to bookmark'); break; }
        Structra.toast(Structra.bookmarks.toggle(path) ? 'Bookmarked ' + path : 'Bookmark removed');
        break;
      }
      case 'nav-back':    Structra.pathHistory.back(); break;
      case 'nav-forward': Structra.pathHistory.forward(); break;
      // View shortcuts
      case 'view-tree':   Structra.setState('activeView', 'tree'); break;
      case 'view-table':  Structra.setState('activeView', 'table'); break;
      case 'view-graph':  Structra.setState('activeView', 'graph'); break;
      case 'view-schema': Structra.setState('activeView', 'schema'); break;
      case 'view-overview':  Structra.setState('activeView', 'overview'); break;
      case 'view-editor': Structra.setState('activeView', 'editor'); break;
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
  document.addEventListener('dragover', (event) => event.preventDefault());
  document.addEventListener('drop', (event) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (!file) return;

    const extension = file.name.split('.').pop().toLowerCase();
    if (!['json', 'txt', 'csv', 'tsv'].includes(extension)) {
      Structra.log.warn('App', 'Dropped file ignored (unsupported extension): ' + extension);
      return;
    }

    Structra.log.info('App', 'File dropped: ' + file.name + ' (' + (file.size / 1048576).toFixed(2) + ' MB, ext=' + extension + ')');

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        let data;
        if (extension === 'csv' || extension === 'tsv') {
          Structra.log.info('App', 'Parsing dropped CSV/TSV...');
          const result = await Structra.parseCsvAsync(reader.result);
          if (result.data.length === 0) { Structra.toast('The CSV has no rows of data'); return; }
          if (result.errors.length > 0) {
            Structra.log.warn('App', 'CSV parse warnings: ' + result.errors.length);
            Structra.toast('The CSV opened with ' + result.errors.length + ' warning' + (result.errors.length === 1 ? '' : 's'));
          }
          data = result.data;
        } else {
          Structra.log.info('App', 'Parsing dropped JSON (' + (reader.result.length / 1024).toFixed(1) + ' KB)...');
          data = await Structra.parseJsonAsync(reader.result);
        }
        const unopenable = Structra.describeUnopenable(data);
        if (unopenable) { Structra.toast(file.name + ' contains only ' + unopenable + ', so there is nothing to explore'); return; }
        Structra.log.info('App', 'Drop parse success - setting state');
        Structra.setState('jsonData', data);
        Structra.setState('fileName', file.name);
        Structra.setState('fileSize', file.size);
        Structra.setState('currentPath', '$');
        Structra.toast('Loaded ' + file.name);
      } catch (error) {
        Structra.log.error('App', 'Drop parse failed: ' + error.message, error);
        Structra.toast(extension === 'csv' || extension === 'tsv' ? 'Could not read the CSV: ' + error.message : 'This file is not valid JSON');
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
    Structra.dataEngine.remove(tabId);
  });

  // When jsonData is set from sources other than input panel (e.g., file drop),
  // ingest into engine if not already ingested
  Structra.events.on('state:jsonData', async (change) => {
    if (!change.value) return;
    const activeTab = Structra.tabs.list.find(candidate => candidate.id === Structra.tabs.activeId);
    if (!activeTab) return;
    // Skip if engine already has this dataset (input-panel already ingested)
    const existing = Structra.dataEngine.getActive();
    if (existing && existing.id === activeTab.id && existing.raw === change.value) return;
    await Structra.dataEngine.ingest(activeTab.id, change.value, {
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
  Structra.shareLink.readHash().then((shared) => {
    if (!shared) return;
    if (Structra.describeUnopenable(shared.data)) { Structra.toast('This share link holds an empty document'); return; }
    // Through the same door as any file, so every view and tool works on it
    const name = String(shared.name || 'Shared JSON').slice(0, 80);
    return document.querySelector('structra-input-panel')._loadSuccess(shared.data, JSON.stringify(shared.data), name);
    // The link stays in the address bar, so refreshing the page opens the same document again
  }).catch((error) => {
    Structra.log.warn('App', 'Share link could not be read', error.message);
    Structra.toast(/^This share link/.test(error.message) ? error.message : 'This share link could not be read');
  });

  /* --- Session: tabs, their view and path, and the stored original of each document --- */

  let _sessionTimer = null;
  function saveSession() {
    const tabs = Structra.tabs.list.map((tab) => {
      const dataset = Structra.dataEngine.getDataset(tab.id);
      return {
        id: tab.id, label: tab.label, fileName: tab.fileName, fileSize: tab.fileSize,
        path: tab.path, view: tab.view, hash: (dataset && dataset.meta.hash) || tab.hash || null,
      };
    });
    Structra.browserDatabase.session.save({
      tabs, activeId: Structra.tabs.activeId, nextId: Structra.tabs.nextId, timestamp: Date.now(),
    }).catch((error) => Structra.log.warn('App', 'Session save failed', error.message));
  }
  const scheduleSessionSave = () => {
    clearTimeout(_sessionTimer);
    _sessionTimer = setTimeout(saveSession, 1500);
  };
  ['tabs:changed', 'tabs:closed', 'state:currentPath', 'state:activeView', 'engine:persisted']
    .forEach((event) => Structra.events.on(event, scheduleSessionSave));
  window.addEventListener('pagehide', saveSession);                 // best effort on the way out

  /** Load the stored original of a restored tab */
  async function openSavedTab(tab) {
    try {
      const text = await Structra.browserDatabase.raw.getText(tab.hash);
      if (!text) throw new Error('the stored copy is missing');
      const panel = document.querySelector('structra-input-panel');
      await panel.loadText(text, tab.fileName || tab.label);
      Structra.setState('currentPath', tab.path || '$');
      Structra.setState('activeView', tab.view || 'tree');
    } catch (error) {
      Structra.log.warn('App', 'Could not restore ' + tab.label, error.message);
      Structra.toast('Could not restore ' + tab.label);
    }
  }

  async function restoreSession() {
    if (/^#share=/.test(location.hash)) return;                     // an explicit link wins
    const session = await Structra.browserDatabase.session.load();
    if (!session || !Array.isArray(session.tabs) || !session.tabs.some((tab) => tab.hash)) return;

    Structra.tabs.list.length = 0;
    for (const savedTab of session.tabs) {
      Structra.tabs.list.push({
        id: savedTab.id, label: savedTab.label, data: null, fileName: savedTab.fileName, fileSize: savedTab.fileSize,
        path: savedTab.path || '$', view: savedTab.view || 'tree', modified: false, hash: savedTab.hash,
      });
    }
    Structra.tabs.nextId = session.nextId || Math.max(...session.tabs.map((savedTab) => savedTab.id)) + 1;
    const active = Structra.tabs.list.find((tab) => tab.id === session.activeId) || Structra.tabs.list[0];
    Structra.tabs.activeId = active.id;
    Structra.events.emit('tabs:changed');
    Structra.events.emit('tabs:switched', active);                  // loads the active tab's document
    Structra.log.info('App', 'Session restored (' + session.tabs.length + ' tab(s))');
  }
  restoreSession().catch((error) => Structra.log.warn('App', 'Session restore failed', error.message));

  Structra.log.info('App', '=== Bootstrap complete ===');
})();
