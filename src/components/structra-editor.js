/* ============================================================
   STRUCTRA V2 - Editor View Component
   <structra-editor> - raw JSON editor (format/minify/repair/apply)

   The text box is a code box from Structra.codeView (core/code-view.js): colours, line numbers, folding, bracket
   matching and undo come from it. It draws only the lines on screen, so a large document (tens of millions of
   characters) stays smooth. What this file adds is the JSON side:
     - checking the text as it is typed (after a pause that grows with the size of the text) and saying what and where
     - Apply, which turns the text into the open document
     - Format, Minify and Repair
     - a draft per tab: text typed but not applied is kept for that tab, and the tab shows a dot

   Size: the open document is turned into text (JSON.stringify) when this view opens. Files up to MAX_EDIT_BYTES open;
   above that a short note is shown instead, because the text would not fit in memory comfortably.

   Wiring (generated from the code below; update it when you add or remove an event):
     Listens to: tabs:closed, editor:repair, editor:format, editor:minify, state:jsonData,
          view:switched
     Emits: tabs:changed, loading:show, loading:hide
     Sets state: jsonData
   ============================================================ */

class StructraEditor extends StructraComponent {
  static get observedAttributes() { return ['readonly']; }

  /** The biggest file (as it was on disk) that opens in the editor */
  static get MAX_EDIT_BYTES() { return 100 * 1024 * 1024; }
  /** A single line longer than this cannot be shown smoothly (Minify makes one line of the whole document) */
  static get MAX_LINE_CHARS() { return 2 * 1000 * 1000; }
  /** From this size on, opening says it may take a few seconds */
  static get SLOW_BYTES() { return 1024 * 1024; }

