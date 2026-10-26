/* ============================================================
   STRUCTRA V2 - JSON compare
   Structra.jsonDiff - what is different between two JSON values, as a flat list a person can read.

   const result = await Structra.jsonDiff.compare(left, right);
   result.changes   [{ type, path, leftPath, rightPath, left, right }]
                    type is 'added' (only on the right), 'removed' (only on the left), 'changed' (a value differs) or 'moved'
                    (a list item that is the same but sits at another place). Paths look like $.items[2].name.
                    leftPath and rightPath say where the value is on each side: in a list they can differ, because an item
                    added at the start moves every other item down by one.
   result.mode      'smart' or 'position' (see below)
   result.note      a sentence to show the person when the compare was not exact, otherwise ''
   result.delta     the library's own description of the changes (smart mode), used for the JSON Patch

   await Structra.jsonDiff.patchOps(result, left, right)   → the changes as JSON Patch operations (RFC 6902)

   Smart mode uses the jsondiffpatch library (src/libs/jsondiffpatch, MIT). It matches the items of a list instead of
   comparing them by position, so adding one item at the start of a list is one change, not a change to every item.
   Items that are objects are matched by an id-like field (id, _id, key, name, ...) or, when there is none, by their whole
   content.

   Matching list items costs time and memory in proportion to the length of the lists multiplied together. Lists longer
   than MAX_ARRAY are therefore compared by position (position mode): quick and safe on any size, but an item added in the
   middle shows as a change to every item after it. The note says so.

   Both sides stay as they were: nothing here changes the data.
   ============================================================ */

