/* ============================================================
   STRUCTRA V2 - Library Loader
   Structra.libs - load third-party libraries on first use.

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
  // Everything is served from this app's own folder: nothing is downloaded from another site
  const REGISTRY = {
    jsonrepair:  { type: 'script', urls: ['src/libs/jsonrepair.min.js'] },
    ajv:         { type: 'script', urls: ['src/libs/ajv.min.js'] },
    html2canvas: { type: 'script', urls: ['src/libs/html2canvas.min.js'] },
    duckdb:      { type: 'module', urls: ['src/libs/duckdb/duckdb-wasm.mjs'] },
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
        ? (url) => import(/* webpackIgnore: true */ new URL(url, document.baseURI).href)
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
