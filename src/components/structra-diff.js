/* ============================================================
   STRUCTRA V2 - Diff Viewer Component
   <structra-diff> - compare two JSON documents.

   What is different comes from Structra.jsonDiff (core/json-diff.js), which uses the jsondiffpatch library: it matches the
   items of a list instead of comparing them by position, so an item added at the start is one change.
   Three views of the same changes:
     Side by Side  both documents as text in two read-only code boxes (core/code-view.js). Only the lines on screen are drawn,
                   so big documents stay smooth. Changed lines are shaded, and the two boxes scroll together.
     Inline        a list of the changes, one per line (the first MAX_ROWS)
     Structural    the same changes grouped by where they are (the first MAX_ROWS)

   Wiring (generated from the code below; update it when you add or remove an event):
     Listens to: diff:open
   ============================================================ */

class StructraDiff extends StructraOverlay {
  init() {
    super.init();
    this._left = null;
    this._right = null;
    this._diffs = [];
    this._result = null;
    this._mode = 'side';

    this.on('diff:open', (d) => this._open(d));
  }

  render() {
    this.mount({ title: 'JSON Diff', size: 'xl flush', head: '<div class="diff-stats" id="diffStats"></div>', body: `<div class="diff-toolbar">
          <button class="diff-btn active" data-diff-mode="side">Side by Side</button>
          <button class="diff-btn" data-diff-mode="inline">Inline</button>
          <button class="diff-btn" data-diff-mode="structural">Structural</button>
          <span class="diff-sep"></span>
          <button class="diff-btn" data-action="swap">${Structra.icons.svg('arrow-left-right', { size: 14 })} Swap</button>
          <button class="diff-btn" data-action="copy-diff">Copy Diff</button>
          <button class="diff-btn" data-action="copy-patch" title="Copy the changes as a JSON Patch">Copy JSON Patch</button>
        </div>
        <div class="diff-load-bar">
          <div class="diff-load-side">
            <label>Left:</label>
            <select class="diff-source" id="diffLeftSrc">
              <option value="current">Current Data</option>
              <option value="paste">Paste JSON…</option>
              <option value="undo">Undo History</option>
            </select>
          </div>
          <div class="diff-load-side">
            <label>Right:</label>
            <select class="diff-source" id="diffRightSrc">
              <option value="paste" selected>Paste JSON…</option>
              <option value="current">Current Data</option>
              <option value="undo">Undo History</option>
            </select>
          </div>
        </div>
        <div class="diff-paste-area" id="diffPasteArea" style="display:none">
          <textarea class="diff-paste-input" id="diffPasteInput" placeholder="Paste JSON to compare…"></textarea>
          <button class="btn btn-primary" data-action="load-paste">Compare</button>
        </div>
        <div class="diff-note" id="diffNote" hidden></div>
        <div class="diff-body" id="diffBody">
          <div class="diff-pane diff-left" id="diffLeft"><div class="diff-host" id="diffLeftHost"></div></div>
          <div class="diff-pane diff-right" id="diffRight"><div class="diff-host" id="diffRightHost"></div></div>
          <div class="diff-list" id="diffList"></div>
        </div>` });

    this.addEventListener('click', (e) => {
      const action = e.target.closest('[data-action]');
      if (action) {
        const a = action.dataset.action;
        if (a === 'close') this.close();
        else if (a === 'swap') this._swap();
        else if (a === 'copy-diff') this._copyDiff();
        else if (a === 'copy-patch') this._copyPatch();
        else if (a === 'load-paste') this._loadPaste();
      }
      const mode = e.target.closest('[data-diff-mode]');
      if (mode) {
        this.querySelectorAll('[data-diff-mode]').forEach(b => b.classList.toggle('active', b === mode));
        this._mode = mode.dataset.diffMode;
        this._renderDiff();
      }
    });

    this.addEventListener('change', (e) => {
      if (e.target.id === 'diffLeftSrc' || e.target.id === 'diffRightSrc') {
        this._handleSourceChange();
      }
    });
  }

