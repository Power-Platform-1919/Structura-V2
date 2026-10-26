/* ============================================================
   STRUCTRA V2 - Code view
   Structra.codeView - one place that creates every code box in the app (SQL editor, JSON editor, read-only code).
   It is the only file that knows which editor library is behind them (CodeMirror 5 today, in src/libs/codemirror).
   Everything else asks for a box and uses the small API below, so changing the library later means changing this file.

   const box = await Structra.codeView.create(hostElement, {
     mode: 'json',            // sql | json | javascript | typescript | xml | yaml | toml | python | csharp | java | go | rust | powerfx | powerautomate | text
     value: '',
     readOnly: false,         // true: a viewer (no cursor, no typing); text can still be selected and copied
     lineNumbers: true,
     fold: true,              // fold gutter for { }, XML tags and indented blocks (left out for very large text)
     placeholder: '',
     growsWithText: false,    // true: a short box that gets taller as text is added (the SQL editor). Never use it for long text: it draws every line.
                              // false (default): the box fills its host, so the host needs a definite height, and only the visible lines are drawn
     extraKeys: {},           // CodeMirror key names, e.g. { 'Ctrl-Enter': fn }
     sql: { columns: () => ['id', 'name'] },   // SQL only: the table is called data; suggestions list these column names
     label: 'JSON text',      // the name a screen reader says
   });

   box.getValue() / box.setValue(text)     the whole text (setValue also clears undo history)
   box.replaceAll(text)                    swap the whole text but keep undo (for small text; large text clears the history to save memory)
   box.lineCount() / box.setReadOnly(bool)
   box.getSelection()                      the selected text, '' when nothing is selected
   box.suggest(manual)                     show the suggestion list (SQL); it also opens by itself while typing
   box.insertAtCursor(text)                type text at the cursor, or over the selection
   box.setCursor(line, ch) / box.focus()
   box.onChange(fn)                        fn() after every edit
   box.gotoOffset(offset, { select })      scroll to a character position and optionally select one character
   box.markError(offset)                   underline the character at offset and mark its line; box.clearError() removes it
   box.setMode(name)                       change language
   box.refresh()                           call after the box was hidden while it was built
   box.destroy()                           remove it
   box.cm                                  the CodeMirror object, for the rare thing the API does not cover

   Structra.codeView.colorize(preElement, text, 'json')
       colours text that is already on the page, with no editor (generated code, schemas, snippets)

   Large text: the library draws only the lines that are on screen, so scrolling stays smooth. To keep typing and opening
   fast on big documents this file turns off folding above BIG_FOLD characters, limits how much of a very long line
   is coloured, and keeps a short undo history. The limits are constants below, found by measuring (tests/perf/codeview.js).
   ============================================================ */

