/* ============================================================
   STRUCTRA V2 — Diff Viewer Component
   <structra-diff> — Two-pane JSON comparison with line-by-line
   difference highlighting. Uses DuckDB for structural comparison
   when both sides are tabular arrays.
   ============================================================ */

class StructraDiff extends StructraOverlay {
  init() {
    super.init();
    this._left = null;
    this._right = null;
    this._diffs = [];

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
          <button class="diff-btn" data-action="copy-patch" title="Copy the changes as an RFC 6902 JSON Patch">Copy JSON Patch</button>
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
        <div class="diff-body" id="diffBody">
          <div class="diff-pane diff-left" id="diffLeft"></div>
          <div class="diff-pane diff-right" id="diffRight"></div>
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
        this._renderDiff(mode.dataset.diffMode);
      }
    });

    this.addEventListener('change', (e) => {
      if (e.target.id === 'diffLeftSrc' || e.target.id === 'diffRightSrc') {
        this._handleSourceChange();
      }
    });
  }

  _open(opts) {
    this.open();
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
    else if (leftSrc === 'undo') {
      const hist = Structra.undoStack.getHistory();
      if (hist.length > 1) this._left = JSON.parse(hist[hist.length - 2].snapshot);
    }

    if (rightSrc === 'current') {
      this._right = Structra.state.jsonData;
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
      this.$('#diffPasteArea').style.display = 'none';
      this._computeAndRender();
    } catch (e) {
      Structra.toast('Invalid JSON: ' + e.message, 'error');
    }
  }

  _swap() {
    [this._left, this._right] = [this._right, this._left];
    this._computeAndRender();
  }

  async _computeAndRender() {
    if (!this._left || !this._right) return;

    // Try DuckDB structural diff for arrays
    if (Array.isArray(this._left) && Array.isArray(this._right)) {
      try {
        const result = await Structra.engine.diff(this._left, this._right);
        if (result) { this._diffs = result.changes || []; this._renderDiff('side'); this._updateStats(); return; }
      } catch {}
    }

    // Fallback: deep compare
    this._diffs = this._deepDiff(this._left, this._right, '$');
    this._renderDiff('side');
    this._updateStats();
  }

  _updateStats() {
    const added = this._diffs.filter(d => d.type === 'added').length;
    const removed = this._diffs.filter(d => d.type === 'removed').length;
    const changed = this._diffs.filter(d => d.type === 'changed').length;
    this.$('#diffStats').innerHTML = `<span class="diff-stat-add">+${added}</span> <span class="diff-stat-rm">-${removed}</span> <span class="diff-stat-chg">~${changed}</span>`;
  }

  _renderDiff(mode) {
    const leftPane = this.$('#diffLeft');
    const rightPane = this.$('#diffRight');
    const body = this.$('#diffBody');

    if (mode === 'inline') {
      body.className = 'diff-body diff-inline-mode';
      leftPane.innerHTML = this._renderInline();
      rightPane.innerHTML = '';
    } else if (mode === 'structural') {
      body.className = 'diff-body diff-structural-mode';
      leftPane.innerHTML = this._renderStructural();
      rightPane.innerHTML = '';
    } else {
      body.className = 'diff-body';
      const leftLines = this._lines(this._left);
      const rightLines = this._lines(this._right);
      leftPane.innerHTML = this._renderSidePane(leftLines, 'left');
      rightPane.innerHTML = this._renderSidePane(rightLines, 'right');
    }
  }

  /**
   * The pretty-printed JSON of a value as lines, each with the data path it belongs to
   * (the same "$.a[2].b" form the diff uses), so a changed path can be matched to its lines.
   */
  _lines(value) {
    const out = [];
    const walk = (v, path, indent, key, last) => {
      const prefix = indent + (key === undefined ? '' : JSON.stringify(key) + ': ');
      const comma = last ? '' : ',';
      if (v !== null && typeof v === 'object') {
        const entries = Array.isArray(v) ? v.map((x, i) => [i, x]) : Object.entries(v);
        const open = Array.isArray(v) ? '[' : '{';
        const close = Array.isArray(v) ? ']' : '}';
        if (!entries.length) { out.push({ text: prefix + open + close + comma, path }); return; }
        out.push({ text: prefix + open, path });
        entries.forEach(([k, child], i) => {
          const childPath = Array.isArray(v) ? `${path}[${k}]` : `${path}.${k}`;
          walk(child, childPath, indent + '  ', Array.isArray(v) ? undefined : k, i === entries.length - 1);
        });
        out.push({ text: indent + close + comma, path });
      } else {
        out.push({ text: prefix + JSON.stringify(v) + comma, path });
      }
    };
    walk(value, '$', '', undefined, true);
    return out;
  }

  /** Does a change at changePath cover the line printed for linePath (the value itself or anything inside it)? */
  _covers(changePath, linePath) {
    return linePath === changePath || linePath.startsWith(changePath + '.') || linePath.startsWith(changePath + '[');
  }

  _renderSidePane(lines, side) {
    return '<div class="diff-lines">' + lines.map((line, i) => {
      const cls = this._getLineDiffClass(line, side);
      return `<div class="diff-line ${cls}"><span class="diff-ln">${i + 1}</span><span class="diff-code">${Structra.util.esc(line.text)}</span></div>`;
    }).join('') + '</div>';
  }

  _getLineDiffClass(line, side) {
    for (const d of this._diffs) {
      if (!this._covers(d.path, line.path)) continue;
      if (d.type === 'changed') return 'diff-chg';
      if (d.type === 'removed' && side === 'left') return 'diff-rm';
      if (d.type === 'added' && side === 'right') return 'diff-add';
    }
    return '';
  }

  _renderInline() {
    let html = '<div class="diff-lines">';
    for (const d of this._diffs) {
      if (d.type === 'removed') {
        html += `<div class="diff-line diff-rm"><span class="diff-ln">-</span><span class="diff-code">${Structra.util.esc(d.path)}: ${Structra.util.esc(this._preview(d.left))}</span></div>`;
      } else if (d.type === 'added') {
        html += `<div class="diff-line diff-add"><span class="diff-ln">+</span><span class="diff-code">${Structra.util.esc(d.path)}: ${Structra.util.esc(this._preview(d.right))}</span></div>`;
      } else if (d.type === 'changed') {
        html += `<div class="diff-line diff-rm"><span class="diff-ln">-</span><span class="diff-code">${Structra.util.esc(d.path)}: ${Structra.util.esc(this._preview(d.left))}</span></div>`;
        html += `<div class="diff-line diff-add"><span class="diff-ln">+</span><span class="diff-code">${Structra.util.esc(d.path)}: ${Structra.util.esc(this._preview(d.right))}</span></div>`;
      }
    }
    html += '</div>';
    return html;
  }

  _renderStructural() {
    const groups = {};
    for (const d of this._diffs) {
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
    html += '</div>';
    return html;
  }

  _deepDiff(a, b, path) {
    const diffs = [];
    if (a === b) return diffs;
    if (a === null || b === null || typeof a !== typeof b) {
      diffs.push({ type: 'changed', path, left: a, right: b });
      return diffs;
    }
    if (typeof a !== 'object') {
      if (a !== b) diffs.push({ type: 'changed', path, left: a, right: b });
      return diffs;
    }
    if (Array.isArray(a) && Array.isArray(b)) {
      const max = Math.max(a.length, b.length);
      for (let i = 0; i < max; i++) {
        if (i >= a.length) diffs.push({ type: 'added', path: `${path}[${i}]`, right: b[i] });
        else if (i >= b.length) diffs.push({ type: 'removed', path: `${path}[${i}]`, left: a[i] });
        else diffs.push(...this._deepDiff(a[i], b[i], `${path}[${i}]`));
      }
    } else {
      const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
      for (const k of allKeys) {
        const cp = `${path}.${k}`;
        if (!(k in a)) diffs.push({ type: 'added', path: cp, right: b[k] });
        else if (!(k in b)) diffs.push({ type: 'removed', path: cp, left: a[k] });
        else diffs.push(...this._deepDiff(a[k], b[k], cp));
      }
    }
    return diffs;
  }

  _copyDiff() {
    const text = this._diffs.map(d => {
      if (d.type === 'added') return `+ ${d.path}: ${JSON.stringify(d.right)}`;
      if (d.type === 'removed') return `- ${d.path}: ${JSON.stringify(d.left)}`;
      return `~ ${d.path}: ${JSON.stringify(d.left)} → ${JSON.stringify(d.right)}`;
    }).join('\n');
    Structra.util.copy(text, 'Diff copied');
  }

  _copyPatch() {
    if (this._left === undefined || this._right === undefined) { Structra.toast('Load both sides first'); return; }
    const ops = Structra.jsonTools.patch(this._left, this._right);
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
