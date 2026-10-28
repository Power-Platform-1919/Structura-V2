/* ============================================================
   STRUCTRA V2 - JSON Tree Renderer
   The Tree, drawn by CodeMirror. The CodeMirror document holds only the rows that are showing: a closed block is one row, opening it
   replaces that row by the rows of the block (src/core/tree-model.js keeps the rows; docs/codemirror-tree-research.md says why).
   CodeMirror draws only the lines in view, so a 90 MB document is about 85 lines in the page.

   What a person sees and what the tests look at are the same as before: every line is a .j-line with data-path and data-ln (its line
   number in the file), keys are .j-key, values .j-str .j-num .j-bool .j-null, blocks have a .j-toggle and closed blocks a .j-ellipsis,
   the selected line is .highlighted, search results .find-match, bookmarks .bookmarked.

   API (the same as the renderer before it; the work now happens when CodeMirror has loaded, so calls made before then wait):
     Structra.jsonTreeRenderer.render(container, data, opts)       opts.onPathSelect(path), opts.onContextMenu(x, y, path)
     Structra.jsonTreeRenderer.expandAll(container)                open every block (a document of millions of lines opens as far as MAX_ROWS)
     Structra.jsonTreeRenderer.collapseAll(container)
     Structra.jsonTreeRenderer.collapseToDepth(container, depth)
     Structra.jsonTreeRenderer.highlightPath(container, path)      select a line (opening what is above it, scrolling to it)
     Structra.jsonTreeRenderer.highlightPaths(container, paths)    mark search results and go to the first
     Structra.jsonTreeRenderer.updateBookmarkHighlights(container, bookmarks)
     Structra.jsonTreeRenderer.highlightKeyByName(container, keyName)
     Structra.jsonTreeRenderer.setFilter(container, matchedPaths)  show only the matches and the blocks above them
     Structra.jsonTreeRenderer.clearFilter(container)
     Structra.jsonTreeRenderer.setWrap(container, on)              long values wrap onto several lines

   Wiring (generated from the code below; update it when you add or remove an event):
     Emits: tree:search-key, loading:show, loading:hide, tree:inline-edit
   ============================================================ */

window.Structra = window.Structra || {};