Structra.codeView = (() => {
  /** Above this many characters, the fold gutter is off: finding where each { ends would scan most of the document */
  const BIG_FOLD = 1.5 * 1024 * 1024;
  /** Above this many characters the undo history is kept short, to save memory */
  const BIG_UNDO = 4 * 1024 * 1024;
  /** Above this many characters, colorize() leaves the text plain */
  const COLORIZE_MAX = 300000;

  // Our name for a language -> the extra file it needs, the library's name for it, and how its blocks fold
  const MODES = {
    sql:        { spec: 'text/x-duckdb' },
    json:       { spec: 'application/x-jsonline', fold: 'brace' },        // our own line-by-line mode, see defineModes
    javascript: { lib: 'cm-javascript', spec: 'text/javascript', fold: 'brace' },
    typescript: { lib: 'cm-javascript', spec: 'text/typescript', fold: 'brace' },
    xml:        { lib: 'cm-xml', spec: 'application/xml', fold: 'xml' },
    yaml:       { lib: 'cm-yaml', spec: 'text/x-yaml', fold: 'indent' },
    toml:       { lib: 'cm-toml', spec: 'text/x-toml', fold: 'indent' },
    python:     { lib: 'cm-python', spec: 'text/x-python', fold: 'indent' },
    csharp:     { lib: 'cm-clike', spec: 'text/x-csharp', fold: 'brace' },
    java:       { lib: 'cm-clike', spec: 'text/x-java', fold: 'brace' },
    go:         { lib: 'cm-go', spec: 'text/x-go', fold: 'brace' },
    rust:       { lib: 'cm-rust', spec: 'text/x-rustsrc', fold: 'brace' },
    text:       { spec: 'text/plain' },
    // Power Platform languages that CodeMirror does not have: small modes written below with its simple-mode helper
    powerfx:      { lib: 'cm-simple', spec: 'powerfx', define: 'powerfx' },
    powerautomate: { lib: 'cm-simple', spec: 'powerautomate', define: 'powerautomate' },
  };

  /** Colour rules for the two Power Platform languages (CodeMirror's simple-mode format: a list of patterns per state) */
  const SIMPLE_MODES = {
    powerfx: {
      start: [
        { regex: /"(?:[^"]|"")*"/, token: 'string' },
        { regex: /\/\/.*/, token: 'comment' },
        { regex: /\/\*/, token: 'comment', next: 'comment' },
        { regex: /\b(?:true|false|Blank)\b/i, token: 'atom' },
        { regex: /\b(?:If|Switch|With|ForAll|Filter|LookUp|Sort|SortByColumns|Search|Patch|Collect|ClearCollect|Clear|Remove|Set|UpdateContext|Navigate|Notify|Concurrent|Text|Value|Date|Time|Now|Today|Len|Left|Right|Mid|Lower|Upper|Trim|Concat|Concatenate|Sum|Average|Min|Max|Count|CountRows|CountIf|First|Last|FirstN|LastN|Distinct|GroupBy|Ungroup|AddColumns|DropColumns|ShowColumns|RenameColumns|Table|Record|ParseJSON|JSON|IsBlank|IsEmpty|IsError|IfError|Coalesce|And|Or|Not|Round|RoundUp|RoundDown|Abs|Mod|Substitute|Replace|Split|Find|StartsWith|EndsWith|ColumnNames|Index|Sequence|DateAdd|DateDiff|DateValue|DateTimeValue|Boolean|Int)(?=\s*\()/, token: 'builtin' },
        { regex: /\b(?:ThisItem|ThisRecord|Self|Parent)\b/, token: 'keyword' },
        { regex: /\d+(?:\.\d+)?(?:e[-+]?\d+)?/i, token: 'number' },
        { regex: /[-+*\/=<>!&|%^:;,.]+|[()[\]{}]/, token: 'operator' },
        { regex: /[A-Za-z_][\w]*/, token: 'variable' },
      ],
      comment: [
        { regex: /.*?\*\//, token: 'comment', next: 'start' },
        { regex: /.*/, token: 'comment' },
      ],
    },
    powerautomate: {
      start: [
        { regex: /'(?:[^']|'')*'/, token: 'string' },
        { regex: /\b(?:true|false|null)\b/, token: 'atom' },
        { regex: /@(?=\{)|@(?=[a-zA-Z])/, token: 'keyword' },
        { regex: /[A-Za-z_][\w]*(?=\()/, token: 'builtin' },
        { regex: /\d+(?:\.\d+)?/, token: 'number' },
        { regex: /\?\[|[()[\]{}.,?]/, token: 'operator' },
        { regex: /[A-Za-z_][\w]*/, token: 'variable' },
      ],
    },
  };


  // DuckDB words that CodeMirror's PostgreSQL mode does not know, so they are coloured like other keywords
  const DUCKDB_WORDS = 'summarize qualify pivot unpivot describe show explain copy attach detach install load using sample tablesample ' +
    'asof positional anti semi struct list map union exclude replace columns unnest generate_series list_agg string_agg approx_count_distinct ' +
    'approx_top_k median mode quantile arg_min arg_max regexp_matches json_extract json_extract_string strftime date_trunc date_diff';

  const definedSimple = new Set();
  let modesDefined = false;
  function defineModes(CM) {
    if (modesDefined) return;
    modesDefined = true;
    const base = CM.resolveMode('text/x-pgsql');
    const keywords = Object.assign({}, base.keywords);
    DUCKDB_WORDS.split(' ').forEach((w) => { keywords[w] = true; });
    CM.defineMIME('text/x-duckdb', Object.assign({}, base, { keywords }));

    // JSON, one line at a time. CodeMirror's own JSON mode remembers a state from line to line, so to colour line 900,000 it
    // must first colour the 899,999 lines before it (measured: 38 seconds for 100,000 flat lines). In pretty-printed JSON a
    // string never runs over a line break, so each line can be coloured on its own: no state, no waiting, less memory.
    // The colours are the Tree's: keys, strings, numbers, true/false and null each get their own.
    CM.defineMode('jsonline', () => ({
      token(stream) {
        if (stream.eatSpace()) return null;
        const ch = stream.peek();
        if (ch === '"') {
          stream.next();
          let escaped = false;
          let c;
          while ((c = stream.next()) != null) {
            if (!escaped && c === '"') break;
            escaped = !escaped && c === '\\';
          }
          // A string followed by a colon is a key. "string property" keeps bracket matching and folding from reading its inside as code.
          return /^\s*:/.test(stream.string.slice(stream.pos)) ? 'string property' : 'string';
        }
        if (stream.match(/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/)) return 'number';
        if (stream.match(/^(?:true|false)\b/)) return 'atom';
        if (stream.match(/^null\b/)) return 'null';
        stream.next();
        return /[{}[\]]/.test(ch) ? 'bracket' : 'punctuation';
      },
      // Lines are independent, so there is no state to keep
      blankLine() {},
    }));
    CM.defineMIME('application/x-jsonline', 'jsonline');
  }

  /** Load the library and the language file a mode needs. Resolves to the CodeMirror function. */
  async function load(modeName, wantFold) {
    const CM = await Structra.libs.require('codemirror');
    defineModes(CM);
    const info = MODES[modeName] || MODES.text;
    if (info.lib) await Structra.libs.require(info.lib);
    if (info.define && !definedSimple.has(info.define)) { CM.defineSimpleMode(info.define, SIMPLE_MODES[info.define]); definedSimple.add(info.define); }
    if (wantFold && info.fold) await Structra.libs.require('cm-fold');
    return CM;
  }

  function foldFinder(CM, kind) {
    return kind === 'xml' ? CM.fold.xml : kind === 'indent' ? CM.fold.indent : CM.fold.brace;
  }

  async function create(host, opts = {}) {
    const modeName = MODES[opts.mode] ? opts.mode : 'text';
    const info = MODES[modeName];
    const value = opts.value || '';
    const big = value.length > BIG_FOLD;
    const wantFold = opts.fold !== false && !!info.fold && !big;
    const CM = await load(modeName, wantFold);

    const config = {
      value,
      mode: info.spec,
      readOnly: !!opts.readOnly,                        // still focusable, so the keyboard can select and copy
      lineNumbers: opts.lineNumbers !== false,
      lineWrapping: false,
      matchBrackets: true,
      autoCloseBrackets: !opts.readOnly,
      placeholder: opts.placeholder || undefined,
      // 'Infinity' draws all lines, which suits a short box that grows with its text (growsWithText); the default draws a window around the screen
      viewportMargin: opts.growsWithText ? Infinity : 10,
      maxHighlightLength: 2000,                          // a very long line is not coloured past this, so one huge line cannot freeze the page
      undoDepth: value.length > BIG_UNDO ? 10 : 200,
      extraKeys: Object.assign({ Tab: false, 'Shift-Tab': false }, opts.extraKeys || {}),   // Tab keeps moving focus: the keyboard is never trapped
    };
    if (wantFold) {
      config.gutters = ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'];
      config.foldGutter = { rangeFinder: foldFinder(CM, info.fold) };
    }
    if (opts.readOnly) config.cursorBlinkRate = -1;
    host.classList.add('cv');
    if (opts.growsWithText) host.classList.add('cv-grow');
    const cm = CM(host, config);
    const input = cm.getInputField();
    if (opts.label) input.setAttribute('aria-label', opts.label);
    if (opts.readOnly) input.setAttribute('aria-readonly', 'true');

    // SQL: CodeMirror's own SQL add-on suggests keywords and the table; it is told the table "data" and its columns
    const sqlName = (name) => (/^[a-z_][a-z0-9_]*$/.test(name) ? name : '"' + String(name).replace(/"/g, '""') + '"');
    function suggest() {
      if (!opts.sql) return;
      const columns = opts.sql.columns() || [];
      const hint = (editor, options) => {
        const found = CM.hint.sql(editor, options);
        if (!found) return found;
        // A column that is not a plain lower-case word has to be written in double quotes in SQL
        if (!editor.getRange(found.from, found.to).startsWith('"')) {
          found.list = found.list.map((item) => {
            const text = typeof item === 'string' ? item : item.text;
            return columns.includes(text) && sqlName(text) !== text ? { text: sqlName(text), displayText: text } : item;
          });
        }
        return found;
      };
      cm.showHint({
        hint,
        completeSingle: false,
        tables: { data: columns },
        defaultTable: 'data',
        closeCharacters: /[\s()[\]{};:>,]/,
        extraKeys: { Tab: (_, handle) => handle.pick() },
        container: host,
      });
    }
    if (opts.sql) {
      cm.on('inputRead', (_, change) => {
        if (change.origin === '+input' && /^[A-Za-z0-9_".]$/.test(change.text[0] || '') && !cm.state.completionActive) suggest();
      });
      cm.addKeyMap({ 'Ctrl-Space': suggest });
    }
    // Escape closes an open suggestion list first. It must not also reach the app and close a panel.
    let listWasOpen = false;
    host.addEventListener('keydown', (e) => { if (e.key === 'Escape') listWasOpen = !!cm.state.completionActive; }, true);
    host.addEventListener('keydown', (e) => { if (e.key === 'Escape' && listWasOpen) { e.stopPropagation(); listWasOpen = false; } });

    let errorMark = null;
    let errorLine = null;
    const handlers = [];
    cm.on('change', () => handlers.forEach((fn) => fn()));

    const api = {
      cm,
      /** True when the text was big enough that folding and long undo history are off */
      big,
      getValue: () => cm.getValue(),
      setValue(text) {
        cm.operation(() => { cm.setValue(text); cm.clearHistory(); });
        api.clearError();
        api.big = text.length > BIG_FOLD;
        cm.setOption('undoDepth', text.length > BIG_UNDO ? 10 : 200);
        if (api.big && cm.getOption('foldGutter')) cm.setOption('foldGutter', false);
      },
      suggest,
      replaceAll(text) {
        if (text.length > BIG_UNDO || cm.lineCount() > 150000) { api.setValue(text); return; }     // a long undo history of a big text would cost much memory
        cm.operation(() => cm.replaceRange(text, { line: 0, ch: 0 }, { line: cm.lastLine(), ch: cm.getLine(cm.lastLine()).length }));
      },
      lineCount: () => cm.lineCount(),
      setReadOnly(on) { cm.setOption('readOnly', !!on); },
      getSelection: () => cm.getSelection(),
      insertAtCursor(text) { cm.replaceSelection(text, 'end'); cm.focus(); },
      setCursor(line, ch) { cm.setCursor({ line, ch }); },
      focus: () => cm.focus(),
      refresh: () => cm.refresh(),
      onChange(fn) { handlers.push(fn); },
      gotoOffset(offset, { select = false } = {}) {
        const from = cm.posFromIndex(Math.max(0, offset));
        const to = cm.posFromIndex(offset + 1);
        cm.focus();
        if (select) cm.setSelection(from, to); else cm.setCursor(from);
        cm.scrollIntoView({ from, to }, 120);
      },
      markError(offset) {
        api.clearError();
        const from = cm.posFromIndex(Math.max(0, offset));
        const to = cm.posFromIndex(offset + 1);
        errorMark = cm.markText(from, to, { className: 'cv-error' });
        errorLine = from.line;
        cm.addLineClass(errorLine, 'wrap', 'cv-error-line');
      },
      clearError() {
        if (errorMark) { errorMark.clear(); errorMark = null; }
        if (errorLine !== null) { cm.removeLineClass(errorLine, 'wrap', 'cv-error-line'); errorLine = null; }
      },
      async setMode(name) {
        const next = MODES[name] ? name : 'text';
        await load(next, false);
        cm.setOption('mode', MODES[next].spec);
      },
      destroy() {
        cm.getWrapperElement().remove();
        handlers.length = 0;
      },
    };
    return api;
  }

  /**
   * Colour a piece of text that is already on the page (a <pre>), without making an editor: for generated code, schemas,
   * snippets. The text is shown at once in plain form and coloured when the language file has arrived. Copying still
   * gives the same text. Very long text is left plain, because colouring it would only cost time.
   */
  async function colorize(el, text, modeName) {
    el.textContent = text;
    const token = (el._cvToken = (el._cvToken || 0) + 1);
    if (!text || text.length > COLORIZE_MAX) return;
    try {
      const name = MODES[modeName] ? modeName : 'text';
      const CM = await load(name, false);
      await Structra.libs.require('cm-runmode');
      if (token !== el._cvToken || el.textContent !== text) return;      // newer text arrived while this loaded
      el.textContent = '';
      CM.runMode(text, MODES[name].spec, el);
      el.classList.add('cv');                                             // the colours in codeview.css apply to .cv
    } catch (err) {
      el.textContent = text;                                              // stay plain
    }
  }

  /** The best mode for the text of a file: a name from the list above */
  function modeForFormat(format) {
    return { json: 'json', xml: 'xml', yaml: 'yaml', yml: 'yaml', toml: 'toml', csv: 'text', tsv: 'text', ts: 'typescript' }[String(format).toLowerCase()] || (MODES[format] ? format : 'text');
  }

  return { create, colorize, modeForFormat, MODES, BIG_FOLD };
})();
