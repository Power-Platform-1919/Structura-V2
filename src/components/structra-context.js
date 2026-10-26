/* ============================================================
   STRUCTRA V2 - Context Panel Component
   <structra-context> - right detail panel (value, meta, actions)

   Wiring (generated from the code below; update it when you add or remove an event):
     Listens to: tree:node-selected, state:contextPanelOpen, overlay:close,
          bookmarks:changed, state:fileName
     Emits: drawer:show, find:prefill
     Sets state: contextPanelOpen, currentPath
   ============================================================ */

class StructraContext extends StructraComponent {
  static get observedAttributes() { return ['path']; }

  init() {
    this.on('tree:node-selected', (path) => {
      Structra.log.debug('Context', 'Node selected: ' + path);
      this._show(path);
    });
    this.on('state:contextPanelOpen', (isOpen) => {
      Structra.log.debug('Context', 'contextPanel ' + (isOpen.value ? 'opened' : 'closed'));
      this.classList.toggle('show', isOpen.value);
    });
    this.on('overlay:close', () => Structra.setState('contextPanelOpen', false));
    this.on('bookmarks:changed', () => this._renderBookmarks());
    this.on('state:fileName', () => this._renderBookmarks());
  }

  render() {
    this.innerHTML = `
      <div class="panel-head">
        <span class="panel-title">Node</span>
        <span class="panel-sub" id="ctxPath">-</span>
        <button class="btn btn-icon btn-ghost" type="button" data-action="close" aria-label="Close panel" title="Close">
          ${Structra.icons.svg('x', { size: 16 })}
        </button>
      </div>
      <div class="ctx-body">
        <div class="ctx-section">
          <div class="ctx-label">Value</div>
          <div class="ctx-value" id="ctxValue">-</div>
        </div>
        <div class="ctx-section" id="ctxPreviewSection" hidden>
          <div class="ctx-label">Content Preview</div>
          <div class="ctx-preview" id="ctxPreview"></div>
        </div>
        <div class="ctx-section">
          <div class="ctx-label">Properties</div>
          <dl class="ctx-meta" id="ctxMeta"><dt>Type</dt><dd>-</dd></dl>
        </div>
        <div class="ctx-section" id="ctxPpSection" hidden>
          <div class="ctx-label">Use in Power Platform</div>
          <div class="ctx-pp" id="ctxPp"></div>
        </div>
        <div class="ctx-section">
          <div class="ctx-label">Bookmarks</div>
          <div class="ctx-bookmarks" id="ctxBookmarks"></div>
        </div>
        <div class="ctx-section">
          <div class="ctx-label">Actions</div>
          <div class="ctx-actions">
            <button class="ctx-btn" data-action="copy-value" title="Copy this value as it is in the file">Copy value</button>
            <button class="ctx-btn" data-action="copy-path" title="Copy the path to this value">Copy path</button>
            <button class="ctx-btn" data-action="bookmark" title="Keep this place in the list of bookmarks (Ctrl+B)">Bookmark</button>
            <button class="ctx-btn" data-action="find-value" title="Find every place this value appears">Find this value</button>
          </div>
        </div>
      </div>`;
    this._renderBookmarks();

    this.addEventListener('click', (event) => {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      const actionName = button.dataset.action;
      if (actionName === 'close') Structra.setState('contextPanelOpen', false);
      else if (actionName === 'copy-value') this._copyValue();
      else if (actionName === 'copy-path') this._copyPath();
      else if (actionName === 'bookmark') this._toggleBookmark();
      else if (actionName === 'go-bookmark') Structra.setState('currentPath', button.dataset.path);
      else if (actionName === 'del-bookmark') Structra.bookmarks.remove(button.dataset.path);
      else if (actionName === 'find-value') this._findValue();
      else if (actionName === 'mock') this._mockFromContext();
      else if (actionName === 'copy-pp') Structra.sharedHelpers.copyToClipboard(button.dataset.code, 'Copied');
      else if (actionName === 'pp-source') Structra.events.emit('drawer:show', 'expressions');
    });
  }

  _toggleBookmark() {
    const path = this._currentPath || Structra.state.currentPath;
    if (!path || path === '$') { Structra.toast('Select a path to bookmark'); return; }
    Structra.toast(Structra.bookmarks.toggle(path) ? 'Bookmarked ' + path : 'Bookmark removed');
  }

