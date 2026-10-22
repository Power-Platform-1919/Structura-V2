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
    this.innerHTML = '<div class="schema-container" id="schemaContainer"></div>';
    this.renderSchema();
  }

  renderSchema() {
    this._stale = false;
    Structra.log.info('Schema', 'renderSchema()');
    const t0 = performance.now();
    const container = this.$('#schemaContainer');

    // Prefer engine schema if available
    const dataset = Structra.engine.getActive();
    const data = dataset ? dataset.raw : Structra.state.jsonData;
    if (!data) {
      container.innerHTML = '<p style="color:var(--text-muted);padding:var(--sp-4)">Load JSON to see schema</p>';
      return;
    }

    // Try engine.getSchema() for cached result
    let lines;
    if (dataset) {
      const engineSchema = Structra.engine.getSchema();
      if (engineSchema && engineSchema.lines) {
        lines = engineSchema.lines;
      }
    }
    if (!lines) {
      lines = [];
      this._inferSchema(data, 'root', 0, lines, new Set());
    }

    container.innerHTML = lines.map(l =>
      `<div style="padding-left:${l.depth * 16}px">` +
      `<span class="s-key">${Structra.util.esc(l.key)}</span>: ` +
      `<span class="s-type">${l.type}</span>` +
      (l.required ? ' <span class="s-req">required</span>' : '') +
      `</div>`
    ).join('');
  }

  _inferSchema(val, key, depth, lines, seen) {
    const type = this._typeOf(val);
    const required = depth === 1;
    lines.push({ key, type, depth, required });

    if (type === 'object' && val) {
      const entries = Object.entries(val);
      for (const [k, v] of entries) {
        this._inferSchema(v, k, depth + 1, lines, seen);
      }
    } else if (type === 'array' && val && val.length > 0) {
      // Infer item schema from first element
      const sample = val[0];
      if (sample && typeof sample === 'object') {
        // Merge keys from all items for a more accurate schema
        const merged = this._mergeArrayItems(val);
        this._inferSchema(merged, '[item]', depth + 1, lines, seen);
      } else {
        lines.push({ key: '[item]', type: this._typeOf(sample), depth: depth + 1, required: false });
      }
    }
  }

  _mergeArrayItems(arr) {
    const merged = {};
    arr.forEach(item => {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        Object.entries(item).forEach(([k, v]) => {
          if (!(k in merged)) merged[k] = v;
        });
      }
    });
    return merged;
  }

  _typeOf(val) {
    if (val === null) return 'null';
    if (Array.isArray(val)) return 'array';
    if (typeof val === 'number') return Number.isInteger(val) ? 'integer' : 'number';
    return typeof val;
  }

}

customElements.define('structra-schema', StructraSchema);
