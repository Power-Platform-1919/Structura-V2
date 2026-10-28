/**
 * Web Worker for YAML parsing via the yaml library, through Structra.yamlIo (src/core/yaml-io.js), the same file the page uses.
 * Converts YAML/YML to a JSON value for exploration. Several documents ("---") come back as a list.
 *
 * Requires: src/libs/yaml/yaml.min.js and src/core/yaml-io.js (loaded via importScripts in worker).
 * On file://, sync fallback uses Structra.yamlIo on the main thread.
 */
importScripts('../libs/yaml/yaml.min.js', '../core/yaml-io.js');

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
    var parsed = self.Structra.yamlIo.parse(text);
    var elapsed = (performance.now() - startTime).toFixed(1);
    console.log('[Worker:YAML] #' + id + ' Parse OK in ' + elapsed + 'ms');
    self.postMessage({ id: id, success: true, data: parsed.data, documents: parsed.documents, tagsIgnored: parsed.tagsIgnored });
  } catch (error) {
    self.postMessage({ id: id, success: false, error: 'YAML parse error: ' + (error.message || 'Unknown YAML error') });
  }
});