  _renderBookmarks() {
    const element = this.queryOne('#ctxBookmarks');
    if (!element) return;
    const escapeHtml = Structra.sharedHelpers.escapeHtml;
    const items = Structra.bookmarks.list();
    element.innerHTML = items.length
      ? items.map((item) => `<div class="ctx-bm">
          <button class="ctx-bm-path" data-action="go-bookmark" data-path="${escapeHtml(item.path)}" title="${escapeHtml(item.preview || item.path)}">${escapeHtml(item.path)}</button>
          <button class="ctx-bm-del" data-action="del-bookmark" data-path="${escapeHtml(item.path)}" title="Remove bookmark">${Structra.icons.svg('x', { size: 14 })}</button>
        </div>`).join('')
      : '<div class="ctx-bm-empty">No bookmarks yet. Press Ctrl+B on a path.</div>';
  }

  _show(path) {
    Structra.setState('contextPanelOpen', true);
    this._currentPath = path;

    const data = Structra.state.jsonData;
    const value = this._resolve(data, path);
    this._currentValue = value;

    this.queryOne('#ctxPath').textContent = path;
    this._renderPowerPlatform(path, value);

    // Value preview
    const valElement = this.queryOne('#ctxValue');
    if (value === null) valElement.textContent = 'null';
    else if (typeof value === 'object') Structra.codeView.colorize(valElement, this._previewJson(value), 'json');
    else valElement.textContent = String(value);

    // Content preview (pattern detection)
    this._renderContentPreview(value);

    // Meta
    const meta = this.queryOne('#ctxMeta');
    const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
    let metaHtml = `<dt>Type</dt><dd>${type}</dd>`;
    if (Array.isArray(value)) metaHtml += `<dt>Length</dt><dd>${value.length}</dd>`;
    else if (value && typeof value === 'object') metaHtml += `<dt>Keys</dt><dd>${Object.keys(value).length}</dd>`;
    else if (typeof value === 'string') metaHtml += `<dt>Length</dt><dd>${value.length}</dd>`;
    meta.innerHTML = metaHtml;
  }

  /**
   * The first part of a value as JSON text, for the preview box. Only the first few items of each list and object are
   * turned into text: the whole value can be as big as the document, and the box shows only the start of it anyway.
   */
  _previewJson(value) {
    const KEEP = 12;
    const trim = (value, depth) => {
      if (value === null || typeof value !== 'object') return value;
      if (depth > 3) return Array.isArray(value) ? ['…'] : { '…': '…' };
      if (Array.isArray(value)) {
        const part = value.slice(0, KEEP).map((x) => trim(x, depth + 1));
        if (value.length > KEEP) part.push('… ' + (value.length - KEEP).toLocaleString() + ' more');
        return part;
      }
      const out = {};
      const keys = Object.keys(value);
      for (const k of keys.slice(0, KEEP)) out[k] = trim(value[k], depth + 1);
      if (keys.length > KEEP) out['…'] = (keys.length - KEEP).toLocaleString() + ' more';
      return out;
    };
    const text = JSON.stringify(trim(value, 0), null, 2);
    return text.length > 600 ? text.slice(0, 600) + '\n…' : text;
  }

  /* ======== CONTENT PREVIEW - pattern detection ======== */

  _renderContentPreview(value) {
    const section = this.queryOne('#ctxPreviewSection');
    const preview = this.queryOne('#ctxPreview');
    if (!section || !preview) return;

    if (typeof value !== 'string' || value.length === 0) {
      section.hidden = true;
      return;
    }

    const detections = this._detectPatterns(value);
    if (detections.length === 0) {
      section.hidden = true;
      return;
    }

    section.hidden = false;
    preview.innerHTML = detections.map(detection => `<div class="ctx-detection">
      <span class="ctx-det-badge ctx-det-${detection.type}">${detection.type}</span>
      <span class="ctx-det-value">${detection.html || Structra.sharedHelpers.escapeHtml(detection.display || value.slice(0, 80))}</span>
    </div>`).join('');
  }

  _detectPatterns(text) {
    const detections = [];
    const trimmed = text.trim();

    // URL
    if (/^https?:\/\/.+/i.test(trimmed)) {
      detections.push({ type: 'url', html: `<a href="${Structra.sharedHelpers.escapeHtml(trimmed)}" target="_blank" rel="noopener" class="ctx-link">${Structra.sharedHelpers.escapeHtml(trimmed.slice(0, 60))}</a>` });
    }

    // Email
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      detections.push({ type: 'email', display: trimmed });
    }

