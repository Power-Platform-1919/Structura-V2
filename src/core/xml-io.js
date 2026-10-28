/* ============================================================
   STRUCTRA V2 - XML reading
   Structra.xmlIo.parse(text) → { <root element name>: value }   (throws an Error that says where the XML is wrong)

   XML is read on the page itself: DOMParser does not exist inside a Web Worker. (There used to be a worker file and a copy of this walk in
   worker-pool.js; the worker could never run, so both are gone and this is the one place.) The way XML becomes JSON:

     <a id="1"><b>x</b></a>        attributes go in "@attributes":          { a: { "@attributes": { id: "1" }, b: "x" } }
     <a><b>1</b><b>2</b></a>       repeated elements are a list:            { a: { b: ["1", "2"] } }   (one element is not a list)
     <a><b/></a>                   an empty element is null
     <p>Hi <b>x</b> there</p>      text between elements is "#text":        { p: { b: "x", "#text": "Hi there" } }
     <a><![CDATA[<x>]]></a>        CDATA is text
     <a xsi:nil="true"/>           null (what our own export writes for null); its xmlns:xsi declaration is dropped
     <s:Body>                      the prefix stays in the name ("s:Body"), namespace declarations stay in "@attributes"
     comments, processing instructions and the XML declaration are skipped
   Every value is text: XML cannot tell 1 from "1". Whitespace around text is trimmed.
   Compared with fast-xml-parser (MIT, https://github.com/NaturalIntelligence/fast-xml-parser): it keeps attributes as "@_name" keys beside the children and
   the text as "#text"; we keep attributes together in "@attributes" (so a child called id and an attribute called id never meet) and the text as "#text".
   Both turn repeated elements into lists. We did not adopt its names: a file opened here and exported again must read back the same way.
   The way JSON becomes XML is Structra.formatConversion.jsonToXml.
   ============================================================ */

window.Structra = window.Structra || {};

Structra.xmlIo = (() => {
  const NIL_NAMESPACE = 'http://www.w3.org/2001/XMLSchema-instance';

  function elementToValue(node) {
    if (node.getAttribute('xsi:nil') === 'true') return null;
    const object = {};
    if (node.attributes.length) {
      const attributes = {};
      for (const attribute of node.attributes) {
        if (attribute.name === 'xmlns:xsi' && attribute.value === NIL_NAMESPACE) continue;     // added by our own export, carries no data
        attributes[attribute.name] = attribute.value;
      }
      if (Object.keys(attributes).length) object['@attributes'] = attributes;
    }
    let hasElements = false;
    const pieces = [];
    for (const child of node.childNodes) {
      if (child.nodeType === 1) {
        hasElements = true;
        const value = elementToValue(child);
        const tag = child.nodeName;
        if (Object.prototype.hasOwnProperty.call(object, tag)) {
          if (!Array.isArray(object[tag])) object[tag] = [object[tag]];
          object[tag].push(value);
        } else {
          object[tag] = value;
        }
      } else if ((child.nodeType === 3 || child.nodeType === 4) && child.textContent.trim()) {
        pieces.push(child.textContent.trim());
      }
    }
    const text = pieces.join(' ');
    if (!hasElements) {
      if (object['@attributes']) { if (text) object['#text'] = text; return object; }
      return text || null;
    }
    if (text) object['#text'] = text;
    return object;
  }

  function parse(text) {
    if (!text || typeof text !== 'string') throw new Error('No XML input');
    const documentNode = new DOMParser().parseFromString(text, 'application/xml');
    const parserError = documentNode.querySelector('parsererror');
    if (parserError) throw new Error('XML parse error: ' + parserError.textContent.replace(/\s+/g, ' ').trim().substring(0, 200));
    return { [documentNode.documentElement.nodeName]: elementToValue(documentNode.documentElement) };
  }

  return { parse };
})();
