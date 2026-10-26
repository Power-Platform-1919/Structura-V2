/**
 * Web Worker for YAML parsing via js-yaml.
 * Converts YAML/YML to JSON object for exploration.
 *
 * Requires: src/libs/js-yaml.min.js (loaded via importScripts in worker).
 * On file://, sync fallback uses jsyaml from main thread.
 */
importScripts('../libs/js-yaml.min.js');

self.addEventListener('message', function(event) {
  var id = event.data.id, text = event.data.text;

  if (id == null) {
    self.postMessage({ id: null, success: false, error: 'Missing request id' });
    return;
  }

  if (!text || typeof text !== 'string') {
    self.postMessage({ id: id, success: false, error: 'No YAML input' });
    return;
  }

  try {
    var startTime = performance.now();
    var data = jsyaml.load(text);
    var elapsed = (performance.now() - startTime).toFixed(1);
    console.log('[Worker:YAML] #' + id + ' Parse OK in ' + elapsed + 'ms');
    self.postMessage({ id: id, success: true, data: data });
  } catch (error) {
    var message = error.message || 'Unknown YAML error';
    if (error.mark) message += ' (line ' + (error.mark.line + 1) + ', col ' + (error.mark.column + 1) + ')';
    self.postMessage({ id: id, success: false, error: 'YAML parse error: ' + message });
  }
});
