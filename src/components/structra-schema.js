/* ============================================================
   STRUCTRA V2 — Schema View Component
   <structra-schema> — inferred JSON schema display
   ============================================================ */

class StructraSchema extends StructraElement {
  static get observedAttributes() { return ['show-required']; }

  init() {
    this._stale = false;
    this.on('state:jsonData', () => {
      this._stale = true;
      Structra.log.debug('Schema', 'jsonData changed — stale=true (activeView=' + Structra.state.activeView + ')');
      if (Structra.state.activeView === 'schema') this.renderSchema();
    });
    this.on('view:switched', (view) => {
      if (view === 'schema' && this._stale) {
        Structra.log.info('Schema', 'View switched to schema — rendering');
        this.renderSchema();
      }
    });
    this.on('engine:ingested', () => {
      this._stale = true;
      if (Structra.state.activeView === 'schema') this.renderSchema();
    });
  }

  render() {
    this.innerHTML = '<div class="schema-bar"><span class="schema-hint">Every field the file has. Click one to see its expressions.</span><button class="btn btn-sm" type="button" data-schema-copy title="Copy this as a JSON Schema, ready for the Parse JSON action">Copy schema</button></div><div class="schema-container" id="schemaContainer"></div>';
    this.renderSchema();
    // A field is a place in the document: click it to see its expressions, like a node in the Tree
    this.addEventListener('click', (e) => {
      if (e.target.closest('[data-schema-copy]')) { if (this._schema) Structra.util.copy(JSON.stringify(this._schema, null, 2), 'Schema copied'); return; }
      const line = e.target.closest('.s-line');
      if (!line || !line.dataset.path || line.dataset.path === '$') return;
      this.querySelectorAll('.s-line.selected').forEach((l) => l.classList.remove('selected'));
      line.classList.add('selected');
      Structra.set('currentPath', line.dataset.path);
    });
  }

  renderSchema() {
    this._stale = false;
    const t0 = performance.now();
    const container = this.$('#schemaContainer');

    const dataset = Structra.engine.getActive();
    const data = dataset ? dataset.raw : Structra.state.jsonData;
    if (!data) {
      container.innerHTML = '<p style="color:var(--text-muted);padding:var(--sp-4)">Load JSON to see schema</p>';
      return;
    }

    // The same schema the Schema Gen tab copies, so the two never disagree: every record is read,
    // a field that is sometimes empty is "string | null", and a field present in every record is "required"
    const schema = Structra.schemaGen.smart(data, { integers: true, required: true });
    this._schema = schema;
    const lines = [];
    this._collect(schema, 'root', 0, false, lines);

    const MAX = 3000;
    const shown = lines.slice(0, MAX);
    container.innerHTML = shown.map((l) => {
      const nullable = l.types.includes('null');
      const types = l.types.map((t) => `<span class="s-type${t === 'null' ? ' s-null' : ''}">${Structra.util.esc(t)}</span>`).join('<span class="s-or"> | </span>');
      return `<div class="s-line" data-path="${Structra.util.esc(l.path)}" style="padding-left:${l.depth * 16}px">` +
        `<span class="s-key">${Structra.util.esc(l.key)}</span>: ${types}` +
        (l.required ? ' <span class="s-req" title="This field is in every record">required</span>' : '') +
        (nullable ? '' : '') +
        `</div>`;
    }).join('') + (lines.length > MAX ? `<div class="s-more">${(lines.length - MAX).toLocaleString()} more fields are not shown. Copy the schema from the Schema Gen tab to get all of it.</div>` : '');
    Structra.log.perf('Schema', 'render', performance.now() - t0);
  }

  /** What a schema node is called: 'string', 'string | null', 'object | array', or 'any' when only empty values were seen */
  _typesOf(node) {
    const out = [];
    const add = (t) => { if (t && !out.includes(t)) out.push(t); };
    const read = (n) => {
      if (!n) return;
      if (Array.isArray(n.type)) n.type.forEach(add);
      else if (n.type) add(n.type);
      if (Array.isArray(n.anyOf)) n.anyOf.forEach(read);
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
    for (const v of variants) {
      if (v && v.properties) {
        const req = new Set(v.required || []);
        for (const [k, child] of Object.entries(v.properties)) {
          if (seenKeys.has(k)) continue;
          seenKeys.add(k);
          this._collect(child, k, depth + 1, req.has(k), lines, path === '$' ? `$.${k}` : `${path}.${k}`);
        }
      }
    }
    for (const v of variants) {
      if (v && v.items && !seenKeys.has('[item]')) {
        seenKeys.add('[item]');
        this._collect(v.items, '[item]', depth + 1, false, lines, path + '[0]');
      }
    }
  }
}

customElements.define('structra-schema', StructraSchema);
