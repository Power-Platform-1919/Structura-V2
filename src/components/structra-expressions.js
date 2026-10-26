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
    this.on('state:currentPath', (d) => { this._path = Structra.dataPaths.strip(d.value); this._refresh(); });
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

    this.addEventListener('click', (e) => {
      if (e.target.closest('[data-goto-tree]')) { Structra.setState('activeView', 'tree'); return; }
      const tab = e.target.closest('.expr-subtab');
      if (tab) { this._switch(tab.dataset.sub); return; }
      const copyAll = e.target.closest('[data-copy-block]');
      if (copyAll) { Structra.sharedHelpers.copy(copyAll.closest('.expr-block').querySelector('pre').textContent, 'Action copied'); return; }
      const copy = e.target.closest('.expr-copy');
      if (copy) { Structra.sharedHelpers.copy(copy.parentElement.querySelector('.ecode').textContent, 'Copied'); return; }
      const code = e.target.closest('.ecode');
      if (code) {
        Structra.sharedHelpers.copy(code.textContent, 'Copied');
      }
      const all = e.target.closest('[data-cols-all]');
      if (all) this._setAllColumns(all.dataset.colsAll === 'on');
    });
    this.addEventListener('change', (e) => {
      const col = e.target.closest('[data-col]');
      if (col) {
        const rows = Structra.dataPaths.resolve(Structra.state.jsonData, this._path);
        if (Array.isArray(rows)) Structra.powerPlatformExpressions.setColumn(this._path, rows, col.dataset.col, col.checked);
        return;
      }
      const kind = e.target.closest('[data-src="kind"]');
      if (kind) { Structra.powerPlatformExpressions.setSource({ kind: kind.value }); return; }
      const full = e.target.closest('[data-src="full"]');
      if (full) Structra.powerPlatformExpressions.setSource({ fullOutput: full.value === 'auto' ? 'auto' : full.value === 'yes' });
    });
    this.addEventListener('input', (e) => {
      const name = e.target.closest('[data-src="name"]');
      if (name) { this._keepFocus = 'name'; Structra.powerPlatformExpressions.setSource({ name: name.value }); return; }
      const v = e.target.closest('[data-src="fxvar"]');
      if (v) { this._keepFocus = 'fxvar'; Structra.powerPlatformExpressions.setSource({ fxVar: v.value || 'jsonText' }); }
    });
    this._refresh();
  }

  /** Where does this JSON come from? The expressions start there. */
  _renderSource() {
    const el = this.$('#exprSource');
    if (!el) return;
    if (this._tab === 'helpers') { el.hidden = true; return; }
    el.hidden = false;
    const src = Structra.powerPlatformExpressions.getSource();
    const esc = Structra.sharedHelpers.esc;
    if (this._tab === 'canvas') {
      el.innerHTML = `<label class="expr-src-field">Text variable that holds the JSON
        <input type="text" data-src="fxvar" value="${esc(src.fxVar)}" spellcheck="false"></label>`;
    } else {
      const named = src.kind === 'action' || src.kind === 'item' || src.kind === 'custom';
      const label = src.kind === 'custom' ? 'Expression' : src.kind === 'item' ? 'Loop name' : 'Action name';
      const sel = (v, cur) => (v === cur ? ' selected' : '');
      el.innerHTML = `
        <label class="expr-src-field">The JSON is
          <select data-src="kind">
            <option value="action"${sel('action', src.kind)}>An action output</option>
            <option value="trigger"${sel('trigger', src.kind)}>The trigger body</option>
            <option value="item"${sel('item', src.kind)}>The current loop item</option>
            <option value="custom"${sel('custom', src.kind)}>A custom expression</option>
          </select></label>
        ${named ? `<label class="expr-src-field">${label}
          <input type="text" data-src="name" value="${esc(src.name)}" spellcheck="false"></label>` : ''}
        <label class="expr-src-field">Whole action output
          <select data-src="full" title="An action output has statusCode, headers and body. The body is the main part, so it is not repeated in the expression.">
            <option value="auto"${sel('auto', src.fullOutput)}>Detect</option>
            <option value="yes"${src.fullOutput === true ? ' selected' : ''}>Yes, skip body</option>
            <option value="no"${src.fullOutput === false ? ' selected' : ''}>No</option>
          </select></label>`;
    }
    if (this._keepFocus) {
      const f = el.querySelector(`[data-src="${this._keepFocus}"]`);
      if (f) { f.focus(); const n = f.value.length; f.setSelectionRange(n, n); }
      this._keepFocus = null;
    }
  }

  _switch(id) {
    this._tab = id;
    this.$$('.expr-subtab').forEach((b) => b.classList.toggle('active', b.dataset.sub === id));
    this.$$('.expr-pane').forEach((p) => p.classList.toggle('active', p.dataset.pane === id));
    this._refresh();
  }

  /** Render only the visible pane */
  _refresh() {
    if (!this._mounted) return;
    const data = Structra.state.jsonData;
    this._renderSource();
    const label = this.$('#exprPath');
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
      this._fill(this._tab, `<div class="expr-empty">Select a value in the Tree to see ${Structra.sharedHelpers.esc(kind)} expressions.${view === 'tree' ? '' : ' <button class="btn btn-sm" type="button" data-goto-tree>Go to the Tree</button>'}</div>`);
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
    const cols = Structra.powerPlatformExpressions.pickedColumns(this._path, value);
    if (!cols.length) return '';
    const esc = Structra.sharedHelpers.esc;
    const on = cols.filter((c) => c.on).length;
    return `<div class="expr-cols">
      <div class="expr-cols-head"><strong>Columns</strong>
        <span class="expr-note">${on} of ${cols.length} used in typed tables and Select. Choice and Person fields give one column per part (Status_Value).</span>
        <button class="btn btn-sm btn-ghost" type="button" data-cols-all="on">All</button>
        <button class="btn btn-sm btn-ghost" type="button" data-cols-all="off">None</button>
      </div>
      <div class="expr-cols-list">${cols.slice(0, 80).map((c) => `<label class="expr-col${c.on ? ' on' : ''}${c.noise ? ' noise' : ''}" title="${esc(c.noise ? c.id + ' (system field, off by default)' : c.id)}"><input type="checkbox" data-col="${esc(c.id)}"${c.on ? ' checked' : ''}>${esc(c.name)}</label>`).join('')}</div>
    </div>`;
  }

  _setAllColumns(on) {
    const rows = Structra.dataPaths.resolve(Structra.state.jsonData, this._path);
    if (!Array.isArray(rows)) return;
    Structra.powerPlatformExpressions.pickedColumns(this._path, rows).forEach((c) => { if (c.on !== on) Structra.powerPlatformExpressions.setColumn(this._path, rows, c.id, on); });
  }

  /** Action JSON: a titled block with its own copy button */
  _blocks(build) {
    let items;
    try { items = build(); } catch (err) {
      Structra.log.error('Expressions', 'Could not build flow actions', err);
      return this._empty('Could not build flow actions for this data');
    }
    const esc = Structra.sharedHelpers.esc;
    return '<p class="expr-note">Paste into a cloud flow with Peek code or the code view, under "actions".</p>' + items.map((it) => `
      <section class="expr-block">
        <header class="expr-block-head"><strong>${esc(it.label)}</strong>
          <button class="btn btn-sm" type="button" data-copy-block>Copy</button></header>
        <p class="expr-note">${esc(it.note)}</p>
        <pre>${esc(it.code)}</pre>
      </section>`).join('');
  }

  _fill(pane, html) {
    const el = this.$(`[data-pane="${pane}"]`);
    if (el) el.innerHTML = html;
  }

  _empty(msg) {
    return `<div class="expr-empty">${Structra.sharedHelpers.esc(msg)}</div>`;
  }

  _sections(build) {
    let sections;
    try {
      sections = build();
    } catch (err) {
      Structra.log.error('Expressions', 'Could not build expressions', err);
      return this._empty('Could not build expressions for this data');
    }
    const esc = Structra.sharedHelpers.esc;
    return sections.map((s) => `
      <section class="expr-section">
        ${s.title ? `<h4 class="expr-title">${esc(s.title)}</h4>` : ''}
        ${s.note ? `<p class="expr-note">${esc(s.note)}</p>` : ''}
        ${s.rows.map((r) => `<div class="expr-row"><span class="elabel" title="${esc(r.label)}">${esc(r.label)}</span><div class="ecode" title="Click to copy">${esc(r.code)}</div><button class="expr-copy" type="button" title="Copy" aria-label="Copy ${esc(r.label)}">${Structra.icons.svg('copy', { size: 14 })}</button></div>`).join('')}
      </section>`).join('');
  }
}

customElements.define('structra-expressions', StructraExpressions);
