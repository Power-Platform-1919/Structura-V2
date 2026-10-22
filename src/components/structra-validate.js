/* ============================================================
   STRUCTRA V2 — Schema Validation
   <structra-validate> — validate the open data against a JSON Schema.
   Paste a schema, or start from one inferred from the data.
   Click an error to jump to that path in the tree.
   ============================================================ */

class StructraValidate extends StructraElement {
  static get MAX_SHOWN() { return 200; }

  init() {
    this.on('validate:open', () => this._open());
    this.on('overlay:close', () => this._close());
  }

  render() {
    this.innerHTML = `
      <div class="val-overlay" id="valOverlay">
        <div class="val-box" role="dialog" aria-label="Validate JSON Schema">
          <div class="val-head">
            <span class="val-title">Validate against a JSON Schema</span>
            <button class="val-close" data-action="close" aria-label="Close">&times;</button>
          </div>
          <textarea class="val-schema" id="valSchema" spellcheck="false" placeholder='Paste a JSON Schema, for example {"type":"object","required":["id"]}'></textarea>
          <div class="val-actions">
            <button class="btn btn-primary" data-action="validate">Validate</button>
            <button class="btn" data-action="infer">Use inferred schema</button>
            <span class="val-summary" id="valSummary"></span>
          </div>
          <div class="val-results" id="valResults"></div>
        </div>
      </div>`;

    this.addEventListener('click', (e) => {
      if (e.target.id === 'valOverlay') { this._close(); return; }
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const a = btn.dataset.action;
      if (a === 'close') this._close();
      else if (a === 'infer') this._infer();
      else if (a === 'validate') this._run();
      else if (a === 'goto') this._goto(btn.dataset.path);
    });
  }

  _open() {
    if (!Structra.state.jsonData) { Structra.toast('Load JSON first'); return; }
    this.$('#valOverlay').classList.add('show');
    this.$('#valSchema').focus();
  }

  _close() {
    const o = this.$('#valOverlay');
    if (o) o.classList.remove('show');
  }

  _infer() {
    const data = Structra.state.jsonData;
    if (!data) return;
    this.$('#valSchema').value = JSON.stringify(Structra.schemaGen.smart(data), null, 2);
    this._summary('Inferred from the loaded data. Edit it, then validate.', '');
  }

  _summary(text, kind) {
    const el = this.$('#valSummary');
    el.textContent = text;
    el.className = 'val-summary' + (kind ? ' ' + kind : '');
  }

  async _run() {
    const results = this.$('#valResults');
    results.innerHTML = '';
    let schema;
    try {
      schema = JSON.parse(this.$('#valSchema').value);
    } catch (err) {
      this._summary('The schema is not valid JSON: ' + err.message, 'bad');
      return;
    }

    this._summary('Validating...', '');
    try {
      const { valid, errors } = await Structra.jsonTools.validate(Structra.state.jsonData, schema);
      if (valid) { this._summary('Valid. The data matches the schema.', 'ok'); return; }

      const shown = errors.slice(0, StructraValidate.MAX_SHOWN);
      const esc = Structra.dom.esc;
      this._summary(errors.length + ' problem' + (errors.length === 1 ? '' : 's') + ' found'
        + (errors.length > shown.length ? ' (showing the first ' + shown.length + ')' : ''), 'bad');
      results.innerHTML = shown.map((e) => `
        <div class="val-err">
          <button class="val-path" data-action="goto" data-path="${esc(e.path)}" title="Show in tree">${esc(e.path || 'root')}</button>
          <span class="val-msg">${esc(e.message)}</span>
        </div>`).join('');
    } catch (err) {
      Structra.log.error('Validate', 'Validation failed', err);
      this._summary('Could not validate: ' + err.message, 'bad');
    }
  }

  _goto(path) {
    this._close();
    Structra.set('activeView', 'tree');
    Structra.set('currentPath', path || '$');
  }
}

customElements.define('structra-validate', StructraValidate);
