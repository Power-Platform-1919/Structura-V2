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
    this.on('state:contextPanelOpen', (d) => {
      Structra.log.debug('Context', 'contextPanel ' + (d.value ? 'opened' : 'closed'));
      this.classList.toggle('show', d.value);
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

    this.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const a = btn.dataset.action;
      if (a === 'close') Structra.setState('contextPanelOpen', false);
      else if (a === 'copy-value') this._copyValue();
      else if (a === 'copy-path') this._copyPath();
      else if (a === 'bookmark') this._toggleBookmark();
      else if (a === 'go-bookmark') Structra.setState('currentPath', btn.dataset.path);
      else if (a === 'del-bookmark') Structra.bookmarks.remove(btn.dataset.path);
      else if (a === 'find-value') this._findValue();
      else if (a === 'mock') this._mockFromContext();
      else if (a === 'copy-pp') Structra.sharedHelpers.copy(btn.dataset.code, 'Copied');
      else if (a === 'pp-source') Structra.events.emit('drawer:show', 'expressions');
    });
  }

  _toggleBookmark() {
    const path = this._currentPath || Structra.state.currentPath;
    if (!path || path === '$') { Structra.toast('Select a path to bookmark'); return; }
    Structra.toast(Structra.bookmarks.toggle(path) ? 'Bookmarked ' + path : 'Bookmark removed');
  }

  _renderBookmarks() {
    const el = this.$('#ctxBookmarks');
    if (!el) return;
    const esc = Structra.sharedHelpers.esc;
    const items = Structra.bookmarks.list();
    el.innerHTML = items.length
      ? items.map((b) => `<div class="ctx-bm">
          <button class="ctx-bm-path" data-action="go-bookmark" data-path="${esc(b.path)}" title="${esc(b.preview || b.path)}">${esc(b.path)}</button>
          <button class="ctx-bm-del" data-action="del-bookmark" data-path="${esc(b.path)}" title="Remove bookmark">${Structra.icons.svg('x', { size: 14 })}</button>
        </div>`).join('')
      : '<div class="ctx-bm-empty">No bookmarks yet. Press Ctrl+B on a path.</div>';
  }

  _show(path) {
    Structra.setState('contextPanelOpen', true);
    this._currentPath = path;

    const data = Structra.state.jsonData;
    const val = this._resolve(data, path);
    this._currentValue = val;

    this.$('#ctxPath').textContent = path;
    this._renderPowerPlatform(path, val);

    // Value preview
    const valEl = this.$('#ctxValue');
    if (val === null) valEl.textContent = 'null';
    else if (typeof val === 'object') Structra.codeView.colorize(valEl, this._previewJson(val), 'json');
    else valEl.textContent = String(val);

    // Content preview (pattern detection)
    this._renderContentPreview(val);

    // Meta
    const meta = this.$('#ctxMeta');
    const type = val === null ? 'null' : Array.isArray(val) ? 'array' : typeof val;
    let metaHtml = `<dt>Type</dt><dd>${type}</dd>`;
    if (Array.isArray(val)) metaHtml += `<dt>Length</dt><dd>${val.length}</dd>`;
    else if (val && typeof val === 'object') metaHtml += `<dt>Keys</dt><dd>${Object.keys(val).length}</dd>`;
    else if (typeof val === 'string') metaHtml += `<dt>Length</dt><dd>${val.length}</dd>`;
    meta.innerHTML = metaHtml;
  }

  /**
   * The first part of a value as JSON text, for the preview box. Only the first few items of each list and object are
   * turned into text: the whole value can be as big as the document, and the box shows only the start of it anyway.
   */
  _previewJson(val) {
    const KEEP = 12;
    const trim = (v, depth) => {
      if (v === null || typeof v !== 'object') return v;
      if (depth > 3) return Array.isArray(v) ? ['…'] : { '…': '…' };
      if (Array.isArray(v)) {
        const part = v.slice(0, KEEP).map((x) => trim(x, depth + 1));
        if (v.length > KEEP) part.push('… ' + (v.length - KEEP).toLocaleString() + ' more');
        return part;
      }
      const out = {};
      const keys = Object.keys(v);
      for (const k of keys.slice(0, KEEP)) out[k] = trim(v[k], depth + 1);
      if (keys.length > KEEP) out['…'] = (keys.length - KEEP).toLocaleString() + ' more';
      return out;
    };
    const text = JSON.stringify(trim(val, 0), null, 2);
    return text.length > 600 ? text.slice(0, 600) + '\n…' : text;
  }

  /* ======== CONTENT PREVIEW - pattern detection ======== */

  _renderContentPreview(val) {
    const section = this.$('#ctxPreviewSection');
    const preview = this.$('#ctxPreview');
    if (!section || !preview) return;

    if (typeof val !== 'string' || val.length === 0) {
      section.hidden = true;
      return;
    }

    const detections = this._detectPatterns(val);
    if (detections.length === 0) {
      section.hidden = true;
      return;
    }

    section.hidden = false;
    preview.innerHTML = detections.map(d => `<div class="ctx-detection">
      <span class="ctx-det-badge ctx-det-${d.type}">${d.type}</span>
      <span class="ctx-det-value">${d.html || Structra.sharedHelpers.esc(d.display || val.slice(0, 80))}</span>
    </div>`).join('');
  }

  _detectPatterns(str) {
    const detections = [];
    const s = str.trim();

    // URL
    if (/^https?:\/\/.+/i.test(s)) {
      detections.push({ type: 'url', html: `<a href="${Structra.sharedHelpers.esc(s)}" target="_blank" rel="noopener" class="ctx-link">${Structra.sharedHelpers.esc(s.slice(0, 60))}</a>` });
    }

    // Email
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) {
      detections.push({ type: 'email', display: s });
    }

    // UUID
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) {
      detections.push({ type: 'uuid', display: s });
    }

    // ISO date / datetime
    if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?/.test(s)) {
      const d = new Date(s);
      if (!isNaN(d.getTime())) {
        detections.push({ type: 'date', display: d.toLocaleString() });
      }
    }

    // IPv4
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(s)) {
      detections.push({ type: 'ip', display: s });
    }

    // JWT
    if (/^eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(s)) {
      try {
        const payload = JSON.parse(atob(s.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        detections.push({ type: 'jwt', display: `JWT, sub: ${payload.sub || '?'}, exp: ${payload.exp ? new Date(payload.exp * 1000).toISOString() : '?'}` });
      } catch { detections.push({ type: 'jwt', display: 'JWT token (could not be decoded)' }); }
    }

    // Color hex
    if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(s)) {
      detections.push({ type: 'color', html: `<span class="ctx-color-swatch" style="background:${s}"></span> ${s}` });
    }

    // Base64
    if (/^[A-Za-z0-9+/]{20,}={0,2}$/.test(s) && s.length > 30) {
      detections.push({ type: 'base64', display: `Base64 (${s.length} chars → ~${Math.floor(s.length * 0.75)} bytes)` });
    }

    // Phone number
    if (/^[\+]?[\d\s\-\(\)]{7,15}$/.test(s) && /\d{7,}/.test(s.replace(/\D/g, ''))) {
      detections.push({ type: 'phone', display: s });
    }

    return detections;
  }

  /** The expressions a maker wants for this value, one click to copy. The full set lives in the Expressions tab. */
  _renderPowerPlatform(path, val) {
    const section = this.$('#ctxPpSection');
    const box = this.$('#ctxPp');
    if (!section || !box) return;
    if (!path || path === '$') { section.hidden = true; return; }
    const esc = Structra.sharedHelpers.esc;
    const rows = Structra.powerPlatformExpressions.quick(path, val);
    const src = Structra.powerPlatformExpressions.getSource();
    const srcText = src.kind === 'trigger' ? 'the trigger body' : src.kind === 'item' ? 'the current loop item' : src.kind === 'custom' ? 'your own expression' : `the action ${src.name}`;
    box.innerHTML = rows.map((r) => `
      <div class="ctx-pp-row">
        <div class="ctx-pp-head"><span class="ctx-pp-app ctx-pp-${r.app === 'Power Fx' ? 'fx' : 'pa'}">${esc(r.app)}</span><span class="ctx-pp-label">${esc(r.label)}</span></div>
        <div class="ctx-pp-line">
          <code class="ctx-pp-code">${esc(r.code)}</code>
          <button class="ctx-pp-copy" type="button" data-action="copy-pp" data-code="${esc(r.code)}" title="Copy" aria-label="Copy ${esc(r.label)}">${Structra.icons.svg('copy', { size: 14 })}</button>
        </div>
      </div>`).join('') + `<div class="ctx-pp-src">Reading from ${esc(srcText)}. <button class="ctx-link-btn" type="button" data-action="pp-source">Change</button></div>`;
    section.hidden = false;
  }

  /** Search the whole document for this value (a number or text; objects and lists have no single value to search for) */
  _findValue() {
    const v = this._currentValue;
    if (v === null || v === undefined || typeof v === 'object') { Structra.toast('Select a text, number or true/false value to find where else it appears'); return; }
    Structra.events.emit('find:prefill', String(v));
  }

  _mockFromContext() {
    const val = this._currentValue;
    if (val == null) { Structra.toast('No value to mock', 'warning'); return; }
    const mocked = Structra.mockDataGenerator.generate(val, 3);
    Structra.sharedHelpers.copy(JSON.stringify(mocked, null, 2), 'Mock data copied to clipboard');
  }

  _resolve(data, path) {
    if (!data || !path || path === '$') return data;
    return Structra.dataPaths.resolve(data, path);
  }

  _copyValue() {
    // The whole value, not the shortened text shown on screen
    const v = this._currentValue;
    const text = v === undefined ? '' : (typeof v === 'string' ? v : JSON.stringify(v, null, 2));
    Structra.sharedHelpers.copy(text, 'Value copied');
  }

  _copyPath() {
    const text = this.$('#ctxPath').textContent;
    Structra.sharedHelpers.copy(text, 'Path copied');
  }

}

customElements.define('structra-context', StructraContext);