  init() {
    this._stale = false;
    this._drafts = new Map();     // tab id -> typed text that was not applied
    this._dataOf = new Map();     // tab id -> the document the draft was typed against
    this.on('tabs:closed', (id) => { this._drafts.delete(id); this._dataOf.delete(id); });
    this.on('editor:repair', () => this._repair());
    this.on('editor:format', () => this._format());
    this.on('editor:minify', () => this._minify());
    this.on('state:jsonData', () => {
      this._stale = true;
      Structra.log.debug('Editor', 'jsonData changed - stale=true (activeView=' + Structra.state.activeView + ')');
      if (Structra.state.activeView === 'editor') this._loadData();
    });
    this.on('view:switched', (view) => {
      if (view === 'editor') {
        if (this._box) this._box.refresh();             // it was hidden while it was drawn
        if (this._stale) {
          Structra.log.info('Editor', 'View switched to editor - loading data');
          this._loadData();
        }
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
          <div class="editor-host" id="editorHost"></div>
        </div>
      </div>`;

    // The status names the problem; a click goes to it
    this.queryOne('#edStatus').addEventListener('click', () => {
      if (this._errorAt == null || !this._box) return;
      this._box.markError(this._errorAt);
      this._box.gotoOffset(this._errorAt, { select: true });
    });

    this.addEventListener('click', (event) => {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      const action = button.dataset.action;
      if (action === 'apply') this._apply();
      else if (action === 'format') this._format();
      else if (action === 'minify') this._minify();
      else if (action === 'repair') this._repair();
    });

    this._loadData();
  }

  /** The code box, created the first time it is needed */
  _ensureBox() {
    if (!this._boxPromise) {
      this._boxPromise = Structra.codeView.create(this.queryOne('#editorHost'), { mode: 'json', label: 'JSON text' })
        .then((box) => {
          this._box = box;
          box.onChange(() => this._edited());
          return box;
        })
        .catch((error) => {
          this._boxPromise = null;
          Structra.log.error('Editor', 'The code box could not load: ' + error.message);
          return null;
        });
    }
    return this._boxPromise;
  }

  /** Put text in the box without it counting as something the person typed */
  _setText(text) {
    this._quiet = true;
    try { this._box.setValue(text); } finally { this._quiet = false; }
  }

  /** Something was typed or pasted: remember it as a draft, and check it once typing pauses */
  _edited() {
    if (this._quiet || this._loading) return;
    this._box.clearError();
    this._dirty = true;
    const id = Structra.tabs.activeId;
    const tab = Structra.tabs.list.find((candidate) => candidate.id === id);
    if (tab && !tab.draft) { tab.draft = true; Structra.events.emit('tabs:changed'); }
    this._dataOf.set(id, Structra.state.jsonData);
    // The text itself is read later (when checking, or when the tab is left): reading it on every key would copy it each time
    const lines = this._box.lineCount();
    const wait = Math.min(2500, 150 + Math.floor(lines / 1500));
    if (wait > 400) this._showChecking();
    clearTimeout(this._checkTimer);
    this._checkTimer = setTimeout(() => this._validate(), wait);
  }

  _dropDraft(id) {
    this._drafts.delete(id);
    this._dataOf.delete(id);
    const tab = Structra.tabs.list.find((candidate) => candidate.id === id);
    if (tab && tab.draft) { tab.draft = false; Structra.events.emit('tabs:changed'); }
  }

  /** A big document takes a few seconds to prepare: say so first, and start after the message is shown */
  _loadData() {
    const size = Structra.state.fileSize || 0;
    this._stale = false;
    if (size < StructraEditor.SLOW_BYTES) { this._loadDataNow(); return; }
    Structra.events.emit('loading:show', size > 20 * 1024 * 1024 ? 'Preparing the editor… a large file can take several seconds' : 'Preparing the editor…');
    setTimeout(async () => { try { await this._loadDataNow(); } finally { Structra.events.emit('loading:hide'); } }, 40);
  }

  async _loadDataNow() {
    this._stale = false;
    this._loading = true;
    try {
      const box = await this._ensureBox();
      if (!box) { this._status('warn', 'triangle-alert', 'The editor could not load'); return; }
      // Text typed in the tab that was open until now is kept before the box is reused
      if (this._dirty && this._boxTabId != null) this._drafts.set(this._boxTabId, box.getValue());
      this._dirty = false;
      clearTimeout(this._checkTimer);

      const tabId = Structra.tabs.activeId;
      const data = Structra.state.jsonData;
      this._tooLarge = false;
      box.setReadOnly(false);
      if (!data) { this._setText(''); this._boxTabId = tabId; this._validate(); return; }

      const size = Structra.state.fileSize || 0;
      if (size > StructraEditor.MAX_EDIT_BYTES) {
        Structra.log.warn('Editor', 'File too large for editor (' + (size / 1048576).toFixed(1) + ' MB)');
        this._tooLarge = true;
        this._setText('// This file is too large to edit here (' + (size / 1048576).toFixed(0) + ' MB).\n// The Tree, Table, Query and Overview views work on it.');
        box.setReadOnly(true);
        this._boxTabId = tabId;
        this._status('warn', 'triangle-alert', 'Too large to edit');
        return;
      }

      // Typed-but-not-applied text stays while the document is the one it was typed against; if the document changed, it is obsolete
      let text;
      if (this._drafts.has(tabId) && this._dataOf.get(tabId) === data) {
        text = this._drafts.get(tabId);
        this._dirty = true;
      } else {
        this._dropDraft(tabId);
        try {
          const startTime = performance.now();
          text = JSON.stringify(data, null, 2);
          Structra.log.perf('Editor', 'JSON.stringify', performance.now() - startTime);
        } catch (error) {
          Structra.log.error('Editor', 'JSON.stringify failed: ' + error.message, error);
          text = '// This document could not be turned into text: ' + error.message;
        }
      }
      this._setText(text);
      this._boxTabId = tabId;
      box.refresh();
    } finally {
      this._loading = false;
    }
    this._validate();
  }

  _status(kind, icon, html, color) {
    const status = this.queryOne('#edStatus');
    if (!status) return;
    const tone = { valid: 'success', error: 'danger', warn: 'warning' }[kind];
    status.innerHTML = Structra.icons.svg(icon, { size: 14, color: color || tone }) + ' ' + html;
    status.className = 'ed-status ' + kind;
    status.disabled = kind !== 'error';
    status.title = '';
  }

  _showChecking() {
    const status = this.queryOne('#edStatus');
    if (!status) return;
    status.innerHTML = 'Checking…';
    status.className = 'ed-status checking';
    status.disabled = true;
  }

  /** The parser's wording, said the way a maker would: what is wrong, not which token */
  _plainReason(reason, text, at) {
    const character = at != null && text ? text[at] : '';
    if (/Unexpected end of JSON|Unterminated string/i.test(reason)) return 'the text ends too early: a closing bracket or quote is missing';
    if (/Expected property name|Expected double-quoted property name/i.test(reason)) return character === "'" ? 'keys need double quotes, not single quotes' : 'a key is missing or needs double quotes (a trailing comma?)';
    if (/Expected ',' or '[}\]]'|Expected ',' or/i.test(reason)) return 'a comma is missing between two items';
    if (/Unexpected non-whitespace/i.test(reason)) return 'there is extra text after the end of the JSON';
    if (/Unexpected token/i.test(reason) || /is not valid JSON/i.test(reason)) {
      if (character === "'") return "text needs double quotes (\"like this\"), not single quotes";
      if (character === ',') return 'a comma is not allowed here';
      if (character === '}' || character === ']') return 'a closing bracket is in the wrong place';
      if (character === ':') return 'a colon is not allowed here';
      if (/[A-Za-z]/.test(character || '')) return 'text needs double quotes (\"like this\"), unless it is true, false or null';
    }
    return reason;
  }

  async _validate() {
    const status = this.queryOne('#edStatus');
    const box = this._box;
    if (!status || !box || this._tooLarge) return;
    const token = (this._checkToken = (this._checkToken || 0) + 1);     // a newer check replaces an older one still running
    const text = box.getValue();
    this._errorAt = null;
    try {
      await Structra.parseJsonAsync(text);
      if (token !== this._checkToken) return;
      this._status('valid', 'check', 'Valid JSON');
    } catch (error) {
      if (token !== this._checkToken) return;
      // Say what is wrong and where. The place comes from jsonc-parser, which gives the same answer in every browser; the browsers'
      // own messages differ (Safari gives no place at all), so they are only the fallback when that parser could not load.
      let found = null;
      try { found = await Structra.jsonRepairAndValidation.explainParseError(text); } catch { /* the fallback below */ }
      if (token !== this._checkToken) return;
      if (found) {
        this._errorAt = found.offset;
        box.markError(found.offset);
        this._status('error', 'x', Structra.sharedHelpers.escapeHtml(`Line ${found.line}, column ${found.column}: ${found.reason}`.slice(0, 130)));
        status.disabled = false;
        status.title = 'Click to go to the problem';
        return;
      }
      let why = error.message;
      try { JSON.parse(text); } catch (native) { why = native.message; }
      const position = /position\s+(\d+)/i.exec(why);
      const lineAndColumn = /line\s+(\d+)\s+column\s+(\d+)/i.exec(why);
      let where = '';
      if (position) {
        this._errorAt = Number(position[1]);
        const at = box.offsetToPosition(this._errorAt);
        where = `Line ${at.line + 1}, column ${at.ch + 1}`;
        box.markError(this._errorAt);
      } else if (lineAndColumn) {
        where = `Line ${lineAndColumn[1]}, column ${lineAndColumn[2]}`;
      }
      const reason = why.replace(/\s*in JSON at position.*$/i, '').replace(/\s*\(line.*\)$/i, '').replace(/^JSON\.parse:\s*/i, '').trim();
      this._status('error', 'x', `${Structra.sharedHelpers.escapeHtml(where ? where + ': ' : '')}${Structra.sharedHelpers.escapeHtml(this._plainReason(reason, text, this._errorAt).slice(0, 110))}`);
      status.disabled = this._errorAt == null;
      status.title = this._errorAt == null ? '' : 'Click to go to the problem';
    }
  }

  /** Swap the text for new text. It counts as an edit, so the tab shows a draft and the text is checked again */
  _replaceText(text) {
    this._box.replaceAll(text);
  }

  _blocked() {
    if (!this._tooLarge) return false;
    Structra.toast('This file is too large to edit here. Use the Tree, Table or Query views.');
    return true;
  }

  async _format() {
    if (!this._box || this._blocked()) return;
    try {
      const data = await Structra.parseJsonAsync(this._box.getValue());
      this._replaceText(JSON.stringify(data, null, 2));
      Structra.toast('Formatted');
    } catch (error) {
      Structra.toast('This is not valid JSON');
    }
  }

  async _minify() {
    if (!this._box || this._blocked()) return;
    try {
      const data = await Structra.parseJsonAsync(this._box.getValue());
      const text = JSON.stringify(data);
      if (text.length > StructraEditor.MAX_LINE_CHARS) {
        Structra.toast('The minified text is one line of ' + (text.length / 1048576).toFixed(1) + ' MB, which the editor cannot show smoothly. The text was left as it is.');
        return;
      }
      this._replaceText(text);
      Structra.toast('Minified');
    } catch (error) {
      Structra.toast('This is not valid JSON');
    }
  }

  async _repair() {
    if (!this._box || this._blocked()) return;
    const before = this._box.getValue();
    if (!before.trim()) { Structra.toast('Nothing to repair'); return; }
    try {
      await Structra.parseJsonAsync(before);
      Structra.toast('Already valid JSON');
      return;
    } catch { /* invalid: fall through to repair */ }
    try {
      const fixed = await Structra.jsonRepairAndValidation.repair(before);
      this._replaceText(fixed);
      // Say how much changed, so the repair is not a leap of faith
      const lines = (text) => text.split(/\r?\n/);
      const was = lines(before), now = lines(fixed);
      let changed = Math.abs(was.length - now.length);
      for (let i = 0; i < Math.min(was.length, now.length); i++) if (was[i] !== now[i]) changed++;
      Structra.toast(`Repaired: about ${changed} line${changed === 1 ? '' : 's'} changed. Review it, then Apply. Ctrl+Z in the box undoes the repair.`);
    } catch (error) {
      const panel = document.querySelector('structra-input-panel');
      const detail = panel && panel._explainError ? panel._explainError(error.message, before).detail : error.message;
      const plain = /unexpected end|end of json/i.test(detail) ? 'The text stops before the JSON is complete, or it is not JSON at all.' : detail;
      Structra.toast('This could not be repaired automatically. ' + plain);
    }
  }

  async _apply() {
    if (!this._box || this._blocked()) return;
    try {
      const data = await Structra.parseJsonAsync(this._box.getValue());
      // Keep the document as it was, so Ctrl+Z can bring it back, and mark the tab as changed
      const tabId = Structra.tabs.activeId;
      Structra.undoStack.push(Structra.state.jsonData, 'Before editing', tabId);
      this._dropDraft(tabId);
      this._dirty = false;
      Structra.setState('jsonData', data);
      Structra.undoStack.push(data, 'Edited in the Editor', tabId);
      const tab = Structra.tabs.list.find((candidate) => candidate.id === tabId);
      if (tab) { tab.modified = true; Structra.events.emit('tabs:changed'); }
      Structra.toast('Changes applied. Ctrl+Z (outside this box) undoes them.');
    } catch (error) {
      this._validate();
      Structra.toast('These changes cannot be applied yet: ' + (this.queryOne('#edStatus').textContent || 'the JSON is not valid').trim());
    }
  }
}

customElements.define('structra-editor', StructraEditor);
