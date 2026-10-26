/* ============================================================
   STRUCTRA V2 - Library Loader
   Structra.libraryLoader - load third-party libraries on first use.

   Script libraries (UMD) set a window global. Module libraries
   (ESM) return their namespace. Each library loads once.

   API:
     await Structra.libraryLoader.require('jsonrepair')   → window.JSONRepair
     await Structra.libraryLoader.require('ajv')          → window.Ajv
     await Structra.libraryLoader.require('html2canvas')  → window.html2canvas
     await Structra.libraryLoader.require('jsonpath')     → window.JSONPath
     const duckdb = await Structra.libraryLoader.require('duckdb')
   ============================================================ */

window.Structra = window.Structra || {};

Structra.libraryLoader = (() => {
  // Everything is served from this app's own folder: nothing is downloaded from another site
  const REGISTRY = {
    jsonrepair:  { type: 'script', urls: ['src/libs/jsonrepair.min.js'] },
    ajv:         { type: 'script', urls: ['src/libs/ajv.min.js'] },
    html2canvas: { type: 'script', urls: ['src/libs/html2canvas.min.js'] },
    duckdb:      { type: 'module', urls: ['src/libs/duckdb/duckdb-wasm.mjs'] },
    // jsondiffpatch (MIT): what is different between two documents. Plain ES modules, so no build step is needed.
    jsondiffpatch:            { type: 'module', urls: ['src/libs/jsondiffpatch/index.js'] },
    'jsondiffpatch-jsonpatch': { type: 'module', urls: ['src/libs/jsondiffpatch/formatters/jsonpatch.js'] },
    // CodeMirror 6 (MIT) makes every code box: the SQL and JSON editors, coloured code, the Compare panes.
    // It is built by tools/build-editor.mjs (npm run build:editor) and committed, so nothing is built when the app runs.
    // The languages inside are separate files that load when first used.
    codemirror6: { type: 'module', urls: ['src/libs/codemirror6/editor.js'] },
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
