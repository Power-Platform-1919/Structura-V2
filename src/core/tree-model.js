/* ============================================================
   STRUCTRA V2 - Tree model
   Structra.treeModel - the rows of the Tree: which lines are showing, and what each one stands for.

   The Tree is a CodeMirror document that holds only the rows that are showing (docs/codemirror-tree-research.md, design B). A block that
   is closed is one row: { ...24 keys }. Opening it replaces that row by the rows of the block; closing it puts the one row back.
   This file knows nothing about CodeMirror or the page: it keeps the rows, says what text a change has to put in the document, and
   answers "which row is this path" and "which path is this row". tests/unit/tree-model.test.js proves it against JSON.stringify.

   Every row has, kept in typed arrays (about 14 bytes per row, so a million rows is 14 MB):
     kind      VALUE a value on its own line, OPEN an open block ({ or [), CLOSED a closed block, CLOSE the closing bracket,
               EMPTY an empty { } or [ ], MORE the "more" row at the end of a window
     depth     how deep it is (the root is 0)
     parent    the row of the block that holds it (for a closing bracket: the row of its own opening bracket); -1 for the root
     index     its place in the parent: the list position, or the position of the key in the object; for MORE the next position
     fileLine  the line it starts at in the file as it would be pretty printed (from 0); it never changes when blocks open or close
     span      for an open block, how many rows it takes now from its opening to its closing bracket; 1 for every other row

   A block with more than WINDOW children shows the first WINDOW, then a MORE row that shows the next window when it is used.

   A change is { at, removeRows, text }: the document replaces the removeRows rows from row "at" by the lines of text.

   API:
     const model = Structra.treeModel.create(data)   the first view opens the levels one after the other while the rows still fit
     model.rows, model.fileLines
     model.initialText()                             the text of the first rows, one per line (a change keeps the document up to date after that)
     model.toggle(row)                               open or close a block: a change, or null when the row is not a block
     model.more(row)                                 show the next window of a MORE row: a change, or null
     model.setDepth(depth)                           open the blocks above this depth, close the rest: { text } for the whole document
     model.expandAll()                               open everything, up to MAX_ROWS rows: { text, capped }
     model.collapseAll()                             close everything, the root too: { text }
     model.revealPath(path)                          open what has to be open for the path to show: { row, changes } or null
     model.rowOfPath(path)                           the row of the path now, or -1 when it is not showing
     model.pathOf(row), model.valueOf(row), model.keyOf(row)
     model.kind(row), depth(row), fileLineOf(row), isBlock(row), isOpen(row), closeRowOf(row), parentOf(row)
   ============================================================ */
'use strict';

window.Structra = window.Structra || {};

