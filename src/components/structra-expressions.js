/* ============================================================
   STRUCTRA V2 — Expressions Component
   <structra-expressions> — Power Automate and Power Fx expressions
   for the selected path, plus whole-document Power Platform helpers.
   Lives in the Expressions tab of <structra-drawer>.

   Data comes from Structra.expressions (rows / sections).
   Click any expression to copy it.
   ============================================================ */

class StructraExpressions extends StructraElement {
  init() {
    this._tab = 'automate';
    this._path = '';
    this.on('state:currentPath', (d) => { this._path = Structra.paths.strip(d.value); this._refresh(); });
    this.on('state:jsonData', () => this._refresh());
    this.on('tabs:switched', () => this._refresh());
    this.on('drawer:tab-switched', (id) => { if (id === 'expressions') this._refresh(); });
    this._path = Structra.paths.strip(Structra.state.currentPath);
  }

  render() {
    this.innerHTML = `
      <div class="expr-subtabs">
        <button class="expr-subtab active" data-sub="automate">Power Automate</button>
        <button class="expr-subtab" data-sub="canvas">Canvas app</button>
        <button class="expr-subtab" data-sub="helpers">Helpers</button>
        <span class="expr-path" id="exprPath"></span>
      </div>
      <div class="expr-pane active" data-pane="automate"></div>
      <div class="expr-pane" data-pane="canvas"></div>
      <div class="expr-pane" data-pane="helpers"></div>`;

    this.addEventListener('click', (e) => {
      const tab = e.target.closest('.expr-subtab');
      if (tab) { this._switch(tab.dataset.sub); return; }
      const code = e.target.closest('.ecode');
      if (code) {
        Structra.util.copy(code.textContent, 'Copied');
      }
    });
    this._refresh();
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
    const label = this.$('#exprPath');
    if (label) label.textContent = this._tab === 'helpers' ? '' : this._path;

    if (this._tab === 'helpers') {
      this._fill('helpers', data
        ? this._sections(() => Structra.expressions.helpers(data))
        : this._empty('Load JSON to see Power Platform helpers'));
      return;
    }

    const make = this._tab === 'automate' ? Structra.expressions.powerAutomate : Structra.expressions.powerFx;
    const kind = this._tab === 'automate' ? 'Power Automate' : 'Power Fx';
    if (!data || !this._path) {
      this._fill(this._tab, this._empty('Select a path in the tree to see ' + kind + ' expressions'));
      return;
    }
    const value = Structra.paths.resolve(data, this._path);
    if (value === undefined) {
      this._fill(this._tab, this._empty('No value at this path'));
      return;
    }
    this._fill(this._tab, this._sections(() => [{ rows: make(this._path, value) }]));
  }

  _fill(pane, html) {
    const el = this.$(`[data-pane="${pane}"]`);
    if (el) el.innerHTML = html;
  }

  _empty(msg) {
    return `<div class="expr-empty">${Structra.dom.esc(msg)}</div>`;
  }

  _sections(build) {
    let sections;
    try {
      sections = build();
    } catch (err) {
      Structra.log.error('Expressions', 'Could not build expressions', err);
      return this._empty('Could not build expressions for this data');
    }
    const esc = Structra.dom.esc;
    return sections.map((s) => `
      <section class="expr-section">
        ${s.title ? `<h4 class="expr-title">${esc(s.title)}</h4>` : ''}
        ${s.note ? `<p class="expr-note">${esc(s.note)}</p>` : ''}
        ${s.rows.map((r) => `<div class="expr-row"><span class="elabel">${esc(r.label)}</span><div class="ecode" title="Click to copy">${esc(r.code)}</div></div>`).join('')}
      </section>`).join('');
  }
}

customElements.define('structra-expressions', StructraExpressions);
