/* Design B of docs/codemirror-tree-research.md, as small as it can be while still being honest about cost.
   The CodeMirror document holds only the rows that are showing. A collapsed block is one line ({ ... 14 keys }). Opening a block replaces
   its line with the lines of the block; closing it puts the one line back. The line numbers in the margin are the file's own (what the
   pretty-printed document would have), kept in a typed array that moves with the rows.

   window.spike.run(options) builds a document of `records` records, then times the things a Tree must do fast. */
import { EditorState, EditorView, lineNumbers, ViewPlugin, Decoration, keymap, Prec, RangeSetBuilder } from '/src/libs/codemirror6/editor.js';

const host = document.getElementById('host');

/** A record like a SharePoint list item: about 560 bytes of JSON, 24 lines when printed */
function makeRecord(i) {
  return {
    Id: i, Title: 'Item number ' + i, Cost: (i * 7) % 5000 + 0.5, Approved: i % 2 === 0, Created: '2026-10-28T10:00:00Z',
    Requester: { Email: 'person' + i + '@example.com', Name: 'Person ' + i, Department: 'Dept ' + (i % 40) },
    Tags: [{ Value: 'alpha' + (i % 9) }, { Value: 'beta' + (i % 7) }],
    Notes: 'Some text about item ' + i + ' that is long enough to matter for size, with a few words more.',
    Status: { Value: i % 3 === 0 ? 'Open' : 'Closed', Id: i % 3 },
  };
}

/** How many lines a value takes when printed with 2-space indentation */
function linesOf(value) {
  if (value === null || typeof value !== 'object') return 1;
  const entries = Array.isArray(value) ? value : Object.values(value);
  if (!entries.length) return 1;
  let total = 2;
  for (const item of entries) total += linesOf(item);
  return total;
}

const summary = (value) => (Array.isArray(value) ? `[ ... ${value.length} items ]` : `{ ... ${Object.keys(value).length} keys }`);

/** The Tree model: rows[i] describes line i of the CodeMirror document */
class Model {
  constructor(records) {
    this.records = records;
    // one row per record, collapsed; fileLine[i] is the line (from 0) the row starts at in the pretty-printed file
    this.count = records.length;
    this.fileLine = new Uint32Array(this.count + 2);
    this.recordOf = new Int32Array(this.count + 2).fill(-1);       // which record a row belongs to (-1: the brackets)
    this.span = new Uint32Array(this.count + 2);                    // lines the row stands for in the file
    this.expanded = new Uint8Array(this.count + 2);
    this.rows = this.count + 2;
    this.recordLines = new Uint32Array(this.count);
    let line = 0;
    this.fileLine[0] = line++; this.span[0] = 1;                    // "["
    for (let i = 0; i < this.count; i++) {
      this.recordLines[i] = linesOf(records[i]);
      this.fileLine[i + 1] = line; this.recordOf[i + 1] = i; this.span[i + 1] = this.recordLines[i];
      line += this.recordLines[i];
    }
    this.fileLine[this.count + 1] = line; this.span[this.count + 1] = 1;   // "]"
    this.fileLines = line + 1;
  }

  /** The text of the collapsed document: one line per record */
  initialText() {
    const out = new Array(this.count + 2);
    out[0] = '[';
    for (let i = 0; i < this.count; i++) out[i + 1] = '  ' + summary(this.records[i]) + (i < this.count - 1 ? ',' : '');
    out[this.count + 1] = ']';
    return out.join('\n');
  }
}

/** Replace one row by several (or several by one): the typed arrays move, the CodeMirror document gets one change */
function replaceRows(model, view, rowIndex, removeCount, insertRows, insertText) {
  const { doc } = view.state;
  const from = doc.line(rowIndex + 1).from;
  const to = doc.line(rowIndex + removeCount).to;
  const total = model.rows - removeCount + insertRows.length;
  for (const name of ['fileLine', 'recordOf', 'span', 'expanded']) {
    const old = model[name];
    const next = new old.constructor(total + 2);
    next.set(old.subarray(0, rowIndex), 0);
    for (let k = 0; k < insertRows.length; k++) next[rowIndex + k] = insertRows[k][name];
    next.set(old.subarray(rowIndex + removeCount, model.rows), rowIndex + insertRows.length);
    model[name] = next;
  }
  model.rows = total;
  view.dispatch({ changes: { from, to, insert: insertText } });
}

