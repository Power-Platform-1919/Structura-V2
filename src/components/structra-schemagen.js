/* ============================================================
   STRUCTRA V2 — Parse JSON Schema Generator
   <structra-schemagen> — JSON Schema for the Power Automate
   "Parse JSON" action, generated from the loaded data.
   Lives in the Schema Gen tab of <structra-drawer>.
   ============================================================ */

class StructraSchemaGen extends StructraElement {
  init() {
    this._allItems = true;
    this._integers = false;     // false: every number is "number" (safe); true: whole numbers are "integer"
    this._required = true;
    this._stale = true;
    this.on('state:jsonData', () => { this._stale = true; this._refresh(); });
    this.on('tabs:switched', () => { this._stale = true; this._refresh(); });
    this.on('drawer:tab-switched', () => this._refresh());
    this.on('state:drawerState', () => this._refresh());
  }

  /** Generating a schema reads every array item, so only do it while this tab can be seen */
  _visible() {
    const panel = this.closest('.drawer-panel');
    const drawer = this.closest('structra-drawer');
    return !!panel && panel.classList.contains('active') && !!drawer && !drawer.classList.contains('collapsed');
  }

  render() {
    this.innerHTML = `
      <div class="sg-toolbar">
        <button class="btn btn-primary" data-action="copy">Copy schema</button>
        <label class="sg-opt" title="Read every array item to find optional and nullable keys">
          <input type="checkbox" data-action="all-items" checked> Read all items
        </label>
        <label class="sg-opt" title="Off: all numbers are typed number, which also accepts whole numbers. On: whole numbers are typed integer, and a later 1.5 would fail the Parse JSON action">
          <input type="checkbox" data-action="integers"> Whole numbers as integer
        </label>
        <label class="sg-opt" title="Off: no key is required, so a missing key never fails the Parse JSON action">
          <input type="checkbox" data-action="required" checked> Mark keys as required
        </label>
        <span class="sg-hint">Paste into the Parse JSON action</span>
      </div>
      <pre class="sg-output" id="sgOutput"></pre>`;

    this.addEventListener('click', (e) => {
      if (!e.target.closest('[data-action="copy"]')) return;
      const text = this.$('#sgOutput').dataset.schema;
      if (!text) { Structra.toast('No schema to copy'); return; }
      Structra.util.copy(text, 'Schema copied');
    });
    this.addEventListener('change', (e) => {
      const a = e.target.dataset && e.target.dataset.action;
      if (a === 'integers') this._integers = e.target.checked;
      else if (a === 'required') this._required = e.target.checked;
      else if (a === 'all-items') this._allItems = e.target.checked;
      else return;
      this._stale = true;
      this._refresh();
    });
    this._refresh();
  }

  _refresh() {
    if (!this._mounted || !this._visible() || !this._stale) return;
    this._stale = false;
    const out = this.$('#sgOutput');
    const data = Structra.state.jsonData;
    if (!out) return;
    if (!data) {
      out.dataset.schema = '';
      out.textContent = 'Load JSON to generate a schema';
      return;
    }
    try {
      const opts = { integers: this._integers, required: this._required };
      const schema = this._allItems ? Structra.schemaGen.smart(data, opts) : Structra.schemaGen.basic(data, opts);
      const text = JSON.stringify(schema, null, 2);
      out.dataset.schema = text;
      out.textContent = text;
    } catch (err) {
      Structra.log.error('SchemaGen', 'Schema generation failed', err);
      out.dataset.schema = '';
      out.textContent = 'Could not generate a schema for this data';
    }
  }
}

customElements.define('structra-schemagen', StructraSchemaGen);
