/* ============================================================
   STRUCTRA V2 - Library Loader
   Structra.libraryLoader - load third-party libraries on first use.

   Script libraries (UMD) set a window global. Module libraries
   (ESM) return their namespace. Each library loads once.

   API:
     await Structra.libraryLoader.loadLibrary('jsonrepair')   → window.JSONRepair
     await Structra.libraryLoader.loadLibrary('ajv')          → window.Ajv
     await Structra.libraryLoader.loadLibrary('modernscreenshot')  → window.modernScreenshot
     await Structra.libraryLoader.loadLibrary('jsonpath')     → window.JSONPath
     const duckdb = await Structra.libraryLoader.loadLibrary('duckdb')
   ============================================================ */

window.Structra = window.Structra || {};

Structra.libraryLoader = (() => {
  // Everything is served from this app's own folder: nothing is downloaded from another site
  const REGISTRY = {
    jsonrepair:  { type: 'script', urls: ['src/libs/jsonrepair.min.js'] },
    // @tanstack/virtual-core (MIT): which rows of a long list are on screen, and how tall the whole list is (tools/build-virtual-core.mjs)
    virtualcore: { type: 'module', urls: ['src/libs/virtual-core/virtual-core.min.js'] },
    // json-p3 (MIT): JSONPath, all 715 tests of the official standard (RFC 9535). One file, no imports. src/core/jsonpath-query.js uses it.
    jsonp3:      { type: 'module', urls: ['src/libs/json-p3/json-p3.min.js'] },
    // jsonc-parser (MIT, Microsoft): where JSON is broken, the same in every browser (tools/build-jsonc-parser.mjs makes the file)
    jsonc:       { type: 'script', urls: ['src/libs/jsonc-parser.min.js'] },
    ajv:         { type: 'script', urls: ['src/libs/ajv.min.js'] },
    // modern-screenshot (MIT): Save as PNG; the browser draws the copy of the view (src/core/share-and-capture.js)
    modernscreenshot: { type: 'script', urls: ['src/libs/modern-screenshot/modern-screenshot.js'] },
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
      const scriptElement = document.createElement('script');
      scriptElement.src = url;
      scriptElement.onload = () => resolve();
      scriptElement.onerror = () => { scriptElement.remove(); reject(new Error('Failed to load ' + url)); };
      document.head.appendChild(scriptElement);
    });
  }

  async function firstThatWorks(name, urls, load) {
    let lastError;
    for (const url of urls) {
      try {
        return await load(url);
      } catch (error) {
        lastError = error;
        Structra.log.warn('Libs', `"${name}" failed from ${url}: ${error.message}`);
      }
    }
    throw new Error(`Could not load "${name}": ${lastError ? lastError.message : 'no source'}`);
  }

  function loadLibrary(name) {
    const entry = REGISTRY[name];
    if (!entry) return Promise.reject(new Error('Unknown library: ' + name));
    if (!loaded.has(name)) {
      const load = entry.type === 'module'
        ? (url) => import(/* webpackIgnore: true */ new URL(url, document.baseURI).href)
        : injectScript;
      const attempt = firstThatWorks(name, entry.urls, load);
      // A failed load must be retryable
      attempt.catch(() => loaded.delete(name));
      loaded.set(name, attempt);
    }
    return loaded.get(name);
  }

  return { loadLibrary };
})();
