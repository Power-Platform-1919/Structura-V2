/* ============================================================
   STRUCTRA V2 — Global State & Event Bus
   Single namespace: window.Structra
   Console-accessible: Structra.state, Structra.events, Structra.tabs
   ============================================================ */

window.Structra = window.Structra || {};

/* ===== EVENT BUS ===== */
Structra.events = (() => {
  const listeners = {};

  return {
    on(event, fn) {
      (listeners[event] = listeners[event] || []).push(fn);
      Structra.log.debug('EventBus', 'on("' + event + '") — ' + (listeners[event].length) + ' listener(s)');
    },

    off(event, fn) {
      const list = listeners[event];
      if (list) listeners[event] = list.filter(f => f !== fn);
      Structra.log.debug('EventBus', 'off("' + event + '")');
    },

    emit(event, data) {
      const list = listeners[event];
      const count = list ? list.length : 0;
      Structra.log.debug('EventBus', 'emit("' + event + '") → ' + count + ' listener(s)', data);
      if (list) {
        list.forEach(fn => {
          try {
            fn(data);
          } catch (err) {
            Structra.log.error('EventBus', 'Listener threw on "' + event + '":', err);
            throw err;
          }
        });
      }
    },

    once(event, fn) {
      const wrapper = (data) => {
        this.off(event, wrapper);
        fn(data);
      };
      this.on(event, wrapper);
    }
  };
})();

/* ===== APPLICATION STATE ===== */
Structra.state = {
  theme: Structra.settings.get('theme'),
  activeView: 'tree',
  currentPath: '$',
  jsonData: null,
  fileName: null,
  fileSize: 0,
  drawerState: 'collapsed',   // collapsed | medium | expanded
  queryPanelOpen: false,
  contextPanelOpen: false,
  findBarOpen: false,
  duplicateKeys: [],          // [{ key, path, line }] found in the raw text of the open file
};

/* ===== STATE HELPERS ===== */
Structra.set = (key, value) => {
  const old = Structra.state[key];
  if (old === value) return;
  Structra.state[key] = value;
  // Log state change (summarize large objects)
  const display = (key === 'jsonData' && value)
    ? (Array.isArray(value) ? 'Array(' + value.length + ')' : 'Object(' + Object.keys(value).length + ' keys)')
    : value;
  Structra.log.info('State', key + ' = ' + display);
  Structra.events.emit('state:' + key, { key, value, old });
};

Structra.get = (key) => Structra.state[key];

/* ===== THEME ===== */
Structra.applyTheme = () => {
  Structra.settings.set('theme', Structra.state.theme);
  Structra.settings.applyTheme();
  Structra.log.info('State', 'Theme applied: ' + Structra.state.theme);
};

Structra.toggleTheme = () => {
  Structra.set('theme', Structra.state.theme === 'dark' ? 'light' : 'dark');
  Structra.applyTheme();
};

/* ===== TOAST (quick access) ===== */
Structra.toast = (msg) => {
  Structra.log.info('App', 'Toast: ' + msg);
  Structra.events.emit('toast', msg);
};

/* ===== TAB STATE ===== */
Structra.tabs = {
  list: [],       // [{id, label, data, path, view, modified}]
  activeId: null,
  nextId: 1,
};
