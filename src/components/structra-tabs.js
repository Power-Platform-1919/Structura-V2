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
      <div class="doc-tab ${t.id === activeId ? 'active' : ''} ${t.modified || t.draft ? 'modified' : ''}"
           data-id="${t.id}" role="tab" aria-selected="${t.id === activeId}" tabindex="${t.id === activeId ? 0 : -1}" draggable="true"
           aria-label="${Structra.util.esc(t.label)}${t.modified ? ' (changed)' : t.draft ? ' (typed changes not applied)' : ''}">
        ${Structra.icons.svg('file', { cls: 'tab-icon' })}
        <span class="tab-label">${Structra.util.esc(t.label)}</span>
        <span class="tab-modified"></span>
        <span class="tab-close" data-close="${t.id}">
          ${Structra.icons.svg('x')}
        </span>
      </div>`).join('');

    this.innerHTML = `
      <div class="doc-tab-scroll" role="tablist" aria-label="Open documents">${tabsHtml}</div>
      <button class="doc-tab-add" title="New tab (Alt+N)">+</button>`;

    // Event delegation
    this.addEventListener('click', this._handleClick);
    this.addEventListener('dblclick', this._handleDblClick);
    this.addEventListener('contextmenu', this._handleContext);
    this.addEventListener('dragstart', this._dragStart);
    this.addEventListener('dragover', this._dragOver);
    this.addEventListener('drop', this._drop);
    this.addEventListener('dragend', () => this.$$('.doc-tab').forEach((t) => t.classList.remove('drop-before', 'drop-after', 'dragging')));
    this.addEventListener('keydown', this._keys);
  }

  /* ---- reorder by dragging ---- */
  _dragStart = (e) => {
    const tab = e.target.closest('.doc-tab');
    if (!tab) return;
    this._dragId = Number(tab.dataset.id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', tab.querySelector('.tab-label').textContent);
    tab.classList.add('dragging');
  }

  _dragOver = (e) => {
    const tab = e.target.closest('.doc-tab');
    if (!tab || this._dragId == null) return;
    e.preventDefault();
    const r = tab.getBoundingClientRect();
    const before = e.clientX < r.left + r.width / 2;
    this.$$('.doc-tab').forEach((t) => t.classList.remove('drop-before', 'drop-after'));
    if (Number(tab.dataset.id) !== this._dragId) tab.classList.add(before ? 'drop-before' : 'drop-after');
  }

  _drop = (e) => {
    const tab = e.target.closest('.doc-tab');
    const from = this._dragId;
    this._dragId = null;
    if (!tab || from == null) return;
    e.preventDefault();
    const to = Number(tab.dataset.id);
    if (to === from) return;
    const list = Structra.tabs.list;
    const moving = list.find((t) => t.id === from);
    const r = tab.getBoundingClientRect();
    const before = e.clientX < r.left + r.width / 2;
    list.splice(list.indexOf(moving), 1);
    const at = list.findIndex((t) => t.id === to);
    list.splice(before ? at : at + 1, 0, moving);
    Structra.events.emit('tabs:changed');
  }

  /* ---- keyboard: arrows move between tabs ---- */
  _keys = (e) => {
    const tab = e.target.closest('.doc-tab');
    if (!tab || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Enter' && e.key !== ' ')) return;
    const list = Structra.tabs.list;
    const i = list.findIndex((t) => t.id === Number(tab.dataset.id));
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this._switchTab(list[i].id); return; }
    const next = list[(i + (e.key === 'ArrowRight' ? 1 : -1) + list.length) % list.length];
    e.preventDefault();
    this._switchTab(next.id);
    requestAnimationFrame(() => this.$(`.doc-tab[data-id="${next.id}"]`)?.focus());
  }

  /* ---- right-click menu ---- */
  _handleContext = (e) => {
    const tabEl = e.target.closest('.doc-tab');
    if (!tabEl) return;
    e.preventDefault();
    const id = Number(tabEl.dataset.id);
    const list = Structra.tabs.list;
    const idx = list.findIndex((t) => t.id === id);
    const items = [
      { label: 'Close', run: () => this._closeTab(id) },
      { label: 'Close other tabs', disabled: list.length < 2, run: () => list.filter((t) => t.id !== id).forEach((t) => this._closeTab(t.id)) },
      { label: 'Close tabs to the right', disabled: idx === list.length - 1, run: () => list.slice(idx + 1).forEach((t) => this._closeTab(t.id)) },
      '-',
      { label: 'Duplicate', run: () => { const t = list[idx]; this._addTab(t.label + ' (copy)', t.data); } },
      { label: 'Rename', run: () => { const el = this.$(`.doc-tab[data-id="${id}"]`); if (el) this._startRename(el); } },
    ];
    this._closeMenu();
    const menu = document.createElement('div');
    menu.className = 'menu';
    menu.setAttribute('role', 'menu');
    menu.innerHTML = items.map((it, i) => it === '-' ? '<div class="menu-sep"></div>'
      : `<button class="menu-item" type="button" role="menuitem" data-i="${i}"${it.disabled ? ' disabled' : ''}>${Structra.util.esc(it.label)}</button>`).join('');
    document.body.appendChild(menu);
    const r = menu.getBoundingClientRect();
    menu.style.left = Math.max(8, Math.min(e.clientX, innerWidth - r.width - 8)) + 'px';
    menu.style.top = Math.max(8, Math.min(e.clientY, innerHeight - r.height - 8)) + 'px';
    menu.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-i]');
      if (b && !b.disabled) items[Number(b.dataset.i)].run();
      this._closeMenu();
    });
    this._menu = menu;
    setTimeout(() => {
      this._off = (ev) => { if (ev.type === 'keydown' && ev.key !== 'Escape') return; if (ev.type === 'mousedown' && menu.contains(ev.target)) return; this._closeMenu(); };
      document.addEventListener('mousedown', this._off); document.addEventListener('keydown', this._off);
    }, 0);
  }

  _closeMenu() {
    if (this._menu) { this._menu.remove(); this._menu = null; }
    if (this._off) { document.removeEventListener('mousedown', this._off); document.removeEventListener('keydown', this._off); this._off = null; }
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
      Structra.toast(`You can have ${constants.MAX_TABS} tabs open. Close one to open another.`, 'warning');
      return;
    }
    const id = tabs.nextId++;
    if (!label) { let n = 1; while (tabs.list.some((t) => t.label === `Untitled ${n}`)) n++; label = `Untitled ${n}`; }
    const newTab = {
      id,
      label,
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

    // Keep what was in the tab, so closing it is never final: the message offers to bring it back
    const closed = tabs.list[idx];
    const ds = Structra.engine.getDataset(id);
    const snapshot = closed.data || (ds && ds.raw) || null;
    const wasEmpty = !snapshot;

    tabs.list.splice(idx, 1);
    Structra.events.emit('tabs:closed', id);
    if (!wasEmpty) {
      Structra.toast(`Closed ${closed.label}`, { action: { label: 'Reopen', run: () => this._reopen(closed, snapshot, idx) } });
    }

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

  /** Put a closed tab back, with its file and the place it was in the strip */
  _reopen(closed, snapshot, idx) {
    const tabs = Structra.tabs;
    if (tabs.list.length >= Structra.constants.MAX_TABS) { Structra.toast('Too many tabs are open to reopen it'); return; }
    // An untouched empty tab is replaced rather than left behind
    const onlyEmpty = tabs.list.length === 1 && !tabs.list[0].data;
    const id = tabs.nextId++;
    const tab = { ...closed, id, data: snapshot, modified: !!closed.modified };
    if (onlyEmpty) tabs.list.length = 0;
    tabs.list.splice(Math.min(idx, tabs.list.length), 0, tab);
    tabs.activeId = id;
    Structra.events.emit('tabs:changed');
    Structra.events.emit('tabs:switched', tab);
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
