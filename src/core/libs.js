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
    // jsondiffpatch (MIT): what is different between two documents. Plain ES modules, so no build step is needed.
    jsondiffpatch:            { type: 'module', urls: ['src/libs/jsondiffpatch/index.js'] },
    'jsondiffpatch-jsonpatch': { type: 'module', urls: ['src/libs/jsondiffpatch/formatters/jsonpatch.js'] },
    // CodeMirror 5 (MIT) is the SQL editor: highlighting, brackets and the SQL suggestions come from it.
    // A bundle loads its files one after another, because the add-ons need the core first.
    codemirror:  { type: 'bundle', global: 'CodeMirror', files: [
      'src/libs/codemirror/codemirror.min.css', 'src/libs/codemirror/show-hint.min.css',
      'src/libs/codemirror/codemirror.min.js', 'src/libs/codemirror/sql.min.js', 'src/libs/codemirror/show-hint.min.js',
      'src/libs/codemirror/sql-hint.min.js', 'src/libs/codemirror/matchbrackets.min.js', 'src/libs/codemirror/closebrackets.min.js',
      'src/libs/codemirror/placeholder.min.js',
    ] },
    // Extra languages and code folding for CodeMirror. Each loads on first use, after the core above.
    'cm-javascript': { type: 'bundle', needs: 'codemirror', global: 'CodeMirror', files: ['src/libs/codemirror/mode-javascript.min.js'] },
    'cm-xml':        { type: 'bundle', needs: 'codemirror', global: 'CodeMirror', files: ['src/libs/codemirror/mode-xml.min.js'] },
    'cm-yaml':       { type: 'bundle', needs: 'codemirror', global: 'CodeMirror', files: ['src/libs/codemirror/mode-yaml.min.js'] },
    'cm-toml':       { type: 'bundle', needs: 'codemirror', global: 'CodeMirror', files: ['src/libs/codemirror/mode-toml.min.js'] },
    'cm-python':     { type: 'bundle', needs: 'codemirror', global: 'CodeMirror', files: ['src/libs/codemirror/mode-python.min.js'] },
    'cm-clike':      { type: 'bundle', needs: 'codemirror', global: 'CodeMirror', files: ['src/libs/codemirror/mode-clike.min.js'] },   // C# and Java
    'cm-go':         { type: 'bundle', needs: 'codemirror', global: 'CodeMirror', files: ['src/libs/codemirror/mode-go.min.js'] },
    'cm-rust':       { type: 'bundle', needs: ['codemirror', 'cm-simple'], global: 'CodeMirror', files: ['src/libs/codemirror/mode-rust.min.js'] },
    'cm-simple':     { type: 'bundle', needs: 'codemirror', global: 'CodeMirror', files: ['src/libs/codemirror/addon-simple.min.js'] },     // for small custom languages
    'cm-runmode':    { type: 'bundle', needs: 'codemirror', global: 'CodeMirror', files: ['src/libs/codemirror/runmode.min.js'] },     // colours a piece of text without making an editor
    'cm-fold':       { type: 'bundle', needs: 'codemirror', global: 'CodeMirror', files: [
      'src/libs/codemirror/foldgutter.min.css', 'src/libs/codemirror/foldcode.min.js', 'src/libs/codemirror/foldgutter.min.js',
      'src/libs/codemirror/brace-fold.min.js', 'src/libs/codemirror/indent-fold.min.js', 'src/libs/codemirror/xml-fold.min.js',
    ] },
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

  function injectStyle(url) {
    return new Promise((resolve, reject) => {
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = url;
      l.onload = () => resolve();
      l.onerror = () => { l.remove(); reject(new Error('Failed to load ' + url)); };
      document.head.appendChild(l);
    });
  }

  /** Load the files of a bundle in order (styles and scripts), then hand back its global */
  async function loadBundle(entry) {
    for (const need of [].concat(entry.needs || [])) await require(need);          // add-ons and languages need the core (and sometimes another add-on) first
    for (const file of entry.files) await (file.endsWith('.css') ? injectStyle(file) : injectScript(file));
    return window[entry.global];
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
      if (entry.type === 'bundle') {
        const p = loadBundle(entry);
        p.catch(() => loaded.delete(name));
        loaded.set(name, p);
        return p;
      }
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
