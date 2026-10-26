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
    var memory = {};
    return {
      getItem: function (key) { return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : null; },
      setItem: function (key, value) { memory[String(key)] = String(value); },
      removeItem: function (key) { delete memory[key]; },
      clear: function () { memory = {}; },
      key: function (i) { return Object.keys(memory)[i] === undefined ? null : Object.keys(memory)[i]; },
      get length() { return Object.keys(memory).length; }
    };
  }
  ['localStorage', 'sessionStorage'].forEach(function (name) {
    if (working(name)) return;
    try { Object.defineProperty(window, name, { value: memoryStore(), configurable: true }); } catch (error) { /* cannot replace it */ }
    window.__storageBlocked = true;
  });
})();
