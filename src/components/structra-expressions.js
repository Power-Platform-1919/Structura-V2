/* ============================================================
   STRUCTRA V2 - Expressions Component
   <structra-expressions> - Power Automate and Power Fx expressions
   for the selected path, plus whole-document Power Platform helpers.
   Lives in the Expressions tab of <structra-drawer>.

   Data comes from Structra.powerPlatformExpressions (rows / sections).
   Click any expression to copy it.

   Wiring (generated from the code below; update it when you add or remove an event):
     Listens to: state:currentPath, state:jsonData, expressions:source-changed,
          expressions:columns-changed, tabs:switched, drawer:tab-switched
     Sets state: activeView
   ============================================================ */

class StructraExpressions extends StructraComponent {
  init() {
    this._tab = 'automate';
    this._path = '';
    this.on('state:currentPath', (change) => { this._path = Structra.dataPaths.strip(change.value); this._refresh(); });
    this.on('state:jsonData', () => this._refresh());
    this.on('expressions:source-changed', () => this._refresh());
    this.on('expressions:columns-changed', () => this._refresh());
    this.on('tabs:switched', () => this._refresh());
    this.on('drawer:tab-switched', (id) => { if (id === 'expressions') this._refresh(); });
    this._path = Structra.dataPaths.strip(Structra.state.currentPath);
  }

  render() {
    this.innerHTML = `
      <div class="tabs expr-subtabs">
        <button class="tab expr-subtab active" type="button" data-sub="automate">Power Automate</button>
        <button class="tab expr-subtab" type="button" data-sub="canvas">Canvas app</button>
        <button class="tab expr-subtab" type="button" data-sub="flow">Flow actions</button>
        <button class="tab expr-subtab" type="button" data-sub="helpers">Helpers</button>
        <span class="expr-path" id="exprPath"></span>
      </div>
      <div class="expr-source" id="exprSource"></div>
      <div class="expr-pane active" data-pane="automate"></div>
      <div class="expr-pane" data-pane="canvas"></div>
      <div class="expr-pane" data-pane="flow"></div>
      <div class="expr-pane" data-pane="helpers"></div>`;

    this.addEventListener('click', (event) => {
      if (event.target.closest('[data-goto-tree]')) { Structra.setState('activeView', 'tree'); return; }
      const tab = event.target.closest('.expr-subtab');
      if (tab) { this._switch(tab.dataset.sub); return; }
      const copyAll = event.target.closest('[data-copy-block]');
      if (copyAll) { Structra.sharedHelpers.copyToClipboard(copyAll.closest('.expr-block').querySelector('pre').textContent, 'Action copied'); return; }
      const copy = event.target.closest('.expr-copy');
      if (copy) { Structra.sharedHelpers.copyToClipboard(copy.parentElement.querySelector('.ecode').textContent, 'Copied'); return; }
      const code = event.target.closest('.ecode');
      if (code) {
        Structra.sharedHelpers.copyToClipboard(code.textContent, 'Copied');
      }
      const all = event.target.closest('[data-cols-all]');
      if (all) this._setAllColumns(all.dataset.colsAll === 'on');
    });
    this.addEventListener('change', (event) => {
      const column = event.target.closest('[data-col]');
      if (column) {
        const rows = Structra.dataPaths.resolve(Structra.state.jsonData, this._path);
        if (Array.isArray(rows)) Structra.powerPlatformExpressions.setColumn(this._path, rows, column.dataset.col, column.checked);
        return;
      }
      const kind = event.target.closest('[data-src="kind"]');
      if (kind) { Structra.powerPlatformExpressions.setSource({ kind: kind.value }); return; }
      const full = event.target.closest('[data-src="full"]');
      if (full) Structra.powerPlatformExpressions.setSource({ fullOutput: full.value === 'auto' ? 'auto' : full.value === 'yes' });
    });
    this.addEventListener('input', (event) => {
      const name = event.target.closest('[data-src="name"]');
      if (name) { this._keepFocus = 'name'; Structra.powerPlatformExpressions.setSource({ name: name.value }); return; }
      const target = event.target.closest('[data-src="fxvar"]');
      if (target) { this._keepFocus = 'fxvar'; Structra.powerPlatformExpressions.setSource({ fxVar: target.value || 'jsonText' }); }
    });
    this._refresh();
  }

