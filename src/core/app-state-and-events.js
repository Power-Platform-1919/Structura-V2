/* ============================================================
   STRUCTRA V2 - Global State & Event Bus
   Single namespace: window.Structra
   Console-accessible: Structra.state, Structra.events, Structra.tabs

   Wiring (generated from the code below; update it when you add or remove an event):
     Listens to: theme:toggle
     Emits: state:, toast
   ============================================================ */

window.Structra = window.Structra || {};

/* ===== EVENT BUS ===== */
Structra.events = (() => {
  const listeners = {};

  return {
    on(event, callback) {
      (listeners[event] = listeners[event] || []).push(callback);
      Structra.log.debug('EventBus', 'on("' + event + '") - ' + (listeners[event].length) + ' listener(s)');
    },

    off(event, callback) {
      const list = listeners[event];
      if (list) listeners[event] = list.filter(listener => listener !== callback);
      Structra.log.debug('EventBus', 'off("' + event + '")');
    },

    emit(event, data) {
      const list = listeners[event];
      const count = list ? list.length : 0;
      Structra.log.debug('EventBus', 'emit("' + event + '") → ' + count + ' listener(s)', data);
      if (list) {
        list.forEach(callback => {
          try {
            callback(data);
          } catch (error) {
            Structra.log.error('EventBus', 'Listener threw on "' + event + '":', error);
            throw error;
          }
        });
      }
    },

    once(event, callback) {
      const wrapper = (data) => {
        this.off(event, wrapper);
        callback(data);
      };
      this.on(event, wrapper);
    }
  };
})();

/* ===== APPLICATION STATE ===== */
Structra.state = {
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

/**
 * "No document" is represented by a falsy jsonData, so a file whose whole content is
 * null, false, 0 or "" cannot be opened. Callers use this to say so instead of showing nothing.
 */
Structra.describeUnopenable = (data) => {
  if (data === null) return 'null';
  if (data === false) return 'false';
  if (data === 0) return '0';
  if (data === '') return 'an empty string';
  return null;
};

Structra.setState = (key, value) => {
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

Structra.getState = (key) => Structra.state[key];

/* ===== THEME ===== */
Structra.events.on('theme:toggle', () => Structra.themeEngine.toggle());

/* ===== TOAST (quick access) ===== */
/**
 * Structra.toast('Saved')                                       a short message
 * Structra.toast('Closed x', { action: { label: 'Reopen', run } })   with a button
 * (A second argument that is a text or a number, from older calls, is ignored.)
 */
Structra.toast = (message, options) => {
  Structra.log.info('App', 'Toast: ' + message);
  Structra.events.emit('toast', { msg: message, ...(options && typeof options === 'object' ? options : {}) });
};

/* ===== TAB STATE ===== */
Structra.tabs = {
  list: [],       // [{id, label, data, path, view, modified}]
  activeId: null,
  nextId: 1,
};
