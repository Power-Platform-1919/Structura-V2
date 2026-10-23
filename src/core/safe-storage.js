/* ============================================================
   STRUCTRA V2 - Safe storage
   Some browsers block saving in the page (private windows, strict policies): reading localStorage then throws.
   When that happens, a plain in-memory store takes its place, so everything keeps working and only the
   saving across visits is lost. Loaded first, before any script reads a setting.
   ============================================================ */
(function () {
  function working(name) {
    try { var s = window[name]; var k = '__structra_probe'; s.setItem(k, '1'); s.removeItem(k); return true; }
    catch (e) { return false; }
  }
  function memoryStore() {
    var mem = {};
    return {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
      setItem: function (k, v) { mem[String(k)] = String(v); },
      removeItem: function (k) { delete mem[k]; },
      clear: function () { mem = {}; },
      key: function (i) { return Object.keys(mem)[i] === undefined ? null : Object.keys(mem)[i]; },
      get length() { return Object.keys(mem).length; }
    };
  }
  ['localStorage', 'sessionStorage'].forEach(function (name) {
    if (working(name)) return;
    try { Object.defineProperty(window, name, { value: memoryStore(), configurable: true }); } catch (e) { /* cannot replace it */ }
    window.__storageBlocked = true;
  });
})();