  /** Where does this JSON come from? The expressions start there. */
  _renderSource() {
    const element = this.queryOne('#exprSource');
    if (!element) return;
    if (this._tab === 'helpers') { element.hidden = true; return; }
    element.hidden = false;
    const source = Structra.powerPlatformExpressions.getSource();
    const escapeHtml = Structra.sharedHelpers.escapeHtml;
    if (this._tab === 'canvas') {
      element.innerHTML = `<label class="expr-src-field">Text variable that holds the JSON
        <input type="text" data-src="fxvar" value="${escapeHtml(source.fxVar)}" spellcheck="false"></label>`;
    } else {
      const named = source.kind === 'action' || source.kind === 'item' || source.kind === 'custom';
      const label = source.kind === 'custom' ? 'Expression' : source.kind === 'item' ? 'Loop name' : 'Action name';
      const selection = (value, current) => (value === current ? ' selected' : '');
      element.innerHTML = `
        <label class="expr-src-field">The JSON is
          <select data-src="kind">
            <option value="action"${selection('action', source.kind)}>An action output</option>
            <option value="trigger"${selection('trigger', source.kind)}>The trigger body</option>
            <option value="item"${selection('item', source.kind)}>The current loop item</option>
            <option value="custom"${selection('custom', source.kind)}>A custom expression</option>
          </select></label>
        ${named ? `<label class="expr-src-field">${label}
          <input type="text" data-src="name" value="${escapeHtml(source.name)}" spellcheck="false"></label>` : ''}
        <label class="expr-src-field">Whole action output
          <select data-src="full" title="An action output has statusCode, headers and body. The body is the main part, so it is not repeated in the expression.">
            <option value="auto"${selection('auto', source.fullOutput)}>Detect</option>
            <option value="yes"${source.fullOutput === true ? ' selected' : ''}>Yes, skip body</option>
            <option value="no"${source.fullOutput === false ? ' selected' : ''}>No</option>
          </select></label>`;
    }
    if (this._keepFocus) {
      const field = element.querySelector(`[data-src="${this._keepFocus}"]`);
      if (field) { field.focus(); const length = field.value.length; field.setSelectionRange(length, length); }
      this._keepFocus = null;
    }
  }

  _switch(id) {
    this._tab = id;
    this.queryAll('.expr-subtab').forEach((button) => button.classList.toggle('active', button.dataset.sub === id));
    this.queryAll('.expr-pane').forEach((pane) => pane.classList.toggle('active', pane.dataset.pane === id));
    this._refresh();
  }

  /** Render only the visible pane */
  _refresh() {
    if (!this._mounted) return;
    const data = Structra.state.jsonData;
    this._renderSource();
    const label = this.queryOne('#exprPath');
    if (label) label.textContent = this._tab === 'helpers' ? '' : this._path;

    if (this._tab === 'helpers') {
      this._fill('helpers', data
        ? this._sections(() => Structra.powerPlatformExpressions.helpers(data))
        : this._empty('Load JSON to see Power Platform helpers'));
      return;
    }

    const make = this._tab === 'automate' ? Structra.powerPlatformExpressions.powerAutomate : Structra.powerPlatformExpressions.powerFx;
    const kind = this._tab === 'automate' ? 'Power Automate' : this._tab === 'flow' ? 'flow action' : 'Power Fx';
    if (!data || !this._path) {
      const view = Structra.state.activeView;
      this._fill(this._tab, `<div class="expr-empty">Select a value in the Tree to see ${Structra.sharedHelpers.escapeHtml(kind)} expressions.${view === 'tree' ? '' : ' <button class="btn btn-sm" type="button" data-goto-tree>Go to the Tree</button>'}</div>`);
      return;
    }
    const value = Structra.dataPaths.resolve(data, this._path);
    if (value === undefined) {
      this._fill(this._tab, this._empty('No value at this path'));
      return;
    }
    // Typed tables and Select actions are built from the columns the person keeps ticked
    const picker = this._tab === 'automate' ? '' : this._columnPicker(value);
    if (this._tab === 'flow') {
      this._fill('flow', picker + this._blocks(() => Structra.powerPlatformExpressions.flowActions(this._path, value)));
      this.querySelectorAll('[data-pane="flow"] .expr-block pre').forEach((pre) => Structra.codeView.colorize(pre, pre.textContent, 'json'));
      return;
    }
    this._fill(this._tab, picker + this._sections(() => [{ rows: make(this._path, value) }]));
  }

