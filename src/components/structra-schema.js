/* ============================================================
   STRUCTRA V2 - Schema View Component
   <structra-schema> - inferred JSON schema display

   Wiring (generated from the code below; update it when you add or remove an event):
     Listens to: state:jsonData, view:switched, engine:ingested
     Sets state: currentPath
   ============================================================ */

class StructraSchema extends StructraComponent {
  static get observedAttributes() { return ['show-required']; }

  init() {
    this._stale = false;
    this.on('state:jsonData', () => {
      this._stale = true;
      Structra.log.debug('Schema', 'jsonData changed - stale=true (activeView=' + Structra.state.activeView + ')');
      if (Structra.state.activeView === 'schema') this.renderSchema();
    });
    this.on('view:switched', (view) => {
      if (view === 'schema' && this._stale) {
        Structra.log.info('Schema', 'View switched to schema - rendering');
        this.renderSchema();
      }
    });
    this.on('engine:ingested', () => {
      this._stale = true;
      if (Structra.state.activeView === 'schema') this.renderSchema();
    });
  }

  render() {
    this.innerHTML = '<div class="schema-bar"><span class="schema-hint">Every field the file has. Click one to see its expressions.</span><button class="btn btn-sm" type="button" data-schema-copy title="Copy this as a JSON Schema, ready for the Parse JSON action">Copy schema</button></div><div class="schema-container" id="schemaContainer" tabindex="0" role="region" aria-label="Schema fields"></div>';
    this.renderSchema();
    // A field is a place in the document: click it to see its expressions, like a node in the Tree
    this.addEventListener('click', (event) => {
      if (event.target.closest('[data-schema-copy]')) { if (this._schema) Structra.sharedHelpers.copyToClipboard(JSON.stringify(this._schema, null, 2), 'Schema copied'); return; }
      const line = event.target.closest('.s-line');
      if (!line || !line.dataset.path || line.dataset.path === '$') return;
      this.querySelectorAll('.s-line.selected').forEach((line) => line.classList.remove('selected'));
      line.classList.add('selected');
      Structra.setState('currentPath', line.dataset.path);
    });
  }

  renderSchema() {
    this._stale = false;
    const startTime = performance.now();
    const container = this.queryOne('#schemaContainer');

    const dataset = Structra.dataEngine.getActive();
    const data = dataset ? dataset.raw : Structra.state.jsonData;
    if (!data) {
      container.innerHTML = '<p style="color:var(--text-muted);padding:var(--sp-4)">Load JSON to see schema</p>';
      return;
    }

    // The same schema the Schema Gen tab copies, so the two never disagree: every record is read,
    // a field that is sometimes empty is "string | null", and a field present in every record is "required"
    const schema = Structra.parseJsonSchemaGenerator.smart(data, { integers: true, required: true });
    this._schema = schema;
    const lines = [];
    this._collect(schema, 'root', 0, false, lines);

    const MAX_LINES = 3000;
    const shown = lines.slice(0, MAX_LINES);
    container.innerHTML = shown.map((line) => {
      const nullable = line.types.includes('null');
      const types = line.types.map((type) => `<span class="s-type${type === 'null' ? ' s-null' : ''}">${Structra.sharedHelpers.escapeHtml(type)}</span>`).join('<span class="s-or"> | </span>');
      return `<div class="s-line" data-path="${Structra.sharedHelpers.escapeHtml(line.path)}" style="padding-left:${line.depth * 16}px">` +
        `<span class="s-key">${Structra.sharedHelpers.escapeHtml(line.key)}</span>: ${types}` +
        (line.required ? ' <span class="s-req" title="This field is in every record">required</span>' : '') +
        (nullable ? '' : '') +
        `</div>`;
    }).join('') + (lines.length > MAX_LINES ? `<div class="s-more">${(lines.length - MAX_LINES).toLocaleString()} more fields are not shown. Copy the schema from the Schema Gen tab to get all of it.</div>` : '');
    Structra.log.perf('Schema', 'render', performance.now() - startTime);
  }

  /** What a schema node is called: 'string', 'string | null', 'object | array', or 'any' when only empty values were seen */
  _typesOf(node) {
    const out = [];
    const add = (type) => { if (type && !out.includes(type)) out.push(type); };
    const read = (node) => {
      if (!node) return;
      if (Array.isArray(node.type)) node.type.forEach(add);
      else if (node.type) add(node.type);
      if (Array.isArray(node.anyOf)) node.anyOf.forEach(read);
    };
    read(node);
    return out.length ? out : ['empty'];
  }

  /** Flatten a JSON Schema into display lines: { key, types, depth, required, path } */
  _collect(node, key, depth, required, lines, path = '$') {
    if (lines.length > 20000) return;
    lines.push({ key, types: this._typesOf(node), depth, required, path });
    // A node can be an object in some records and a list in others: show the children of both
    const variants = [node, ...(Array.isArray(node && node.anyOf) ? node.anyOf : [])];
    const seenKeys = new Set();
    for (const variant of variants) {
      if (variant && variant.properties) {
        const request = new Set(variant.required || []);
        for (const [key, child] of Object.entries(variant.properties)) {
          if (seenKeys.has(key)) continue;
          seenKeys.add(key);
          this._collect(child, key, depth + 1, request.has(key), lines, Structra.dataPaths.child(path, key));
        }
      }
    }
    for (const variant of variants) {
      if (variant && variant.items && !seenKeys.has('[item]')) {
        seenKeys.add('[item]');
        this._collect(variant.items, '[item]', depth + 1, false, lines, path + '[0]');
      }
    }
  }
}

customElements.define('structra-schema', StructraSchema);
