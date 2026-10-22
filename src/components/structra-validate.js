/* ============================================================
   STRUCTRA V2 — Schema Validation
   <structra-validate> — validate the open data against a JSON Schema.
   Paste a schema, or start from one inferred from the data.
   Click an error to jump to that path in the tree.
   ============================================================ */

class StructraValidate extends StructraOverlay {
  static get MAX_SHOWN() { return 200; }

  init() {
    super.init();
    this.on('validate:open', () => this._open());
  }

  render() {
    this.mount({
      title: 'Validate against a JSON Schema',
      size: 'lg',
      body: `
        <div class="field">
          <label for="valSchema">JSON Schema</label>
          <textarea class="val-schema" id="valSchema" spellcheck="false" placeholder='Paste a JSON Schema, for example {"type":"object","required":["id"]}'></textarea>
        </div>
        <div class="row val-actions">
          <button class="btn btn-primary" type="button" data-action="validate">Validate</button>
          <button class="btn" type="button" data-action="infer">Use inferred schema</button>
          <span class="val-summary" id="valSummary" aria-live="polite"></span>
        </div>
        <div class="val-results" id="valResults"></div>`,
    });

    this.root.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const a = btn.dataset.action;
      if (a === 'infer') this._infer();
      else if (a === 'validate') this._run();
      else if (a === 'goto') this._goto(btn.dataset.path);
    });
  }

  _open() {
    if (!Structra.state.jsonData) { Structra.toast('Load JSON first'); return; }
    this.open();
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
      const esc = Structra.util.esc;
      this._summary(errors.length + ' problem' + (errors.length === 1 ? '' : 's') + ' found'
        + (errors.length > shown.length ? ' (showing the first ' + shown.length + ')' : ''), 'bad');
      results.innerHTML = shown.map((e) => `
        <div class="val-err">
          <button class="val-path" type="button" data-action="goto" data-path="${esc(e.path)}" title="Show in tree">${esc(e.path || 'root')}</button>
          <span class="val-msg">${esc(e.message)}</span>
        </div>`).join('');
    } catch (err) {
      Structra.log.error('Validate', 'Validation failed', err);
      this._summary('Could not validate: ' + err.message, 'bad');
    }
  }

  _goto(path) {
    this.close();
    Structra.set('activeView', 'tree');
    Structra.set('currentPath', path || '$');
  }
}

customElements.define('structra-validate', StructraValidate);
