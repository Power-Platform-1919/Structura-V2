/* ============================================================
   STRUCTRA V2 — Library Loader
   Structra.libs — load third-party libraries on first use.

   Script libraries (UMD) set a window global. Module libraries
   (ESM) return their namespace. Each library loads once.

   API:
     await Structra.libs.require('jsonrepair')   → window.JSONRepair
     await Structra.libs.require('ajv')          → window.Ajv
     await Structra.libs.require('html2canvas')  → window.html2canvas
     await Structra.libs.require('jsonpath')     → window.JSONPath
     const duckdb = await Structra.libs.require('duckdb')
   ============================================================ */

window.Structra = window.Structra || {};

Structra.libs = (() => {
  const REGISTRY = {
    jsonrepair:  { type: 'script', urls: ['https://cdn.jsdelivr.net/npm/jsonrepair@3.14.0/lib/umd/jsonrepair.min.js'] },
    jsonpath:    { type: 'script', urls: ['https://cdn.jsdelivr.net/npm/jsonpath-plus@10.4.0/dist/index-browser-umd.min.cjs', 'https://unpkg.com/jsonpath-plus@10.4.0/dist/index-browser-umd.cjs'] },
    ajv:         { type: 'script', urls: ['https://cdn.jsdelivr.net/npm/ajv@6.12.6/dist/ajv.min.js'] },
    html2canvas: { type: 'script', urls: ['https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js'] },
    duckdb:      { type: 'module', urls: ['https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.29.0/+esm'] },
  };

  const loaded = new Map();   // name → Promise

  function injectScript(url) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = url;
      s.onload = () => resolve();
      s.onerror = () => { s.remove(); reject(new Error('Failed to load ' + url)); };
      document.head.appendChild(s);
    });
  }

  async function firstThatWorks(name, urls, load) {
    let lastErr;
    for (const url of urls) {
      try {
        return await load(url);
      } catch (err) {
        lastErr = err;
        Structra.log.warn('Libs', `"${name}" failed from ${url}: ${err.message}`);
      }
    }
    throw new Error(`Could not load "${name}": ${lastErr ? lastErr.message : 'no source'}`);
  }

  function require(name) {
    const entry = REGISTRY[name];
    if (!entry) return Promise.reject(new Error('Unknown library: ' + name));
    if (!loaded.has(name)) {
      const load = entry.type === 'module'
        ? (url) => import(/* webpackIgnore: true */ url)
        : injectScript;
      const p = firstThatWorks(name, entry.urls, load);
      // A failed load must be retryable
      p.catch(() => loaded.delete(name));
      loaded.set(name, p);
    }
    return loaded.get(name);
  }

  return { require };
})();
