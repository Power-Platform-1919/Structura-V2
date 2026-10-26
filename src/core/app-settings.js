/* ============================================================
   STRUCTRA V2 - Settings Manager
   Persistent user preferences via localStorage.

   Loads SYNCHRONOUSLY before first paint.
   All keys prefixed with 'structra.' in localStorage.

   API:
     Structra.appSettings.get('pageSize')       → 50
     Structra.appSettings.set('pageSize', 100)  → persists + emits event
     Structra.appSettings.getAll()              → {logMode:'normal', pageSize:50, ...}
     Structra.appSettings.reset()               → restore all defaults
     Structra.appSettings.export()              → JSON string
     Structra.appSettings.import(json)          → bulk restore

   Events (via Structra.events if available):
     'settings:changed' → {key, value, old}

   Console:
     Structra.appSettings.getAll()
     Structra.appSettings.set('pageSize', 100)
     Structra.appSettings.reset()

   Wiring (generated from the code below; update it when you add or remove an event):
     Emits: settings:changed, settings:reset
   ============================================================ */

window.Structra = window.Structra || {};

Structra.appSettings = (() => {
  const PREFIX = 'structra.';

  /* --- Defaults --- */
  const DEFAULTS = {
    logMode:      'normal',      // 'dev' | 'normal' | 'off'
    fontSize:     14,            // px
    pageSize:     50,            // table rows per page
    sidebarW:     320,           // sidebar width px
    defaultFmt:   'auto',        // file format: 'auto' | 'json' | 'csv' | 'xml' | 'yaml' | 'toml'
    autoDetect:   true,          // auto-detect format on paste/upload
    animations:   true,          // enable UI animations
    confirmClose: true,          // confirm before closing modified tab
    sqlHistory:   true,          // persist SQL query history
    treeChunk:    100,           // tree view chunk size
    maxDepth:     20,            // max traversal depth
    keepRecentContent: true,     // Recent keeps the content of files so they can be reopened
  };

  /* --- Read --- */
  function get(key) {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw === null) return DEFAULTS[key];
    // Parse typed values
    const definition = DEFAULTS[key];
    if (typeof definition === 'number') return Number(raw) || definition;
    if (typeof definition === 'boolean') return raw === 'true';
    return raw;
  }

  /* --- Write --- */
  function set(key, value) {
    if (!(key in DEFAULTS)) {
      console.warn('[Settings] Unknown key: ' + key);
      return;
    }
    const old = get(key);
    if (old === value) return;
    localStorage.setItem(PREFIX + key, String(value));
    // Emit change event if event bus exists (may not during early boot)
    if (Structra.events) {
      Structra.events.emit('settings:changed', { key, value, old });
    }
  }

  /* --- Bulk --- */
  function getAll() {
    const result = {};
    for (const key of Object.keys(DEFAULTS)) {
      result[key] = get(key);
    }
    return result;
  }

  function reset() {
    for (const key of Object.keys(DEFAULTS)) {
      localStorage.removeItem(PREFIX + key);
    }
    if (Structra.events) {
      Structra.events.emit('settings:reset');
    }
  }

  /* --- Import/Export --- */
  function exportSettings() {
    return JSON.stringify(getAll(), null, 2);
  }

  function importSettings(json) {
    let object;
    try { object = JSON.parse(json); }
    catch { console.error('[Settings] Invalid JSON'); return false; }
    for (const [key, value] of Object.entries(object)) {
      if (key in DEFAULTS) set(key, value);
    }
    return true;
  }


  /* --- Public API --- */
  return {
    get,
    set,
    getAll,
    reset,
    export: exportSettings,
    import: importSettings,
    DEFAULTS,
  };
})();
