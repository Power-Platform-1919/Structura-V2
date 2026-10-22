/**
 * Lazy CDN library loader — loads external scripts/modules on first use.
 * Supports UMD (script tag) and ESM (dynamic import) libraries.
 */
window.App = window.App || {};
window.App.libLoader = (() => {
  const loaded = {};

  /* --- UMD: inject <script> tag, sets window global --- */
  function loadScript(name, url) {
    if (loaded[name]) return loaded[name];
    loaded[name] = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = url;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error(`Failed to load ${name}`));
      document.head.appendChild(s);
    });
    return loaded[name];
  }

  /* --- ESM: dynamic import(), returns module namespace --- */
  function loadModule(name, urls) {
    if (loaded[name]) return loaded[name];
    loaded[name] = (async () => {
      const list = Array.isArray(urls) ? urls : [urls];
      for (const url of list) {
        try {
          return await import(/* webpackIgnore: true */ url);
        } catch (e) {
          if (window.Structra?.log) {
            Structra.log.warn('LibLoader', `ESM import "${name}" from ${url} failed: ${e.message}`);
          }
        }
      }
      throw new Error(`All ESM endpoints failed for "${name}"`);
    })();
    return loaded[name];
  }

  const LIBS = {
    jsonrepair: 'https://cdn.jsdelivr.net/npm/jsonrepair@3.14.0/lib/umd/jsonrepair.min.js',
    jsonpath: 'https://unpkg.com/jsonpath-plus@10.4.0/dist/index-browser-umd.cjs',
    jsyaml: 'https://cdn.jsdelivr.net/npm/js-yaml@4.2.0/dist/js-yaml.min.js',
    jsondiffpatch: 'https://cdn.jsdelivr.net/npm/jsondiffpatch@0.5.0/dist/jsondiffpatch.umd.min.js',
    ajv: 'https://cdn.jsdelivr.net/npm/ajv@6.12.6/dist/ajv.min.js',
    html2canvas: 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js',
    papaparse: 'https://cdn.jsdelivr.net/npm/papaparse@5.5.3/papaparse.min.js',
    duckdb: {
      type: 'esm',
      urls: [
        'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.29.0/+esm',
      ],
    },
  };

  /**
   * Load a library by name. UMD libs return void (global set on window).
   * ESM libs return the module namespace object.
   * @param {string} name
   * @returns {Promise<void|Module>}
   */
  async function require(name) {
    if (!LIBS[name]) throw new Error(`Unknown lib: ${name}`);
    const entry = LIBS[name];
    if (typeof entry === 'object' && entry.type === 'esm') {
      return loadModule(name, entry.urls);
    }
    await loadScript(name, entry);
  }

  return { require, LIBS };
})();
