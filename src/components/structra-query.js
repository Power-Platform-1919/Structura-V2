/* ============================================================
   STRUCTRA V2 - Query Panel Component
   <structra-query> - query and transform panel. Query modes: path, jsonpath, regex (pattern), js, sql.
   The SQL mode runs read-only queries on the open file (the table "data") through Structra.engine.runSql

   Wiring (generated from the code below; update it when you add or remove an event):
     Listens to: query:show-tab, tabs:switched, tabs:closed, engine:ingested,
          state:queryPanelOpen, state:jsonData
     Emits: pivot:open, query:tab-switched, tree:navigate-path
     Sets state: queryPanelOpen, activeView, currentPath
   ============================================================ */

class StructraQuery extends StructraElement {
  static get observedAttributes() { return ['mode']; }

  /** What each mode is for, with an example that works on most documents */
  static get MODE_NAMES() { return { path: 'Path', jsonpath: 'JSONPath', regex: 'Pattern', js: 'JavaScript', sql: 'SQL' }; }

  /** Rows read from one SQL query, and rows drawn in the result grid (the rest can be copied or opened in a tab) */
  static get SQL_MAX_ROWS() { return 10000; }
  static get SQL_SHOW_ROWS() { return 500; }
  static get SQL_HISTORY_KEY() { return 'structra.sqlHistory'; }

  static get MODE_HELP() {
    return {
      path: { example: 'value[*].Title', hint: 'A path through the data. [*] means every item, so value[*].Title lists every Title.' },
      jsonpath: { example: '$.value[?(@.Cost > 100)].Title', hint: 'JSONPath: $ is the document, [?(...)] keeps items that pass a test, $..name finds name at any depth.' },
      regex: { example: '^[A-Z][a-z]+$', hint: 'Finds text values that match a pattern (not case sensitive).' },
      js: { example: 'data.value.filter(x => x.Approved)', hint: 'JavaScript where data is the whole document. It runs only in this browser.' },
      sql: { example: 'SELECT * FROM data LIMIT 100', hint: 'The open file is a table named data. Press Ctrl+Enter to run. Select part of the text to run only that part. Queries only read the data, they never change it.' },
    };
  }

  init() {
    this._mode = 'path';
    this.on('query:show-tab', (tab) => this._switchTab(tab));
    // Results and transform output belong to the document they were made from
    const clear = () => this._resetResults();
    this.on('tabs:switched', clear);
    this.on('tabs:closed', clear);
    this.on('engine:ingested', clear);
    this.on('state:queryPanelOpen', (d) => {
      Structra.log.info('Query', 'queryPanel ' + (d.value ? 'opened' : 'closed'));
      this.classList.toggle('show', d.value);
    });
  }

  _resetResults() {
    this._lastMatches = [];
    this._lastTransform = null;
    const results = this.$('#queryResults');
    if (results) results.innerHTML = '<div class="qp-summary">Type a query and press Run</div>';
  }

