/* JSON to XML: every key becomes a legal element name, two keys never share one, and the text is escaped. (The way XML is read back is
   checked in the browser: tests/smoke/xml-mapping.js, because it needs DOMParser.) */
const { load, test, eq, truthy } = require('./harness');

load(['format-conversion']);
const { jsonToXml } = Structra.formatConversion;

console.log('json to xml');

test('keys that become the same name get _2, _3 so no value is merged into another', () => {
  const xml = jsonToXml({ 'a b': 1, a_b: 2, 'a-b': 3, 'a?b': 4, 'a:b': 5 });
  truthy(xml.includes('<a_b>1</a_b>'), xml);
  truthy(xml.includes('<a_b_2>2</a_b_2>'), xml);
  truthy(xml.includes('<a-b>3</a-b>'), xml);
  truthy(xml.includes('<a_b_3>4</a_b_3>'), xml);
  truthy(xml.includes('<a_b_4>5</a_b_4>'), xml);
});

test('a suffix never lands on a name another key already has', () => {
  const xml = jsonToXml({ 'a b': 1, a_b: 2, a_b_2: 3 });
  const names = [...xml.matchAll(/<(a_b[_0-9]*)>/g)].map((match) => match[1]);
  eq(new Set(names).size, 3, names.join());
});

test('names that start with a digit or are empty are made legal', () => {
  const xml = jsonToXml({ '1st': 1, '': 2, '2nd place': 3 });
  truthy(xml.includes('<_1st>1</_1st>'), xml);
  truthy(xml.includes('<_>2</_>'), xml);
  truthy(xml.includes('<_2nd_place>3</_2nd_place>'), xml);
});

test('text is escaped and control characters are dropped', () => {
  const xml = jsonToXml({ v: '<a href="x">&\'</a>\u0001' });
  truthy(xml.includes('<v>&lt;a href=&quot;x&quot;&gt;&amp;&apos;&lt;/a&gt;</v>'), xml);
});

test('null is written as xsi:nil with the namespace declared once', () => {
  const xml = jsonToXml({ a: null, b: [null] });
  truthy(xml.includes('<a xsi:nil="true"/>') && xml.includes('<item xsi:nil="true"/>'), xml);
  eq(xml.split('xmlns:xsi').length - 1, 1);
});
