/* ============================================================
   STRUCTRA V2 - Persistence Manager
   IndexedDB multi-store for large data, recents, session state.

   Stores:
     'recents'     - file history with metadata (name, format, size, timestamp, hash)
     'raw_files'   - original source text as Blob (keyed by content hash)
     'session'     - tab/view/filter state (single key: "state")
     'api_history' - URL load history

   API:
     Structra.browserDatabase.ready        → Promise (resolves when DB open)
     Structra.browserDatabase.recents.*    → add, getAll, clear
     Structra.browserDatabase.raw.*        → put, get, delete
     Structra.browserDatabase.session.*    → save, load
     Structra.browserDatabase.api.*        → add, getAll, clear
     Structra.browserDatabase.clearAll()   → wipe everything

   Console:
     Structra.browserDatabase.recents.getAll().then(console.log)
     Structra.browserDatabase.session.load().then(console.log)
   ============================================================ */

window.Structra = window.Structra || {};

Structra.browserDatabase = (() => {
  const DB_NAME = 'structra-store';
  const DB_VERSION = 1;
  let _db = null;
  let _readyPromise = null;

  /* --- Database Init --- */
  function open() {
    if (_readyPromise) return _readyPromise;
    _readyPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        // Recents store - auto-increment, indexed by timestamp
        if (!db.objectStoreNames.contains('recents')) {
          const store = db.createObjectStore('recents', { keyPath: 'id', autoIncrement: true });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('hash', 'hash', { unique: false });
        }
        // Raw files - keyed by content hash
        if (!db.objectStoreNames.contains('raw_files')) {
          db.createObjectStore('raw_files');
        }
        // Session - single-key store
        if (!db.objectStoreNames.contains('session')) {
          db.createObjectStore('session');
        }
        // API history - auto-increment, indexed by timestamp
        if (!db.objectStoreNames.contains('api_history')) {
          const store = db.createObjectStore('api_history', { keyPath: 'id', autoIncrement: true });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
      request.onsuccess = () => {
        _db = request.result;
        Structra.log.info('Persistence', 'IndexedDB opened: ' + DB_NAME);
        resolve(_db);
      };
      request.onerror = () => {
        Structra.log.error('Persistence', 'IndexedDB open failed', request.error);
        reject(request.error);
      };
    });
    return _readyPromise;
  }

  /* --- Generic Helpers --- */
  function openTransaction(storeName, mode) {
    return _db.transaction(storeName, mode).objectStore(storeName);
  }

  function promisify(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /* --- Content Hash (SHA-256) --- */
  async function hashText(text) {
    const data = new TextEncoder().encode(text);
    const buffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buffer)).map(byte => byte.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Fingerprint of a Blob. Small ones are hashed whole; for big files the size plus the first
   * and last 256 KB are hashed, which avoids reading tens of MB just to make a key.
   */
  async function hashBlob(blob) {
    const EDGE = 262144;
    const parts = [new TextEncoder().encode(String(blob.size) + ':')];
    if (blob.size <= EDGE * 4) {
      parts.push(new Uint8Array(await blob.arrayBuffer()));
    } else {
      parts.push(new Uint8Array(await blob.slice(0, EDGE).arrayBuffer()));
      parts.push(new Uint8Array(await blob.slice(blob.size - EDGE).arrayBuffer()));
    }
    const all = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
    let at = 0;
    for (const part of parts) { all.set(part, at); at += part.length; }
    const buffer = await crypto.subtle.digest('SHA-256', all);
    return Array.from(new Uint8Array(buffer)).map(byte => byte.toString(16).padStart(2, '0')).join('');
  }

  /* --- Recents --- */
  const recents = {
    async add(entry) {
      await open();
      // entry: {name, format, size, timestamp, hash, tabId}
      const record = {
        name: entry.name || 'Untitled',
        format: entry.format || 'json',
        size: entry.size || 0,
        timestamp: entry.timestamp || Date.now(),
        hash: entry.hash || '',
        tabId: entry.tabId || null,
      };
      return promisify(openTransaction('recents', 'readwrite').add(record));
    },

    async getAll(limit = 50) {
      await open();
      return new Promise((resolve, reject) => {
        const results = [];
        const store = openTransaction('recents', 'readonly');
        const index = store.index('timestamp');
        const cursor = index.openCursor(null, 'prev'); // newest first
        cursor.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor && results.length < limit) {
            results.push(cursor.value);
            cursor.continue();
          } else {
            resolve(results);
          }
        };
        cursor.onerror = () => reject(cursor.error);
      });
    },

    async clear() {
      await open();
      return promisify(openTransaction('recents', 'readwrite').clear());
    },
  };

  /* --- Raw Files --- */
  const raw = {
    /** @param {string|Blob} source - the text, or the File it came from (stored as is, no copy) */
    async put(source, meta) {
      await open();
      const isBlob = typeof source !== 'string';
      const blob = isBlob ? source : new Blob([source], { type: 'text/plain' });
      const hash = isBlob || source.length > 1048576 ? await hashBlob(blob) : await hashText(source);
      const record = { blob, format: meta.format, originalName: meta.name, timestamp: Date.now() };
      openTransaction('raw_files', 'readwrite').put(record, hash);
      return hash;
    },

    async get(hash) {
      await open();
      return promisify(openTransaction('raw_files', 'readonly').get(hash));
    },

    async getText(hash) {
      const record = await this.get(hash);
      if (!record || !record.blob) return null;
      return record.blob.text();
    },

    async delete(hash) {
      await open();
      return promisify(openTransaction('raw_files', 'readwrite').delete(hash));
    },
  };

  /* --- Session State --- */
  const session = {
    async save(state) {
      await open();
      // state: {tabs, activeTab, views, filters, scrollPositions}
      openTransaction('session', 'readwrite').put(state, 'state');
      Structra.log.debug('Persistence', 'Session saved');
    },

    async load() {
      await open();
      return promisify(openTransaction('session', 'readonly').get('state'));
    },

    async clear() {
      await open();
      return promisify(openTransaction('session', 'readwrite').delete('state'));
    },
  };

  /* --- API History --- */
  const api = {
    async add(entry) {
      await open();
      // entry: {url, method, headers, timestamp, responseHash, status}
      const record = {
        url: entry.url,
        method: entry.method || 'GET',
        headers: entry.headers || null,
        timestamp: entry.timestamp || Date.now(),
        responseHash: entry.responseHash || null,
        status: entry.status || null,
      };
      return promisify(openTransaction('api_history', 'readwrite').add(record));
    },

    async getAll(limit = 30) {
      await open();
      return new Promise((resolve, reject) => {
        const results = [];
        const store = openTransaction('api_history', 'readonly');
        const index = store.index('timestamp');
        const cursor = index.openCursor(null, 'prev');
        cursor.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor && results.length < limit) {
            results.push(cursor.value);
            cursor.continue();
          } else {
            resolve(results);
          }
        };
        cursor.onerror = () => reject(cursor.error);
      });
    },

    async clear() {
      await open();
      return promisify(openTransaction('api_history', 'readwrite').clear());
    },
  };

  /* --- Clear Everything --- */
  async function clearAll() {
    await open();
    await Promise.all([
      recents.clear(),
      promisify(openTransaction('raw_files', 'readwrite').clear()),
      session.clear(),
      api.clear(),
    ]);
    Structra.log.info('Persistence', 'All stores cleared');
  }

  /* --- Public API --- */
  return {
    ready: open(),
    recents,
    raw,
    session,
    api,
    clearAll,
    hashText,
  };
})();
