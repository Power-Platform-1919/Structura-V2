/* ============================================================
   STRUCTRA V2 — Tabs Component
   <structra-tabs> — document tab bar (multi-tab system)
   ============================================================ */

class StructraTabs extends StructraElement {
  static get observedAttributes() { return ['max-tabs']; }

  init() {
    this.on('tabs:changed', () => this.render());
    this.on('tabs:add', () => this._addTab());
    this.on('tabs:close-active', () => this._closeTab(Structra.tabs.activeId));
  }

  render() {
    const tabs = Structra.tabs.list;
    const activeId = Structra.tabs.activeId;

    const tabsHtml = tabs.map(t => `
      <div class="doc-tab ${t.id === activeId ? 'active' : ''} ${t.modified ? 'modified' : ''}"
           data-id="${t.id}">
        <svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
        <span class="tab-label">${t.label}</span>
        <span class="tab-modified"></span>
        <span class="tab-close" data-close="${t.id}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </span>
      </div>`).join('');

    this.innerHTML = `
      <div class="doc-tab-scroll">${tabsHtml}</div>
      <button class="doc-tab-add" title="New tab (Ctrl+T)">+</button>`;

    // Event delegation
    this.addEventListener('click', this._handleClick);
    this.addEventListener('dblclick', this._handleDblClick);
  }

  _handleClick = (e) => {
    const close = e.target.closest('[data-close]');
    if (close) {
      e.stopPropagation();
      this._closeTab(Number(close.dataset.close));
      return;
    }

    const add = e.target.closest('.doc-tab-add');
    if (add) {
      this._addTab();
      return;
    }

    const tab = e.target.closest('.doc-tab');
    if (tab) {
      this._switchTab(Number(tab.dataset.id));
    }
  }

  _handleDblClick = (e) => {
    const tab = e.target.closest('.doc-tab');
    if (tab) this._startRename(tab);
  }

  _addTab(label, data) {
    const { tabs, constants } = { tabs: Structra.tabs, constants: Structra.constants };
    if (tabs.list.length >= constants.MAX_TABS) {
      Structra.toast(`Max ${constants.MAX_TABS} tabs`);
      return;
    }
    const id = tabs.nextId++;
    const newTab = {
      id,
      label: label || `Untitled ${id}`,
      data: data || null,
      path: '$',
      view: 'tree',
      modified: false,
    };
    tabs.list.push(newTab);
    tabs.activeId = id;
    Structra.events.emit('tabs:changed');
    Structra.events.emit('tabs:switched', newTab);
  }

  _closeTab(id) {
    const tabs = Structra.tabs;
    const idx = tabs.list.findIndex(t => t.id === id);
    if (idx === -1) return;

    tabs.list.splice(idx, 1);
    Structra.events.emit('tabs:closed', id);

    if (tabs.list.length === 0) {
      this._addTab();
      return;
    }

    if (tabs.activeId === id) {
      const next = tabs.list[Math.min(idx, tabs.list.length - 1)];
      tabs.activeId = next.id;
      Structra.events.emit('tabs:switched', next);
    }
    Structra.events.emit('tabs:changed');
  }

  _switchTab(id) {
    if (Structra.tabs.activeId === id) return;
    Structra.tabs.activeId = id;
    const tab = Structra.tabs.list.find(t => t.id === id);
    Structra.events.emit('tabs:changed');
    Structra.events.emit('tabs:switched', tab);
  }

  _startRename(tabEl) {
    const label = tabEl.querySelector('.tab-label');
    const old = label.textContent;
    label.contentEditable = 'true';
    label.focus();

    const done = () => {
      label.contentEditable = 'false';
      const newName = label.textContent.trim() || old;
      label.textContent = newName;
      const id = Number(tabEl.dataset.id);
      const tab = Structra.tabs.list.find(t => t.id === id);
      if (tab) tab.label = newName;
    };

    label.addEventListener('blur', done, { once: true });
    label.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); label.blur(); }
      if (e.key === 'Escape') { label.textContent = old; label.blur(); }
    });
  }
}

customElements.define('structra-tabs', StructraTabs);
