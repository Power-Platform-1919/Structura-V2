/* ============================================================
   STRUCTRA V2 - Schema Validation
   <structra-validate> - validate the open data against a JSON Schema.
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
    if (!Structra.state.jsonData) { Structra.toast('Open a file first'); return; }
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

      // The same problem in thousands of rows is one line with a count and the first place it happens
      const esc = Structra.util.esc;
      const groups = new Map();
      for (const e of errors) {
        const general = (e.path || 'root').replace(/\[\d+\]/g, '[*]');
        const key = general + '\u0001' + e.message;
        let g = groups.get(key);
        if (!g) { g = { general, message: e.message, count: 0, first: e.path }; groups.set(key, g); }
        g.count++;
      }
      const list = [...groups.values()].sort((a, b) => b.count - a.count);
      const kinds = list.length;
      this._summary(`${errors.length.toLocaleString()} problem${errors.length === 1 ? '' : 's'} found, of ${kinds} kind${kinds === 1 ? '' : 's'}`, 'bad');
      results.innerHTML = list.slice(0, StructraValidate.MAX_SHOWN).map((g) => `
        <div class="val-err">
          <button class="val-path" type="button" data-action="goto" data-path="${esc(g.first)}" title="Show the first one in the tree">${esc(g.general)}</button>
          <span class="val-msg">${esc(g.message)}</span>
          <span class="val-count">${g.count === 1 ? '1 place' : g.count.toLocaleString() + ' places'}</span>
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