    // UUID
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
      detections.push({ type: 'uuid', display: trimmed });
    }

    // ISO date / datetime
    if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?/.test(trimmed)) {
      const date = new Date(trimmed);
      if (!isNaN(date.getTime())) {
        detections.push({ type: 'date', display: date.toLocaleString() });
      }
    }

    // IPv4
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(trimmed)) {
      detections.push({ type: 'ip', display: trimmed });
    }

    // JWT
    if (/^eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(trimmed)) {
      try {
        const payload = JSON.parse(atob(trimmed.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        detections.push({ type: 'jwt', display: `JWT, sub: ${payload.sub || '?'}, exp: ${payload.exp ? new Date(payload.exp * 1000).toISOString() : '?'}` });
      } catch { detections.push({ type: 'jwt', display: 'JWT token (could not be decoded)' }); }
    }

    // Color hex
    if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(trimmed)) {
      detections.push({ type: 'color', html: `<span class="ctx-color-swatch" style="background:${trimmed}"></span> ${trimmed}` });
    }

    // Base64
    if (/^[A-Za-z0-9+/]{20,}={0,2}$/.test(trimmed) && trimmed.length > 30) {
      detections.push({ type: 'base64', display: `Base64 (${trimmed.length} chars → ~${Math.floor(trimmed.length * 0.75)} bytes)` });
    }

    // Phone number
    if (/^[\+]?[\d\s\-\(\)]{7,15}$/.test(trimmed) && /\d{7,}/.test(trimmed.replace(/\D/g, ''))) {
      detections.push({ type: 'phone', display: trimmed });
    }

    return detections;
  }

  /** The expressions a maker wants for this value, one click to copy. The full set lives in the Expressions tab. */
  _renderPowerPlatform(path, value) {
    const section = this.queryOne('#ctxPpSection');
    const box = this.queryOne('#ctxPp');
    if (!section || !box) return;
    if (!path || path === '$') { section.hidden = true; return; }
    const escapeHtml = Structra.sharedHelpers.escapeHtml;
    const rows = Structra.powerPlatformExpressions.quick(path, value);
    const source = Structra.powerPlatformExpressions.getSource();
    const srcText = source.kind === 'trigger' ? 'the trigger body' : source.kind === 'item' ? 'the current loop item' : source.kind === 'custom' ? 'your own expression' : `the action ${source.name}`;
    box.innerHTML = rows.map((row) => `
      <div class="ctx-pp-row">
        <div class="ctx-pp-head"><span class="ctx-pp-app ctx-pp-${row.app === 'Power Fx' ? 'fx' : 'pa'}">${escapeHtml(row.app)}</span><span class="ctx-pp-label">${escapeHtml(row.label)}</span></div>
        <div class="ctx-pp-line">
          <code class="ctx-pp-code">${escapeHtml(row.code)}</code>
          <button class="ctx-pp-copy" type="button" data-action="copy-pp" data-code="${escapeHtml(row.code)}" title="Copy" aria-label="Copy ${escapeHtml(row.label)}">${Structra.icons.svg('copy', { size: 14 })}</button>
        </div>
      </div>`).join('') + `<div class="ctx-pp-src">Reading from ${escapeHtml(srcText)}. <button class="ctx-link-btn" type="button" data-action="pp-source">Change</button></div>`;
    section.hidden = false;
  }

  /** Search the whole document for this value (a number or text; objects and lists have no single value to search for) */
  _findValue() {
    const currentValue = this._currentValue;
    if (currentValue === null || currentValue === undefined || typeof currentValue === 'object') { Structra.toast('Select a text, number or true/false value to find where else it appears'); return; }
    Structra.events.emit('find:prefill', String(currentValue));
  }

  _mockFromContext() {
    const value = this._currentValue;
    if (value == null) { Structra.toast('No value to mock', 'warning'); return; }
    const mocked = Structra.mockDataGenerator.generate(value, 3);
    Structra.sharedHelpers.copyToClipboard(JSON.stringify(mocked, null, 2), 'Mock data copied to clipboard');
  }

  _resolve(data, path) {
    if (!data || !path || path === '$') return data;
    return Structra.dataPaths.resolve(data, path);
  }

  _copyValue() {
    // The whole value, not the shortened text shown on screen
    const currentValue = this._currentValue;
    const text = currentValue === undefined ? '' : (typeof currentValue === 'string' ? currentValue : JSON.stringify(currentValue, null, 2));
    Structra.sharedHelpers.copyToClipboard(text, 'Value copied');
  }

  _copyPath() {
    const text = this.queryOne('#ctxPath').textContent;
    Structra.sharedHelpers.copyToClipboard(text, 'Path copied');
  }

}

customElements.define('structra-context', StructraContext);
