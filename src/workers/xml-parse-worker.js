/**
 * Web Worker for XML parsing - uses built-in DOMParser, converts to JSON object.
 * No external library needed - works in Blob URL (file://) and URL (https://).
 *
 * Dual-mode: <script src> registers source, Worker thread executes.
 */
(function() {
  var WORKER_FN = function() {
    // Recursively convert DOM node to plain JS object
    function domToObject(node) {
      if (node.nodeType === 3) return node.textContent.trim() || null; // text node
      if (node.nodeType !== 1) return null; // skip comments, etc.

      var object = {};
      // Attributes
      if (node.attributes && node.attributes.length > 0) {
        object['@attributes'] = {};
        for (var i = 0; i < node.attributes.length; i++) {
          object['@attributes'][node.attributes[i].name] = node.attributes[i].value;
        }
      }
      // Children
      var children = node.childNodes;
      var hasElements = false;
      for (var index = 0; index < children.length; index++) {
        var child = children[index];
        if (child.nodeType === 1) {
          hasElements = true;
          var tag = child.nodeName;
          var value = domToObject(child);
          if (object[tag] !== undefined) {
            // Multiple same-name siblings → array
            if (!Array.isArray(object[tag])) object[tag] = [object[tag]];
            object[tag].push(value);
          } else {
            object[tag] = value;
          }
        }
      }
      // If no element children, use text content
      if (!hasElements) {
        var text = node.textContent.trim();
        if (object['@attributes']) {
          if (text) object['#text'] = text;
        } else {
          return text || null;
        }
      }
      return object;
    }

    self.addEventListener('message', function(event) {
      var id = event.data.id, text = event.data.text;
      if (id == null) { self.postMessage({ id: null, success: false, error: 'Missing request id' }); return; }
      if (!text || typeof text !== 'string') { self.postMessage({ id: id, success: false, error: 'No XML input' }); return; }

      try {
        var startTime = performance.now();
        var parser = new DOMParser();
        var xmlDocument = parser.parseFromString(text, 'application/xml');
        var parseError = xmlDocument.querySelector('parsererror');
        if (parseError) {
          self.postMessage({ id: id, success: false, error: 'XML parse error: ' + parseError.textContent.substring(0, 200) });
          return;
        }
        var data = domToObject(xmlDocument.documentElement);
        // Wrap in root element name
        var result = {};
        result[xmlDocument.documentElement.nodeName] = data;
        var elapsed = (performance.now() - startTime).toFixed(1);
        console.log('[Worker:XML] #' + id + ' Parse OK in ' + elapsed + 'ms');
        self.postMessage({ id: id, success: true, data: result });
      } catch (error) {
        self.postMessage({ id: id, success: false, error: 'XML parse failed: ' + (error.message || error) });
      }
    });
  };

  if (typeof window !== 'undefined') {
    (window.Structra || (window.Structra = {}))._xmlWorkerSource = '(' + WORKER_FN.toString() + ')()';
  } else {
    WORKER_FN();
  }
})();
