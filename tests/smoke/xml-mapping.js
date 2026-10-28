/* The way XML and JSON map to each other, through the real XML worker (DOMParser) and the real export:
     - JSON to XML and back gives the same data (values come back as text, which XML cannot tell from numbers),
     - null comes back as null, keys that collide stay apart, text between elements is kept, attributes and CDATA are read,
     - an empty element is null, repeated elements are a list, a single element is not.

   Run:  node tests/smoke/xml-mapping.js          (PW_CHANNEL=msedge uses the installed Edge; PW_BROWSER=firefox or webkit) */
const { runAppTest } = require('../app-test');

runAppTest('xml-mapping', async ({ page, fail }) => {
  const result = await page.evaluate(async () => {
    const out = {};
    const roundTrip = async (data) => (await Structra.parseXmlAsync(Structra.formatConversion.jsonToXml(data))).root;
    // 1. text values, objects, a list of objects, a null, keys that collide
    out.basic = await roundTrip({ name: 'Ann', address: { city: 'Oslo', zip: '0150' }, tags: ['a', 'b'], gone: null });
    out.collide = await roundTrip({ 'a b': 'one', a_b: 'two', 'a-b': 'three' });
    // 2. text with markup characters and quotes comes back as typed
    out.escaped = await roundTrip({ v: '<b> & "q" \'s\' </b>' });
    // 3. numbers and booleans come back as text (XML has no types)
    out.typed = await roundTrip({ n: 1.5, t: true });
    // 4. reading: attributes, CDATA, mixed text, empty element, a single child versus repeated children, namespaces
    const read = async (xml) => (await Structra.parseXmlAsync(xml));
    out.attributes = await read('<a id="1" kind="x"><b>text</b></a>');
    out.cdata = await read('<a><![CDATA[<not & markup>]]></a>');
    out.mixed = await read('<p>Hello <b>big</b> world</p>');
    out.empty = await read('<a><b/><c></c></a>');
    out.single = await read('<a><b>1</b></a>');
    out.repeated = await read('<a><b>1</b><b>2</b></a>');
    out.namespace = await read('<s:Envelope xmlns:s="http://x"><s:Body><m:Get xmlns:m="http://y">1</m:Get></s:Body></s:Envelope>');
    out.comment = await read('<a><!-- note --><b>1</b></a>');
    return out;
  });
  const same = (name, actual, expected) => { if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(`${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); };
  // a list is written as <tags><item>a</item><item>b</item></tags>, so it comes back as { item: [...] }
  same('basic round trip', result.basic, { name: 'Ann', address: { city: 'Oslo', zip: '0150' }, tags: { item: ['a', 'b'] }, gone: null });
  same('colliding keys stay apart', result.collide, { a_b: 'one', a_b_2: 'two', 'a-b': 'three' });
  same('markup characters in text', result.escaped, { v: '<b> & "q" \'s\' </b>'.trim() });
  same('numbers and booleans come back as text', result.typed, { n: '1.5', t: 'true' });
  same('attributes', result.attributes, { a: { '@attributes': { id: '1', kind: 'x' }, b: 'text' } });
  same('CDATA', result.cdata, { a: '<not & markup>' });
  same('text between elements is kept', result.mixed, { p: { b: 'big', '#text': 'Hello world' } });
  same('empty elements are null', result.empty, { a: { b: null, c: null } });
  same('one child is not a list', result.single, { a: { b: '1' } });
  same('repeated children are a list', result.repeated, { a: { b: ['1', '2'] } });
  same('namespaces keep their prefix', result.namespace, { 's:Envelope': { '@attributes': { 'xmlns:s': 'http://x' }, 's:Body': { 'm:Get': { '@attributes': { 'xmlns:m': 'http://y' }, '#text': '1' } } } });
  same('comments are skipped', result.comment, { a: { b: '1' } });
}, { viewport: { width: 1360, height: 900 } });