  render() {
    const modes = Structra.constants.QUERY_MODES;

    this.innerHTML = `
      <div class="panel-head">
        <span class="panel-title">Query and Transform</span>
        <button class="btn btn-icon btn-ghost" type="button" data-action="close" aria-label="Close panel" title="Close">
          ${Structra.icons.svg('x', { size: 16 })}
        </button>
      </div>
      <div class="tabs qp-tabs" role="tablist">
        <button class="tab active" type="button" role="tab" data-qtab="query">Query</button>
        <button class="tab" type="button" role="tab" data-qtab="transform">Transform</button>
      </div>
      <div class="qp-tab-body" id="qpQueryBody">
        <div class="seg qp-modes">
          ${modes.map(m => `<button class="seg-btn ${m === this._mode ? 'active' : ''}" type="button" data-mode="${m}">${StructraQuery.MODE_NAMES[m] || m}</button>`).join('')}
        </div>
        <div class="qp-sql-examples" id="sqlExamples" hidden></div>
        <textarea class="qp-input" id="queryInput" spellcheck="false" placeholder=""></textarea>
        <div class="qp-hint" id="queryHint"></div>
        <div class="qp-run-row">
          <button class="btn btn-primary qp-run" type="button" data-action="run" id="queryRun">Run query</button>
          <select class="qp-sql-history" id="sqlHistory" aria-label="Earlier queries" hidden></select>
        </div>
        <details class="qp-sql-schema" id="sqlSchema" hidden>
          <summary id="sqlSchemaTitle">Table <code>data</code></summary>
          <div class="qp-sql-columns" id="sqlColumns"></div>
        </details>
      </div>
      <div class="qp-tab-body" id="qpTransformBody" hidden>
        <div class="qp-transform-presets" id="transformPresets"></div>
        <button class="btn qp-pivot" type="button" data-action="openPivot" title="Group the rows and total or count a column, like a pivot table">${Structra.icons.svg('table-properties', { size: 14 })} Group and total (Pivot)</button>
        <details class="qp-advanced" id="qpAdvanced">
          <summary>Advanced: write your own steps</summary>
          <textarea class="qp-input" id="transformInput" spellcheck="false" placeholder="Steps, for example: .[] | select(.active) | .name"></textarea>
          <button class="btn btn-primary qp-run" type="button" data-action="runTransform">Run transform</button>
        </details>
      </div>
      <div class="qp-results" id="queryResults">
        <div class="qp-summary">Type a query and press Run</div>
      </div>`;

    this._showModeHelp();
    this._renderTransformPresets();
    // The presets name the open file's fields, so they follow the open document
    this.on('state:jsonData', () => this._renderTransformPresets());
    this.on('engine:ingested', () => this._renderTransformPresets());

    this.addEventListener('click', (e) => {
      const tab = e.target.closest('[data-qtab]');
      if (tab) {
        this._switchTab(tab.dataset.qtab);
        return;
      }
      const copy = e.target.closest('[data-copy-expr]');
      if (copy) {
        e.stopPropagation();
        const path = copy.closest('.qp-result').dataset.path;
        const expr = copy.dataset.copyExpr === 'pa' ? Structra.paths.powerAutomate(path) : Structra.paths.powerFx(path);
        Structra.util.copy(expr, copy.dataset.copyExpr === 'pa' ? 'Power Automate expression copied' : 'Power Fx expression copied');
        return;
      }
      const hit = e.target.closest('.qp-result[data-path]');
      if (hit) { this._showMatch(hit.dataset.path); return; }
      if (e.target.closest('[data-action="openPivot"]')) { Structra.events.emit('pivot:open'); return; }
      const preset = e.target.closest('[data-preset]');
      if (preset) {
        this.$('#transformInput').value = preset.dataset.preset;
        this._runTransform();                       // a preset is a ready-made answer: it runs at once
        return;
      }
      const example = e.target.closest('[data-sql-example]');
      if (example) {                                    // a ready-made query runs at once
        this.$('#queryInput').value = example.dataset.sqlExample;
        this._runQuery();
        return;
      }
      const col = e.target.closest('[data-sql-col]');
      if (col) { this._insertAtCursor(col.dataset.sqlCol); return; }
      const mode = e.target.closest('[data-mode]');
      if (mode) {
        this._mode = mode.dataset.mode;
        this.$$('.seg-btn').forEach(m => m.classList.toggle('active', m.dataset.mode === this._mode));
        this._showModeHelp();
        return;
      }
      const action = e.target.closest('[data-action]');
      if (!action) return;
      if (action.dataset.action === 'close') Structra.set('queryPanelOpen', false);
      else if (action.dataset.action === 'run') this._runQuery();
      else if (action.dataset.action === 'sqlCopy') this._sqlExport('copy');
      else if (action.dataset.action === 'sqlCsv') this._sqlExport('csv');
      else if (action.dataset.action === 'sqlOpen') this._sqlExport('tab');
      else if (action.dataset.action === 'copyMatches') this._copyMatches();
      else if (action.dataset.action === 'openMatches') this._openMatches();
      else if (action.dataset.action === 'runTransform') this._runTransform();
      else if (action.dataset.action === 'openTransform') this._openTransform();
      else if (action.dataset.action === 'copyTransform') Structra.util.copy(JSON.stringify(this._lastTransform, null, 2), 'Result copied');
    });

    this.$('#queryInput').addEventListener('keydown', (e) => {
      if (this._mode === 'sql') {                        // SQL is written over several lines: Ctrl+Enter runs, Enter starts a new line
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); this._runQuery(); }
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {            // Enter runs, Shift+Enter starts a new line
        e.preventDefault();
        this._runQuery();
      }
    });
    this.$('#sqlHistory').addEventListener('change', (e) => {
      if (e.target.value === '') return;
      this.$('#queryInput').value = this._sqlHistory()[Number(e.target.value)] || '';
      e.target.value = '';
      this.$('#queryInput').focus();
    });
    // A different file has different columns
    const reloadSchema = () => { if (this._mode === 'sql' && this.classList.contains('show')) this._loadSqlSchema(); };
    this.on('tabs:switched', reloadSchema);
    this.on('engine:ingested', reloadSchema);
    this.$('#transformInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        this._runTransform();
      }
    });
  }

  _switchTab(tab) {
    this._tab = tab;
    const title = this.$('.panel-title');
    if (title) title.textContent = tab === 'transform' ? 'Transform' : 'Query and Transform';
    Structra.events.emit('query:tab-switched', tab);
    this.querySelectorAll('.tabs .tab').forEach(t => t.classList.toggle('active', t.dataset.qtab === tab));
    this.$('#qpQueryBody').hidden = tab !== 'query';
    this.$('#qpTransformBody').hidden = tab !== 'transform';
  }

  /**
   * One-click transforms built from the open file, so they always run: they name the file's real list and fields.
   * Returns { presets: [{ label, expr }], example }
   */
  _transformPresets() {
    const ds = Structra.engine.getActive();
    const data = ds ? ds.raw : Structra.state.jsonData;
    let rows = null;
    let nav = '';
    if (Array.isArray(data)) rows = data;
    else if (data && typeof data === 'object') {
      const first = Structra.engine.findFirstObjectArray ? Structra.engine.findFirstObjectArray(data) : null;
      // Only a list reached through plain keys can be written as .a.b
      if (first && first.path && /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/.test(first.path.replace(/^\$\.?/, ''))) {
        rows = first.rows;
        nav = '.' + first.path.replace(/^\$\.?/, '');
      }
    }
    const head = nav ? nav + ' | ' : '';
    if (!rows || !rows.length || typeof rows[0] !== 'object' || rows[0] === null) {
      return { presets: [{ label: 'Count items', expr: 'length' }, { label: 'Keys', expr: 'keys()' }], example: 'keys() | slice(0, 5)' };
    }
    const sample = rows.slice(0, 50).filter((r) => r && typeof r === 'object' && !Array.isArray(r));
    const keys = [];
    sample.forEach((r) => Object.keys(r).forEach((k) => { if (!keys.includes(k) && /^[A-Za-z_$][\w$]*$/.test(k) && !k.startsWith('@')) keys.push(k); }));
    const kindOf = (k) => {
      const vals = sample.map((r) => r[k]).filter((v) => v !== null && v !== undefined);
      if (!vals.length) return null;
      if (vals.every((v) => typeof v === 'boolean')) return 'boolean';
      if (vals.every((v) => typeof v === 'number')) return 'number';
      if (vals.every((v) => typeof v === 'string')) return 'string';
      return null;
    };
    const text = keys.find((k) => kindOf(k) === 'string');
    const num = keys.find((k) => kindOf(k) === 'number');
    const flag = keys.find((k) => kindOf(k) === 'boolean');
    const presets = [];
    presets.push({ label: 'Count items', expr: head + 'length' });
    if (keys.length >= 2) presets.push({ label: 'Pick fields', expr: `${head}pick(${keys.slice(0, 3).join(', ')})` });
    if (text) presets.push({ label: 'Sort by ' + text, expr: `${head}sortBy(${text})` });
    if (text) presets.push({ label: 'Unique ' + text, expr: `${head}map(x => x?.${text}) | unique()` });
    if (flag) presets.push({ label: 'Only ' + flag, expr: `${head}filter(x => x?.${flag} == true)` });
    if (num) presets.push({ label: 'Total ' + num, expr: `${head}sum(x => x?.${num})` });
    if (num) presets.push({ label: 'Biggest ' + num, expr: `${head}sortBy(-${num}) | slice(0, 5)` });
    if (text) presets.push({ label: 'Group by ' + text, expr: `${head}groupBy(x => x?.${text})` });
    return { presets, example: presets[1] ? presets[1].expr : presets[0].expr };
  }

  _renderTransformPresets() {
    const container = this.$('#transformPresets');
    if (!container) return;
    const { presets, example } = this._transformPresets();
    container.innerHTML = presets.map(p =>
      `<button class="qp-preset-btn" type="button" data-preset="${Structra.util.esc(p.expr)}" title="${Structra.util.esc(p.expr)}">${Structra.util.esc(p.label)}</button>`
    ).join('');
    const input = this.$('#transformInput');
    if (input) input.placeholder = `Steps joined with |\nExample: ${example}`;
  }

  /** Keep the result of a transform: it opens in a new tab and the open file stays as it is */
  _openTransform() {
    const cmd = document.querySelector('structra-command');
    if (this._lastTransform === undefined || !cmd) return;
    const name = (Structra.state.fileName || 'data').replace(/\.[^.]+$/, '') + ' (transform)';
    cmd._openInNewTab(this._lastTransform, name).then((opened) => { if (opened) Structra.toast('Result opened in a new tab'); });
  }

  async _runTransform() {
    const input = this.$('#transformInput').value.trim();
    const results = this.$('#queryResults');
    if (!input) { results.innerHTML = '<div class="qp-summary">Type the steps first</div>'; return; }

    const data = Structra.state.jsonData;
    if (!data) { results.innerHTML = '<div class="qp-summary">No JSON loaded</div>'; return; }

    try {
      const output = Structra.transformOps.evaluate(input, data);
      this._lastTransform = output;
      if (output === undefined) {
        results.innerHTML = '<div class="qp-summary">The steps found nothing. A field named in the steps is not in this data.</div>';
        return;
      }
      const preview = JSON.stringify(output, null, 2);
      const lines = preview.split('\n');
      const truncated = lines.length > 50 ? lines.slice(0, 50).join('\n') + '\n…' : preview;
      const kind = Array.isArray(output) ? output.length + (output.length === 1 ? ' item' : ' items') : (output && typeof output === 'object' ? 'an object' : typeof output);
      results.innerHTML = `<div class="qp-summary">Result: ${kind}</div>
        <pre class="qp-transform-output">${Structra.util.esc(truncated)}</pre>
        <div class="qp-actions">
          <button class="btn btn-sm" type="button" data-action="openTransform">Open result in a new tab</button>
          <button class="btn btn-sm btn-ghost" type="button" data-action="copyTransform">Copy</button>
        </div>`;
    } catch (err) {
      results.innerHTML = `<div class="qp-summary is-error">${Structra.util.esc(err.message)}</div>`;
    }
  }

  _showModeHelp() {
    const help = StructraQuery.MODE_HELP[this._mode] || StructraQuery.MODE_HELP.path;
    const input = this.$('#queryInput');
    if (input) input.placeholder = 'Example: ' + help.example;
    const hint = this.$('#queryHint');
    if (hint) hint.textContent = help.hint;

    // SQL has its own extras: example queries, the columns of the table, and earlier queries
    const sql = this._mode === 'sql';
    this.classList.toggle('is-sql', sql);
    ['#sqlExamples', '#sqlSchema'].forEach((id) => { const el = this.$(id); if (el) el.hidden = !sql; });
    const run = this.$('#queryRun');
    if (run) run.innerHTML = sql ? 'Run query <kbd class="qp-kbd">Ctrl+Enter</kbd>' : 'Run query';
    if (input) { input.rows = sql ? 8 : 3; input.classList.toggle('is-sql', sql); }
    this._renderSqlHistory();
    if (sql) this._loadSqlSchema();
  }

  /* ======== SQL ======== */

  _sqlHistory() {
    try { return JSON.parse(localStorage.getItem(StructraQuery.SQL_HISTORY_KEY)) || []; } catch { return []; }
  }

  _rememberSql(text) {
    const list = [text, ...this._sqlHistory().filter((q) => q !== text)].slice(0, 20);
    try { localStorage.setItem(StructraQuery.SQL_HISTORY_KEY, JSON.stringify(list)); } catch { /* storage blocked: history is just not kept */ }
    this._renderSqlHistory();
  }

  _renderSqlHistory() {
    const select = this.$('#sqlHistory');
    if (!select) return;
    const list = this._sqlHistory();
    select.hidden = this._mode !== 'sql' || !list.length;
    select.innerHTML = '<option value="">Earlier queries</option>' + list.map((q, i) => {
      const line = q.replace(/\s+/g, ' ').trim();
      return `<option value="${i}">${Structra.util.esc(line.length > 60 ? line.slice(0, 60) + '…' : line)}</option>`;
    }).join('');
  }

  /** Put text where the cursor is (or over the selection), like a SQL tool does when you click a column name */
  _insertAtCursor(text) {
    const box = this.$('#queryInput');
    const from = box.selectionStart, to = box.selectionEnd;
    box.value = box.value.slice(0, from) + text + box.value.slice(to);
    box.focus();
    box.selectionStart = box.selectionEnd = from + text.length;
  }

  /** A column name as SQL wants it: quoted unless it is a plain lower-case word */
  _sqlName(name) {
    return /^[a-z_][a-z0-9_]*$/.test(name) ? name : '"' + String(name).replace(/"/g, '""') + '"';
  }

  /** Show the columns of the open file as a table named data, and offer queries written for those columns */
  async _loadSqlSchema() {
    const box = this.$('#sqlColumns');
    const examples = this.$('#sqlExamples');
    if (!box) return;
    if (!Structra.state.jsonData) {
      box.innerHTML = '<div class="qp-summary">Open a file to see its columns.</div>';
      examples.innerHTML = '';
      return;
    }
    const token = (this._schemaToken = (this._schemaToken || 0) + 1);
    box.innerHTML = '<div class="qp-summary">Starting the SQL engine…</div>';
    let cols = [];
    try {
      if (await Structra.engine.enableSql()) cols = await Structra.engine.describeTable();
    } catch { cols = []; }
    if (token !== this._schemaToken) return;           // the file changed while this was loading
    if (!cols.length) {
      box.innerHTML = '<div class="qp-summary">SQL is not available for this file. It needs a list of records or an object.</div>';
      examples.innerHTML = '';
      return;
    }
    this.$('#sqlSchemaTitle').innerHTML = `Table <code>data</code> (${cols.length} ${cols.length === 1 ? 'column' : 'columns'}, click to show)`;
    box.innerHTML = cols.map((c) =>
      `<button class="qp-sql-col" type="button" data-sql-col="${Structra.util.esc(this._sqlName(c.name))}" title="Add ${Structra.util.esc(c.name)} to the query">
        <span>${Structra.util.esc(c.name)}</span><em>${Structra.util.esc(c.type)}</em></button>`).join('');
    examples.innerHTML = this._sqlExamples(cols).map((e) =>
      `<button class="qp-preset-btn" type="button" data-sql-example="${Structra.util.esc(e.sql)}" title="${Structra.util.esc(e.sql)}">${Structra.util.esc(e.label)}</button>`).join('');
  }

  /** Ready-made queries that use the file's real column names, so they run as they are */
  _sqlExamples(cols) {
    const isNum = (t) => /^(U?(TINY|SMALL|BIG|HUGE)?INT|INTEGER|DOUBLE|FLOAT|REAL|DECIMAL)/i.test(t);
    const text = cols.find((c) => /^VARCHAR/i.test(c.type));
    const num = cols.find((c) => isNum(c.type));
    const list = [
      { label: 'First 100 rows', sql: 'SELECT *\nFROM data\nLIMIT 100' },
      { label: 'Count rows', sql: 'SELECT COUNT(*) AS rows\nFROM data' },
    ];
    if (text) {
      const t = this._sqlName(text.name);
      list.push({ label: 'Count by ' + text.name, sql: `SELECT ${t}, COUNT(*) AS n\nFROM data\nGROUP BY ${t}\nORDER BY n DESC` });
    }
    if (num) {
      const n = this._sqlName(num.name);
      list.push({ label: 'Totals of ' + num.name, sql: `SELECT SUM(${n}) AS total, AVG(${n}) AS average, MIN(${n}) AS smallest, MAX(${n}) AS biggest\nFROM data` });
      list.push({ label: 'Top 10 by ' + num.name, sql: `SELECT *\nFROM data\nORDER BY ${n} DESC\nLIMIT 10` });
    }
    list.push({ label: 'Summary of every column', sql: 'SUMMARIZE data' });
    return list;
  }

  /** The text to run: the selected part if there is one, like a SQL tool, otherwise everything */
  _sqlText() {
    const box = this.$('#queryInput');
    const selected = box.value.slice(box.selectionStart, box.selectionEnd).trim();
    return selected || box.value.trim();
  }

  /** The engine's messages, in plainer words */
  _sqlError(message) {
    let text = String(message || 'The query did not run.')
      .split('\n').filter((l) => !/^\s*(LINE \d+:|\^)/.test(l)).join(' ')
      .replace(/^(Parser|Binder|Catalog|Conversion|Invalid Input|Syntax|Runtime|Out of Range|Constraint) Error:\s*/i, '').trim();
    if (/does not exist/i.test(text) && /table/i.test(text)) text += ' The open file is the table named data.';
    return text;
  }

  async _runSql() {
    const results = this.$('#queryResults');
    const text = this._sqlText();
    if (!text) { results.innerHTML = '<div class="qp-summary">Type a query first. Example: <code>SELECT * FROM data LIMIT 100</code></div>'; return; }
    if (!Structra.state.jsonData) { results.innerHTML = '<div class="qp-summary">Open a file first</div>'; return; }
    results.innerHTML = '<div class="qp-summary">Running…</div>';
    const result = await Structra.engine.runSql(text, { quiet: true, readOnly: true, maxRows: StructraQuery.SQL_MAX_ROWS });
    if (result.error) {
      this._lastSql = null;
      results.innerHTML = `<div class="qp-summary is-error">${Structra.util.esc(this._sqlError(result.error))}</div>`;
      return;
    }
    this._rememberSql(this.$('#queryInput').value.trim());
    this._lastSql = result;
    this._renderSqlResult(result);
    this._loadSqlSchemaIfStale();
  }

  _loadSqlSchemaIfStale() {
    if (!this.$('#sqlColumns').querySelector('.qp-sql-col')) this._loadSqlSchema();
  }

  /** One cell as text. Dates, big numbers and nested values from the engine are turned into plain text */
  _cell(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'bigint') return Number.isSafeInteger(Number(v)) ? Number(v) : v.toString();
    if (v instanceof Date) return v.toISOString();
    if (typeof v === 'object') {
      try { return JSON.stringify(v, (k, x) => (typeof x === 'bigint' ? x.toString() : x)); } catch { return String(v); }
    }
    return v;
  }

  _renderSqlResult(result) {
    const results = this.$('#queryResults');
    const esc = Structra.util.esc;
    const cols = result.columns;
    const rows = result.rows.map((r) => cols.map((c) => this._cell(r[c])));
    const shown = rows.slice(0, StructraQuery.SQL_SHOW_ROWS);
    const ms = result.duration < 1000 ? Math.round(result.duration) + ' ms' : (result.duration / 1000).toFixed(1) + ' s';
    let note = `${rows.length.toLocaleString()}${result.truncated ? '+' : ''} ${rows.length === 1 ? 'row' : 'rows'} in ${ms}`;
    if (result.truncated) note += `. Only the first ${rows.length.toLocaleString()} rows were read. Add a WHERE or LIMIT to narrow it.`;
    else if (rows.length > shown.length) note += `. The first ${shown.length.toLocaleString()} are shown below; copy or open the result to get them all.`;
    if (!cols.length) { results.innerHTML = `<div class="qp-summary">The query ran and returned no rows (${esc(ms)}).</div>`; return; }
    const head = cols.map((c) => `<th title="${esc(c)}">${esc(c)}</th>`).join('');
    const body = shown.map((r, i) => `<tr><td class="qp-sql-n">${i + 1}</td>${r.map((v) => {
      if (v === null) return '<td class="qp-sql-null">NULL</td>';
      const t = String(v);
      return `<td${typeof v === 'number' ? ' class="qp-sql-num"' : ''} title="${esc(t.length > 300 ? t.slice(0, 300) + '…' : t)}">${esc(t.length > 120 ? t.slice(0, 120) + '…' : t)}</td>`;
    }).join('')}</tr>`).join('');
    results.innerHTML = `<div class="qp-summary">${esc(note)}</div>
      <div class="qp-actions">
        <button class="btn btn-sm" type="button" data-action="sqlOpen">Open as a table in a new tab</button>
        <button class="btn btn-sm btn-ghost" type="button" data-action="sqlCopy">Copy as JSON</button>
        <button class="btn btn-sm btn-ghost" type="button" data-action="sqlCsv">Download CSV</button>
      </div>
      <div class="qp-sql-grid"><table><thead><tr><th class="qp-sql-n">#</th>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  }

  _sqlExport(how) {
    const result = this._lastSql;
    if (!result || !result.rows.length) return;
    const cols = result.columns;
    const rows = result.rows.map((r) => Object.fromEntries(cols.map((c) => [c, this._cell(r[c])])));
    const base = (Structra.state.fileName || 'data').replace(/\.[^.]+$/, '');
    if (how === 'copy') {
      Structra.util.copy(JSON.stringify(rows, null, 2), `${rows.length} ${rows.length === 1 ? 'row' : 'rows'} copied`);
    } else if (how === 'csv') {
      const q = (v) => (v === null ? '' : /[",\n\r]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v));
      const csv = [cols.map(q).join(','), ...rows.map((r) => cols.map((c) => q(r[c])).join(','))].join('\r\n');
      Structra.util.download('﻿' + csv, base + ' (query).csv', 'text/csv;charset=utf-8');
      Structra.toast('CSV downloaded');
    } else {
      const cmd = document.querySelector('structra-command');
      if (cmd) cmd._openInNewTab(rows, base + ' (SQL)').then((opened) => { if (opened) Structra.toast('Result opened in a new tab'); });
    }
  }

  async _runQuery() {
    if (this._mode === 'sql') { await this._runSql(); return; }
    const input = this.$('#queryInput').value.trim();
    const results = this.$('#queryResults');
    const help = StructraQuery.MODE_HELP[this._mode];
    if (!input) {
      results.innerHTML = `<div class="qp-summary">Type a query first. Example: <code>${Structra.util.esc(help.example)}</code></div>`;
      this.$('#queryInput').focus();
      return;
    }

    const ds = Structra.engine.getActive();
    const data = ds ? ds.raw : Structra.state.jsonData;
    if (!data) { results.innerHTML = '<div class="qp-summary">Open a file first</div>'; return; }

    try {
      let matches = [];
      if (this._mode === 'path' || this._mode === 'jsonpath') matches = Structra.jsonpath.query(data, input);
      else if (this._mode === 'regex') matches = this._queryRegex(data, input);
      else if (this._mode === 'js') {
        // The code is tried first in a separate thread, so one that never ends cannot freeze the page
        const probe = await Structra.util.tryInWorker(input.replace(/^=/, ''), data);
        if (!probe.ok) throw new Error('The JavaScript did not run: ' + probe.error);
        matches = this._queryJs(data, input);
      }
      this._lastMatches = matches;

      if (matches.length === 0) {
        results.innerHTML = `<div class="qp-summary">No matches. Nothing in this file fits <code>${Structra.util.esc(input)}</code>.</div>`;
        return;
      }
      const shown = matches.slice(0, 100);
      results.innerHTML = `<div class="qp-summary">${matches.length.toLocaleString()} ${matches.length === 1 ? 'match' : 'matches'}${matches.length > shown.length ? ` (first ${shown.length} shown)` : ''}</div>
        <div class="qp-actions">
          <button class="btn btn-sm" type="button" data-action="copyMatches">Copy values</button>
          <button class="btn btn-sm" type="button" data-action="openMatches">Open in a new tab</button>
        </div>` +
        shown.map((m, i) =>
          `<div class="qp-result" data-i="${i}" data-path="${Structra.util.esc(m.path)}" title="Show in the Tree">
            <span class="qp-result-path">${Structra.util.esc(m.path)}</span>
            <span class="qp-result-value">${Structra.util.esc(this._preview(m.value))}</span>
            <span class="qp-result-copy">
              <button class="btn btn-sm btn-ghost" type="button" data-copy-expr="pa" title="Copy the Power Automate expression for this value">Power Automate</button>
              <button class="btn btn-sm btn-ghost" type="button" data-copy-expr="fx" title="Copy the Power Fx expression for this value">Power Fx</button>
            </span>
          </div>`
        ).join('');
    } catch (err) {
      results.innerHTML = `<div class="qp-summary is-error">${Structra.util.esc(err.message)}</div>`;
    }
  }

  /** A result was clicked: show it in the Tree, where it can be read in context and its expressions are one click away */
  _showMatch(path) {
    if (!path || !path.startsWith('$')) return;
    Structra.set('activeView', 'tree');
    Structra.set('currentPath', path);
    // Every match is marked in the Tree, and the clicked one is brought into view
    setTimeout(() => {
      const view = document.getElementById('jsonView');
      const all = (this._lastMatches || []).map((m) => m.path).filter((p) => typeof p === 'string' && p.startsWith('$'));
      if (view && all.length) Structra.jsonTree.highlightPaths(view, all);
      Structra.events.emit('tree:navigate-path', path);
    }, 60);
  }

  _copyMatches() {
    const values = (this._lastMatches || []).map((m) => m.value);
    Structra.util.copy(JSON.stringify(values, null, 2), `${values.length} ${values.length === 1 ? 'value' : 'values'} copied`);
  }

  _openMatches() {
    const cmd = document.querySelector('structra-command');
    const values = (this._lastMatches || []).map((m) => m.value);
    if (!cmd || !values.length) return;
    const name = (Structra.state.fileName || 'data').replace(/\.[^.]+$/, '') + ' (query)';
    cmd._openInNewTab(values, name).then((opened) => { if (opened) Structra.toast('Matches opened in a new tab'); });
  }

  _queryRegex(data, pattern) {
    const matches = [];
    let re;
    const source = pattern.replace(/^\/|\/[a-z]*$/g, '');
    if (Structra.util.riskyRegex(source)) throw new Error(Structra.util.RISKY_MESSAGE);
    try { re = new RegExp(source, 'i'); }
    catch (err) { throw new Error('That is not a valid pattern: ' + err.message.replace(/^Invalid regular expression: /, '')); }
    const walk = (val, path) => {
      if (typeof val === 'string' && re.test(val)) matches.push({ path, value: val });
      if (val && typeof val === 'object') {
        const entries = Array.isArray(val) ? val.map((v, i) => [i, v]) : Object.entries(val);
        entries.forEach(([k, v]) => {
          const p = Array.isArray(val) ? `${path}[${k}]` : (/^[A-Za-z_$][\w$]*$/.test(k) ? `${path}.${k}` : `${path}['${k}']`);
          walk(v, p);
        });
      }
    };
    walk(data, '$');
    return matches;
  }

  _queryJs(data, expr) {
    // Strip leading = if present
    const code = expr.replace(/^=/, '');
    let result;
    try { result = new Function('data', `return ${code};`)(data); }
    catch (err) { throw new Error('The JavaScript did not run: ' + err.message); }

    // Items that are objects inside the document are given their real path ($.value[1]), the rest are numbered
    let where = null;
    const locate = (obj) => {
      if (!where) {
        where = new Map();
        const walk = (val, path, budget) => {
          if (budget.left-- <= 0 || !val || typeof val !== 'object') return;
          if (!where.has(val)) where.set(val, path);
          const entries = Array.isArray(val) ? val.map((v, i) => [i, v]) : Object.entries(val);
          for (const [k, v] of entries) walk(v, Array.isArray(val) ? `${path}[${k}]` : (/^[A-Za-z_$][\w$]*$/.test(k) ? `${path}.${k}` : `${path}['${k}']`), budget);
        };
        walk(data, '$', { left: 200000 });
      }
      return where.get(obj);
    };
    if (Array.isArray(result)) return result.map((v, i) => ({ path: (v && typeof v === 'object' && locate(v)) || `result[${i}]`, value: v }));
    return [{ path: (result && typeof result === 'object' && locate(result)) || 'result', value: result }];
  }

  _preview(val) {
    if (val === null) return 'null';
    if (typeof val === 'string') return val.length > 40 ? val.slice(0, 40) + '…' : val;
    if (typeof val === 'object') { const t = JSON.stringify(val); return t.length > 60 ? t.slice(0, 60) + '…' : t; }
    return String(val);
  }

}

customElements.define('structra-query', StructraQuery);
