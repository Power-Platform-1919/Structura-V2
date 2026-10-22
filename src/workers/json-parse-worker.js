/**
 * Web Worker for JSON parsing — offloads heavy JSON.parse from main thread.
 * Keeps UI responsive during large file loads (200k+ records).
 * Supports both string and ArrayBuffer (Transferable) input for efficiency.
 *
 * Dual-mode: loaded via <script src> in main thread (registers source for Blob URL),
 * or loaded as new Worker() in worker thread (executes directly).
 */
(function() {
  var WORKER_FN = function() {
    self.addEventListener('message', function(e) {
      var id = e.data.id, text = e.data.text, buffer = e.data.buffer;

      if (id == null) {
        console.warn('[Worker:JSON] Missing request id');
        self.postMessage({ id: null, success: false, error: 'Missing request id' });
        return;
      }

      try {
        var jsonStr;
        if (buffer) {
          if (!(buffer instanceof ArrayBuffer)) {
            console.error('[Worker:JSON] #' + id + ' Expected ArrayBuffer, got ' + typeof buffer);
            self.postMessage({ id: id, success: false, error: 'Expected ArrayBuffer, got ' + typeof buffer });
            return;
          }
          console.log('[Worker:JSON] #' + id + ' Decoding buffer (' + (buffer.byteLength / 1048576).toFixed(1) + ' MB)');
          jsonStr = new TextDecoder().decode(buffer);
        } else if (typeof text === 'string') {
          console.log('[Worker:JSON] #' + id + ' Received text (' + (text.length / 1024).toFixed(1) + ' KB)');
          jsonStr = text;
        } else {
          console.error('[Worker:JSON] #' + id + ' No input provided');
          self.postMessage({ id: id, success: false, error: 'No input provided (expected text or buffer)' });
          return;
        }

        if (jsonStr.length === 0) {
          console.warn('[Worker:JSON] #' + id + ' Empty input');
          self.postMessage({ id: id, success: false, error: 'Empty input' });
          return;
        }

        console.log('[Worker:JSON] #' + id + ' JSON.parse starting (' + jsonStr.length + ' chars)');
        var t0 = performance.now();
        var data = JSON.parse(jsonStr);
        var elapsed = (performance.now() - t0).toFixed(1);
        var type = Array.isArray(data) ? 'Array(' + data.length + ')' : (data && typeof data === 'object') ? 'Object(' + Object.keys(data).length + ' keys)' : typeof data;
        console.log('[Worker:JSON] #' + id + ' Parse OK in ' + elapsed + 'ms → ' + type);
        self.postMessage({ id: id, success: true, data: data });
      } catch (err) {
        var msg = err.message || 'Unknown parse error';
        var size = (text ? text.length : buffer ? buffer.byteLength : 0);
        console.error('[Worker:JSON] #' + id + ' Parse FAILED: ' + msg + ' (' + err.constructor.name + ', ' + size + ' bytes)');
        if (err instanceof SyntaxError) {
          msg = 'JSON parse error (' + (size > 1024 ? Math.round(size / 1024) + 'KB' : size + 'B') + '): ' + msg;
        } else if (err instanceof RangeError) {
          msg = 'JSON too deeply nested for worker stack (' + (size > 1024 ? Math.round(size / 1024) + 'KB' : size + 'B') + '): ' + msg;
        } else if (err.name === 'DataCloneError' || (err.message && err.message.indexOf('clone') !== -1)) {
          msg = 'Result too deeply nested to transfer back to main thread: ' + msg;
        }
        self.postMessage({ id: id, success: false, error: msg });
      }
    });

    self.addEventListener('unhandledrejection', function(e) {
      e.preventDefault();
      self.postMessage({ id: null, success: false, error: 'Unhandled rejection: ' + (e.reason && e.reason.message || e.reason || 'unknown') });
    });
  };

  // Detect environment: main thread vs worker thread
  if (typeof window !== 'undefined') {
    // Main thread — register source for Blob URL creation
    (window.Structra || (window.Structra = {}))._jsonWorkerSource = '(' + WORKER_FN.toString() + ')()';
  } else {
    // Worker thread — execute
    WORKER_FN();
  }
})();
