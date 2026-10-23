/* Types the cells of a parsed CSV (every cell arrives as text).
   Numbers are read with thousands separators ("1,200.00" is 1200), empty cells become null, true/false become booleans,
   and a number too big to be exact stays text. A column whose numbers were written with decimals remembers how many,
   so 2.50 can be shown as 2.50 and not 2.5. Used by the CSV worker and by the fallback on the main thread. */
(function (root) {
  var PLAIN = /^-?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;
  var GROUPED = /^-?\d{1,3}(,\d{3})+(\.\d+)?$/;
  var LEADING_ZERO = /^-?0\d/;

  function typeCell(raw) {
    if (raw === null || raw === undefined) return { v: null };
    var t = String(raw).trim();
    if (t === '') return { v: null };
    var lower = t.toLowerCase();
    if (lower === 'true') return { v: true };
    if (lower === 'false') return { v: false };
    if (PLAIN.test(t) && !LEADING_ZERO.test(t)) {
      var n = Number(t);
      if (isFinite(n) && (Number.isSafeInteger(n) || String(n).indexOf('e') === -1 && t.replace(/^-|\./g, '').replace(/^0+/, '').length <= 15)) {
        var dot = t.indexOf('.');
        return { v: n, dec: dot >= 0 && !/[eE]/.test(t) ? t.length - dot - 1 : 0, num: true };
      }
      return { v: raw };
    }
    if (GROUPED.test(t)) {
      var g = Number(t.replace(/,/g, ''));
      var d = t.indexOf('.');
      return { v: g, dec: d >= 0 ? t.length - d - 1 : 0, num: true, grouped: true };
    }
    return { v: raw };
  }

  /** Types every row in place. Returns { decimals: { column: places }, mixed: { column: first text value } } */
  function retype(rows, fields) {
    var decimals = {}, seenNum = {}, text = {};
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      for (var k in row) {
        if (!Object.prototype.hasOwnProperty.call(row, k)) continue;
        var c = typeCell(row[k]);
        row[k] = c.v;
        if (c.num) { seenNum[k] = true; if (c.dec > (decimals[k] || 0)) decimals[k] = c.dec; }
        else if (typeof c.v === 'string' && text[k] === undefined) text[k] = { value: c.v, row: i + 1 };
      }
    }
    var mixed = {};
    for (var col in text) if (seenNum[col]) mixed[col] = text[col];
    for (var d in decimals) if (!decimals[d]) delete decimals[d];
    return { decimals: decimals, mixed: mixed };
  }

  root.csvRetype = retype;
})(typeof self !== 'undefined' ? self : this);
