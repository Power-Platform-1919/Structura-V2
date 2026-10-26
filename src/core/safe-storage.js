/* ============================================================
   STRUCTRA V2 - Safe storage
   Some browsers block saving in the page (private windows, strict policies): reading localStorage then throws.
   When that happens, a plain in-memory store takes its place, so everything keeps working and only the
   saving across visits is lost. Loaded first, before any script reads a setting.
   ============================================================ */
(function () {
  function working(name) {
    try { var storage = window[name]; var key = '__structra_probe'; storage.setItem(key, '1'); storage.removeItem(key); return true; }
    catch (error) { return false; }
  }
  function memoryStore() {
    var mem = {};
    return {
      getItem: function (key) { return Object.prototype.hasOwnProperty.call(mem, key) ? mem[key] : null; },
      setItem: function (key, value) { mem[String(key)] = String(value); },
      removeItem: function (key) { delete mem[key]; },
      clear: function () { mem = {}; },
      key: function (i) { return Object.keys(mem)[i] === undefined ? null : Object.keys(mem)[i]; },
      get length() { return Object.keys(mem).length; }
    };
  }
  ['localStorage', 'sessionStorage'].forEach(function (name) {
    if (working(name)) return;
    try { Object.defineProperty(window, name, { value: memoryStore(), configurable: true }); } catch (error) { /* cannot replace it */ }
    window.__storageBlocked = true;
  });
})();
