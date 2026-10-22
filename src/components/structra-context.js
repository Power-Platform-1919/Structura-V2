/* ============================================================
   STRUCTRA V2 — Context Panel Component
   <structra-context> — right detail panel (value, meta, actions)
   ============================================================ */

class StructraContext extends StructraElement {
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
    this.on('overlay:close', () => Structra.set('contextPanelOpen', false));
    this.on('bookmarks:changed', () => this._renderBookmarks());
    this.on('state:fileName', () => this._renderBookmarks());
  }

  render() {
    this.innerHTML = `
      <div class="panel-head">
        <span class="panel-title">Node</span>
        <span class="panel-sub" id="ctxPath">—</span>
        <button class="btn btn-icon btn-ghost" type="button" data-action="close" aria-label="Close panel" title="Close">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="ctx-body">
        <div class="ctx-section">
          <div class="ctx-label">Value</div>
          <div class="ctx-value" id="ctxValue">—</div>
        </div>
        <div class="ctx-section" id="ctxPreviewSection" hidden>
          <div class="ctx-label">Content Preview</div>
          <div class="ctx-preview" id="ctxPreview"></div>
        </div>
        <div class="ctx-section">
          <div class="ctx-label">Properties</div>
          <dl class="ctx-meta" id="ctxMeta"><dt>Type</dt><dd>—</dd></dl>
        </div>
        <div class="ctx-section">
          <div class="ctx-label">Bookmarks</div>
          <div class="ctx-bookmarks" id="ctxBookmarks"></div>
        </div>
        <div class="ctx-section">
          <div class="ctx-label">Actions</div>
          <div class="ctx-actions">
            <button class="ctx-btn" data-action="copy-value">Copy Value</button>
            <button class="ctx-btn" data-action="copy-path">Copy Path</button>
            <button class="ctx-btn" data-action="bookmark">Bookmark</button>
            <button class="ctx-btn" data-action="filter">Filter</button>
            <button class="ctx-btn" data-action="mock">Mock</button>
          </div>
        </div>
      </div>`;
    this._renderBookmarks();

    this.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const a = btn.dataset.action;
      if (a === 'close') Structra.set('contextPanelOpen', false);
      else if (a === 'copy-value') this._copyValue();
      else if (a === 'copy-path') this._copyPath();
      else if (a === 'bookmark') this._toggleBookmark();
      else if (a === 'go-bookmark') Structra.set('currentPath', btn.dataset.path);
      else if (a === 'del-bookmark') Structra.bookmarks.remove(btn.dataset.path);
      else if (a === 'filter') this._filterFromContext();
      else if (a === 'mock') this._mockFromContext();
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
    const esc = Structra.dom.esc;
    const items = Structra.bookmarks.list();
    el.innerHTML = items.length
      ? items.map((b) => `<div class="ctx-bm">
          <button class="ctx-bm-path" data-action="go-bookmark" data-path="${esc(b.path)}" title="${esc(b.preview || b.path)}">${esc(b.path)}</button>
          <button class="ctx-bm-del" data-action="del-bookmark" data-path="${esc(b.path)}" title="Remove bookmark">&times;</button>
        </div>`).join('')
      : '<div class="ctx-bm-empty">No bookmarks yet. Press Ctrl+B on a path.</div>';
  }

  _show(path) {
    Structra.set('contextPanelOpen', true);
    this._currentPath = path;

    const data = Structra.state.jsonData;
    const val = this._resolve(data, path);

    this.$('#ctxPath').textContent = path;

    // Value preview
    const valEl = this.$('#ctxValue');
    if (val === null) valEl.textContent = 'null';
    else if (typeof val === 'object') valEl.textContent = JSON.stringify(val, null, 2).slice(0, 200);
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

  /* ======== CONTENT PREVIEW — pattern detection ======== */

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
      <span class="ctx-det-value">${d.html || Structra.util.esc(d.display || val.slice(0, 80))}</span>
    </div>`).join('');
  }

  _detectPatterns(str) {
    const detections = [];
    const s = str.trim();

    // URL
    if (/^https?:\/\/.+/i.test(s)) {
      detections.push({ type: 'url', html: `<a href="${Structra.util.esc(s)}" target="_blank" rel="noopener" class="ctx-link">${Structra.util.esc(s.slice(0, 60))}</a>` });
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
        detections.push({ type: 'jwt', display: `JWT — sub: ${payload.sub || '?'}, exp: ${payload.exp ? new Date(payload.exp * 1000).toISOString() : '?'}` });
      } catch { detections.push({ type: 'jwt', display: 'JWT token (decode failed)' }); }
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

  _filterFromContext() {
    if (!this._currentPath) return;
    Structra.set('filterBarOpen', true);
    Structra.toast('Filter opened');
  }

  _mockFromContext() {
    const data = Structra.state.jsonData;
    const val = this._resolve(data, this._currentPath);
    if (val == null) { Structra.toast('No value to mock', 'warning'); return; }
    const mocked = Structra.mockGen.generate(val, 3);
    Structra.util.copy(JSON.stringify(mocked, null, 2), 'Mock data copied to clipboard');
  }

  _resolve(data, path) {
    if (!data || !path || path === '$') return data;
    const parts = path.replace(/^\$\.?/, '').replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
    let cur = data;
    for (const p of parts) {
      if (cur == null) return undefined;
      cur = Array.isArray(cur) ? cur[parseInt(p, 10)] : cur[p];
    }
    return cur;
  }

  _copyValue() {
    const text = this.$('#ctxValue').textContent;
    Structra.util.copy(text, 'Value copied');
  }

  _copyPath() {
    const text = this.$('#ctxPath').textContent;
    Structra.util.copy(text, 'Path copied');
  }

}

customElements.define('structra-context', StructraContext);
