/* ============================================================
   STRUCTRA V2 - Persistence Manager
   IndexedDB multi-store for large data, recents, session state.

   Stores:
     'recents'     - file history with metadata (name, format, size, timestamp, hash)
     'raw_files'   - original source text as Blob (keyed by content hash)
     'session'     - tab/view/filter state (single key: "state")
     'api_history' - URL load history

   API:
     Structra.persistence.ready        → Promise (resolves when DB open)
     Structra.persistence.recents.*    → add, getAll, clear
     Structra.persistence.raw.*        → put, get, delete
     Structra.persistence.session.*    → save, load
     Structra.persistence.api.*        → add, getAll, clear
     Structra.persistence.clearAll()   → wipe everything

   Console:
     Structra.persistence.recents.getAll().then(console.log)
     Structra.persistence.session.load().then(console.log)
   ============================================================ */

window.Structra = window.Structra || {};

Structra.persistence = (() => {
  const DB_NAME = 'structra-store';
  const DB_VERSION = 1;
  let _db = null;
  let _readyPromise = null;

  /* --- Database Init --- */
  function open() {
    if (_readyPromise) return _readyPromise;
    _readyPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
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
      req.onsuccess = () => {
        _db = req.result;
        Structra.log.info('Persistence', 'IndexedDB opened: ' + DB_NAME);
        resolve(_db);
      };
      req.onerror = () => {
        Structra.log.error('Persistence', 'IndexedDB open failed', req.error);
        reject(req.error);
      };
    });
    return _readyPromise;
  }

  /* --- Generic Helpers --- */
  function tx(storeName, mode) {
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
    return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
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
    const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of parts) { all.set(p, at); at += p.length; }
    const buffer = await crypto.subtle.digest('SHA-256', all);
    return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
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
      return promisify(tx('recents', 'readwrite').add(record));
    },

    async getAll(limit = 50) {
      await open();
      return new Promise((resolve, reject) => {
        const results = [];
        const store = tx('recents', 'readonly');
        const idx = store.index('timestamp');
        const cursor = idx.openCursor(null, 'prev'); // newest first
        cursor.onsuccess = (e) => {
          const c = e.target.result;
          if (c && results.length < limit) {
            results.push(c.value);
            c.continue();
          } else {
            resolve(results);
          }
        };
        cursor.onerror = () => reject(cursor.error);
      });
    },

    async clear() {
      await open();
      return promisify(tx('recents', 'readwrite').clear());
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
      tx('raw_files', 'readwrite').put(record, hash);
      return hash;
    },

    async get(hash) {
      await open();
      return promisify(tx('raw_files', 'readonly').get(hash));
    },

    async getText(hash) {
      const record = await this.get(hash);
      if (!record || !record.blob) return null;
      return record.blob.text();
    },

    async delete(hash) {
      await open();
      return promisify(tx('raw_files', 'readwrite').delete(hash));
    },
  };

  /* --- Session State --- */
  const session = {
    async save(state) {
      await open();
      // state: {tabs, activeTab, views, filters, scrollPositions}
      tx('session', 'readwrite').put(state, 'state');
      Structra.log.debug('Persistence', 'Session saved');
    },

    async load() {
      await open();
      return promisify(tx('session', 'readonly').get('state'));
    },

    async clear() {
      await open();
      return promisify(tx('session', 'readwrite').delete('state'));
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
      return promisify(tx('api_history', 'readwrite').add(record));
    },

    async getAll(limit = 30) {
      await open();
      return new Promise((resolve, reject) => {
        const results = [];
        const store = tx('api_history', 'readonly');
        const idx = store.index('timestamp');
        const cursor = idx.openCursor(null, 'prev');
        cursor.onsuccess = (e) => {
          const c = e.target.result;
          if (c && results.length < limit) {
            results.push(c.value);
            c.continue();
          } else {
            resolve(results);
          }
        };
        cursor.onerror = () => reject(cursor.error);
      });
    },

    async clear() {
      await open();
      return promisify(tx('api_history', 'readwrite').clear());
    },
  };

  /* --- Clear Everything --- */
  async function clearAll() {
    await open();
    await Promise.all([
      recents.clear(),
      promisify(tx('raw_files', 'readwrite').clear()),
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
