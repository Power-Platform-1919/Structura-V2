/* Property names that break code that writes or reads paths by hand. Shared by the unit tests and the browser tests.
   The first group is what real SharePoint, Dataverse and OData payloads contain; the rest is what a hostile or odd file can contain. */
const HOSTILE_KEYS = [
  // real Power Platform payloads
  '@odata.etag', '@odata.type', '__metadata', 'body/field', 'Created By', 'Title (old)', 'a.b', 'a.b.c', 'x@y',
  // brackets and quotes
  'a[0]', '[0]', 'a]', ']', '[', 'a"]', '"]', 'say "hi"', "it's", "a']", 'a"b\'c',
  // backslashes
  '\\', 'a\\b', 'a\\', '\\"', '\\\\', 'C:\\temp',
  // empty, numeric text, whitespace, a dollar sign
  '', '0', '12', '-1', '1.5', ' ', ' lead', 'trail ', '$', '$a', '$.a', '$[0]', '$ref', '*', '..', '.', '.a', 'a.',
  // control characters and unicode
  'line\nbreak', 'tab\there', 'nul\u0000x', 'é', '日本語', '😀', 'a\u2028b',
  // names every object already has
  'constructor', 'toString', 'hasOwnProperty', 'prototype', '__proto__', 'length',
  // very long
  'k'.repeat(5000),
];

module.exports = { HOSTILE_KEYS };
