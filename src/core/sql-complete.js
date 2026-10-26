/* ============================================================
   STRUCTRA V2 - SQL completion
   Structra.sqlComplete.suggest(text, caret, { columns, force }) - what to offer while someone types SQL.
   Pure logic (no DOM), so it can be tested in Node. The Query panel draws the list and applies the choice.

   It offers three things, in an order that fits where the cursor is:
     - columns of the open file (from DuckDB's description of the table "data")
     - the table name "data" (right after FROM or JOIN)
     - SQL keywords and common functions

   It stays quiet inside quoted text and comments, and when nothing has been typed yet (unless force is set,
   which the panel does for Ctrl+Space).

   suggest(...) returns null, or:
     { from, to, word, items: [{ label, insert, kind, detail }] }
   Replace text.slice(from, to) with the chosen item's insert. kind is 'column' | 'table' | 'keyword' | 'function'.
   ============================================================ */

Structra.sqlComplete = (() => {
  const MAX_ITEMS = 10;

  const KEYWORDS = [
    'SELECT', 'DISTINCT', 'FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT', 'OFFSET', 'AS',
    'AND', 'OR', 'NOT', 'IN', 'IS NULL', 'IS NOT NULL', 'LIKE', 'ILIKE', 'BETWEEN', 'EXISTS',
    'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'JOIN', 'LEFT JOIN', 'INNER JOIN', 'ON', 'USING',
    'UNION', 'UNION ALL', 'WITH', 'ASC', 'DESC', 'NULLS FIRST', 'NULLS LAST', 'TRUE', 'FALSE', 'NULL',
    'DESCRIBE', 'SUMMARIZE', 'SHOW', 'EXPLAIN', 'OVER', 'PARTITION BY',
  ];

  const FUNCTIONS = [
    ['COUNT', 'number of rows or values'], ['SUM', 'total'], ['AVG', 'average'], ['MIN', 'smallest'], ['MAX', 'biggest'],
    ['ROUND', 'round a number'], ['ABS', 'remove the minus sign'], ['FLOOR', 'round down'], ['CEIL', 'round up'],
    ['LOWER', 'lower case'], ['UPPER', 'upper case'], ['LENGTH', 'number of characters'], ['TRIM', 'remove spaces at the ends'],
    ['SUBSTR', 'part of a text'], ['REPLACE', 'swap text for other text'], ['CONCAT', 'join texts'], ['SPLIT_PART', 'one piece of a split text'],
    ['COALESCE', 'first value that is not empty'], ['NULLIF', 'empty when two values match'], ['CAST', 'change the type'],
    ['TRY_CAST', 'change the type, empty when it cannot'], ['DATE_TRUNC', 'cut a date to month, day, ...'], ['DATE_DIFF', 'time between two dates'],
    ['STRFTIME', 'format a date as text'], ['YEAR', 'year of a date'], ['MONTH', 'month of a date'], ['NOW', 'current time'],
    ['LIST', 'collect values into a list'], ['STRING_AGG', 'join values into one text'], ['ARRAY_LENGTH', 'items in a list'],
    ['UNNEST', 'one row per list item'], ['ROW_NUMBER', 'number the rows'], ['RANK', 'rank the rows'],
    ['MEDIAN', 'middle value'], ['STDDEV', 'spread of the values'], ['REGEXP_MATCHES', 'does a pattern match'],
    ['JSON_EXTRACT_STRING', 'read a value from JSON text'],
  ];

  /** A column name as SQL wants it: bare when it is a plain lower-case word, otherwise in double quotes */
  function quoteName(name) {
    return /^[a-z_][a-z0-9_]*$/.test(name) ? name : '"' + String(name).replace(/"/g, '""') + '"';
  }

  /**
   * Where the caret is: in ordinary SQL, inside a 'text', inside a "name", or inside a comment.
   * Returns { state, start } where start is where the quote or comment began.
   */
  function stateAt(text, caret) {
    let state = 'code';
    let start = -1;
    for (let i = 0; i < caret; i++) {
      const c = text[i];
      const n = text[i + 1];
      if (state === 'code') {
        if (c === "'") { state = 'string'; start = i; }
        else if (c === '"') { state = 'ident'; start = i; }
        else if (c === '-' && n === '-') { state = 'line'; start = i; i++; }
        else if (c === '/' && n === '*') { state = 'block'; start = i; i++; }
      } else if (state === 'string') {
        if (c === "'") { if (n === "'") i++; else state = 'code'; }
      } else if (state === 'ident') {
        if (c === '"') { if (n === '"') i++; else state = 'code'; }
      } else if (state === 'line') {
        if (c === '\n') state = 'code';
      } else if (state === 'block') {
        if (c === '*' && n === '/') { state = 'code'; i++; }
      }
    }
    return { state, start };
  }

  function suggest(text, caret, options = {}) {
    const columns = options.columns || [];
    const force = !!options.force;
    if (caret == null) caret = text.length;

    const { state, start } = stateAt(text, caret);
    if (state === 'string' || state === 'line' || state === 'block') return null;

    let from;
    let to = caret;
    let word;
    const insideQuotes = state === 'ident';
    if (insideQuotes) {
      from = start;
      word = text.slice(start + 1, caret);
      if (text[caret] === '"') to = caret + 1;           // the closing quote is replaced along with the name
    } else {
      const m = /[A-Za-z_][A-Za-z0-9_]*$/.exec(text.slice(0, caret));
      word = m ? m[0] : '';
      from = caret - word.length;
    }

    const before = text.slice(0, from);
    const qualified = !insideQuotes && /[A-Za-z_][A-Za-z0-9_]*\.$/.test(before);   // data.<column>
    if (!word && !force && !qualified) return null;

    const prevWord = (/([A-Za-z_]+)\s*$/.exec(before) || [])[1];
    const prev = prevWord ? prevWord.toUpperCase() : '';
    const startOfStatement = !qualified && (/^\s*$/.test(before.replace(/--[^\n]*|\/\*[\s\S]*?\*\//g, '')) || /;\s*$/.test(before));

    const low = word.toLowerCase();
    const candidates = [];
    const addColumns = () => columns.forEach((c) => candidates.push({ label: c.name, insert: quoteName(c.name), kind: 'column', detail: c.type || '' }));

    if (insideQuotes || qualified) {
      addColumns();                                       // inside "..." only names make sense
    } else if (prev === 'FROM' || prev === 'JOIN') {
      candidates.push({ label: 'data', insert: 'data', kind: 'table', detail: 'the open file' });
    } else {
      addColumns();
      candidates.push({ label: 'data', insert: 'data', kind: 'table', detail: 'the open file' });
      KEYWORDS.forEach((k) => candidates.push({ label: k, insert: k, kind: 'keyword', detail: 'keyword' }));
      FUNCTIONS.forEach(([f, d]) => candidates.push({ label: f, insert: f + '(', kind: 'function', detail: d }));
    }

    const kindOrder = startOfStatement
      ? { keyword: 0, function: 1, table: 2, column: 3 }
      : { column: 0, table: 1, keyword: 2, function: 3 };

    const ranked = [];
    candidates.forEach((item, idx) => {
      const name = item.label.toLowerCase();
      let rank = -1;
      if (!low) rank = 0;
      else if (name.startsWith(low)) rank = 0;
      else if (item.kind === 'column' && low.length >= 2 && name.includes(low)) rank = 1;
      if (rank < 0) return;
      ranked.push({ item, rank, idx });
    });
    ranked.sort((a, b) => a.rank - b.rank || kindOrder[a.item.kind] - kindOrder[b.item.kind]
      // with nothing typed, keep the order of the table; otherwise the shorter (closer) match first
      || (low ? a.item.label.length - b.item.label.length || a.item.label.localeCompare(b.item.label) : a.idx - b.idx));

    const items = ranked.slice(0, MAX_ITEMS).map((r) => r.item);
    // Nothing left to complete: the word is already exactly the only thing on offer
    if (items.length === 1 && items[0].label === word && !insideQuotes) return null;
    if (!items.length) return null;
    return { from, to, word, items };
  }

  return { suggest, quoteName, KEYWORDS, FUNCTIONS };
})();