function expandRow(model, view, rowIndex) {
  const record = model.recordOf[rowIndex];
  const lines = JSON.stringify(model.records[record], null, 2).split('\n').map((line) => '  ' + line);
  const startLine = model.fileLine[rowIndex];
  const rows = lines.map((line, k) => ({ fileLine: startLine + k, recordOf: record, span: 1, expanded: 1 }));
  lines[lines.length - 1] += record < model.count - 1 ? ',' : '';
  replaceRows(model, view, rowIndex, 1, rows, lines.join('\n'));
}

function collapseRows(model, view, rowIndex, lineCount) {
  const record = model.recordOf[rowIndex];
  const row = { fileLine: model.fileLine[rowIndex], recordOf: record, span: lineCount, expanded: 0 };
  replaceRows(model, view, rowIndex, lineCount, [row], '  ' + summary(model.records[record]) + (record < model.count - 1 ? ',' : ''));
}

const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
const heap = () => (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null);
// The change itself (CodeMirror updates its model and draws what is in view inside the dispatch), and the time until the browser has painted
const time = async (fn) => { const start = performance.now(); await fn(); const changed = performance.now() - start; await frame(); return { changedMs: Math.round(changed * 10) / 10, paintedMs: Math.round((performance.now() - start) * 10) / 10 }; };

/* ---- The behaviours the Tree needs besides speed (answers for docs/codemirror-tree-research.md, section "Can CodeMirror do what the Tree does") ---- */
const behaviours = { selectedRow: 0, matches: new Set(), log: [] };

