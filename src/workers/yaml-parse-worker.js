/**
 * Web Worker for YAML parsing via js-yaml.
 * Converts YAML/YML to JSON object for exploration.
 *
 * Requires: src/libs/js-yaml.min.js (loaded via importScripts in worker).
 * On file://, sync fallback uses jsyaml from main thread.
 */
importScripts('../libs/js-yaml.min.js');

self.addEventListener('message', function(e) {
  var id = e.data.id, text = e.data.text;

  if (id == null) {
    self.postMessage({ id: null, success: false, error: 'Missing request id' });
    return;
  }

  if (!text || typeof text !== 'string') {
    self.postMessage({ id: id, success: false, error: 'No YAML input' });
    return;
  }

  try {
    var t0 = performance.now();
    var data = jsyaml.load(text);
    var elapsed = (performance.now() - t0).toFixed(1);
    console.log('[Worker:YAML] #' + id + ' Parse OK in ' + elapsed + 'ms');
    self.postMessage({ id: id, success: true, data: data });
  } catch (err) {
    var msg = err.message || 'Unknown YAML error';
    if (err.mark) msg += ' (line ' + (err.mark.line + 1) + ', col ' + (err.mark.column + 1) + ')';
    self.postMessage({ id: id, success: false, error: 'YAML parse error: ' + msg });
  }
});
