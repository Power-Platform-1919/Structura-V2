/* ============================================================
   STRUCTRA V2 - Query Panel Component
   <structra-query> - query and transform panel. Query modes: path, jsonpath, regex (pattern), js, sql.
   The SQL mode runs read-only queries on the open file (the table "data") through Structra.dataEngine.runSql

   Wiring (generated from the code below; update it when you add or remove an event):
     Listens to: query:show-tab, tabs:switched, tabs:closed, engine:ingested,
          state:queryPanelOpen, state:jsonData
     Emits: pivot:open, query:tab-switched, tree:navigate-path
     Sets state: queryPanelOpen, activeView, currentPath
   ============================================================ */

class StructraQuery extends StructraComponent {
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
      jsonpath: { example: '$.value[?(@.Cost > 100)].Title', hint: 'JSONPath (the standard): $ is the document, [?(...)] keeps items that pass a test (== != < > && ||, and @.field =~ /pattern/i for text), $..name finds name at any depth, [::-1] goes backwards.' },
      regex: { example: '^[A-Z][a-z]+$', hint: 'Finds text values that match a pattern (not case sensitive).' },
      js: { example: 'data.value.filter(x => x.Approved)', hint: 'JavaScript where data is the whole document. It runs only in this browser.' },
      sql: { example: 'SELECT * FROM data LIMIT 100', hint: 'The open file is a table named data. Suggestions appear as you type (Tab or Enter picks one, Ctrl+Space asks for them). Ctrl+Enter runs. Select part of the text to run only that part. Queries only read the data, they never change it.' },
    };
  }

  init() {
    this._mode = 'path';
    this._tab = 'query';
    this.on('query:show-tab', (tab) => this._switchTab(tab));
    // Results and transform output belong to the document they were made from
    const clear = () => this._resetResults();
    this.on('tabs:switched', clear);
    this.on('tabs:closed', clear);
    this.on('engine:ingested', clear);
    this.on('state:queryPanelOpen', (isOpen) => {
      Structra.log.info('Query', 'queryPanel ' + (isOpen.value ? 'opened' : 'closed'));
      this.classList.toggle('show', isOpen.value);
    });
  }

  _resetResults() {
    this._lastMatches = [];
    this._lastTransform = null;
    this._lastSql = null;
    const results = this.queryOne('#queryResults');
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
          ${modes.map(mode => `<button class="seg-btn ${mode === this._mode ? 'active' : ''}" type="button" data-mode="${mode}">${StructraQuery.MODE_NAMES[mode] || mode}</button>`).join('')}
        </div>
        <div class="qp-sql-examples" id="sqlExamples" hidden></div>
        <div class="qp-editor">
          <textarea class="qp-input" id="queryInput" spellcheck="false" placeholder=""></textarea>
          <div class="qp-sql-host" id="sqlHost" hidden></div>
        </div>
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

    this.addEventListener('click', (event) => {
      const tab = event.target.closest('[data-qtab]');
      if (tab) {
        this._switchTab(tab.dataset.qtab);
        return;
      }
      const copy = event.target.closest('[data-copy-expr]');
      if (copy) {
        event.stopPropagation();
        const path = copy.closest('.qp-result').dataset.path;
        const expression = copy.dataset.copyExpr === 'pa' ? Structra.dataPaths.powerAutomate(path) : Structra.dataPaths.powerFx(path);
        Structra.sharedHelpers.copyToClipboard(expression, copy.dataset.copyExpr === 'pa' ? 'Power Automate expression copied' : 'Power Fx expression copied');
        return;
      }
      const match = event.target.closest('.qp-result[data-path]');
      if (match) { this._showMatch(match.dataset.path); return; }
      if (event.target.closest('[data-action="openPivot"]')) { Structra.events.emit('pivot:open'); return; }
      const preset = event.target.closest('[data-preset]');
      if (preset) {
        this.queryOne('#transformInput').value = preset.dataset.preset;
        this._runTransform();                       // a preset is a ready-made answer: it runs at once
        return;
      }
      const example = event.target.closest('[data-sql-example]');
      if (example) {                                    // a ready-made query runs at once
        this._sqlSet(example.dataset.sqlExample);
        this._runQuery();
        return;
      }
      const column = event.target.closest('[data-sql-col]');
      if (column) { this._insertAtCursor(column.dataset.sqlCol); return; }
      const mode = event.target.closest('[data-mode]');
      if (mode) {
        const changed = mode.dataset.mode !== this._mode;
        this._mode = mode.dataset.mode;
        this.queryAll('.seg-btn').forEach(modeButton => modeButton.classList.toggle('active', modeButton.dataset.mode === this._mode));
        this._showModeHelp();
        if (changed) this._resetResults();                 // the old result belongs to the mode that made it
        return;
      }
      const action = event.target.closest('[data-action]');
      if (!action) return;
      if (action.dataset.action === 'close') Structra.setState('queryPanelOpen', false);
      else if (action.dataset.action === 'run') this._runQuery();
      else if (action.dataset.action === 'sqlCopy') this._sqlExport('copy');
      else if (action.dataset.action === 'sqlCsv') this._sqlExport('csv');
      else if (action.dataset.action === 'sqlOpen') this._sqlExport('tab');
      else if (action.dataset.action === 'copyMatches') this._copyMatches();
      else if (action.dataset.action === 'openMatches') this._openMatches();
      else if (action.dataset.action === 'runTransform') this._runTransform();
      else if (action.dataset.action === 'openTransform') this._openTransform();
      else if (action.dataset.action === 'copyTransform') Structra.sharedHelpers.copyToClipboard(JSON.stringify(this._lastTransform, null, 2), 'Result copied');
    });

    // The other modes use this plain box: Enter runs, Shift+Enter starts a new line (SQL has its own editor)
    this.queryOne('#queryInput').addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        this._runQuery();
      }
    });
    this.queryOne('#sqlHistory').addEventListener('change', (event) => {
      if (event.target.value === '') return;
      this._sqlSet(this._sqlHistory()[Number(event.target.value)] || '');
      event.target.value = '';
    });
    // A different file has different columns
    const reloadSchema = () => { if (this._mode === 'sql' && this.classList.contains('show')) this._loadSqlSchema(); };
    this.on('tabs:switched', reloadSchema);
    this.on('engine:ingested', reloadSchema);
    this.queryOne('#transformInput').addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        this._runTransform();
      }
    });
  }

  _switchTab(tab) {
    if (this._tab !== tab) this._resetResults();      // Query and Transform share the result area
    this._tab = tab;
    const title = this.queryOne('.panel-title');
    if (title) title.textContent = tab === 'transform' ? 'Transform' : 'Query and Transform';
    Structra.events.emit('query:tab-switched', tab);
    this.querySelectorAll('.tabs .tab').forEach(tabButton => tabButton.classList.toggle('active', tabButton.dataset.qtab === tab));
    this.queryOne('#qpQueryBody').hidden = tab !== 'query';
    this.queryOne('#qpTransformBody').hidden = tab !== 'transform';
  }

  /**
   * One-click transforms built from the open file, so they always run: they name the file's real list and fields.
   * Returns { presets: [{ label, expr }], example }
   */
  _transformPresets() {
    const dataset = Structra.dataEngine.getActive();
    const data = dataset ? dataset.raw : Structra.state.jsonData;
    let rows = null;
    let navigation = '';
    if (Array.isArray(data)) rows = data;
    else if (data && typeof data === 'object') {
      const first = Structra.dataEngine.findFirstObjectArray ? Structra.dataEngine.findFirstObjectArray(data) : null;
      // Only a list reached through plain keys can be written as .a.b
      if (first && first.path && /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/.test(first.path.replace(/^\$\.?/, ''))) {
        rows = first.rows;
        navigation = '.' + first.path.replace(/^\$\.?/, '');
      }
    }
    const head = navigation ? navigation + ' | ' : '';
    if (!rows || !rows.length || typeof rows[0] !== 'object' || rows[0] === null) {
      return { presets: [{ label: 'Count items', expr: 'length' }, { label: 'Keys', expr: 'keys()' }], example: 'keys() | slice(0, 5)' };
    }
    const sample = rows.slice(0, 50).filter((row) => row && typeof row === 'object' && !Array.isArray(row));
    const keys = [];
    sample.forEach((row) => Object.keys(row).forEach((field) => { if (!keys.includes(field) && /^[A-Za-z_$][\w$]*$/.test(field) && !field.startsWith('@')) keys.push(field); }));
    const kindOf = (field) => {
      const values = sample.map((row) => row[field]).filter((value) => value !== null && value !== undefined);
      if (!values.length) return null;
      if (values.every((value) => typeof value === 'boolean')) return 'boolean';
      if (values.every((value) => typeof value === 'number')) return 'number';
      if (values.every((value) => typeof value === 'string')) return 'string';
      return null;
    };
    const text = keys.find((field) => kindOf(field) === 'string');
    const number = keys.find((field) => kindOf(field) === 'number');
    const flag = keys.find((field) => kindOf(field) === 'boolean');
    const presets = [];
    presets.push({ label: 'Count items', expr: head + 'length' });
    if (keys.length >= 2) presets.push({ label: 'Pick fields', expr: `${head}pick(${keys.slice(0, 3).join(', ')})` });
    if (text) presets.push({ label: 'Sort by ' + text, expr: `${head}sortBy(${text})` });
    if (text) presets.push({ label: 'Unique ' + text, expr: `${head}map(x => x?.${text}) | unique()` });
    if (flag) presets.push({ label: 'Only ' + flag, expr: `${head}filter(x => x?.${flag} == true)` });
    if (number) presets.push({ label: 'Total ' + number, expr: `${head}sum(x => x?.${number})` });
    if (number) presets.push({ label: 'Biggest ' + number, expr: `${head}sortBy(-${number}) | slice(0, 5)` });
    if (text) presets.push({ label: 'Group by ' + text, expr: `${head}groupBy(x => x?.${text})` });
    return { presets, example: presets[1] ? presets[1].expr : presets[0].expr };
  }

  _renderTransformPresets() {
    const container = this.queryOne('#transformPresets');
    if (!container) return;
    const { presets, example } = this._transformPresets();
    container.innerHTML = presets.map(preset =>
      `<button class="qp-preset-btn" type="button" data-preset="${Structra.sharedHelpers.escapeHtml(preset.expr)}" title="${Structra.sharedHelpers.escapeHtml(preset.expr)}">${Structra.sharedHelpers.escapeHtml(preset.label)}</button>`
    ).join('');
    const input = this.queryOne('#transformInput');
    if (input) input.placeholder = `Steps joined with |\nExample: ${example}`;
  }

  /** Keep the result of a transform: it opens in a new tab and the open file stays as it is */
  _openTransform() {
    const command = document.querySelector('structra-command');
    if (this._lastTransform === undefined || !command) return;
    const name = (Structra.state.fileName || 'data').replace(/\.[^.]+$/, '') + ' (transform)';
    command._openInNewTab(this._lastTransform, name).then((opened) => { if (opened) Structra.toast('Result opened in a new tab'); });
  }

  async _runTransform() {
    const input = this.queryOne('#transformInput').value.trim();
    const results = this.queryOne('#queryResults');
    if (!input) { results.innerHTML = '<div class="qp-summary">Type the steps first</div>'; return; }

    const data = Structra.state.jsonData;
    if (!data) { results.innerHTML = '<div class="qp-summary">No JSON loaded</div>'; return; }

    try {
      // The steps run in the sandbox worker: a step that never ends cannot freeze the page
      let output;
      try { output = (await Structra.sandbox.transform(data, input)).value; }
      catch (error) { throw error.timedOut ? new Error('The steps ran for more than 5 seconds and were stopped.') : error; }
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
        <pre class="qp-transform-output"></pre>
        <div class="qp-actions">
          <button class="btn btn-sm" type="button" data-action="openTransform">Open result in a new tab</button>
          <button class="btn btn-sm btn-ghost" type="button" data-action="copyTransform">Copy</button>
        </div>`;
      Structra.codeView.colorize(results.querySelector('.qp-transform-output'), truncated, 'json');
    } catch (error) {
      results.innerHTML = `<div class="qp-summary is-error">${Structra.sharedHelpers.escapeHtml(error.message)}</div>`;
    }
  }

  _showModeHelp() {
    const help = StructraQuery.MODE_HELP[this._mode] || StructraQuery.MODE_HELP.path;
    const input = this.queryOne('#queryInput');
    if (input) input.placeholder = 'Example: ' + help.example;
    const hint = this.queryOne('#queryHint');
    if (hint) hint.textContent = help.hint;

    // SQL has its own extras: example queries, the columns of the table, and earlier queries
    const sql = this._mode === 'sql';
    this.classList.toggle('is-sql', sql);
    this.queryOne('#sqlHost').hidden = !sql;                  // SQL has its own editor; the other modes use the plain box
    if (input) input.hidden = sql;
    ['#sqlExamples', '#sqlSchema'].forEach((id) => { const element = this.queryOne(id); if (element) element.hidden = !sql; });
    const run = this.queryOne('#queryRun');
    if (run) run.innerHTML = sql ? 'Run query <kbd class="qp-kbd">Ctrl+Enter</kbd>' : 'Run query';
    this._renderSqlHistory();
    if (sql) {
      this._sqlEditor().then((box) => {
        if (!box) { this.queryOne('#queryResults').innerHTML = '<div class="qp-summary is-error">The SQL editor could not load. Check your connection and try again.</div>'; return; }
        box.refresh();                                 // it was hidden while it was built
        this._loadSqlSchema();
      });
    }
  }

  /* ======== SQL ======== */

  _sqlHistory() {
    try { return JSON.parse(localStorage.getItem(StructraQuery.SQL_HISTORY_KEY)) || []; } catch { return []; }
  }

  _rememberSql(text) {
    const list = [text, ...this._sqlHistory().filter((savedQuery) => savedQuery !== text)].slice(0, 20);
    try { localStorage.setItem(StructraQuery.SQL_HISTORY_KEY, JSON.stringify(list)); } catch { /* storage blocked: history is just not kept */ }
    this._renderSqlHistory();
  }

  _renderSqlHistory() {
    const select = this.queryOne('#sqlHistory');
    if (!select) return;
    const list = this._sqlHistory();
    select.hidden = this._mode !== 'sql' || !list.length;
    select.innerHTML = '<option value="">Earlier queries</option>' + list.map((savedQuery, i) => {
      const line = savedQuery.replace(/\s+/g, ' ').trim();
      return `<option value="${i}">${Structra.sharedHelpers.escapeHtml(line.length > 60 ? line.slice(0, 60) + '…' : line)}</option>`;
    }).join('');
  }

  /* ---- The SQL editor ----
     The box itself (colours, brackets, suggestions) comes from Structra.codeView (core/code-view.js).
     It loads the first time SQL mode is opened. The plain text box above it is used by the other modes. */

  /** The editor, created on first use. Resolves to it, or null when it could not load. */
  _sqlEditor() {
    if (this._boxPromise) return this._boxPromise;
    this._boxPromise = Structra.codeView.create(this.queryOne('#sqlHost'), {
      mode: 'sql',
      lineNumbers: false,
      growsWithText: true,
      placeholder: 'Example: ' + StructraQuery.MODE_HELP.sql.example,
      label: 'SQL query',
      sql: { columns: () => (this._sqlCols || []).map((sqlColumn) => sqlColumn.name) },
      extraKeys: { 'Ctrl-Enter': () => this._runQuery(), 'Cmd-Enter': () => this._runQuery() },
    }).then((box) => { this._box = box; return box; })
      .catch(() => { this._boxPromise = null; return null; });
    return this._boxPromise;
  }

  _sqlGet() {
    return this._box ? this._box.getValue() : '';
  }

  _sqlSet(text) {
    if (!this._box) return;
    this._box.setValue(text);
    this._box.focus();
    this._box.moveToEnd();
  }

  /** Put text where the cursor is (or over the selection), like a SQL tool does when you click a column name */
  _insertAtCursor(text) {
    if (this._box) this._box.insertAtCursor(text);
  }

  /** A column name as SQL wants it: quoted unless it is a plain lower-case word */
  _sqlName(name) {
    return /^[a-z_][a-z0-9_]*$/.test(name) ? name : '"' + String(name).replace(/"/g, '""') + '"';
  }

  /** Show the columns of the open file as a table named data, and offer queries written for those columns */
  async _loadSqlSchema() {
    const box = this.queryOne('#sqlColumns');
    const examples = this.queryOne('#sqlExamples');
    if (!box) return;
    if (!Structra.state.jsonData) {
      box.innerHTML = '<div class="qp-summary">Open a file to see its columns.</div>';
      examples.innerHTML = '';
      return;
    }
    const token = (this._schemaToken = (this._schemaToken || 0) + 1);
    box.innerHTML = '<div class="qp-summary">Starting the SQL engine…</div>';
    let columns = [];
    try {
      if (await Structra.dataEngine.enableSql()) columns = await Structra.dataEngine.describeTable();
    } catch { columns = []; }
    if (token !== this._schemaToken) return;           // the file changed while this was loading
    this._sqlCols = columns;                              // the editor suggests these names
    if (this._box) this._box.updateSchema();
    if (!columns.length) {
      box.innerHTML = '<div class="qp-summary">SQL is not available for this file. It needs a list of records or an object.</div>';
      examples.innerHTML = '';
      return;
    }
    this.queryOne('#sqlSchemaTitle').innerHTML = `Table <code>data</code> (${columns.length} ${columns.length === 1 ? 'column' : 'columns'}, click to show)`;
    box.innerHTML = columns.map((column) =>
      `<button class="qp-sql-col" type="button" data-sql-col="${Structra.sharedHelpers.escapeHtml(this._sqlName(column.name))}" title="Add ${Structra.sharedHelpers.escapeHtml(column.name)} to the query">
        <span>${Structra.sharedHelpers.escapeHtml(column.name)}</span><em>${Structra.sharedHelpers.escapeHtml(column.type)}</em></button>`).join('');
    examples.innerHTML = this._sqlExamples(columns).map((example) =>
      `<button class="qp-preset-btn" type="button" data-sql-example="${Structra.sharedHelpers.escapeHtml(example.sql)}" title="${Structra.sharedHelpers.escapeHtml(example.sql)}">${Structra.sharedHelpers.escapeHtml(example.label)}</button>`).join('');
  }

  /** Ready-made queries that use the file's real column names, so they run as they are */
  _sqlExamples(columns) {
    const isNumber = (type) => /^(U?(TINY|SMALL|BIG|HUGE)?INT|INTEGER|DOUBLE|FLOAT|REAL|DECIMAL)/i.test(type);
    const text = columns.find((column) => /^VARCHAR/i.test(column.type));
    const number = columns.find((column) => isNumber(column.type));
    const list = [
      { label: 'First 100 rows', sql: 'SELECT *\nFROM data\nLIMIT 100' },
      { label: 'Count rows', sql: 'SELECT COUNT(*) AS rows\nFROM data' },
    ];
    if (text) {
      const textName = this._sqlName(text.name);
      list.push({ label: 'Count by ' + text.name, sql: `SELECT ${textName}, COUNT(*) AS n\nFROM data\nGROUP BY ${textName}\nORDER BY n DESC` });
    }
    if (number) {
      const numberName = this._sqlName(number.name);
      list.push({ label: 'Totals of ' + number.name, sql: `SELECT SUM(${numberName}) AS total, AVG(${numberName}) AS average, MIN(${numberName}) AS smallest, MAX(${numberName}) AS biggest\nFROM data` });
      list.push({ label: 'Top 10 by ' + number.name, sql: `SELECT *\nFROM data\nORDER BY ${numberName} DESC\nLIMIT 10` });
    }
    list.push({ label: 'Summary of every column', sql: 'SUMMARIZE data' });
    return list;
  }

  /** The text to run: the selected part if there is one, like a SQL tool, otherwise everything */
  _sqlText() {
    if (!this._box) return '';
    return this._box.getSelection().trim() || this._box.getValue().trim();
  }

  /** The engine's messages, in plainer words */
  _sqlError(message) {
    let text = String(message || 'The query did not run.')
      .split('\n').filter((line) => !/^\s*(LINE \d+:|\^)/.test(line)).join(' ')
      .replace(/^(Parser|Binder|Catalog|Conversion|Invalid Input|Syntax|Runtime|Out of Range|Constraint) Error:\s*/i, '').trim();
    if (/does not exist/i.test(text) && /table/i.test(text)) text += ' The open file is the table named data.';
    return text;
  }

  async _runSql() {
    const results = this.queryOne('#queryResults');
    const text = this._sqlText();
    if (!text) { results.innerHTML = '<div class="qp-summary">Type a query first. Example: <code>SELECT * FROM data LIMIT 100</code></div>'; return; }
    if (!Structra.state.jsonData) { results.innerHTML = '<div class="qp-summary">Open a file first</div>'; return; }
    results.innerHTML = '<div class="qp-summary">Running…</div>';
    const result = await Structra.dataEngine.runSql(text, { quiet: true, readOnly: true, maxRows: StructraQuery.SQL_MAX_ROWS });
    if (result.error) {
      this._lastSql = null;
      results.innerHTML = `<div class="qp-summary is-error">${Structra.sharedHelpers.escapeHtml(this._sqlError(result.error))}</div>`;
      return;
    }
    this._rememberSql(this._sqlGet().trim());
    result.table = this._prepare(result);           // dates, decimals and nested values turned into plain data once
    this._lastSql = result;
    this._renderSqlResult(result);
    this._loadSqlSchemaIfStale();
  }

  _loadSqlSchemaIfStale() {
    if (!this.queryOne('#sqlColumns').querySelector('.qp-sql-col')) this._loadSqlSchema();
  }

  /** What kind of value a column holds, from the type the engine reported */
  _columnKind(info) {
    const type = info && info.type ? info.type : '';
    if (/^Decimal/.test(type)) return { name: 'decimal', scale: info.scale || 0, numeric: true };
    if (/^(Int|Uint|Float)/.test(type)) return { name: 'number', numeric: true };
    if (/^Date/.test(type)) return { name: 'date' };
    if (/^Timestamp/.test(type)) return { name: 'timestamp' };
    if (/^Time/.test(type)) return { name: 'time' };               // after Timestamp, which also starts with Time
    if (/^Bool/.test(type)) return { name: 'bool' };
    return { name: 'other' };
  }

  /** One value as plain JSON data, for copying, saving and opening in a tab */
  _plain(value, kind) {
    if (value === null || value === undefined) return null;
    const pad = (number, width = 2) => String(number).padStart(width, '0');
    if (kind.name === 'date' && typeof value === 'number') return new Date(value).toISOString().slice(0, 10);
    if (kind.name === 'timestamp' && typeof value === 'number') {
      const date = new Date(value);
      const text = date.toISOString().replace('T', ' ').replace('Z', '');
      return date.getUTCMilliseconds() ? text : text.slice(0, 19);
    }
    if (kind.name === 'time') {
      const micros = Number(value);
      const secs = Math.floor(micros / 1e6);
      const fraction = micros % 1e6;
      return `${pad(Math.floor(secs / 3600))}:${pad(Math.floor(secs / 60) % 60)}:${pad(secs % 60)}${fraction ? '.' + pad(fraction, 6).replace(/0+$/, '') : ''}`;
    }
    if (kind.name === 'decimal') {                       // the engine gives the digits without the point: put it back
      let digits = String(value).replace('-', '');
      const negative = String(value).startsWith('-');
      if (kind.scale) {
        digits = digits.padStart(kind.scale + 1, '0');
        digits = digits.slice(0, -kind.scale) + '.' + digits.slice(-kind.scale);
      }
      const text = (negative ? '-' : '') + digits;
      return digits.replace('.', '').length <= 15 ? Number(text) : text;
    }
    if (typeof value === 'bigint') return Number.isSafeInteger(Number(value)) ? Number(value) : value.toString();
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'object') {
      if (ArrayBuffer.isView(value) && !(value instanceof DataView)) return Array.from(value, (x) => (typeof x === 'bigint' ? x.toString() : x));
      try { return JSON.parse(JSON.stringify(value, (field, x) => (typeof x === 'bigint' ? x.toString() : x))); } catch { return String(value); }
    }
    return value;
  }

  /** The text shown in the grid for a plain value (a decimal keeps its trailing zeros: 12.50) */
  _cellText(value, kind) {
    if (kind.name === 'decimal' && typeof value === 'number') return value.toFixed(kind.scale);
    if (value !== null && typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  /** The result of a query ready to show and to save */
  _prepare(result) {
    const columns = result.columns;
    const kinds = columns.map((column, i) => this._columnKind((result.columnTypes || [])[i]));
    const plain = result.rows.map((row) => columns.map((column, i) => this._plain(row[column], kinds[i])));
    return { cols: columns, kinds, plain };
  }

  _renderSqlResult(result) {
    const results = this.queryOne('#queryResults');
    const escapeHtml = Structra.sharedHelpers.escapeHtml;
    const { cols: columns, kinds, plain: rows } = result.table;
    const shown = rows.slice(0, StructraQuery.SQL_SHOW_ROWS);
    const milliseconds = result.duration < 1000 ? Math.round(result.duration) + ' ms' : (result.duration / 1000).toFixed(1) + ' s';
    let note = `${rows.length.toLocaleString()}${result.truncated ? '+' : ''} ${rows.length === 1 ? 'row' : 'rows'} in ${milliseconds}`;
    if (result.truncated) note += `. Only the first ${rows.length.toLocaleString()} rows were read. Add a WHERE or LIMIT to narrow it.`;
    else if (rows.length > shown.length) note += `. The first ${shown.length.toLocaleString()} are shown below; copy or open the result to get them all.`;
    if (!columns.length) { results.innerHTML = `<div class="qp-summary">The query ran and returned no rows (${escapeHtml(milliseconds)}).</div>`; return; }
    const head = columns.map((column) => `<th title="${escapeHtml(column)}">${escapeHtml(column)}</th>`).join('');
    const body = shown.map((row, i) => `<tr><td class="qp-sql-n">${i + 1}</td>${row.map((value, index) => {
      if (value === null) return '<td class="qp-sql-null">NULL</td>';
      const text = this._cellText(value, kinds[index]);
      return `<td${kinds[index].numeric ? ' class="qp-sql-num"' : ''} title="${escapeHtml(text.length > 300 ? text.slice(0, 300) + '…' : text)}">${escapeHtml(text.length > 120 ? text.slice(0, 120) + '…' : text)}</td>`;
    }).join('')}</tr>`).join('');
    results.innerHTML = `<div class="qp-summary">${escapeHtml(note)}</div>
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
    const { cols: columns, kinds } = result.table;
    const rows = result.table.plain.map((row) => Object.fromEntries(columns.map((column, i) => [column, row[i]])));
    const base = (Structra.state.fileName || 'data').replace(/\.[^.]+$/, '');
    if (how === 'copy') {
      Structra.sharedHelpers.copyToClipboard(JSON.stringify(rows, null, 2), `${rows.length} ${rows.length === 1 ? 'row' : 'rows'} copied`);
    } else if (how === 'csv') {
      const csv = Structra.formatConversion.writeCsv(columns, result.table.plain.map((row) => row.map((value, i) => (kinds[i].name === 'decimal' && typeof value === 'number' ? value.toFixed(kinds[i].scale) : value))), { newline: '\r\n' });
      Structra.sharedHelpers.downloadFile('﻿' + csv, base + ' (query).csv', 'text/csv;charset=utf-8');
      Structra.toast('CSV downloaded');
    } else {
      const command = document.querySelector('structra-command');
      if (command) command._openInNewTab(rows, base + ' (SQL)').then((opened) => { if (opened) Structra.toast('Result opened in a new tab'); });
    }
  }

  async _runQuery() {
    if (this._mode === 'sql') { await this._runSql(); return; }
    const input = this.queryOne('#queryInput').value.trim();
    const results = this.queryOne('#queryResults');
    const help = StructraQuery.MODE_HELP[this._mode];
    if (!input) {
      results.innerHTML = `<div class="qp-summary">Type a query first. Example: <code>${Structra.sharedHelpers.escapeHtml(help.example)}</code></div>`;
      this.queryOne('#queryInput').focus();
      return;
    }

    const dataset = Structra.dataEngine.getActive();
    const data = dataset ? dataset.raw : Structra.state.jsonData;
    if (!data) { results.innerHTML = '<div class="qp-summary">Open a file first</div>'; return; }

    try {
      let matches = [];
      if (this._mode === 'path' || this._mode === 'jsonpath') matches = await Structra.jsonpathQuery.query(data, input);
      else if (this._mode === 'regex') matches = await this._queryRegex(data, input);
      else if (this._mode === 'js') matches = await this._queryJs(data, input);
      this._lastMatches = matches;

      if (matches.length === 0) {
        results.innerHTML = `<div class="qp-summary">No matches. Nothing in this file fits <code>${Structra.sharedHelpers.escapeHtml(input)}</code>.</div>`;
        return;
      }
      const shown = matches.slice(0, 100);
      results.innerHTML = `<div class="qp-summary">${matches.length.toLocaleString()} ${matches.length === 1 ? 'match' : 'matches'}${matches.length > shown.length ? ` (first ${shown.length} shown)` : ''}</div>
        <div class="qp-actions">
          <button class="btn btn-sm" type="button" data-action="copyMatches">Copy values</button>
          <button class="btn btn-sm" type="button" data-action="openMatches">Open in a new tab</button>
        </div>` +
        shown.map((match, i) =>
          `<div class="qp-result" data-i="${i}" data-path="${Structra.sharedHelpers.escapeHtml(match.path)}" title="Show in the Tree">
            <span class="qp-result-path">${Structra.sharedHelpers.escapeHtml(match.path)}</span>
            <span class="qp-result-value">${Structra.sharedHelpers.escapeHtml(this._preview(match.value))}</span>
            <span class="qp-result-copy">
              <button class="btn btn-sm btn-ghost" type="button" data-copy-expr="pa" title="Copy the Power Automate expression for this value">Power Automate</button>
              <button class="btn btn-sm btn-ghost" type="button" data-copy-expr="fx" title="Copy the Power Fx expression for this value">Power Fx</button>
            </span>
          </div>`
        ).join('');
    } catch (error) {
      results.innerHTML = `<div class="qp-summary is-error">${Structra.sharedHelpers.escapeHtml(error.message)}</div>`;
    }
  }

  /** A result was clicked: show it in the Tree, where it can be read in context and its expressions are one click away */
  _showMatch(path) {
    if (!path || !path.startsWith('$')) return;
    Structra.setState('activeView', 'tree');
    Structra.setState('currentPath', path);
    // Every match is marked in the Tree, and the clicked one is brought into view
    setTimeout(() => {
      const view = document.getElementById('jsonView');
      const all = (this._lastMatches || []).map((match) => match.path).filter((path) => typeof path === 'string' && path.startsWith('$'));
      if (view && all.length) Structra.jsonTreeRenderer.highlightPaths(view, all);
      Structra.events.emit('tree:navigate-path', path);
    }, 60);
  }

  _copyMatches() {
    const values = (this._lastMatches || []).map((match) => match.value);
    Structra.sharedHelpers.copyToClipboard(JSON.stringify(values, null, 2), `${values.length} ${values.length === 1 ? 'value' : 'values'} copied`);
  }

  _openMatches() {
    const command = document.querySelector('structra-command');
    const values = (this._lastMatches || []).map((match) => match.value);
    if (!command || !values.length) return;
    const name = (Structra.state.fileName || 'data').replace(/\.[^.]+$/, '') + ' (query)';
    command._openInNewTab(values, name).then((opened) => { if (opened) Structra.toast('Matches opened in a new tab'); });
  }

  /** A pattern over every text value of the document. It runs in the sandbox worker, so a pattern that never finishes is stopped. */
  async _queryRegex(data, pattern) {
    const source = pattern.replace(/^\/|\/[a-z]*$/g, '');
    if (Structra.sharedHelpers.isRiskyRegex(source)) throw new Error(Structra.sharedHelpers.RISKY_REGEX_MESSAGE);
    try {
      return (await Structra.sandbox.findPattern(data, source, { flags: 'i', primitives: false })).matches;
    } catch (error) {
      if (error.timedOut) throw new Error(Structra.sharedHelpers.RISKY_REGEX_MESSAGE);
      throw new Error('That is not a valid pattern: ' + error.message.replace(/^Invalid regular expression: /, ''));
    }
  }

  /** The person's JavaScript, run in the sandbox worker: the page cannot freeze and the code cannot reach it. */
  async _queryJs(data, expression) {
    let answer;
    try { answer = await Structra.sandbox.evaluate(data, expression, { locate: true }); }
    catch (error) { throw new Error('The JavaScript did not run: ' + error.message); }
    // Items that are objects inside the document are given their real path ($.value[1]), the rest are numbered
    return answer.items.map((item) => ({ path: item.path || (item.index === null ? 'result' : `result[${item.index}]`), value: item.value }));
  }

  _preview(value) {
    if (value === null) return 'null';
    if (typeof value === 'string') return value.length > 40 ? value.slice(0, 40) + '…' : value;
    if (typeof value === 'object') { const text = JSON.stringify(value); return text.length > 60 ? text.slice(0, 60) + '…' : text; }
    return String(value);
  }

}

customElements.define('structra-query', StructraQuery);
