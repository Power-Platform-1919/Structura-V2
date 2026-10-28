/* ============================================================
   STRUCTRA V2 - Schema Validation
   <structra-validate> - validate the open data against a JSON Schema.
   Paste a schema, or start from one inferred from the data.
   Click an error to jump to that path in the tree.

   Wiring (generated from the code below; update it when you add or remove an event):
     Listens to: validate:open
     Sets state: activeView, currentPath
   ============================================================ */

class StructraValidate extends StructraDialog {
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

    this.root.addEventListener('click', (event) => {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      const action = button.dataset.action;
      if (action === 'infer') this._infer();
      else if (action === 'validate') this._run();
      else if (action === 'goto') this._goToPath(button.dataset.path);
    });
  }

  _open() {
    if (!Structra.state.jsonData) { Structra.toast('Open a file first'); return; }
    this.open();
  }

  _infer() {
    const data = Structra.state.jsonData;
    if (!data) return;
    this.queryOne('#valSchema').value = JSON.stringify(Structra.parseJsonSchemaGenerator.smart(data), null, 2);
    this._summary('Inferred from the loaded data. Edit it, then validate.', '');
  }

  _summary(text, kind) {
    const element = this.queryOne('#valSummary');
    element.textContent = text;
    element.className = 'val-summary' + (kind ? ' ' + kind : '');
  }

  async _run() {
    const results = this.queryOne('#valResults');
    results.innerHTML = '';
    let schema;
    try {
      schema = JSON.parse(this.queryOne('#valSchema').value);
    } catch (error) {
      this._summary('The schema is not valid JSON: ' + error.message, 'bad');
      return;
    }

    this._summary('Validating...', '');
    try {
      const { valid, errors, note } = await Structra.jsonRepairAndValidation.validate(Structra.state.jsonData, schema);
      const withNote = (text) => (note ? text + ' ' + note : text);
      if (valid) { this._summary(withNote('Valid. The data matches the schema.'), 'ok'); return; }

      // The same problem in thousands of rows is one line with a count and the first place it happens
      const escapeHtml = Structra.sharedHelpers.escapeHtml;
      const groups = new Map();
      for (const error of errors) {
        const general = (error.path || 'root').replace(/\[\d+\]/g, '[*]');
        const key = general + '\u0001' + error.message;
        let group = groups.get(key);
        if (!group) { group = { general, message: error.message, count: 0, first: error.path }; groups.set(key, group); }
        group.count++;
      }
      const list = [...groups.values()].sort((first, second) => second.count - first.count);
      const kinds = list.length;
      this._summary(withNote(`${errors.length.toLocaleString()} problem${errors.length === 1 ? '' : 's'} found, of ${kinds} kind${kinds === 1 ? '' : 's'}`), 'bad');
      results.innerHTML = list.slice(0, StructraValidate.MAX_SHOWN).map((group) => `
        <div class="val-err">
          <button class="val-path" type="button" data-action="goto" data-path="${escapeHtml(group.first)}" title="Show the first one in the tree">${escapeHtml(group.general)}</button>
          <span class="val-msg">${escapeHtml(group.message)}</span>
          <span class="val-count">${group.count === 1 ? '1 place' : group.count.toLocaleString() + ' places'}</span>
        </div>`).join('');
    } catch (error) {
      Structra.log.error('Validate', 'Validation failed', error);
      this._summary('Could not validate: ' + error.message, 'bad');
    }
  }

  _goToPath(path) {
    this.close();
    Structra.setState('activeView', 'tree');
    Structra.setState('currentPath', path || '$');
  }
}

customElements.define('structra-validate', StructraValidate);