  /** Every other open document can be a side: the choices are rebuilt each time the dialog opens */
  _tabChoices() {
    const others = (Structra.tabs.list || []).filter((t) => t.id !== Structra.tabs.activeId && t.data);
    return others.map((t) => `<option value="tab:${t.id}">Tab: ${Structra.util.esc(t.label || 'Untitled')}</option>`).join('');
  }

  _tabData(value) {
    const id = Number(String(value).slice(4));
    const t = (Structra.tabs.list || []).find((x) => x.id === id);
    return t ? t.data : null;
  }

  _open(opts) {
    this.open();
    this.querySelectorAll('.diff-source').forEach((sel) => {
      sel.querySelectorAll('option[value^="tab:"]').forEach((o) => o.remove());
      sel.insertAdjacentHTML('beforeend', this._tabChoices());
    });
    if (opts && opts.left) this._left = opts.left;
    else this._left = Structra.state.jsonData;

    if (opts && opts.right) {
      this._right = opts.right;
      this._computeAndRender();
    } else {
      this._showPasteArea();
    }
  }


  _showPasteArea() {
    this.$('#diffPasteArea').style.display = '';
    this.$('#diffPasteInput').focus();
  }

  _handleSourceChange() {
    const leftSrc = this.$('#diffLeftSrc').value;
    const rightSrc = this.$('#diffRightSrc').value;

    if (leftSrc === 'current') this._left = Structra.state.jsonData;
    else if (leftSrc.startsWith('tab:')) this._left = this._tabData(leftSrc);
    else if (leftSrc === 'undo') {
      const hist = Structra.undoStack.getHistory();
      if (hist.length > 1) this._left = JSON.parse(hist[hist.length - 2].snapshot);
    }

    if (rightSrc === 'current') {
      this._right = Structra.state.jsonData;
      this._computeAndRender();
    } else if (rightSrc.startsWith('tab:')) {
      this._right = this._tabData(rightSrc);
      this.$('#diffPasteArea').style.display = 'none';
      this._computeAndRender();
    } else if (rightSrc === 'undo') {
      const hist = Structra.undoStack.getHistory();
      if (hist.length > 0) { this._right = JSON.parse(hist[hist.length - 1].snapshot); this._computeAndRender(); }
    } else {
      this._showPasteArea();
    }
  }

  _loadPaste() {
    const text = this.$('#diffPasteInput').value.trim();
    if (!text) { Structra.toast('Paste JSON to compare', 'warning'); return; }
    try {
      this._right = JSON.parse(text);
      this._computeAndRender();   // the paste box stays, so the right side can be edited and compared again
    } catch (e) {
      Structra.toast('This is not valid JSON: ' + e.message, 'error');
    }
  }

  _swap() {
    [this._left, this._right] = [this._right, this._left];
    this._computeAndRender();
  }

  /** The most rows the Inline and Structural lists show: a longer list would only slow the page down */
  static get MAX_ROWS() { return 2000; }

  async _computeAndRender() {
    if (this._left === undefined || this._right === undefined || this._left === null || this._right === null) return;
    const token = (this._token = (this._token || 0) + 1);
    this._showNote('Comparing…');
    let result;
    try {
      result = await Structra.jsonDiff.compare(this._left, this._right);
    } catch (err) {
      Structra.log.error('Diff', 'Compare failed', err);
      if (token === this._token) this._showNote('The two sides could not be compared: ' + err.message);
      return;
    }
    if (token !== this._token) return;                      // a newer compare has started
    this._result = result;
    this._diffs = result.changes;
    this._showNote(result.note);
    await this._renderDiff();
    this._updateStats();
  }

  _showNote(text) {
    const note = this.$('#diffNote');
    if (!note) return;
    note.textContent = text || '';
    note.hidden = !text;
  }

