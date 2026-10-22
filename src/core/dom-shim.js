/* ============================================================
   STRUCTRA V2 — DOM Utilities
   Structra.dom — HTML escaping, loading spinner, toast proxy

   API:
     Structra.dom.esc(str)         → HTML-escaped string
     Structra.dom.$(id)            → document.getElementById(id)
     Structra.dom.toast(msg)       → delegates to Structra.toast
     Structra.dom.showLoading(msg) → show global spinner
     Structra.dom.hideLoading()    → hide global spinner
   ============================================================ */

window.Structra = window.Structra || {};
Structra.log.debug('Dom', 'Initializing Structra.dom');

Structra.dom = (() => {
  const $ = id => document.getElementById(id);

  const toast = msg => Structra.toast(msg);

  const ESC_RE = /[&<>"']/g;
  const escReplacer = c => {
    switch (c) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return c;
    }
  };
  const esc = s => {
    if (s == null) return '';
    return String(s).replace(ESC_RE, escReplacer);
  };

  let _loadingEl = null;
  function _getLoading() {
    if (!_loadingEl) _loadingEl = document.getElementById('gLoading');
    return _loadingEl;
  }

  let _loadingCount = 0;
  function showLoading(msg) {
    _loadingCount++;
    const el = _getLoading();
    if (el) {
      const msgEl = document.getElementById('gLoadingMsg');
      if (msgEl) msgEl.textContent = msg || 'Loading\u2026';
      el.classList.add('show');
    }
  }
  function hideLoading() {
    _loadingCount = Math.max(0, _loadingCount - 1);
    if (_loadingCount === 0) {
      const el = _getLoading();
      if (el) el.classList.remove('show');
    }
  }

  return { $, toast, esc, showLoading, hideLoading };
})();