  /** For a list of records: which columns go into typed tables (Power Fx) and the Select action (flow). */
  _columnPicker(value) {
    if (!Array.isArray(value) || !value.length || !value[0] || typeof value[0] !== 'object' || Array.isArray(value[0])) return '';
    const columns = Structra.powerPlatformExpressions.pickedColumns(this._path, value);
    if (!columns.length) return '';
    const escapeHtml = Structra.sharedHelpers.escapeHtml;
    const shownCount = columns.filter((column) => column.on).length;
    return `<div class="expr-cols">
      <div class="expr-cols-head"><strong>Columns</strong>
        <span class="expr-note">${shownCount} of ${columns.length} used in typed tables and Select. Choice and Person fields give one column per part (Status_Value).</span>
        <button class="btn btn-sm btn-ghost" type="button" data-cols-all="on">All</button>
        <button class="btn btn-sm btn-ghost" type="button" data-cols-all="off">None</button>
      </div>
      <div class="expr-cols-list">${columns.slice(0, 80).map((column) => `<label class="expr-col${column.on ? ' on' : ''}${column.noise ? ' noise' : ''}" title="${escapeHtml(column.noise ? column.id + ' (system field, off by default)' : column.id)}"><input type="checkbox" data-col="${escapeHtml(column.id)}"${column.on ? ' checked' : ''}>${escapeHtml(column.name)}</label>`).join('')}</div>
    </div>`;
  }

  _setAllColumns(checked) {
    const rows = Structra.dataPaths.resolve(Structra.state.jsonData, this._path);
    if (!Array.isArray(rows)) return;
    Structra.powerPlatformExpressions.pickedColumns(this._path, rows).forEach((column) => { if (column.on !== checked) Structra.powerPlatformExpressions.setColumn(this._path, rows, column.id, checked); });
  }

  /** Action JSON: a titled block with its own copy button */
  _blocks(build) {
    let items;
    try { items = build(); } catch (error) {
      Structra.log.error('Expressions', 'Could not build flow actions', error);
      return this._empty('Could not build flow actions for this data');
    }
    const escapeHtml = Structra.sharedHelpers.escapeHtml;
    return '<p class="expr-note">Paste into a cloud flow with Peek code or the code view, under "actions".</p>' + items.map((item) => `
      <section class="expr-block">
        <header class="expr-block-head"><strong>${escapeHtml(item.label)}</strong>
          <button class="btn btn-sm" type="button" data-copy-block>Copy</button></header>
        <p class="expr-note">${escapeHtml(item.note)}</p>
        <pre>${escapeHtml(item.code)}</pre>
      </section>`).join('');
  }

  _fill(pane, html) {
    const element = this.queryOne(`[data-pane="${pane}"]`);
    if (element) element.innerHTML = html;
  }

  _empty(message) {
    return `<div class="expr-empty">${Structra.sharedHelpers.escapeHtml(message)}</div>`;
  }

  _sections(build) {
    let sections;
    try {
      sections = build();
    } catch (error) {
      Structra.log.error('Expressions', 'Could not build expressions', error);
      return this._empty('Could not build expressions for this data');
    }
    const escapeHtml = Structra.sharedHelpers.escapeHtml;
    return sections.map((section) => `
      <section class="expr-section">
        ${section.title ? `<h4 class="expr-title">${escapeHtml(section.title)}</h4>` : ''}
        ${section.note ? `<p class="expr-note">${escapeHtml(section.note)}</p>` : ''}
        ${section.rows.map((row) => `<div class="expr-row"><span class="elabel" title="${escapeHtml(row.label)}">${escapeHtml(row.label)}</span><div class="ecode" title="Click to copy">${escapeHtml(row.code)}</div><button class="expr-copy" type="button" title="Copy" aria-label="Copy ${escapeHtml(row.label)}">${Structra.icons.svg('copy', { size: 14 })}</button></div>`).join('')}
      </section>`).join('');
  }
}

customElements.define('structra-expressions', StructraExpressions);
