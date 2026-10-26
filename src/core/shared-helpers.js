/* ============================================================
   STRUCTRA V2 - Shared Utilities
   Structra.sharedHelpers - small helpers that used to be copied into many files.
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

Structra.sharedHelpers = (() => {
  const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const ESC_RE = /[&<>"']/g;

  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(ESC_RE, (letter) => ESC_MAP[letter]);
  }

  function jsonTypeOf(value) {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
  }

  // Naming styles used when generating code
  const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);
  const camelCase = (text) => text.replace(/[-_](\w)/g, (_, letter) => letter.toUpperCase());
  const pascalCase = (text) => capitalize(camelCase(text));
  const snakeCase = (text) => text.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '').replace(/[-\s]+/g, '_');

  function formatBytes(bytes) {
    if (bytes === null || bytes === undefined || bytes === '' || Number.isNaN(Number(bytes))) return '-';
    bytes = Number(bytes);
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
    return (bytes / 1073741824).toFixed(2) + ' GB';
  }

  function timeAgo(timestamp) {
    if (!timestamp) return '';
    const diff = Date.now() - timestamp;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
    return new Date(timestamp).toLocaleDateString();
  }

  const clamp = (number, min, max) => Math.max(min, Math.min(max, number));

  function debounce(callback, milliseconds) {
    let timer = null;
    const wrapped = (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => { timer = null; callback(...args); }, milliseconds);
    };
    wrapped.cancel = () => { clearTimeout(timer); timer = null; };
    return wrapped;
  }

  const waitForNextTick = () => new Promise((resolve) => setTimeout(resolve, 0));

  function yieldToBrowser() {
    if (globalThis.scheduler && typeof globalThis.scheduler.yield === 'function') return globalThis.scheduler.yield();
    return waitForNextTick();
  }

  function runWhenIdle(callback, timeout = 2000) {
    if (typeof requestIdleCallback === 'function') return requestIdleCallback(callback, { timeout });
    return setTimeout(callback, 50);
  }

  async function copyToClipboard(text, message = 'Copied') {
    const str = String(text);
    try {
      await navigator.clipboard.writeText(str);
    } catch {
      // Clipboard API refused (insecure origin, no focus): fall back to a hidden textarea
      const textarea = document.createElement('textarea');
      textarea.value = str;
      textarea.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
      document.body.appendChild(textarea);
      textarea.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch { /* ignore */ }
      textarea.remove();
      if (!ok) { Structra.toast('Copy failed'); return false; }
    }
    if (message) Structra.toast(message);
    return true;
  }

  function downloadFile(content, name, mime = 'text/plain') {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  /**
   * One order for values of any kind, the way a spreadsheet sorts: numbers, then text (capital letters make no
   * difference and numbers inside text sort naturally: item 2 before item 10), then true/false, then lists and
   * records. Empty values are for the caller to put last.
   */
  const _rank = (value) => (typeof value === 'number' ? 0 : typeof value === 'string' ? 1 : typeof value === 'boolean' ? 2 : 3);
  function compareValues(first, second) {
    const firstRank = _rank(first), secondRank = _rank(second);
    if (firstRank !== secondRank) return firstRank - secondRank;
    if (firstRank === 0) return first - second;
    if (firstRank === 1) return first.localeCompare(second, undefined, { sensitivity: 'base', numeric: true }) || (first < second ? -1 : first > second ? 1 : 0);
    if (firstRank === 2) return (first ? 1 : 0) - (second ? 1 : 0);
    const firstText = JSON.stringify(first), secondText = JSON.stringify(second);
    return firstText < secondText ? -1 : firstText > secondText ? 1 : 0;
  }

  /**
   * A pattern with a repeat inside a repeat, such as (a+)+ or (.*)*, can take minutes on a longer text and
   * freezes the page while it does. Such patterns are refused with a message instead.
   */
  function isRiskyRegex(source) {
    const src = String(source);
    return /\((?:[^()\\]|\\.)*[+*](?:[^()\\]|\\.)*\)\s*(?:[+*]|\{\d+,\d*\})/.test(src);
  }
  const RISKY_REGEX_MESSAGE = 'This pattern can take extremely long on some text (a repeat inside a repeat, like (a+)+). Simplify it, for example a+ instead of (a+)+.';

  /**
   * Try some JavaScript on a copy of the data in a separate thread, and stop it after a few seconds.
   * Resolves { ok: true } when it finished, { ok: false, error } when it failed or ran too long.
   */
  function tryCodeInWorker(code, data, milliseconds = 5000) {
    return new Promise((resolve) => {
      let worker, url, timer;
      const done = (result) => { clearTimeout(timer); if (worker) worker.terminate(); if (url) URL.revokeObjectURL(url); resolve(result); };
      try {
        url = URL.createObjectURL(new Blob([`self.onmessage = (e) => { try { new Function('data', 'return ' + e.data.code)(e.data.data); self.postMessage({ ok: true }); } catch (err) { self.postMessage({ ok: false, error: String((err && err.message) || err) }); } };`], { type: 'text/javascript' }));
        worker = new Worker(url);
        worker.onmessage = (event) => done(event.data);
        worker.onerror = (event) => done({ ok: false, error: event.message || 'it could not run' });
        timer = setTimeout(() => done({ ok: false, timedOut: true, error: `It ran for more than ${milliseconds / 1000} seconds and was stopped.` }), milliseconds);
        worker.postMessage({ code, data });
      } catch (error) {
        done({ ok: true });         // no worker available: run it where it is
      }
    });
  }

  /**
   * Data nested more than `cap` levels deep freezes every view, so what lies deeper is replaced by a short text.
   * Works without recursion, so a very deep document cannot overflow the stack. Returns how deep it was.
   */
  function limitDepth(data, cap = 200) {
    let deepest = 1;
    const stack = [[data, 1, null, null]];
    while (stack.length) {
      const [value, depth, parent, key] = stack.pop();
      if (value === null || typeof value !== 'object') continue;
      if (depth > deepest) deepest = depth;
      if (depth > cap) { parent[key] = '(nested too deep to show)'; continue; }
      if (Array.isArray(value)) for (let i = 0; i < value.length; i++) stack.push([value[i], depth + 1, value, i]);
      else for (const key of Object.keys(value)) stack.push([value[key], depth + 1, value, key]);
    }
    return { deepest, capped: deepest > cap };
  }

  let _uid = 0;
  const uniqueId = (prefix = 'id') => prefix + '-' + (++_uid).toString(36) + Math.random().toString(36).slice(2, 6);

  return { escapeHtml, jsonTypeOf, capitalize, camelCase, pascalCase, snakeCase, formatBytes, timeAgo, clamp, debounce, waitForNextTick, yieldToBrowser, runWhenIdle, copyToClipboard, downloadFile, compareValues, isRiskyRegex, RISKY_REGEX_MESSAGE, tryCodeInWorker, limitDepth, uniqueId };
})();
