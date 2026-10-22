/**
 * Web Worker for XML parsing — uses built-in DOMParser, converts to JSON object.
 * No external library needed — works in Blob URL (file://) and URL (https://).
 *
 * Dual-mode: <script src> registers source, Worker thread executes.
 */
(function() {
  var WORKER_FN = function() {
    // Recursively convert DOM node to plain JS object
    function domToObj(node) {
      if (node.nodeType === 3) return node.textContent.trim() || null; // text node
      if (node.nodeType !== 1) return null; // skip comments, etc.

      var obj = {};
      // Attributes
      if (node.attributes && node.attributes.length > 0) {
        obj['@attributes'] = {};
        for (var i = 0; i < node.attributes.length; i++) {
          obj['@attributes'][node.attributes[i].name] = node.attributes[i].value;
        }
      }
      // Children
      var children = node.childNodes;
      var hasElements = false;
      for (var c = 0; c < children.length; c++) {
        var child = children[c];
        if (child.nodeType === 1) {
          hasElements = true;
          var tag = child.nodeName;
          var val = domToObj(child);
          if (obj[tag] !== undefined) {
            // Multiple same-name siblings → array
            if (!Array.isArray(obj[tag])) obj[tag] = [obj[tag]];
            obj[tag].push(val);
          } else {
            obj[tag] = val;
          }
        }
      }
      // If no element children, use text content
      if (!hasElements) {
        var text = node.textContent.trim();
        if (obj['@attributes']) {
          if (text) obj['#text'] = text;
        } else {
          return text || null;
        }
      }
      return obj;
    }

    self.addEventListener('message', function(e) {
      var id = e.data.id, text = e.data.text;
      if (id == null) { self.postMessage({ id: null, success: false, error: 'Missing request id' }); return; }
      if (!text || typeof text !== 'string') { self.postMessage({ id: id, success: false, error: 'No XML input' }); return; }

      try {
        var t0 = performance.now();
        var parser = new DOMParser();
        var doc = parser.parseFromString(text, 'application/xml');
        var parseError = doc.querySelector('parsererror');
        if (parseError) {
          self.postMessage({ id: id, success: false, error: 'XML parse error: ' + parseError.textContent.substring(0, 200) });
          return;
        }
        var data = domToObj(doc.documentElement);
        // Wrap in root element name
        var result = {};
        result[doc.documentElement.nodeName] = data;
        var elapsed = (performance.now() - t0).toFixed(1);
        console.log('[Worker:XML] #' + id + ' Parse OK in ' + elapsed + 'ms');
        self.postMessage({ id: id, success: true, data: result });
      } catch (err) {
        self.postMessage({ id: id, success: false, error: 'XML parse failed: ' + (err.message || err) });
      }
    });
  };

  if (typeof window !== 'undefined') {
    (window.Structra || (window.Structra = {}))._xmlWorkerSource = '(' + WORKER_FN.toString() + ')()';
  } else {
    WORKER_FN();
  }
})();
