/**
 * Web Worker for TOML parsing.
 * Converts TOML to JSON object for exploration.
 *
 * Requires: src/libs/toml.min.js (loaded via importScripts in worker).
 * On file://, sync fallback uses TOML from main thread.
 */
importScripts('../libs/toml.min.js');

self.addEventListener('message', function(e) {
  var id = e.data.id, text = e.data.text;

  if (id == null) {
    self.postMessage({ id: null, success: false, error: 'Missing request id' });
    return;
  }

  if (!text || typeof text !== 'string') {
    self.postMessage({ id: id, success: false, error: 'No TOML input' });
    return;
  }

  try {
    var t0 = performance.now();
    var data = TOML.parse(text);
    var elapsed = (performance.now() - t0).toFixed(1);
    console.log('[Worker:TOML] #' + id + ' Parse OK in ' + elapsed + 'ms');
    self.postMessage({ id: id, success: true, data: data });
  } catch (err) {
    var msg = err.message || 'Unknown TOML error';
    self.postMessage({ id: id, success: false, error: 'TOML parse error: ' + msg });
  }
});