  _updateStats() {
    const count = (type) => this._diffs.filter((d) => d.type === type).length;
    const added = count('added');
    const removed = count('removed');
    const changed = count('changed');
    const moved = count('moved');
    this.$('#diffStats').innerHTML = added + removed + changed + moved === 0
      ? '<span>The two sides are identical</span>'
      : `<span class="diff-stat-add" title="Values only on the right side">${added.toLocaleString()} added</span> <span class="diff-stat-rm" title="Values only on the left side">${removed.toLocaleString()} removed</span> <span class="diff-stat-chg" title="Values that differ">${changed.toLocaleString()} changed</span>` +
        (moved ? ` <span class="diff-stat-chg" title="List items that are the same but sit at another place">${moved.toLocaleString()} moved</span>` : '');
    this.$('#diffStats').title = 'Green: only on the right. Red: only on the left. Orange: different or moved.';
  }

  async _renderDiff() {
    const body = this.$('#diffBody');
    if (this._mode === 'inline' || this._mode === 'structural') {
      body.className = 'diff-body diff-list-mode';
      this.$('#diffList').innerHTML = this._mode === 'inline' ? this._renderInline() : this._renderStructural();
      return;
    }
    body.className = 'diff-body';
    await this._renderSides();
  }

  /** Both documents as text in two code boxes. Only the lines in view are drawn, however long the documents are. */
  async _renderSides() {
    const left = this._textOf(this._left, 'left');
    const right = this._textOf(this._right, 'right');
    if (!this._boxes) {
      const make = (host, label) => Structra.codeView.create(host, { mode: 'json', readOnly: true, fold: false, label });
      this._boxes = await Promise.all([make(this.$('#diffLeftHost'), 'Left document'), make(this.$('#diffRightHost'), 'Right document')]);
      this._syncScroll(this._boxes[0].cm, this._boxes[1].cm);
    }
    const [leftBox, rightBox] = this._boxes;
    leftBox.setValue(left.text);
    rightBox.setValue(right.text);
    leftBox.setLineClasses(left.classes);
    rightBox.setLineClasses(right.classes);
    leftBox.refresh();
    rightBox.refresh();
  }

  /** The two boxes scroll as one, so the same part of each document stays side by side */
  _syncScroll(a, b) {
    let busy = false;
    const follow = (from, to) => from.on('scroll', () => {
      if (busy) return;
      busy = true;
      const info = from.getScrollInfo();
      to.scrollTo(info.left, info.top);
      busy = false;
    });
    follow(a, b);
    follow(b, a);
  }

  /**
   * The document as pretty-printed text, and the shading for each line: a line takes the colour of the change that covers
   * it (the value itself, or something inside it). Each line is decided once, as it is written, so the cost is the size of
   * the document and does not grow with the number of changes.
   */
  _textOf(value, side) {
    const mark = new Map();                                     // path -> class
    for (const d of this._diffs) {
      if (side === 'left') {
        if (d.type === 'removed') mark.set(d.leftPath, 'diff-rm');
        else if (d.type === 'changed' || d.type === 'moved') mark.set(d.leftPath, 'diff-chg');
      } else if (d.type === 'added') mark.set(d.rightPath, 'diff-add');
      else if (d.type === 'changed' || d.type === 'moved') mark.set(d.rightPath, 'diff-chg');
    }
    const lines = [];
    const classes = new Map();                                  // line number -> class
    const put = (text, cls) => { if (cls) classes.set(lines.length, cls); lines.push(text); };
    const walk = (v, path, indent, key, last, inherited) => {
      const cls = mark.get(path) || inherited;
      const prefix = indent + (key === undefined ? '' : JSON.stringify(key) + ': ');
      const comma = last ? '' : ',';
      if (v !== null && typeof v === 'object') {
        const isList = Array.isArray(v);
        const keys = isList ? null : Object.keys(v);
        const size = isList ? v.length : keys.length;
        const open = isList ? '[' : '{';
        const close = isList ? ']' : '}';
        if (!size) { put(prefix + open + close + comma, cls); return; }
        put(prefix + open, cls);
        for (let i = 0; i < size; i++) {
          const k = isList ? i : keys[i];
          const childPath = isList ? `${path}[${k}]` : `${path}.${k}`;
          walk(v[k], childPath, indent + '  ', isList ? undefined : k, i === size - 1, cls);
        }
        put(indent + close + comma, cls);
      } else {
        put(prefix + JSON.stringify(v) + comma, cls);
      }
    };
    walk(value, '$', '', undefined, true, '');
    return { text: lines.join('\n'), classes };
  }

