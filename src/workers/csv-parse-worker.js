/**
 * Web Worker for CSV/TSV parsing via PapaParse.
 * Offloads heavy CSV parsing from the main thread.
 * Supports header detection, skip empty lines, dynamic typing.
 *
 * Only runs as a Worker (not loaded via <script> in main thread).
 * On file://, CSV parsing uses sync fallback with Papa on main thread.
 */
importScripts('../libs/papaparse.min.js', '../libs/csv-typing.js');

self.addEventListener('message', function(event) {
  var id = event.data.id, text = event.data.text, options = event.data.options;

  if (id == null) {
    console.warn('[Worker:CSV] Missing request id');
    self.postMessage({ id: null, success: false, error: 'Missing request id' });
    return;
  }

  if (!text || typeof text !== 'string') {
    console.error('[Worker:CSV] #' + id + ' No CSV input provided');
    self.postMessage({ id: id, success: false, error: 'No CSV input provided' });
    return;
  }

  if (text.trim().length === 0) {
    console.warn('[Worker:CSV] #' + id + ' Empty CSV input');
    self.postMessage({ id: id, success: false, error: 'Empty CSV input' });
    return;
  }

  try {
    console.log('[Worker:CSV] #' + id + ' Parsing (' + (text.length / 1024).toFixed(1) + ' KB)');
    var config = Object.assign({
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false          // typed afterwards by csvRetype, which reads "1,200.00" and keeps decimals
    }, options || {});

    var startTime = performance.now();
    var result = Papa.parse(text, config);
    var typed = csvRetype(result.data, result.meta.fields);
    var elapsed = (performance.now() - startTime).toFixed(1);

    if (result.errors.length > 0 && result.data.length === 0) {
      console.error('[Worker:CSV] #' + id + ' Parse failed: ' + result.errors[0].message);
      self.postMessage({ id: id, success: false, error: 'CSV parse error: ' + result.errors[0].message });
      return;
    }

    console.log('[Worker:CSV] #' + id + ' Parse OK in ' + elapsed + 'ms → ' + result.data.length + ' rows, ' + (result.meta.fields || []).length + ' fields');
    self.postMessage({
      id: id,
      success: true,
      data: result.data,
      meta: {
        delimiter: result.meta.delimiter,
        linebreak: result.meta.linebreak,
        fields: result.meta.fields || [],
        rows: result.data.length,
        errors: result.errors.length,
        truncated: result.meta.truncated || false,
        decimals: typed.decimals,
        mixed: typed.mixed
      },
      errors: result.errors.length > 0 ? result.errors.slice(0, 10) : []
    });
  } catch (error) {
    console.error('[Worker:CSV] #' + id + ' Exception: ' + (error.message || error));
    self.postMessage({ id: id, success: false, error: 'CSV parse failed: ' + (error.message || 'Unknown error') });
  }
});

self.addEventListener('unhandledrejection', function(event) {
  event.preventDefault();
  self.postMessage({ id: null, success: false, error: 'Unhandled rejection: ' + (event.reason && event.reason.message || event.reason || 'unknown') });
});
