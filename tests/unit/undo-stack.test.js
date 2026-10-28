/* Undo and Redo keep the document as one whole copy plus small edits. Checked against plain copies of every state: going back and
   forward gives exactly the document each step had, also after a branch, with awkward text, and when the oldest steps are dropped. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function freshStack() {
  const sandbox = { console };
  sandbox.Structra = {};
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'undo-stack.js'), 'utf8'), sandbox);
  return sandbox.Structra.undoStack;
}

// the objects come out of another context, so they are compared as text
const same = (actual, expected, message) => assert.strictEqual(JSON.stringify(actual), JSON.stringify(expected), message);

// a small repeatable random generator
function random(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

function makeDocument(rnd, size) {
  return Array.from({ length: size }, (_, i) => ({ id: i, name: 'item ' + i, tags: ['a', 'b'], nested: { value: Math.round(rnd() * 1000), note: i % 3 ? 'x"y' : 'café 😀' } }));
}

function change(rnd, doc) {
  const copy = JSON.parse(JSON.stringify(doc));
  const kind = Math.floor(rnd() * 6);
  const at = Math.floor(rnd() * copy.length);
  if (kind === 0) copy[at].name = 'renamed ' + Math.floor(rnd() * 100);
  else if (kind === 1) copy.splice(at, 1);
  else if (kind === 2) copy.splice(at, 0, { id: 'new', name: '', tags: [], nested: null });
  else if (kind === 3) copy.reverse();
  else if (kind === 4) copy[at].extra = { deep: [1, 2, { three: 3 }] };
  else delete copy[at].tags;
  return copy;
}

test('undo and redo return exactly the document of every step', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const rnd = random(seed);
    const stack = freshStack();
    const states = [makeDocument(rnd, 30)];
    stack.push(states[0], 'start', 1);
    for (let i = 0; i < 25; i++) {
      const next = change(rnd, states[states.length - 1]);
      if (JSON.stringify(next) === JSON.stringify(states[states.length - 1])) continue;       // a change that changed nothing adds no step
      states.push(next);
      stack.push(next, 'step ' + i, 1);
    }
    for (let i = states.length - 2; i >= 0; i--) same(stack.undo(1), states[i], `seed ${seed}: undo to step ${i}`);
    assert.strictEqual(stack.undo(1), null);
    for (let i = 1; i < states.length; i++) same(stack.redo(1), states[i], `seed ${seed}: redo to step ${i}`);
    assert.strictEqual(stack.redo(1), null);
  }
});

test('a new change after an undo ends the redo path and the history still reads back right', () => {
  const rnd = random(9);
  const stack = freshStack();
  const a = makeDocument(rnd, 10);
  const b = change(rnd, a);
  const c = change(rnd, b);
  const d = change(rnd, b);
  stack.push(a, 'a', 1); stack.push(b, 'b', 1); stack.push(c, 'c', 1);
  same(stack.undo(1), b);
  stack.push(d, 'd', 1);
  assert.strictEqual(stack.canRedo(1), false);
  same(stack.undo(1), b);
  same(stack.undo(1), a);
  same(stack.redo(1), b);
  same(stack.redo(1), d);
});

test('the same document again adds no step; labels and positions stay as before', () => {
  const stack = freshStack();
  stack.push({ a: 1 }, 'start', 1);
  stack.push({ a: 1 }, 'again', 1);
  assert.strictEqual(stack.getHistory(1).length, 1);
  stack.push({ a: 2 }, 'Sort', 1);
  assert.strictEqual(stack.nextUndoLabel(1), 'Sort');
  assert.strictEqual(stack.nextRedoLabel(1), null);
  stack.undo(1);
  assert.strictEqual(stack.nextRedoLabel(1), 'Sort');
  same(stack.current(1), { label: 'start', index: 0, total: 2 });
});

test('text that is awkward for a cut-away comparison: repeats, surrogate pairs, equal ends, empty and tiny documents', () => {
  const stack = freshStack();
  const states = [[], [''], ['a'], ['aa'], ['aaa'], ['aXa'], ['😀'], ['😁'], ['😁😁'], { a: [] }, { a: [1] }, { a: [1, 1] }, { a: [1, 1, 1] }, null, 0, 'text', ''];
  states.forEach((state, i) => stack.push(state, 's' + i, 1));
  for (let i = states.length - 2; i >= 0; i--) same(stack.undo(1), states[i], 'undo to ' + i);
  for (let i = 1; i < states.length; i++) same(stack.redo(1), states[i], 'redo to ' + i);
});

test('a one-key change in a large document costs a few bytes, not another copy', () => {
  const rnd = random(3);
  const stack = freshStack();
  let doc = makeDocument(rnd, 20000);        // about 2 MB of text
  stack.push(doc, 'start', 1);
  for (let i = 0; i < 40; i++) {
    doc = JSON.parse(JSON.stringify(doc));
    doc[(i * 487) % doc.length].name = 'changed ' + i;
    stack.push(doc, 'edit ' + i, 1);
  }
  const size = stack.sizeOf(1);
  assert.strictEqual(size.steps, 41);
  assert.ok(size.whole > 1500000, 'the document should be large: ' + size.whole);
  // before: every step a whole copy of 2 MB (kept to 60 MB, so about 30 of the 41 steps). Now one copy and the edits.
  assert.ok(size.edits < 100000, 'forty small edits should cost little, they cost ' + size.edits);
});

test('more than 50 steps drops the oldest, and the rest still read back right', () => {
  const stack = freshStack();
  for (let i = 0; i < 80; i++) stack.push({ value: i, list: [i, i + 1] }, 'step ' + i, 1);
  assert.strictEqual(stack.getHistory(1).length, 50);
  for (let i = 78; i >= 30; i--) same(stack.undo(1), { value: i, list: [i, i + 1] });
  assert.strictEqual(stack.undo(1), null);
  assert.strictEqual(stack.getHistory(1)[0].label, 'step 30');
});

test('a change that rewrites the whole document is held within the limit, the last two steps always stay', () => {
  const stack = freshStack();
  const big = (letter) => ({ text: letter.repeat(9 * 1024 * 1024) });          // about 9 MB each
  const letters = 'abcdefghijklmnop'.split('');
  for (const letter of letters) stack.push(big(letter), 'rewrite ' + letter, 1);
  const size = stack.sizeOf(1);
  assert.ok(size.edits <= 60 * 1024 * 1024, 'edits held: ' + size.edits);
  assert.ok(size.steps >= 2);
  const last = stack.undo(1);
  assert.strictEqual(last.text[0], letters[letters.length - 2]);
});

test('a document too large to compare is not kept (the change cannot be undone)', () => {
  const stack = freshStack();
  assert.strictEqual(stack.push({ text: 'x'.repeat(26 * 1024 * 1024) }, 'huge', 1), false);
  assert.strictEqual(stack.getHistory(1).length, 0);
});

test('each tab has its own history, and clear removes only that one', () => {
  const stack = freshStack();
  stack.push({ v: 1 }, 'one', 1); stack.push({ v: 2 }, 'two', 1);
  stack.push({ w: 1 }, 'one', 2); stack.push({ w: 2 }, 'two', 2);
  same(stack.undo(1), { v: 1 });
  same(stack.undo(2), { w: 1 });
  stack.clear(1);
  assert.strictEqual(stack.canUndo(1), false);
  assert.strictEqual(stack.canRedo(2), true);
});