  _renderInline() {
    const rows = this._diffs.slice(0, StructraDiff.MAX_ROWS);
    const line = (cls, sign, path, value) => `<div class="diff-line ${cls}"><span class="diff-ln">${sign}</span><span class="diff-code">${Structra.util.esc(path)}: ${Structra.util.esc(this._preview(value))}</span></div>`;
    let html = '<div class="diff-lines">';
    for (const d of rows) {
      if (d.type === 'removed') html += line('diff-rm', '-', d.leftPath, d.left);
      else if (d.type === 'added') html += line('diff-add', '+', d.rightPath, d.right);
      else {
        html += line('diff-rm', '-', d.leftPath, d.left);
        html += line('diff-add', '+', d.rightPath, d.right);
      }
    }
    html += '</div>' + this._moreNote();
    return html;
  }

  _renderStructural() {
    const groups = {};
    for (const d of this._diffs.slice(0, StructraDiff.MAX_ROWS)) {
      const root = d.path.split('.').slice(0, 2).join('.');
      if (!groups[root]) groups[root] = [];
      groups[root].push(d);
    }
    let html = '<div class="diff-structural">';
    for (const [path, changes] of Object.entries(groups)) {
      html += `<div class="diff-struct-group"><div class="diff-struct-path">${Structra.util.esc(path)}</div>`;
      for (const c of changes) {
        const cls = c.type === 'added' ? 'diff-add' : c.type === 'removed' ? 'diff-rm' : 'diff-chg';
        html += `<div class="diff-struct-item ${cls}">${c.type}: ${Structra.util.esc(c.path.replace(path + '.', ''))}</div>`;
      }
      html += '</div>';
    }
    html += '</div>' + this._moreNote();
    return html;
  }

  _moreNote() {
    const more = this._diffs.length - StructraDiff.MAX_ROWS;
    return more > 0 ? `<div class="diff-more">Showing the first ${StructraDiff.MAX_ROWS.toLocaleString()} of ${this._diffs.length.toLocaleString()} changes. Use Side by Side to see them all in place.</div>` : '';
  }

  _copyDiff() {
    const text = this._diffs.map((d) => {
      if (d.type === 'added') return `+ ${d.rightPath}: ${JSON.stringify(d.right)}`;
      if (d.type === 'removed') return `- ${d.leftPath}: ${JSON.stringify(d.left)}`;
      if (d.type === 'moved') return `> ${d.leftPath} to ${d.rightPath}`;
      return `~ ${d.path}: ${JSON.stringify(d.left)} → ${JSON.stringify(d.right)}`;
    }).join('\n');
    Structra.util.copy(text, 'Diff copied');
  }

  async _copyPatch() {
    if (!this._result) { Structra.toast('Fill in both sides first'); return; }
    const ops = await Structra.jsonDiff.patchOps(this._result, this._left, this._right);
    if (!ops.length) { Structra.toast('No differences'); return; }
    Structra.util.copy(JSON.stringify(ops, null, 2), 'Copied ' + ops.length + ' patch operation' + (ops.length === 1 ? '' : 's'));
  }

  _preview(val) {
    if (val === null) return 'null';
    if (typeof val === 'object') return JSON.stringify(val).slice(0, 60);
    return String(val).slice(0, 60);
  }

}

customElements.define('structra-diff', StructraDiff);
