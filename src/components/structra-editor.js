/* ============================================================
   STRUCTRA V2 — Editor View Component
   <structra-editor> — raw JSON editor (format/minify/validate/apply)
   ============================================================ */

class StructraEditor extends StructraElement {
  static get observedAttributes() { return ['readonly']; }

  init() {
    this._stale = false;
    this.on('tabs:closed', (id) => { if (this._drafts) this._drafts.delete(id); if (this._baseline) this._baseline.delete(id); });
    this.on('editor:repair', () => this._repair());
    this.on('editor:format', () => this._format());
    this.on('editor:minify', () => this._minify());
    this.on('state:jsonData', () => {
      this._stale = true;
      Structra.log.debug('Editor', 'jsonData changed — stale=true (activeView=' + Structra.state.activeView + ')');
      if (Structra.state.activeView === 'editor') this._loadData();
    });
    this.on('view:switched', (view) => {
      if (view === 'editor' && this._stale) {
        Structra.log.info('Editor', 'View switched to editor — loading data');
        this._loadData();
      }
    });
  }

  render() {
    this.innerHTML = `
      <div class="editor-container">
        <div class="editor-toolbar">
          <button class="toolbar-btn" data-action="apply">${Structra.icons.svg('play', { size: 14 })} Apply</button>
          <button class="toolbar-btn" data-action="format">Format</button>
          <button class="toolbar-btn" data-action="minify">Minify</button>
          <button class="toolbar-btn" data-action="repair" title="Fix trailing commas, quotes, comments and other mistakes">Repair</button>
          <button type="button" class="ed-status valid" id="edStatus" disabled>${Structra.icons.svg('check', { size: 14, color: 'success' })} Valid JSON</button>
        </div>
        <div class="editor-body">
          <div class="editor-gutter" id="edGutter" aria-hidden="true"></div>
          <textarea class="editor-textarea" id="editorArea" spellcheck="false" wrap="off" aria-label="JSON text"></textarea>
        </div>
      </div>`;

    const area = this.$('#editorArea');
    area.addEventListener('input', () => { this._gutter(); this._validate(); this._keepDraft(); });
    area.addEventListener('scroll', () => this._gutterWindow(false));
    // The status names the problem; a click goes to it
    this.$('#edStatus').addEventListener('click', () => {
      if (this._errorAt == null) return;
      area.focus();
      area.setSelectionRange(this._errorAt, Math.min(area.value.length, this._errorAt + 1));
      const line = area.value.slice(0, this._errorAt).split('\n').length;
      area.scrollTop = Math.max(0, (line - 4) * parseFloat(getComputedStyle(area).lineHeight));
    });

    this.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const a = btn.dataset.action;
      if (a === 'apply') this._apply();
      else if (a === 'format') this._format();
      else if (a === 'minify') this._minify();
      else if (a === 'repair') this._repair();
    });

    this._loadData();
  }

  /** Text typed in the box but not applied is kept for its tab, and the tab shows a dot */
  _keepDraft() {
    const id = Structra.tabs.activeId;
    const tab = Structra.tabs.list.find((t) => t.id === id);
    const area = this.$('#editorArea');
    if (!tab || !area) return;
    if (!this._drafts) this._drafts = new Map();
    this._drafts.set(id, area.value);
    if (!this._baseline) this._baseline = new Map();
    if (!this._baseline.has(id)) this._baseline.set(id, JSON.stringify(Structra.state.jsonData, null, 2));
    if (!tab.draft) { tab.draft = true; Structra.events.emit('tabs:changed'); }
  }

  _dropDraft(id) {
    if (this._drafts) this._drafts.delete(id);
    const tab = Structra.tabs.list.find((t) => t.id === id);
    if (tab && tab.draft) { tab.draft = false; Structra.events.emit('tabs:changed'); }
  }

  /** A big document takes a few seconds to lay out: say so first, and draw it after the message is shown */
  _loadData() {
    const size = Structra.state.fileSize || 0;
    if (size < 1024 * 1024) { this._loadDataNow(); return; }
    this._stale = false;
    Structra.events.emit('loading:show', 'Preparing the editor…');
    setTimeout(() => { try { this._loadDataNow(); } finally { Structra.events.emit('loading:hide'); } }, 40);
  }

  _loadDataNow() {
    this._stale = false;
    const area = this.$('#editorArea');
    if (!area) return;
    const tabId = Structra.tabs.activeId;
    const data = Structra.state.jsonData;
    if (!data) { area.value = ''; this._gutter(); return; }
    // Guard: skip JSON.stringify for very large data to avoid "Invalid string length"
    const size = Structra.state.fileSize || 0;
    if (size > 10 * 1024 * 1024) {
      Structra.log.warn('Editor', 'File too large for editor (' + (size / 1048576).toFixed(1) + ' MB) — skipping stringify');
      area.value = '// File too large for editor (' + (size / 1048576).toFixed(1) + ' MB)\n// Use the tree view to explore this data.';
      const status = this.$('#edStatus');
      if (status) { status.innerHTML = Structra.icons.svg('triangle-alert', { size: 14, color: 'warning' }) + ' Too large'; status.className = 'ed-status warn'; }
      return;
    }
    try {
      Structra.log.info('Editor', 'JSON.stringify (' + (size / 1024).toFixed(1) + ' KB)...');
      const t0 = performance.now();
      const canon = JSON.stringify(data, null, 2);
      Structra.log.perf('Editor', 'JSON.stringify', performance.now() - t0);
      // Typed-but-not-applied text stays while the document is the same as when it was typed; if the document changed, it is obsolete
      if (!this._baseline) this._baseline = new Map();
      if (this._drafts && this._drafts.has(tabId) && this._baseline.get(tabId) === canon) area.value = this._drafts.get(tabId);
      else { this._dropDraft(tabId); area.value = canon; }
      this._baseline.set(tabId, canon);
    } catch (e) {
      Structra.log.error('Editor', 'JSON.stringify failed: ' + e.message, e);
      area.value = '// Could not stringify data: ' + e.message;
    }
    this._gutter();
    this._validate();
  }

  /**
   * Line numbers beside the text. Only the numbers in view (and a few above and below) are drawn, so a document of
   * 200,000 lines costs no more than one of 200.
   */
  _gutter() {
    const area = this.$('#editorArea');
    const gutter = this.$('#edGutter');
    if (!area || !gutter) return;
    this._lines = area.value.split('\n').length;
    this._lh = parseFloat(getComputedStyle(area).lineHeight) || 24;
    this._gutterWindow(true);
  }

  _gutterWindow(force) {
    const area = this.$('#editorArea');
    const gutter = this.$('#edGutter');
    if (!area || !gutter || !this._lines) return;
    const lh = this._lh || 24;
    const first = Math.max(0, Math.floor(area.scrollTop / lh) - 20);
    if (!force && this._winFirst !== undefined && Math.abs(first - this._winFirst) < 15) { gutter.scrollTop = area.scrollTop; return; }
    this._winFirst = first;
    const last = Math.min(this._lines, first + Math.ceil((area.clientHeight || 600) / lh) + 40);
    let out = '';
    for (let i = first + 1; i <= last; i++) out += i + '\n';
    gutter.innerHTML = `<div style="position:relative;height:${this._lines * lh}px"><div style="position:absolute;top:${first * lh}px;right:0;white-space:pre">${out}</div></div>`;
    gutter.scrollTop = area.scrollTop;
  }

  /** The parser's wording, said the way a maker would: what is wrong, not which token */
  _plainReason(reason, text, at) {
    const ch = at != null && text ? text[at] : '';
    if (/Unexpected end of JSON|Unterminated string/i.test(reason)) return 'the text ends too early: a closing bracket or quote is missing';
    if (/Expected property name|Expected double-quoted property name/i.test(reason)) return ch === "'" ? 'keys need double quotes, not single quotes' : 'a key is missing or needs double quotes (a trailing comma?)';
    if (/Expected ',' or '[}\]]'|Expected ',' or/i.test(reason)) return 'a comma is missing between two items';
    if (/Unexpected non-whitespace/i.test(reason)) return 'there is extra text after the end of the JSON';
    if (/Unexpected token/i.test(reason) || /is not valid JSON/i.test(reason)) {
      if (ch === "'") return "text needs double quotes (\"like this\"), not single quotes";
      if (ch === ',') return 'a comma is not allowed here';
      if (ch === '}' || ch === ']') return 'a closing bracket is in the wrong place';
      if (ch === ':') return 'a colon is not allowed here';
      if (/[A-Za-z]/.test(ch || '')) return 'text needs double quotes (\"like this\"), unless it is true, false or null';
    }
    return reason;
  }

  async _validate() {
    const status = this.$('#edStatus');
    const area = this.$('#editorArea');
    if (!status || !area) return;
    this._errorAt = null;
    try {
      await Structra.parseJsonAsync(area.value);
      status.innerHTML = Structra.icons.svg('check', { size: 14, color: 'success' }) + ' Valid JSON';
      status.className = 'ed-status valid';
      status.disabled = true;
      status.title = '';
    } catch (e) {
      // Say what is wrong and where: the browser's own parser knows the position
      let why = e.message;
      try { JSON.parse(area.value); } catch (native) { why = native.message; }
      const pos = /position\s+(\d+)/i.exec(why);
      const lc = /line\s+(\d+)\s+column\s+(\d+)/i.exec(why);
      let where = '';
      if (pos) {
        this._errorAt = Number(pos[1]);
        const before = area.value.slice(0, this._errorAt);
        where = `line ${before.split('\n').length}, column ${before.length - before.lastIndexOf('\n')}`;
      } else if (lc) {
        where = `line ${lc[1]}, column ${lc[2]}`;
      }
      const reason = why.replace(/\s*in JSON at position.*$/i, '').replace(/\s*\(line.*\)$/i, '').replace(/^JSON\.parse:\s*/i, '').trim();
      status.innerHTML = `${Structra.icons.svg('x', { size: 14, color: 'danger' })} ${Structra.util.esc(where ? `Line ${where.slice(5)}: ` : '')}${Structra.util.esc(this._plainReason(reason, area.value, this._errorAt).slice(0, 110))}`;
      status.className = 'ed-status error';
      status.disabled = this._errorAt == null;
      status.title = this._errorAt == null ? '' : 'Click to go to the problem';
    }
  }

  async _format() {
    const area = this.$('#editorArea');
    try {
      const data = await Structra.parseJsonAsync(area.value);
      area.value = JSON.stringify(data, null, 2);
      this._gutter();
      this._validate();
      Structra.toast('Formatted');
    } catch (e) {
      Structra.toast('Invalid JSON');
    }
  }

  async _minify() {
    const area = this.$('#editorArea');
    try {
      const data = await Structra.parseJsonAsync(area.value);
      area.value = JSON.stringify(data);
      this._gutter();
      this._validate();
      Structra.toast('Minified');
    } catch (e) {
      Structra.toast('Invalid JSON');
    }
  }

  async _repair() {
    const area = this.$('#editorArea');
    if (!area || !area.value.trim()) { Structra.toast('Nothing to repair'); return; }
    try {
      await Structra.parseJsonAsync(area.value);
      Structra.toast('Already valid JSON');
      return;
    } catch { /* invalid: fall through to repair */ }
    const before = area.value;
    try {
      area.value = await Structra.jsonTools.repair(before);
      this._gutter();
      await this._validate();
      // Say how much changed, so the repair is not a leap of faith
      const lines = (t) => t.split(/\r?\n/);
      const was = lines(before), now = lines(area.value);
      let changed = Math.abs(was.length - now.length);
      for (let i = 0; i < Math.min(was.length, now.length); i++) if (was[i] !== now[i]) changed++;
      Structra.toast(`Repaired: about ${changed} line${changed === 1 ? '' : 's'} changed. Review it, then Apply. Ctrl+Z in the box undoes the repair.`);
    } catch (e) {
      const panel = document.querySelector('structra-input-panel');
      const detail = panel && panel._explainError ? panel._explainError(e.message, before).detail : e.message;
      const plain = /unexpected end|end of json/i.test(detail) ? 'The text stops before the JSON is complete, or it is not JSON at all.' : detail;
      Structra.toast('This could not be repaired automatically. ' + plain);
    }
  }

  async _apply() {
    const area = this.$('#editorArea');
    try {
      const data = await Structra.parseJsonAsync(area.value);
      // Keep the document as it was, so Ctrl+Z can bring it back, and mark the tab as changed
      const tabId = Structra.tabs.activeId;
      Structra.undoStack.push(Structra.state.jsonData, 'Before editing', tabId);
      this._dropDraft(tabId);
      Structra.set('jsonData', data);
      Structra.undoStack.push(data, 'Edited in the Editor', tabId);
      const tab = Structra.tabs.list.find((t) => t.id === tabId);
      if (tab) { tab.modified = true; Structra.events.emit('tabs:changed'); }
      Structra.toast('Changes applied. Ctrl+Z (outside this box) undoes them.');
    } catch (e) {
      this._validate();
      Structra.toast('These changes cannot be applied yet: ' + (this.$('#edStatus').textContent || 'the JSON is not valid').trim());
    }
  }
}

customElements.define('structra-editor', StructraEditor);
