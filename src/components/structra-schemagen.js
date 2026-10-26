/* ============================================================
   STRUCTRA V2 - Parse JSON Schema Generator
   <structra-schemagen> - JSON Schema for the Power Automate
   "Parse JSON" action, generated from the loaded data.
   Lives in the Schema Gen tab of <structra-drawer>.

   Wiring (generated from the code below; update it when you add or remove an event):
     Listens to: state:currentPath, state:jsonData, tabs:switched, drawer:tab-switched,
          state:drawerState
   ============================================================ */

class StructraSchemaGen extends StructraComponent {
  init() {
    this._allItems = true;
    this._integers = false;     // false: every number is "number" (safe); true: whole numbers are "integer"
    this._required = true;
    this._selected = false;     // true: only the value selected in the Tree
    this._stale = true;
    this.on('state:currentPath', () => { if (this._selected) { this._stale = true; this._refresh(); } this._syncScope(); });
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
        <label class="sg-opt" title="The Parse JSON action often gets one part of a response, such as body. Select that part in the Tree first">
          <input type="checkbox" data-action="selected"> <span id="sgScope">Only the selected value</span>
        </label>
        <label class="sg-opt" title="Read every array item to find optional and nullable keys">
          <input type="checkbox" data-action="all-items" checked> Read all items
        </label>
        <label class="sg-opt" title="Off: every number is typed number, which also accepts whole numbers. On: whole numbers are typed integer, so a later 1.5 would make the Parse JSON action fail">
          <input type="checkbox" data-action="integers"> Whole numbers as integer
        </label>
        <label class="sg-opt" title="Off: no key is required, so a missing key never fails the Parse JSON action">
          <input type="checkbox" data-action="required" checked> Mark keys as required
        </label>
        <p class="sg-hint">Copy the schema, then paste it into the Schema box of the Parse JSON action. The three options change what it contains.</p>
      </div>
      <pre class="sg-output" id="sgOutput"></pre>`;

    this.addEventListener('click', (e) => {
      if (!e.target.closest('[data-action="copy"]')) return;
      const text = this.queryOne('#sgOutput').dataset.schema;
      if (!text) { Structra.toast('No schema to copy'); return; }
      Structra.sharedHelpers.copyToClipboard(text, 'Schema copied');
    });
    this.addEventListener('change', (e) => {
      const a = e.target.dataset && e.target.dataset.action;
      if (a === 'integers') this._integers = e.target.checked;
      else if (a === 'required') this._required = e.target.checked;
      else if (a === 'all-items') this._allItems = e.target.checked;
      else if (a === 'selected') this._selected = e.target.checked;
      else return;
      this._stale = true;
      this._refresh();
    });
    this._refresh();
    this._syncScope();
  }

  /** Names the selected value on the option, and turns it off when nothing is selected */
  _syncScope() {
    const label = this.queryOne('#sgScope');
    if (!label) return;
    const p = Structra.state.currentPath;
    const usable = !!p && p !== '$';
    label.textContent = usable ? 'Only the selected value (' + p.replace(/^\$\.?/, '') + ')' : 'Only the selected value (select one in the Tree)';
    const box = this.queryOne('[data-action="selected"]');
    box.disabled = !usable;
    if (!usable && this._selected) { this._selected = false; box.checked = false; this._stale = true; this._refresh(); }
  }

  _refresh() {
    if (!this._mounted || !this._visible() || !this._stale) return;
    this._stale = false;
    const out = this.queryOne('#sgOutput');
    let data = Structra.state.jsonData;
    if (data && this._selected && Structra.state.currentPath) {
      const part = Structra.dataPaths.resolve(data, Structra.state.currentPath);
      if (part !== undefined) data = part;
    }
    if (!out) return;
    if (!data) {
      out.dataset.schema = '';
      out.textContent = 'Load JSON to generate a schema';
      return;
    }
    try {
      const opts = { integers: this._integers, required: this._required };
      const schema = this._allItems ? Structra.parseJsonSchemaGenerator.smart(data, opts) : Structra.parseJsonSchemaGenerator.basic(data, opts);
      const text = JSON.stringify(schema, null, 2);
      out.dataset.schema = text;
      Structra.codeView.colorize(out, text, 'json');
    } catch (err) {
      Structra.log.error('SchemaGen', 'Schema generation failed', err);
      out.dataset.schema = '';
      out.textContent = 'Could not generate a schema for this data';
    }
  }
}

customElements.define('structra-schemagen', StructraSchemaGen);