Structra.jsonDiff = (() => {
  /** Lists longer than this are compared by position (matching items is slow and memory-hungry on long lists) */
  const MAX_ARRAY = 1500;
  /** How many values to look at when checking list lengths. A document bigger than this is compared by position. */
  const SCAN_BUDGET = 3000000;
  /** Fields that name a record, tried in this order, to tell which item of a list is which */
  const ID_KEYS = ['id', 'Id', 'ID', '_id', 'key', 'Key', 'guid', 'uuid', 'ItemInternalId', 'name', 'Name'];

  let diffLibrary = null;          // the jsondiffpatch module
  let patchFormat = null;  // its JSON Patch formatter

  /** Give the library (used by the tests, which load it in Node) */
  function use(library, jsonPatchFormatter) {
    diffLibrary = library;
    patchFormat = jsonPatchFormatter;
  }

  async function ready() {
    if (diffLibrary && patchFormat) return;
    diffLibrary = await Structra.libraryLoader.loadLibrary('jsondiffpatch');
    patchFormat = await Structra.libraryLoader.loadLibrary('jsondiffpatch-jsonpatch');
  }

  /** The longest list in a value, or Infinity when the value is too big to look through */
  function longestList(value) {
    let longest = 0;
    let seen = 0;
    const stack = [value];
    while (stack.length) {
      const current = stack.pop();
      if (current === null || typeof current !== 'object') continue;
      if (++seen > SCAN_BUDGET) return Infinity;
      if (Array.isArray(current)) {
        if (current.length > longest) longest = current.length;
        if (longest > MAX_ARRAY) return longest;
        for (let i = 0; i < current.length; i++) stack.push(current[i]);
      } else {
        for (const key in current) stack.push(current[key]);
      }
    }
    return longest;
  }

  /** How to tell which item is which: the id-like field if there is one, otherwise the whole content */
  function objectHash(item) {
    if (item === null || typeof item !== 'object') return undefined;
    if (!Array.isArray(item)) {
      for (const idKey of ID_KEYS) {
        const idValue = item[idKey];
        if (idValue !== undefined && idValue !== null && typeof idValue !== 'object') return idKey + ':' + idValue;
      }
    }
    return JSON.stringify(item);
  }

  /* ---------- the library's description of the changes -> a flat list ---------- */

  const keyPath = (base, key) => base + '.' + key;
  const indexPath = (base, i) => base + '[' + i + ']';

  function add(out, type, leftPath, rightPath, left, right) {
    out.push({ type, path: type === 'removed' ? leftPath : rightPath, leftPath, rightPath, left, right });
  }

  function fromDelta(delta, left, right, leftPath, rightPath, out) {
    if (delta === undefined || delta === null) return;
    if (Array.isArray(delta)) {                               // a whole value was added, changed or removed
      if (delta.length === 1) add(out, 'added', undefined, rightPath, undefined, delta[0]);
      else if (delta.length === 2) add(out, 'changed', leftPath, rightPath, delta[0], delta[1]);
      else if (delta[2] === 0) add(out, 'removed', leftPath, undefined, delta[0], undefined);
      return;
    }
    if (delta._t === 'a') { fromListDelta(delta, left, right, leftPath, rightPath, out); return; }
    for (const key of Object.keys(delta)) {
      const child = delta[key];
      const leftChild = left !== null && typeof left === 'object' ? left[key] : undefined;
      const rightChild = right !== null && typeof right === 'object' ? right[key] : undefined;
      const lpath = keyPath(leftPath, key);
      const rpath = keyPath(rightPath, key);
      if (Array.isArray(child)) {
        if (child.length === 1) add(out, 'added', undefined, rpath, undefined, child[0]);
        else if (child.length === 2) add(out, 'changed', lpath, rpath, child[0], child[1]);
        else if (child[2] === 0) add(out, 'removed', lpath, undefined, child[0], undefined);
      } else {
        fromDelta(child, leftChild, rightChild, lpath, rpath, out);
      }
    }
  }

  /**
   * A list's changes. The library names removed and moved items by their place in the left list ("_3"), and added and
   * changed items by their place in the right list ("5"). To say where a changed item was on the left, the items that
   * stayed are lined up in order on both sides.
   */
  function fromListDelta(delta, leftList, rightList, leftPath, rightPath, out) {
    const removed = new Set();
    const movedFrom = new Map();      // place on the left -> place on the right
    const inserted = new Map();       // place on the right -> the new value
    const nested = [];                // [place on the right, change]
    for (const key of Object.keys(delta)) {
      if (key === '_t') continue;
      const change = delta[key];
      if (key[0] === '_') {
        const i = Number(key.slice(1));
        if (Array.isArray(change) && change[2] === 3) movedFrom.set(i, change[1]);
        else removed.add(i);
      } else {
        const j = Number(key);
        if (Array.isArray(change) && change.length === 1) inserted.set(j, change[0]);
        else nested.push([j, change]);
      }
    }
    const movedTo = new Set(movedFrom.values());
    const stayedLeft = [];
    for (let i = 0; i < leftList.length; i++) if (!removed.has(i) && !movedFrom.has(i)) stayedLeft.push(i);
    const stayedRight = [];
    for (let j = 0; j < rightList.length; j++) if (!inserted.has(j) && !movedTo.has(j)) stayedRight.push(j);
    const leftOf = new Map();
    stayedRight.forEach((j, index) => leftOf.set(j, stayedLeft[index]));
    movedFrom.forEach((j, i) => leftOf.set(j, i));

    removed.forEach((i) => add(out, 'removed', indexPath(leftPath, i), undefined, leftList[i], undefined));
    inserted.forEach((value, j) => add(out, 'added', undefined, indexPath(rightPath, j), undefined, value));
    movedFrom.forEach((j, i) => add(out, 'moved', indexPath(leftPath, i), indexPath(rightPath, j), leftList[i], rightList[j]));
    for (const [j, change] of nested) {
      const i = leftOf.has(j) ? leftOf.get(j) : j;
      if (Array.isArray(change)) add(out, 'changed', indexPath(leftPath, i), indexPath(rightPath, j), change[0], change[1]);
      else fromDelta(change, leftList[i], rightList[j], indexPath(leftPath, i), indexPath(rightPath, j), out);
    }
  }

  /* ---------- position mode: any size, lists compared item by item ---------- */

  function byPosition(left, right, leftPath, rightPath, out) {
    if (left === right) return;
    const bothObjects = left !== null && right !== null && typeof left === 'object' && typeof right === 'object';
    if (!bothObjects || Array.isArray(left) !== Array.isArray(right)) {
      add(out, 'changed', leftPath, rightPath, left, right);
      return;
    }
    if (Array.isArray(left)) {
      const max = Math.max(left.length, right.length);
      for (let i = 0; i < max; i++) {
        if (i >= left.length) add(out, 'added', undefined, indexPath(rightPath, i), undefined, right[i]);
        else if (i >= right.length) add(out, 'removed', indexPath(leftPath, i), undefined, left[i], undefined);
        else byPosition(left[i], right[i], indexPath(leftPath, i), indexPath(rightPath, i), out);
      }
      return;
    }
    for (const key of Object.keys(left)) {
      if (!(key in right)) add(out, 'removed', keyPath(leftPath, key), undefined, left[key], undefined);
      else byPosition(left[key], right[key], keyPath(leftPath, key), keyPath(rightPath, key), out);
    }
    for (const key of Object.keys(right)) {
      if (!(key in left)) add(out, 'added', undefined, keyPath(rightPath, key), undefined, right[key]);
    }
  }

  /* ---------- public ---------- */

  async function compare(left, right) {
    const out = [];
    const longest = Math.max(longestList(left), longestList(right));
    if (longest > MAX_ARRAY) {
      byPosition(left, right, '$', '$', out);
      return {
        changes: out,
        mode: 'position',
        note: 'Some lists are long (over ' + MAX_ARRAY.toLocaleString() + ' items), so their items are compared by position. An item added in the middle of such a list shows as a change to every item after it.',
      };
    }
    await ready();
    const differ = diffLibrary.create({ objectHash, arrays: { detectMove: true, includeValueOnMove: false }, cloneDiffValues: false });
    const delta = differ.diff(left, right);
    fromDelta(delta, left, right, '$', '$', out);
    return { changes: out, mode: 'smart', note: '', delta };
  }

  /** The changes as JSON Patch (RFC 6902) operations */
  async function patchOps(result, left, right) {
    if (result.mode === 'smart') {
      await ready();
      return result.delta === undefined ? [] : patchFormat.format(result.delta);
    }
    return Structra.jsonRepairAndValidation.patch(left, right);
  }

  return { compare, patchOps, use, MAX_ARRAY };
})();