Structra.jsonTreeRenderer = (() => {
  'use strict';

  const K = Structra.treeModel.KIND;
  const CLICK_DELAY = 250;            // a click waits this long, so a double click does not also select
  const LONG_LINE = 20000;            // a line longer than this is shown as plain text (colouring it would cost more than it is worth)

  // Characters that cannot be seen or that change how text reads (control characters, zero width characters, the ones that flip the reading
  // direction). The Editor shows them too: a value that looks like "admin" but holds a hidden character is not the same value.
  // Built from character codes, so no invisible character has to be typed into this file
  const SPECIAL_CHARS = new RegExp('[' + ['0000-0008', '000b', '000c', '000e-001f', '007f-009f', '00ad', '061c', '200b', '200e', '200f', '2028', '2029', '202a-202e', '2066-2069', 'feff', 'fff9-fffc']
    .map((range) => range.split('-').map((hex) => String.fromCharCode(parseInt(hex, 16))).join('-')).join('') + ']', 'g');
  const KEY_PREFIX = /^( *)("(?:[^"\\]|\\.)*": )?/;
  const ESCAPE = /\\(?:u[0-9a-fA-F]{4}|.)/g;

  let library = null;                 // the CodeMirror pieces, once loaded
  const states = new WeakMap();       // container -> what the tree there is showing

  const stripPath = (path) => Structra.dataPaths.strip(path);
  const tick = Structra.sharedHelpers.waitForNextTick;

  /** Run a function on the tree of a container once its view exists (CodeMirror may still be loading) */
  function whenReady(container, work) {
    const state = states.get(container);
    if (!state) return;
    if (state.view) work(state); else state.waiting.push(work);
  }

  /* ============================
     DRAWING A LINE
     ============================ */

  function makeWidgets() {
    const { WidgetType } = library;
    class ToggleWidget extends WidgetType {
      constructor(open) { super(); this.open = open; }
      eq(other) { return other.open === this.open; }
      toDOM() {
        const element = document.createElement('span');
        element.className = 'j-toggle';
        element.textContent = this.open ? '▼' : '▶';
        element.title = this.open ? 'Collapse' : 'Expand';
        return element;
      }
      ignoreEvent() { return false; }
    }
    class SpecialWidget extends WidgetType {
      constructor(character) { super(); this.character = character; }
      eq(other) { return other.character === this.character; }
      toDOM() {
        const code = this.character.charCodeAt(0);
        const element = document.createElement('span');
        element.className = 'j-special';
        element.title = 'U+' + code.toString(16).toUpperCase().padStart(4, '0');
        element.textContent = code < 0x20 ? String.fromCharCode(0x2400 + code) : code === 0x7f ? '␡' : '•';
        return element;
      }
    }
    class EditWidget extends WidgetType {
      constructor(initial, onCommit, onCancel) { super(); this.initial = initial; this.onCommit = onCommit; this.onCancel = onCancel; }
      eq() { return false; }
      ignoreEvent() { return true; }
      toDOM() {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'j-inline-edit';
        input.value = this.initial;
        input.style.cssText = 'font-family:var(--font-mono);font-size:inherit;padding:0 2px;border:1px solid var(--accent);border-radius:3px;background:var(--surface);color:var(--text);outline:none;min-width:40px;width:' + Math.max(60, this.initial.length * 8 + 24) + 'px;';
        let finished = false;
        input.addEventListener('blur', () => { if (!finished) { finished = true; this.onCommit(input.value); } });
        input.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') { event.preventDefault(); input.blur(); }
          if (event.key === 'Escape') { event.preventDefault(); finished = true; this.onCancel(); }
        });
        requestAnimationFrame(() => { input.focus(); input.select(); });
        return input;
      }
    }
    return { ToggleWidget, SpecialWidget, EditWidget };
  }

  /** The marks of a line: what a colour, a click or a double click is attached to. Returns a list of { from, to, decoration }. */
  function lineMarks(state, row, line, path, widgets) {
    const { Decoration } = library;
    const { model } = state;
    const kind = model.kind(row);
    const text = line.text;
    const marks = [];
    const add = (from, to, decoration) => marks.push({ from: line.from + from, to: line.from + to, decoration });
    const mark = (from, to, className, extra) => add(from, to, Decoration.mark({ class: className, attributes: Object.assign({ 'data-path': path }, extra) }));
    if (text.length > LONG_LINE) return marks;

    if (kind === K.MORE) { mark(0, text.length, 'j-muted'); return marks; }
    const prefix = KEY_PREFIX.exec(text);
    const indent = prefix[1].length;
    let valueStart = indent;
    if (prefix[2]) {
      const keyText = prefix[2].slice(0, -2);
      const highlighted = state.keyHighlightName !== null && keyText.slice(1, -1) === state.keyHighlightName;
      mark(indent, indent + keyText.length, 'j-key' + (highlighted ? ' j-key-hl' : ''));
      valueStart = indent + prefix[2].length;
    }
    const bare = text.endsWith(',') ? text.length - 1 : text.length;
    if (kind === K.CLOSE) { mark(valueStart, valueStart + 1, 'j-bracket'); return marks; }
    if (kind === K.OPEN) {
      add(valueStart, valueStart, Decoration.widget({ widget: new widgets.ToggleWidget(true), side: -1 }));
      mark(valueStart, valueStart + 1, 'j-bracket');
      return marks;
    }
    if (kind === K.CLOSED) {
      add(valueStart, valueStart, Decoration.widget({ widget: new widgets.ToggleWidget(false), side: -1 }));
      mark(valueStart, valueStart + 1, 'j-bracket');
      mark(valueStart + 1, bare, 'j-ellipsis');
      return marks;
    }
    if (kind === K.EMPTY) { mark(valueStart, bare, 'j-bracket'); return marks; }

    // a value on its own line
    const first = text[valueStart];
    const match = state.filterMatched && state.filterMatched.has(path) ? ' filter-match' : '';
    if (first === '"') {
      mark(valueStart, bare, 'j-str' + match);
      const body = text.slice(valueStart, bare);
      ESCAPE.lastIndex = 0;
      for (let found = ESCAPE.exec(body); found; found = ESCAPE.exec(body)) add(valueStart + found.index, valueStart + found.index + found[0].length, Decoration.mark({ class: 'j-esc' }));
      SPECIAL_CHARS.lastIndex = 0;
      for (let found = SPECIAL_CHARS.exec(body); found; found = SPECIAL_CHARS.exec(body)) add(valueStart + found.index, valueStart + found.index + 1, Decoration.replace({ widget: new widgets.SpecialWidget(found[0]) }));
    } else if (first === 't' || first === 'f') mark(valueStart, bare, 'j-bool' + match);
    else if (first === 'n') mark(valueStart, bare, 'j-null' + match);
    else mark(valueStart, bare, 'j-num' + match);
    return marks;
  }

  /** The decorations of the lines in view: the line itself (its classes and attributes), then its marks, in the order CodeMirror needs */
  function buildDecorations(view, state, widgets) {
    const { Decoration, RangeSetBuilder } = library;
    const { model } = state;
    const doc = view.state.doc;
    const found = [];
    for (const range of view.visibleRanges) {
      for (let position = range.from; position <= range.to;) {
        const line = doc.lineAt(position);
        const row = line.number - 1;
        position = line.to + 1;
        if (row >= model.rows) continue;
        const kind = model.kind(row);
        const path = model.pathOf(row);
        const selected = row === state.highlightedRow;
        let classes = 'j-line' + (kind === K.CLOSE ? ' j-close' : '') + (selected ? ' highlighted' : '');
        if (state.findPaths && state.findPaths.has(path) && kind !== K.CLOSE) classes += ' find-match';
        if (state.bookmarkPaths && state.bookmarkPaths.has(path) && kind !== K.CLOSE) classes += ' bookmarked';
        const attributes = { 'data-path': path, 'data-ln': kind === K.MORE ? '' : String(model.fileLineOf(row) + 1), role: 'treeitem', 'aria-level': String(model.depth(row) + 1), id: 'tree-row-' + row };
        if (kind === K.OPEN) attributes['aria-expanded'] = 'true';
        if (kind === K.CLOSED) attributes['aria-expanded'] = 'false';
        if (selected) attributes['aria-selected'] = 'true';
        found.push({ from: line.from, to: line.from, decoration: Decoration.line({ class: classes, attributes }) });
        const edit = state.editing && state.editing.row === row ? state.editing : null;
        if (edit) { found.push({ from: line.from + edit.from, to: line.from + edit.to, decoration: Decoration.replace({ widget: new widgets.EditWidget(edit.initial, edit.commit, edit.cancel) }) }); continue; }
        for (const mark of lineMarks(state, row, line, path, widgets)) found.push(mark);
      }
    }
    found.sort((a, b) => a.from - b.from || a.decoration.startSide - b.decoration.startSide || a.to - b.to);
    const builder = new RangeSetBuilder();
    for (const item of found) builder.add(item.from, item.to, item.decoration);
    return builder.finish();
  }

  /* ============================
     THE VIEW
     ============================ */

  function createView(container, state) {
    const { EditorView, EditorState, ViewPlugin, StateEffect, Prec, keymap, Compartment } = library;
    const widgets = makeWidgets();
    const refreshEffect = StateEffect.define();
    state.refreshEffect = refreshEffect;
    state.wrapCompartment = new Compartment();

    const lines = ViewPlugin.fromClass(class {
      constructor(view) { this.decorations = buildDecorations(view, state, widgets); this.fix(view); }
      update(update) {
        if (update.docChanged || update.viewportChanged || update.transactions.some((transaction) => transaction.effects.some((effect) => effect.is(refreshEffect)))) this.decorations = buildDecorations(update.view, state, widgets);
        this.fix(update.view);
      }
      // CodeMirror marks its content as a multi-line text box and read-only; a tree is neither (ARIA does not allow these on role=tree).
      // aria-activedescendant must name a row that is drawn, so it is left off when the selected row is out of view.
      fix(view) {
        queueMicrotask(() => {
          if (!view.contentDOM.isConnected) return;
          view.contentDOM.removeAttribute('aria-multiline');
          view.contentDOM.removeAttribute('aria-readonly');
          const element = state.highlightedRow >= 0 ? view.contentDOM.querySelector('#tree-row-' + state.highlightedRow) : null;
          if (element) view.contentDOM.setAttribute('aria-activedescendant', 'tree-row-' + state.highlightedRow); else view.contentDOM.removeAttribute('aria-activedescendant');
        });
      }
    }, { decorations: (plugin) => plugin.decorations });

    // The row an event happened in: found from the line element it hit (so a click made by code, or by assistive technology, which has
    // no coordinates, works), else from where the pointer is
    const rowAtEvent = (event, view) => {
      const lineElement = event.target.closest && event.target.closest('.cm-line');
      let position = lineElement ? view.posAtDOM(lineElement) : view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (position === null || position === undefined) position = -1;
      return position < 0 ? -1 : view.state.doc.lineAt(position).number - 1;
    };

    const handlers = EditorView.domEventHandlers({
      click(event, view) {
        const target = event.target;
        const row = rowAtEvent(event, view);
        if (row < 0) return false;
        if (target.closest('.j-toggle') || target.closest('.j-ellipsis')) { toggleRow(state, row); return true; }
        if (state.model.kind(row) === K.MORE) { showMore(state, row); return true; }
        const key = target.closest('.j-key');
        if (key) {
          setKeyHighlight(state, key.textContent.replace(/^"|"$/g, ''));
        } else if (state.keyHighlightName !== null) setKeyHighlight(state, null);
        const path = state.model.pathOf(row);
        if (state.opts.onPathSelect) { clearTimeout(state.clickTimer); state.clickTimer = setTimeout(() => state.opts.onPathSelect(path), CLICK_DELAY); }
        return false;
      },
      dblclick(event, view) {
        clearTimeout(state.clickTimer);
        const row = rowAtEvent(event, view);
        if (row < 0) return false;
        const key = event.target.closest('.j-key');
        if (key) { Structra.events.emit('tree:search-key', key.textContent.replace(/^"|"$/g, '')); return true; }
        if (event.target.closest('.j-str, .j-num, .j-bool, .j-null')) { startInlineEdit(state, row); return true; }
        return false;
      },
      contextmenu(event, view) {
        const row = rowAtEvent(event, view);
        if (row < 0 || !state.opts.onContextMenu) return false;
        event.preventDefault();
        state.opts.onContextMenu(event.clientX, event.clientY, state.model.pathOf(row));
        return true;
      },
    });

    // Up and Down move between lines, PageUp and PageDown by a page, Right opens and Left closes a block, Enter selects the line,
    // Space opens or closes the block. They run before CodeMirror's own keys, which would move a text cursor.
    const move = (change) => () => { selectByKey(state, change); return true; };
    const keys = Prec.highest(keymap.of([
      // with no line selected yet, Down selects the first line (row -1 plus one)
      { key: 'ArrowDown', run: move((row) => row + 1) },
      { key: 'ArrowUp', run: move((row) => row - 1) },
      { key: 'Home', run: move(() => 0) },
      { key: 'End', run: move((row, count) => count - 1) },
      { key: 'PageDown', run: move((row, count, page) => Math.max(row, 0) + page) },
      { key: 'PageUp', run: move((row, count, page) => Math.max(row, 0) - page) },
      { key: 'ArrowRight', run: () => { const row = state.highlightedRow; if (row >= 0 && state.model.kind(row) === K.CLOSED) toggleRow(state, row); else selectByKey(state, (at) => at + 1); return true; } },
      { key: 'ArrowLeft', run: () => { const row = state.highlightedRow; if (row >= 0 && state.model.kind(row) === K.OPEN) toggleRow(state, row); return true; } },
      { key: 'Enter', run: () => { const row = state.highlightedRow; if (row >= 0 && state.model.kind(row) === K.MORE) showMore(state, row); else selectByKey(state, (at) => Math.max(at, 0)); return true; } },
      { key: ' ', run: () => { const row = state.highlightedRow; if (row >= 0) toggleRow(state, row); return true; } },
    ]));

    state.view = new EditorView({
      parent: container,
      state: EditorState.create({
        doc: state.model.initialText(),
        extensions: [
          EditorState.readOnly.of(true),
          EditorView.contentAttributes.of({ role: 'tree', 'aria-label': 'JSON tree. Arrow keys move, Left and Right fold, Enter selects.', tabindex: '0', inputmode: 'none' }),
          state.wrapCompartment.of(state.wrap ? EditorView.lineWrapping : []),
          lines, handlers, keys,
        ],
      }),
    });
    container.style.setProperty('--ln-digits', String(Math.max(2, String(state.model.fileLines).length)));
  }

  /* ============================
     CHANGING WHAT SHOWS
     ============================ */

  function refresh(state) {
    if (state.view) state.view.dispatch({ effects: state.refreshEffect.of(null) });
  }

  /** Put a change from the model into the document */
  function applyChange(state, change) {
    const { doc } = state.view.state;
    const from = doc.line(change.at + 1).from;
    const to = doc.line(change.at + change.removeRows).to;
    state.view.dispatch({ changes: { from, to, insert: change.text } });
  }

  function replaceDocument(state, text) {
    state.view.dispatch({ changes: { from: 0, to: state.view.state.doc.length, insert: text } });
  }

  /** The row of the selected path, now that rows may have moved */
  function syncSelected(state) {
    state.highlightedRow = state.highlightedPath === null ? -1 : state.model.rowOfPath(state.highlightedPath);
  }

  function toggleRow(state, row) {
    const change = state.model.toggle(row);
    if (!change) return;
    applyChange(state, change);
    syncSelected(state);
    refresh(state);
  }

  function showMore(state, row) {
    const change = state.model.more(row);
    if (!change) return;
    applyChange(state, change);
    syncSelected(state);
    refresh(state);
  }

  function scrollToRow(state, row, center) {
    const line = state.view.state.doc.line(row + 1);
    state.view.dispatch({ effects: library.EditorView.scrollIntoView(line.from, { y: center ? 'center' : 'nearest' }) });
  }

  function isRowInView(state, row) {
    const line = state.view.state.doc.line(row + 1);
    return state.view.visibleRanges.some((range) => line.from >= range.from && line.from <= range.to);
  }

  function selectRow(state, row, fromKeyboard) {
    row = Math.max(0, Math.min(state.model.rows - 1, row));
    const path = state.model.pathOf(row);
    state.highlightedPath = path;
    state.highlightedRow = row;
    refresh(state);
    scrollToRow(state, row, false);
    if (fromKeyboard && state.opts.onPathSelect) state.opts.onPathSelect(path);
  }

  function selectByKey(state, next) {
    if (!state.model.rows) return;
    const page = Math.max(1, Math.floor(state.view.scrollDOM.clientHeight / (state.view.defaultLineHeight || 22)) - 1);
    selectRow(state, next(state.highlightedRow, state.model.rows, page), true);
  }

  function setKeyHighlight(state, name) {
    state.keyHighlightName = name;
    refresh(state);
  }

  /** Edit a value in place: the value text is swapped for a text box; leaving it (or Enter) asks the command layer to make the change */
  function startInlineEdit(state, row) {
    const model = state.model;
    const path = model.pathOf(row);
    const value = model.valueOf(row);
    if (value !== null && typeof value === 'object') return;
    const line = state.view.state.doc.line(row + 1);
    const prefix = KEY_PREFIX.exec(line.text);
    const from = prefix[0].length;
    const to = line.text.endsWith(',') ? line.text.length - 1 : line.text.length;
    const finish = () => { state.editing = null; refresh(state); };
    state.editing = {
      row, from, to,
      initial: value === null ? 'null' : String(value),
      cancel: finish,
      commit: (raw) => {
        let newValue;
        if (raw === 'null') newValue = null;
        else if (raw === 'true') newValue = true;
        else if (raw === 'false') newValue = false;
        else if (raw !== '' && !isNaN(Number(raw)) && raw.trim() === raw) newValue = Number(raw);
        else newValue = raw;
        finish();
        // The command layer makes the change: it keeps the original for Undo, marks the tab and refreshes every view
        Structra.events.emit('tree:inline-edit', { path, value: newValue });
      },
    };
    refresh(state);
  }

  /* ============================
     PUBLIC
     ============================ */

  async function render(container, data, options) {
    cleanup(container);
    container.innerHTML = '';
    if (!data) { container.innerHTML = '<span class="j-muted">No data</span>'; return; }
    const started = performance.now();
    const state = {
      data, opts: options || {}, model: Structra.treeModel.create(data), view: null, waiting: [], refreshEffect: null,
      highlightedPath: null, highlightedRow: -1, findPaths: null, bookmarkPaths: null, keyHighlightName: null,
      filterMatched: null, savedText: null, baseModel: null, editing: null, clickTimer: null, wrap: container.classList.contains('wrap-mode'),
    };
    states.set(container, state);
    if (!library) library = await Structra.libraryLoader.loadLibrary('codemirror6');
    // the container may have been given a newer document while the library loaded
    if (states.get(container) !== state) return;
    createView(container, state);
    for (const work of state.waiting.splice(0)) work(state);
    Structra.log.perf('JsonTree', 'render() total (' + state.model.rows + ' rows)', performance.now() - started);
    Structra.events.emit('tree:view-ready');
  }

  function cleanup(container) {
    const state = states.get(container);
    if (!state) return;
    clearTimeout(state.clickTimer);
    if (state.view) state.view.destroy();
    states.delete(container);
  }

  async function withSpinner(message, work) {
    Structra.events.emit('loading:show', message);
    await tick();
    try { work(); } finally { Structra.events.emit('loading:hide'); }
  }

  /**
   * After the rows were made again (collapse all, a filter, clearing it): show the selected path again, opening what is above it. The path is
   * remembered by its text, not by its row, because the rows have just changed. Returns whether the selected line is showing.
   */
  function reselect(state) {
    syncSelected(state);
    if (state.highlightedPath !== null && state.highlightedRow < 0) {
      const found = state.model.revealPath(state.highlightedPath);
      if (found) { for (const change of found.changes) applyChange(state, change); syncSelected(state); }
    }
    refresh(state);
    return state.highlightedRow >= 0;
  }

  /** After the rows were all made again: go to the selected line if it is there, else to the top */
  function afterRebuild(state) {
    if (reselect(state)) scrollToRow(state, state.highlightedRow, true);
    else state.view.dispatch({ effects: library.EditorView.scrollIntoView(0) });
  }

  function expandAll(container) {
    return new Promise((resolve) => whenReady(container, (state) => {
      withSpinner('Expanding all…', () => {
        const { text, capped } = state.model.expandAll();
        replaceDocument(state, text);
        afterRebuild(state);
        if (capped) Structra.toast(`Opened the first ${Structra.treeModel.MAX_ROWS.toLocaleString()} lines. The blocks after that stay closed: open them one by one.`);
      }).then(resolve);
    }));
  }

  function collapseAll(container) {
    return new Promise((resolve) => whenReady(container, (state) => {
      withSpinner('Collapsing all…', () => { replaceDocument(state, state.model.collapseAll().text); afterRebuild(state); }).then(resolve);
    }));
  }

  function collapseToDepth(container, depth) {
    return new Promise((resolve) => whenReady(container, (state) => {
      withSpinner('Collapsing…', () => { replaceDocument(state, state.model.setDepth(depth).text); afterRebuild(state); }).then(resolve);
    }));
  }

  function highlightPath(container, path) {
    whenReady(container, (state) => {
      if (!path) { state.highlightedPath = null; state.highlightedRow = -1; refresh(state); return; }
      const target = stripPath(path);
      // remembered even if it is not showing now: a rebuild that is still to come (a filter being applied) may show it
      state.highlightedPath = target;
      const found = state.model.revealPath(target);
      if (!found) { state.highlightedRow = -1; refresh(state); return; }
      for (const change of found.changes) applyChange(state, change);
      state.highlightedRow = found.row;
      refresh(state);
      scrollToRow(state, found.row, !isRowInView(state, found.row));
    });
  }

  function highlightPaths(container, paths) {
    whenReady(container, (state) => {
      const list = [...(Array.isArray(paths) ? paths : paths || [])].map(stripPath);
      state.findPaths = list.length ? new Set(list) : null;
      refresh(state);
      if (!list.length) return;
      const found = state.model.revealPath(list[0]);
      if (!found) return;
      for (const change of found.changes) applyChange(state, change);
      syncSelected(state);
      refresh(state);
      scrollToRow(state, found.row, true);
    });
  }

  function updateBookmarkHighlights(container, bookmarks) {
    whenReady(container, (state) => {
      const set = new Set([...(bookmarks || [])].map(stripPath));
      state.bookmarkPaths = set.size ? set : null;
      refresh(state);
    });
  }

  function highlightKeyByName(container, keyName) {
    whenReady(container, (state) => {
      setKeyHighlight(state, keyName || null);
      if (!keyName) return;
      // go to the first line that has the key, when none shows
      const pattern = new RegExp('^ *' + JSON.stringify(keyName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ': ');
      const doc = state.view.state.doc;
      for (let number = 1; number <= doc.lines; number++) { if (pattern.test(doc.line(number).text)) { scrollToRow(state, number - 1, true); break; } }
    });
  }

  /** Show only the matches and the blocks above them (as many rows as that takes); the whole tree comes back with clearFilter */
  function setFilter(container, matchedPaths) {
    return new Promise((resolve) => whenReady(container, (state) => {
      const paths = [...matchedPaths].map(stripPath);
      if (!paths.length) { clearFilter(container).then(resolve); return; }
      withSpinner('Applying filter…', () => {
        if (!state.baseModel) { state.baseModel = state.model; state.savedText = state.view.state.doc.toString(); state.savedPath = state.highlightedPath; }
        state.filterMatched = new Set(paths);
        state.model = Structra.treeModel.create(state.data, { filter: Structra.treeModel.makeFilter(paths) });
        replaceDocument(state, state.model.initialText());
        if (reselect(state)) scrollToRow(state, state.highlightedRow, !isRowInView(state, state.highlightedRow));
      }).then(resolve);
    }));
  }

  function clearFilter(container) {
    return new Promise((resolve) => whenReady(container, (state) => {
      if (!state.baseModel) { resolve(); return; }
      withSpinner('Clearing filter…', () => {
        state.model = state.baseModel;
        state.baseModel = null;
        state.filterMatched = null;
        replaceDocument(state, state.savedText);
        state.savedText = null;
        if (reselect(state)) scrollToRow(state, state.highlightedRow, !isRowInView(state, state.highlightedRow));
      }).then(resolve);
    }));
  }

  function setWrap(container, on) {
    whenReady(container, (state) => {
      state.wrap = !!on;
      state.view.dispatch({ effects: state.wrapCompartment.reconfigure(on ? library.EditorView.lineWrapping : []) });
    });
  }

  return { render, expandAll, collapseAll, collapseToDepth, highlightPath, highlightPaths, highlightKeyByName, updateBookmarkHighlights, setFilter, clearFilter, setWrap };
})();

// CodeMirror is the first thing the Tree needs: fetch it while the page is idle, so the first Tree does not wait for the download
if (Structra.sharedHelpers.runWhenIdle && typeof document !== 'undefined') {
  Structra.sharedHelpers.runWhenIdle(() => { Structra.libraryLoader.loadLibrary('codemirror6').catch(() => { /* loaded again when the Tree needs it */ }); });
}