/** Tree semantics for a screen reader and a stable hook for tests and styles: every line showing is a tree item with a level and a state */
function treeLines(model) {
  return ViewPlugin.fromClass(class {
    constructor(view) { this.decorations = this.build(view); this.fixAttributes(view); }
    update(update) {
      if (update.docChanged || update.viewportChanged || update.transactions.some((t) => t.effects.length)) this.decorations = this.build(update.view);
      this.fixAttributes(update.view);
    }
    // CodeMirror marks its content as a multi-line text box; a tree is not one (ARIA does not allow aria-multiline on role=tree).
    // aria-activedescendant must name a row that is drawn: when the selected row is out of view the attribute is left off.
    fixAttributes(view) {
      queueMicrotask(() => {
        view.contentDOM.removeAttribute('aria-multiline');
        view.contentDOM.removeAttribute('aria-readonly');     // CodeMirror adds it for a read-only view; a tree may not carry it
        const element = view.contentDOM.querySelector('#row-' + behaviours.selectedRow);
        if (element) view.contentDOM.setAttribute('aria-activedescendant', 'row-' + behaviours.selectedRow); else view.contentDOM.removeAttribute('aria-activedescendant');
      });
    }
    build(view) {
      const builder = new RangeSetBuilder();
      const { doc } = view.state;
      for (const { from, to } of view.visibleRanges) {
        for (let position = from; position <= to;) {
          const line = doc.lineAt(position);
          const row = line.number - 1;
          const record = model.recordOf[row];
          const level = record < 0 ? 1 : 2;
          const attributes = { role: 'treeitem', 'aria-level': String(level), 'data-row': String(row), id: 'row-' + row };
          if (record >= 0 && !model.expanded[row]) attributes['aria-expanded'] = 'false';
          else if (record >= 0 && model.expanded[row] && /^\s*\{/.test(line.text)) attributes['aria-expanded'] = 'true';
          if (row === behaviours.selectedRow) attributes['aria-selected'] = 'true';
          const classes = 'j-line' + (row === behaviours.selectedRow ? ' highlighted' : '') + (behaviours.matches.has(row) ? ' find-match' : '');
          builder.add(line.from, line.from, Decoration.line({ class: classes, attributes }));
          position = line.to + 1;
        }
      }
      return builder.finish();
    }
  }, { decorations: (plugin) => plugin.decorations });
}

function installBehaviours(model, view) {
  const select = (row) => {
    behaviours.selectedRow = Math.max(0, Math.min(model.rows - 1, row));
    view.dispatch({ effects: EditorView.scrollIntoView(view.state.doc.line(behaviours.selectedRow + 1).from, { y: 'nearest' }) });
  };
  const toggle = (row) => {
    if (model.recordOf[row] < 0) return;
    if (model.expanded[row]) collapseRows(model, view, row, model.span[row] || 25);
    else if (!model.expanded[row]) expandRow(model, view, row);
  };
  view.dispatch({ effects: EditorView.scrollIntoView(0) });
  return { select, toggle };
}

window.spike = {
  async run({ records, expandCount = 2000 }) {
    const out = { records };
    const before = heap();
    const buildStart = performance.now();
    const data = Array.from({ length: records }, (value, i) => makeRecord(i));
    out.buildDataMs = Math.round(performance.now() - buildStart);
    out.jsonMB = Math.round(JSON.stringify(data[0]).length * records / 1048576);

    let model;
    out.model = await time(async () => { model = new Model(data); });
    out.fileLines = model.fileLines;

    let view;
    let controls;
    out.open = await time(async () => {
      view = new EditorView({
        parent: host,
        state: EditorState.create({
          doc: model.initialText(),
          extensions: [
            EditorState.readOnly.of(true),
            EditorView.contentAttributes.of({ role: 'tree', 'aria-label': 'JSON tree', tabindex: '0' }),
            treeLines(model),
            Prec.highest(keymap.of([
              { key: 'ArrowDown', run: () => { controls.select(behaviours.selectedRow + 1); return true; } },
              { key: 'ArrowUp', run: () => { controls.select(behaviours.selectedRow - 1); return true; } },
              { key: 'ArrowRight', run: () => { if (!model.expanded[behaviours.selectedRow]) controls.toggle(behaviours.selectedRow); return true; } },
              { key: 'ArrowLeft', run: () => { if (model.expanded[behaviours.selectedRow]) controls.toggle(behaviours.selectedRow); return true; } },
              { key: 'Enter', run: () => { controls.toggle(behaviours.selectedRow); return true; } },
              { key: 'Home', run: () => { controls.select(0); return true; } },
              { key: 'End', run: () => { controls.select(model.rows - 1); return true; } },
              { key: 'PageDown', run: () => { controls.select(behaviours.selectedRow + 20); return true; } },
              { key: 'PageUp', run: () => { controls.select(behaviours.selectedRow - 20); return true; } },
            ])),
            lineNumbers({ formatNumber: (n) => (n >= 1 && n <= model.rows ? String(model.fileLine[n - 1] + 1) : String(n)) })],
        }),
      });
    });
    controls = installBehaviours(model, view);
    out.heapAfterOpenMB = heap() === null ? null : heap() - before;
    out.documentLines = view.state.doc.lines;

    // the margin shows the file's line numbers
    const gutterTexts = () => [...host.querySelectorAll('.cm-lineNumbers .cm-gutterElement')].map((element) => element.textContent).filter(Boolean);
    out.firstGutter = gutterTexts().slice(0, 3);

    // open one record in the middle, then close it
    const middle = Math.floor(records / 2) + 1;
    view.dispatch({ effects: EditorView.scrollIntoView(view.state.doc.line(middle).from, { y: 'start' }) });
    await frame();
    out.expandOne = await time(async () => expandRow(model, view, middle));
    out.gutterAfterExpand = gutterTexts().slice(0, 4);
    const each = model.recordLines[0];       // every record has the same shape here
    out.linesPerRecord = each;
    out.collapseOne = await time(async () => collapseRows(model, view, middle, each));

    // open many records one by one (what a person does), measuring the slowest
    let slowest = 0;
    for (let k = 0; k < 50; k++) { const t = await time(async () => expandRow(model, view, 1 + k * each)); slowest = Math.max(slowest, t.changedMs); }
    out.fiftyExpandsSlowestChangedMs = slowest;

    // "expand all" of the first expandCount records in one change
    const t0 = performance.now();
    const pieces = [];
    const rows = [];
    let line = model.fileLine[1];
    for (let i = 0; i < expandCount; i++) {
      const text = JSON.stringify(data[i], null, 2).split('\n').map((l) => '  ' + l);
      if (i < model.count - 1) text[text.length - 1] += ',';
      pieces.push(text.join('\n'));
      for (let k = 0; k < text.length; k++) rows.push({ fileLine: line + k, recordOf: i, span: 1, expanded: 1 });
      line += text.length;
    }
    out.expandAllPrepareMs = Math.round(performance.now() - t0);
    // rebuild: current document back to collapsed for the first rows, then insert
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: model.initialText() } });
    Object.assign(model, new Model(data));     // same object: the decorations and the keys hold a reference to it
    await frame();
    const insertAt = view.state.doc.line(2);
    const removeLast = view.state.doc.line(1 + expandCount);
    out.expandAll = await time(async () => {
      const from = insertAt.from, to = removeLast.to;
      const total = model.rows - expandCount + rows.length;
      for (const name of ['fileLine', 'recordOf', 'span', 'expanded']) {
        const old = model[name];
        const next = new old.constructor(total + 2);
        next.set(old.subarray(0, 1), 0);
        for (let k = 0; k < rows.length; k++) next[1 + k] = rows[k][name];
        next.set(old.subarray(1 + expandCount, model.rows), 1 + rows.length);
        model[name] = next;
      }
      model.rows = total;
      view.dispatch({ changes: { from, to, insert: pieces.join('\n') } });
    });
    out.expandAllLines = view.state.doc.lines;

    // keyboard, as a person would use it: focus the tree, move down, open a record, move on
    view.contentDOM.focus();
    const keyTimes = [];
    for (const key of ['ArrowDown', 'ArrowDown', 'ArrowRight', 'ArrowDown', 'ArrowLeft', 'PageDown', 'End', 'Home']) {
      const start = performance.now();
      view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      keyTimes.push(Math.round((performance.now() - start) * 10) / 10);
    }
    await frame();
    out.keyboard = { times: keyTimes, selectedRow: behaviours.selectedRow };
    out.treeAttributes = { role: view.contentDOM.getAttribute('role'), label: view.contentDOM.getAttribute('aria-label'), activeDescendant: view.contentDOM.getAttribute('aria-activedescendant') };
    out.firstItems = [...host.querySelectorAll('.cm-line')].slice(0, 3).map((element) => ({ role: element.getAttribute('role'), level: element.getAttribute('aria-level'), expanded: element.getAttribute('aria-expanded'), selected: element.getAttribute('aria-selected'), cls: element.className.replace(/cm-line ?/, '') }));

    // find marks on rows far from the window: the rows are marked when they scroll in
    for (let k = 0; k < 2000; k++) behaviours.matches.add(1 + k * 40);
    view.dispatch({ effects: EditorView.scrollIntoView(view.state.doc.line(41).from, { y: 'start' }) });
    await frame();
    out.markedRowsShowing = host.querySelectorAll('.cm-line.find-match').length;

    // selecting text across rows and copying it: the selection model is CodeMirror's, over the rows that exist
    view.dispatch({ selection: { anchor: 0, head: Math.min(2000, view.state.doc.length) } });
    out.selectedText = view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to).split('\n').length + ' lines';

    // scroll to the end and to the middle
    out.scrollToEnd = await time(async () => { view.scrollDOM.scrollTop = view.scrollDOM.scrollHeight; });
    out.scrollToMiddle = await time(async () => { view.scrollDOM.scrollTop = view.scrollDOM.scrollHeight / 2; });
    out.heapEndMB = heap() === null ? null : heap() - before;
    out.domLines = host.querySelectorAll('.cm-line').length;
    return out;
  },
};
window.spikeReady = true;
