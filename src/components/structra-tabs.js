/* ============================================================
   STRUCTRA V2 - Tabs Component
   <structra-tabs> - document tab bar (multi-tab system)

   Wiring (generated from the code below; update it when you add or remove an event):
     Listens to: tabs:changed, tabs:add, tabs:close-active
     Emits: tabs:changed, tabs:switched, tabs:closed
   ============================================================ */

class StructraTabs extends StructraComponent {
  static get observedAttributes() { return ['max-tabs']; }

  init() {
    this.on('tabs:changed', () => this.render());
    this.on('tabs:add', () => this._addTab());
    this.on('tabs:close-active', () => this._closeTab(Structra.tabs.activeId));
  }

  render() {
    const tabs = Structra.tabs.list;
    const activeId = Structra.tabs.activeId;

    const tabsHtml = tabs.map(tab => `
      <div class="doc-tab ${tab.id === activeId ? 'active' : ''} ${tab.modified || tab.draft ? 'modified' : ''}"
           data-id="${tab.id}" role="tab" aria-selected="${tab.id === activeId}" tabindex="${tab.id === activeId ? 0 : -1}" draggable="true"
           aria-label="${Structra.sharedHelpers.escapeHtml(tab.label)}${tab.modified ? ' (changed)' : tab.draft ? ' (typed changes not applied)' : ''}">
        ${Structra.icons.svg('file', { cls: 'tab-icon' })}
        <span class="tab-label">${Structra.sharedHelpers.escapeHtml(tab.label)}</span>
        <span class="tab-modified"></span>
        <span class="tab-close" data-close="${tab.id}">
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
    this.addEventListener('dragend', () => this.queryAll('.doc-tab').forEach((tab) => tab.classList.remove('drop-before', 'drop-after', 'dragging')));
    this.addEventListener('keydown', this._keys);
  }

  /* ---- reorder by dragging ---- */
  _dragStart = (event) => {
    const tab = event.target.closest('.doc-tab');
    if (!tab) return;
    this._dragId = Number(tab.dataset.id);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', tab.querySelector('.tab-label').textContent);
    tab.classList.add('dragging');
  }

  _dragOver = (event) => {
    const tab = event.target.closest('.doc-tab');
    if (!tab || this._dragId == null) return;
    event.preventDefault();
    const rect = tab.getBoundingClientRect();
    const before = event.clientX < rect.left + rect.width / 2;
    this.queryAll('.doc-tab').forEach((tab) => tab.classList.remove('drop-before', 'drop-after'));
    if (Number(tab.dataset.id) !== this._dragId) tab.classList.add(before ? 'drop-before' : 'drop-after');
  }

  _drop = (event) => {
    const tab = event.target.closest('.doc-tab');
    const from = this._dragId;
    this._dragId = null;
    if (!tab || from == null) return;
    event.preventDefault();
    const to = Number(tab.dataset.id);
    if (to === from) return;
    const list = Structra.tabs.list;
    const moving = list.find((tab) => tab.id === from);
    const rect = tab.getBoundingClientRect();
    const before = event.clientX < rect.left + rect.width / 2;
    list.splice(list.indexOf(moving), 1);
    const at = list.findIndex((tab) => tab.id === to);
    list.splice(before ? at : at + 1, 0, moving);
    Structra.events.emit('tabs:changed');
  }

  /* ---- keyboard: arrows move between tabs ---- */
  _keys = (event) => {
    const tab = event.target.closest('.doc-tab');
    if (!tab || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Enter' && event.key !== ' ')) return;
    const list = Structra.tabs.list;
    const i = list.findIndex((t) => t.id === Number(tab.dataset.id));
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); this._switchTab(list[i].id); return; }
    const next = list[(i + (event.key === 'ArrowRight' ? 1 : -1) + list.length) % list.length];
    event.preventDefault();
    this._switchTab(next.id);
    requestAnimationFrame(() => this.queryOne(`.doc-tab[data-id="${next.id}"]`)?.focus());
  }

  /* ---- right-click menu ---- */
  _handleContext = (event) => {
    const tabEl = event.target.closest('.doc-tab');
    if (!tabEl) return;
    event.preventDefault();
    const id = Number(tabEl.dataset.id);
    const list = Structra.tabs.list;
    const index = list.findIndex((tab) => tab.id === id);
    const items = [
      { label: 'Close', run: () => this._closeTab(id) },
      { label: 'Close other tabs', disabled: list.length < 2, run: () => list.filter((tab) => tab.id !== id).forEach((tab) => this._closeTab(tab.id)) },
      { label: 'Close tabs to the right', disabled: index === list.length - 1, run: () => list.slice(index + 1).forEach((tab) => this._closeTab(tab.id)) },
      '-',
      { label: 'Duplicate', run: () => { const tab = list[index]; this._addTab(tab.label + ' (copy)', tab.data); } },
      { label: 'Rename', run: () => { const element = this.queryOne(`.doc-tab[data-id="${id}"]`); if (element) this._startRename(element); } },
    ];
    this._closeMenu();
    const menu = document.createElement('div');
    menu.className = 'menu';
    menu.setAttribute('role', 'menu');
    menu.innerHTML = items.map((item, i) => item === '-' ? '<div class="menu-sep"></div>'
      : `<button class="menu-item" type="button" role="menuitem" data-i="${i}"${item.disabled ? ' disabled' : ''}>${Structra.sharedHelpers.escapeHtml(item.label)}</button>`).join('');
    document.body.appendChild(menu);
    const rect = menu.getBoundingClientRect();
    menu.style.left = Math.max(8, Math.min(event.clientX, innerWidth - rect.width - 8)) + 'px';
    menu.style.top = Math.max(8, Math.min(event.clientY, innerHeight - rect.height - 8)) + 'px';
    menu.addEventListener('click', (event) => {
      const button = event.target.closest('[data-i]');
      if (button && !button.disabled) items[Number(button.dataset.i)].run();
      this._closeMenu();
    });
    this._menu = menu;
    setTimeout(() => {
      this._off = (event) => { if (event.type === 'keydown' && event.key !== 'Escape') return; if (event.type === 'mousedown' && menu.contains(event.target)) return; this._closeMenu(); };
      document.addEventListener('mousedown', this._off); document.addEventListener('keydown', this._off);
    }, 0);
  }

  _closeMenu() {
    if (this._menu) { this._menu.remove(); this._menu = null; }
    if (this._off) { document.removeEventListener('mousedown', this._off); document.removeEventListener('keydown', this._off); this._off = null; }
  }

  _handleClick = (event) => {
    const close = event.target.closest('[data-close]');
    if (close) {
      event.stopPropagation();
      this._closeTab(Number(close.dataset.close));
      return;
    }

    const add = event.target.closest('.doc-tab-add');
    if (add) {
      this._addTab();
      return;
    }

    const tab = event.target.closest('.doc-tab');
    if (tab) {
      this._switchTab(Number(tab.dataset.id));
    }
  }

  _handleDblClick = (event) => {
    const tab = event.target.closest('.doc-tab');
    if (tab) this._startRename(tab);
  }

  _addTab(label, data) {
    const { tabs, constants } = { tabs: Structra.tabs, constants: Structra.constants };
    if (tabs.list.length >= constants.MAX_TABS) {
      Structra.toast(`You can have ${constants.MAX_TABS} tabs open. Close one to open another.`, 'warning');
      return;
    }
    const id = tabs.nextId++;
    if (!label) { let number = 1; while (tabs.list.some((tab) => tab.label === `Untitled ${number}`)) number++; label = `Untitled ${number}`; }
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
    const index = tabs.list.findIndex(tab => tab.id === id);
    if (index === -1) return;

    // Keep what was in the tab, so closing it is never final: the message offers to bring it back
    const closed = tabs.list[index];
    const dataset = Structra.dataEngine.getDataset(id);
    const snapshot = closed.data || (dataset && dataset.raw) || null;
    const wasEmpty = !snapshot;

    tabs.list.splice(index, 1);
    Structra.events.emit('tabs:closed', id);
    if (!wasEmpty) {
      Structra.toast(`Closed ${closed.label}`, { action: { label: 'Reopen', run: () => this._reopen(closed, snapshot, index) } });
    }

    if (tabs.list.length === 0) {
      this._addTab();
      return;
    }

    if (tabs.activeId === id) {
      const next = tabs.list[Math.min(index, tabs.list.length - 1)];
      tabs.activeId = next.id;
      Structra.events.emit('tabs:switched', next);
    }
    Structra.events.emit('tabs:changed');
  }

  /** Put a closed tab back, with its file and the place it was in the strip */
  _reopen(closed, snapshot, index) {
    const tabs = Structra.tabs;
    if (tabs.list.length >= Structra.constants.MAX_TABS) { Structra.toast('Too many tabs are open to reopen it'); return; }
    // An untouched empty tab is replaced rather than left behind
    const onlyEmpty = tabs.list.length === 1 && !tabs.list[0].data;
    const id = tabs.nextId++;
    const tab = { ...closed, id, data: snapshot, modified: !!closed.modified };
    if (onlyEmpty) tabs.list.length = 0;
    tabs.list.splice(Math.min(index, tabs.list.length), 0, tab);
    tabs.activeId = id;
    Structra.events.emit('tabs:changed');
    Structra.events.emit('tabs:switched', tab);
  }

  _switchTab(id) {
    if (Structra.tabs.activeId === id) return;
    Structra.tabs.activeId = id;
    const tab = Structra.tabs.list.find(tab => tab.id === id);
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
      const tab = Structra.tabs.list.find(tab => tab.id === id);
      if (tab) { tab.label = newName; if (newName !== old) tab.customLabel = true; }
    };

    label.addEventListener('blur', done, { once: true });
    label.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); label.blur(); }
      if (event.key === 'Escape') { label.textContent = old; label.blur(); }
    });
  }
}

customElements.define('structra-tabs', StructraTabs);
