/* ============================================================
   STRUCTRA V2 - Shared Utilities
   Structra.util - small helpers that used to be copied into many files.
   Anything two components would otherwise each write for themselves lives here.

   API:
     esc(value)                  → HTML-safe text (null becomes ''), safe for text and attribute values
     typeOf(value)               → 'null' | 'array' | 'object' | 'string' | 'number' | 'boolean' | 'undefined'
     formatBytes(n)              → '1.4 MB'
     timeAgo(timestamp)          → 'just now', '5m ago', '3h ago', or a date
     clamp(n, min, max)
     debounce(fn, ms)            → function with .cancel()
     nextTick()                  → Promise that resolves on the next turn of the event loop
     yieldToBrowser()            → Promise; lets the page paint and handle input (use inside long loops)
     whenIdle(fn, timeout)       → run fn when the browser is idle
     copy(text, message)         → Promise<boolean>; copies and shows a toast
     download(content, name, mime) → save text or a Blob as a file
     uid(prefix)                 → unique id string
   ============================================================ */

window.Structra = window.Structra || {};

Structra.util = (() => {
  const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const ESC_RE = /[&<>"']/g;

  function esc(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(ESC_RE, (c) => ESC_MAP[c]);
  }

  function typeOf(v) {
    if (v === null) return 'null';
    if (Array.isArray(v)) return 'array';
    return typeof v;
  }

  // Naming styles used when generating code
  const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const camelCase = (s) => s.replace(/[-_](\w)/g, (_, c) => c.toUpperCase());
  const pascalCase = (s) => capitalize(camelCase(s));
  const snakeCase = (s) => s.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '').replace(/[-\s]+/g, '_');

  function formatBytes(n) {
    if (n === null || n === undefined || n === '' || Number.isNaN(Number(n))) return '-';
    n = Number(n);
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MB';
    return (n / 1073741824).toFixed(2) + ' GB';
  }

  function timeAgo(ts) {
    if (!ts) return '';
    const diff = Date.now() - ts;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
    return new Date(ts).toLocaleDateString();
  }

  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

  function debounce(fn, ms) {
    let timer = null;
    const wrapped = (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => { timer = null; fn(...args); }, ms);
    };
    wrapped.cancel = () => { clearTimeout(timer); timer = null; };
    return wrapped;
  }

  const nextTick = () => new Promise((resolve) => setTimeout(resolve, 0));

  function yieldToBrowser() {
    if (globalThis.scheduler && typeof globalThis.scheduler.yield === 'function') return globalThis.scheduler.yield();
    return nextTick();
  }

  function whenIdle(fn, timeout = 2000) {
    if (typeof requestIdleCallback === 'function') return requestIdleCallback(fn, { timeout });
    return setTimeout(fn, 50);
  }

  async function copy(text, message = 'Copied') {
    const str = String(text);
    try {
      await navigator.clipboard.writeText(str);
    } catch {
      // Clipboard API refused (insecure origin, no focus): fall back to a hidden textarea
      const ta = document.createElement('textarea');
      ta.value = str;
      ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch { /* ignore */ }
      ta.remove();
      if (!ok) { Structra.toast('Copy failed'); return false; }
    }
    if (message) Structra.toast(message);
    return true;
  }

  function download(content, name, mime = 'text/plain') {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  /**
   * One order for values of any kind, the way a spreadsheet sorts: numbers, then text (capital letters make no
   * difference and numbers inside text sort naturally: item 2 before item 10), then true/false, then lists and
   * records. Empty values are for the caller to put last.
   */
  const _rank = (v) => (typeof v === 'number' ? 0 : typeof v === 'string' ? 1 : typeof v === 'boolean' ? 2 : 3);
  function compareValues(a, b) {
    const ra = _rank(a), rb = _rank(b);
    if (ra !== rb) return ra - rb;
    if (ra === 0) return a - b;
    if (ra === 1) return a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }) || (a < b ? -1 : a > b ? 1 : 0);
    if (ra === 2) return (a ? 1 : 0) - (b ? 1 : 0);
    const sa = JSON.stringify(a), sb = JSON.stringify(b);
    return sa < sb ? -1 : sa > sb ? 1 : 0;
  }

  /**
   * A pattern with a repeat inside a repeat, such as (a+)+ or (.*)*, can take minutes on a longer text and
   * freezes the page while it does. Such patterns are refused with a message instead.
   */
  function riskyRegex(source) {
    const src = String(source);
    return /\((?:[^()\\]|\\.)*[+*](?:[^()\\]|\\.)*\)\s*(?:[+*]|\{\d+,\d*\})/.test(src);
  }
  const RISKY_MESSAGE = 'This pattern can take extremely long on some text (a repeat inside a repeat, like (a+)+). Simplify it, for example a+ instead of (a+)+.';

  /**
   * Try some JavaScript on a copy of the data in a separate thread, and stop it after a few seconds.
   * Resolves { ok: true } when it finished, { ok: false, error } when it failed or ran too long.
   */
  function tryInWorker(code, data, ms = 5000) {
    return new Promise((resolve) => {
      let worker, url, timer;
      const done = (r) => { clearTimeout(timer); if (worker) worker.terminate(); if (url) URL.revokeObjectURL(url); resolve(r); };
      try {
        url = URL.createObjectURL(new Blob([`self.onmessage = (e) => { try { new Function('data', 'return ' + e.data.code)(e.data.data); self.postMessage({ ok: true }); } catch (err) { self.postMessage({ ok: false, error: String((err && err.message) || err) }); } };`], { type: 'text/javascript' }));
        worker = new Worker(url);
        worker.onmessage = (e) => done(e.data);
        worker.onerror = (e) => done({ ok: false, error: e.message || 'it could not run' });
        timer = setTimeout(() => done({ ok: false, timedOut: true, error: `It ran for more than ${ms / 1000} seconds and was stopped.` }), ms);
        worker.postMessage({ code, data });
      } catch (err) {
        done({ ok: true });         // no worker available: run it where it is
      }
    });
  }

  /**
   * Data nested more than `cap` levels deep freezes every view, so what lies deeper is replaced by a short text.
   * Works without recursion, so a very deep document cannot overflow the stack. Returns how deep it was.
   */
  function capDepth(data, cap = 200) {
    let deepest = 1;
    const stack = [[data, 1, null, null]];
    while (stack.length) {
      const [v, d, parent, key] = stack.pop();
      if (v === null || typeof v !== 'object') continue;
      if (d > deepest) deepest = d;
      if (d > cap) { parent[key] = '(nested too deep to show)'; continue; }
      if (Array.isArray(v)) for (let i = 0; i < v.length; i++) stack.push([v[i], d + 1, v, i]);
      else for (const k of Object.keys(v)) stack.push([v[k], d + 1, v, k]);
    }
    return { deepest, capped: deepest > cap };
  }

  let _uid = 0;
  const uid = (prefix = 'id') => prefix + '-' + (++_uid).toString(36) + Math.random().toString(36).slice(2, 6);

  return { esc, typeOf, capitalize, camelCase, pascalCase, snakeCase, formatBytes, timeAgo, clamp, debounce, nextTick, yieldToBrowser, whenIdle, copy, download, compareValues, riskyRegex, RISKY_MESSAGE, tryInWorker, capDepth, uid };
})();