Structra.treeModel = (() => {
  const KIND = { VALUE: 0, OPEN: 1, CLOSED: 2, CLOSE: 3, EMPTY: 4, MORE: 5 };
  /** A block shows this many children, then a MORE row */
  const WINDOW = 500000;
  /** The first view opens levels while the rows still fit in this many (the first level is always opened) */
  const INITIAL_ROWS = 30000;
  /** Open all stops here: a document of millions of lines opens as far as this, the rest stays closed */
  const MAX_ROWS = 2000000;
  const LEVEL_LIMIT = 200;

  const isBlockValue = (value) => value !== null && typeof value === 'object';
  const childCount = (value) => (Array.isArray(value) ? value.length : Object.keys(value).length);

  /** How many lines a value takes when pretty printed with two spaces */
  function linesOf(value) {
    if (!isBlockValue(value)) return 1;
    const children = Array.isArray(value) ? value : Object.values(value);
    if (!children.length) return 1;
    let total = 2;
    for (let i = 0; i < children.length; i++) total += linesOf(children[i]);
    return total;
  }

  // The key names of a wide object are remembered: finding the position of a key must not cost the width of the object every time
  const keyCache = new WeakMap();
  function keysOf(object) {
    let keys = keyCache.get(object);
    if (!keys) { keys = Object.keys(object); if (keys.length > 64) keyCache.set(object, keys); }
    return keys;
  }

  const summaryOf = (value) => (Array.isArray(value) ? `[ ...${value.length} items ]` : `{ ...${childCount(value)} keys }`);
  const moreText = (level, left, array) => '  '.repeat(level) + `// ${left.toLocaleString()} more ${array ? 'items' : 'keys'}: press Enter or click to show the next ones`;

  function create(data) {
    let capacity = 1024;
    let kind = new Uint8Array(capacity);
    let depth = new Uint8Array(capacity);
    let parent = new Int32Array(capacity);
    let index = new Int32Array(capacity);
    let fileLine = new Uint32Array(capacity);
    let span = new Uint32Array(capacity);
    let rows = 0;

    /* ---------- the arrays ---------- */

    function grow(needed) {
      if (needed <= capacity) return;
      while (capacity < needed) capacity *= 2;
      const widen = (array) => { const next = new array.constructor(capacity); next.set(array.subarray(0, rows)); return next; };
      kind = widen(kind); depth = widen(depth); parent = widen(parent); index = widen(index); fileLine = widen(fileLine); span = widen(span);
    }

    /** New rows being made: parallel lists, filled by emit(), put into the arrays by place() */
    function collector(at) {
      return {
        at, kinds: [], depths: [], parents: [], indexes: [], lines: [], spans: [], texts: [],
        push(rowKind, level, parentRow, position, line, rowSpan, text) {
          this.kinds.push(rowKind); this.depths.push(level); this.parents.push(parentRow); this.indexes.push(position);
          this.lines.push(line); this.spans.push(rowSpan); this.texts.push(text);
        },
        get length() { return this.texts.length; },
      };
    }

    /** Replace removeCount rows from "at" by the collected rows. Row numbers of the collected rows are final (they count from "at"). */
    function place(at, removeCount, collected) {
      const insert = collected.length;
      const delta = insert - removeCount;
      grow(rows + delta);
      if (delta !== 0) {
        for (const array of [kind, depth, parent, index, fileLine, span]) array.copyWithin(at + insert, at + removeCount, rows);
        // a row after the change that points at a row after the change points at its new number
        for (let row = at + insert; row < rows + delta; row++) if (parent[row] >= at + removeCount) parent[row] += delta;
      }
      for (let k = 0; k < insert; k++) {
        kind[at + k] = collected.kinds[k]; depth[at + k] = collected.depths[k]; parent[at + k] = collected.parents[k];
        index[at + k] = collected.indexes[k]; fileLine[at + k] = collected.lines[k]; span[at + k] = collected.spans[k];
      }
      rows += delta;
    }

    /** After a block took more or fewer rows, every open block that holds it takes that many more or fewer */
    function fixSpans(row, delta) {
      if (delta === 0) return;
      for (let current = parent[row]; current >= 0; current = parent[current]) if (kind[current] === KIND.OPEN) span[current] += delta;
    }

    /* ---------- making rows ---------- */

    /** Indentation and, inside an object, the key */
    const lead = (level, keyName) => '  '.repeat(level) + (keyName === null ? '' : JSON.stringify(keyName) + ': ');

    /**
     * Make the rows of one value, and of what is open inside it by `openRule(level, value)`, appended to `out`.
     * Returns the file line after the value. Row numbers are final: the first row made is out.at.
     */
    function emit(out, value, keyName, position, level, parentRow, line, isLast, openRule) {
      const comma = isLast ? '' : ',';
      if (!isBlockValue(value)) {
        out.push(KIND.VALUE, level, parentRow, position, line, 1, lead(level, keyName) + JSON.stringify(value) + comma);
        return line + 1;
      }
      const array = Array.isArray(value);
      const count = childCount(value);
      if (count === 0) {
        out.push(KIND.EMPTY, level, parentRow, position, line, 1, lead(level, keyName) + (array ? '[]' : '{}') + comma);
        return line + 1;
      }
      if (!openRule(level, value)) {
        out.push(KIND.CLOSED, level, parentRow, position, line, 1, lead(level, keyName) + summaryOf(value) + comma);
        return line + linesOf(value);
      }
      const here = out.at + out.length;
      out.push(KIND.OPEN, level, parentRow, position, line, 0, lead(level, keyName) + (array ? '[' : '{'));
      const keys = array ? null : keysOf(value);
      const shown = Math.min(count, WINDOW);
      let next = line + 1;
      for (let i = 0; i < shown; i++) next = emit(out, array ? value[i] : value[keys[i]], array ? null : keys[i], i, level + 1, here, next, i === count - 1, openRule);
      if (count > shown) {
        out.push(KIND.MORE, level + 1, here, shown, next, 1, moreText(level + 1, count - shown, array));
        for (let i = shown; i < count; i++) next += linesOf(array ? value[i] : value[keys[i]]);
      }
      out.push(KIND.CLOSE, level, here, -1, next, 1, '  '.repeat(level) + (array ? ']' : '}') + comma);
      out.spans[here - out.at] = out.length - (here - out.at);
      return next + 1;
    }

    /** Is this row the last child of its parent (no comma after it)? */
    function isLastChild(row) {
      if (parent[row] < 0) return true;
      return index[row] === childCount(valueOfRow(parent[row])) - 1;
    }

    /* ---------- the answers ---------- */

    const isBlock = (row) => kind[row] === KIND.OPEN || kind[row] === KIND.CLOSED;
    const isOpen = (row) => kind[row] === KIND.OPEN;
    const closeRowOf = (row) => (kind[row] === KIND.OPEN ? row + span[row] - 1 : -1);

    /** The rows from the root down to this row (the root itself left out), root side first. A closing bracket answers for its block. */
    function chainOf(row) {
      const chain = [];
      let current = kind[row] === KIND.CLOSE ? parent[row] : row;
      while (current >= 0 && parent[current] >= 0) { chain.push(current); current = parent[current]; }
      return chain.reverse();
    }

    function step(value, row) {
      return Array.isArray(value) ? value[index[row]] : value[keysOf(value)[index[row]]];
    }

    function valueOfRow(row) {
      let value = data;
      for (const stepRow of chainOf(row)) { if (kind[stepRow] === KIND.MORE) return undefined; value = step(value, stepRow); }
      return value;
    }

    function keyOfRow(row) {
      const chain = chainOf(row);
      if (!chain.length || kind[chain[chain.length - 1]] === KIND.MORE) return null;
      let holder = data;
      for (let i = 0; i < chain.length - 1; i++) holder = step(holder, chain[i]);
      return Array.isArray(holder) ? null : keysOf(holder)[index[chain[chain.length - 1]]];
    }

    function pathOfRow(row) {
      let value = data;
      let path = '';
      for (const stepRow of chainOf(row)) {
        if (kind[stepRow] === KIND.MORE) return path;
        const key = Array.isArray(value) ? index[stepRow] : keysOf(value)[index[stepRow]];
        path = Structra.dataPaths.child(path, key);
        value = value[key];
      }
      return path;
    }

    /* ---------- changing what shows ---------- */

    function toggle(row) {
      if (kind[row] !== KIND.CLOSED && kind[row] !== KIND.OPEN) return null;
      const opening = kind[row] === KIND.CLOSED;
      const removeRows = opening ? 1 : span[row];
      const level = depth[row];
      const out = collector(row);
      // opening opens this block only (what is inside stays closed); closing makes the one closed row
      emit(out, valueOfRow(row), keyOfRow(row), index[row], level, parent[row], fileLine[row], isLastChild(row), opening ? (at) => at === level : () => false);
      place(row, removeRows, out);
      fixSpans(row, out.length - removeRows);
      return { at: row, removeRows, text: out.texts.join('\n') };
    }

    function more(row) {
      if (kind[row] !== KIND.MORE) return null;
      const blockRow = parent[row];
      const value = valueOfRow(blockRow);
      const array = Array.isArray(value);
      const count = childCount(value);
      const keys = array ? null : keysOf(value);
      const start = index[row];
      const stop = Math.min(count, start + WINDOW);
      const out = collector(row);
      let line = fileLine[row];
      for (let i = start; i < stop; i++) line = emit(out, array ? value[i] : value[keys[i]], array ? null : keys[i], i, depth[row], blockRow, line, i === count - 1, () => false);
      if (count > stop) out.push(KIND.MORE, depth[row], blockRow, stop, line, 1, moreText(depth[row], count - stop, array));
      place(row, 1, out);
      fixSpans(row, out.length - 1);
      return { at: row, removeRows: 1, text: out.texts.join('\n') };
    }

    /** Make every row again by a rule, and return the text of the whole document */
    function rebuild(openRule) {
      rows = 0;
      const out = collector(0);
      emit(out, data, null, -1, 0, -1, 0, true, openRule);
      place(0, 0, out);
      return out.texts.join('\n');
    }

    const setDepth = (maxDepth) => ({ text: rebuild((level) => level < maxDepth) });
    const collapseAll = () => ({ text: rebuild(() => false) });

    function expandAll() {
      let used = 0;
      let capped = false;
      const text = rebuild((level, value) => {
        const cost = Math.min(childCount(value), WINDOW) + 2;
        if (used + cost > MAX_ROWS) { capped = true; return false; }
        used += cost;
        return true;
      });
      return { text, capped };
    }

    /* ---------- the first view ---------- */

    /** How many rows show when the blocks above maxDepth are open (counting stops a little past `limit`) */
    function rowsWithDepth(maxDepth, limit) {
      let total = 0;
      const stack = [[data, 0]];
      while (stack.length) {
        const [value, level] = stack.pop();
        if (!isBlockValue(value) || level >= maxDepth || childCount(value) === 0) { if (++total > limit) return total; continue; }
        const count = childCount(value);
        total += 2 + (count > WINDOW ? 1 : 0);
        if (total > limit) return total;
        const array = Array.isArray(value);
        const keys = array ? null : keysOf(value);
        const shown = Math.min(count, WINDOW);
        for (let i = 0; i < shown; i++) stack.push([array ? value[i] : value[keys[i]], level + 1]);
      }
      return total;
    }

    function firstDepth() {
      let best = 1;
      let before = rowsWithDepth(1, INITIAL_ROWS);
      for (let level = 2; level <= LEVEL_LIMIT; level++) {
        const count = rowsWithDepth(level, INITIAL_ROWS);
        if (count > INITIAL_ROWS) break;
        best = level;
        if (count === before) break;           // nothing more opens at this level: everything is open
        before = count;
      }
      return best;
    }

    /* ---------- finding a path ---------- */

    /** The row of a child of an open block, found by stepping over its earlier siblings; -1 when it is not showing */
    function childRow(blockRow, position) {
      const end = closeRowOf(blockRow);
      for (let row = blockRow + 1; row < end; row += kind[row] === KIND.OPEN ? span[row] : 1) {
        if (kind[row] === KIND.MORE) return -1;
        if (index[row] === position) return row;
      }
      return -1;
    }

    /** The position of the key or list place a path token names in a value, or -1 */
    function positionOf(value, token) {
      if (Array.isArray(value)) return token.type === 'index' && token.value >= 0 && token.value < value.length ? token.value : -1;
      return token.type === 'key' ? keysOf(value).indexOf(token.value) : -1;
    }

    function rowOfPath(path) {
      let row = 0;
      let value = data;
      for (const token of Structra.dataPaths.tokenize(path)) {
        if (!isBlockValue(value) || kind[row] !== KIND.OPEN) return -1;
        const position = positionOf(value, token);
        if (position < 0) return -1;
        row = childRow(row, position);
        if (row < 0) return -1;
        value = step(value, row);
      }
      return row;
    }

    function revealPath(path) {
      const changes = [];
      let row = 0;
      let value = data;
      for (const token of Structra.dataPaths.tokenize(path)) {
        if (!isBlockValue(value)) return null;
        if (kind[row] === KIND.CLOSED) changes.push(toggle(row));
        const position = positionOf(value, token);
        if (position < 0) return null;
        let found = childRow(row, position);
        // the child lies beyond the window that shows: show the next windows until it does
        while (found < 0) {
          const moreRow = closeRowOf(row) - 1;
          if (moreRow < 0 || kind[moreRow] !== KIND.MORE) return null;
          changes.push(more(moreRow));
          found = childRow(row, position);
        }
        row = found;
        value = step(value, row);
      }
      return { row, changes };
    }

    /* ---------- start ---------- */

    const openedLevels = firstDepth();
    const first = rebuild((level) => level < openedLevels);

    return {
      get rows() { return rows; },
      get fileLines() { return linesOf(data); },
      initialText: () => first,
      kind: (row) => kind[row],
      depth: (row) => depth[row],
      fileLineOf: (row) => fileLine[row],
      parentOf: (row) => parent[row],
      indexOf: (row) => index[row],
      isBlock, isOpen, closeRowOf,
      pathOf: pathOfRow, valueOf: valueOfRow, keyOf: keyOfRow,
      toggle, more, setDepth, collapseAll, expandAll,
      rowOfPath, revealPath,
    };
  }

  return { create, KIND, WINDOW, INITIAL_ROWS, MAX_ROWS, linesOf };
})();
