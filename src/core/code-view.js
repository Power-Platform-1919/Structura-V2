/* ============================================================
   STRUCTRA V2 - Code view
   Structra.codeView - one place that creates every code box in the app (SQL editor, JSON editor, read-only code, the two
   Compare panes). It is the only file that knows which editor library is behind them (CodeMirror 6, built into
   src/libs/codemirror6 by tools/build-editor.mjs). Everything else asks for a box and uses the small API below, so changing
   the library later means changing this file.

   const box = await Structra.codeView.create(hostElement, {
     mode: 'json',            // sql | json | javascript | typescript | xml | yaml | toml | python | csharp | java | go | rust | powerfx | powerautomate | text
     value: '',
     readOnly: false,         // true: a viewer (no typing, no caret); text can still be selected and copied
     lineNumbers: true,
     fold: true,              // fold gutter for { }, XML tags and indented blocks (left out for very large text)
     placeholder: '',
     growsWithText: false,    // true: a short box that gets taller as text is added (the SQL editor). Fine for a query, not for long text.
                              // false (default): the box fills its host, so the host needs a definite height
     extraKeys: {},           // key names as CodeMirror writes them, e.g. { 'Ctrl-Enter': fn, 'Cmd-Enter': fn }
     sql: { columns: () => ['id', 'name'] },   // SQL only: the table is called data; suggestions list these column names
     label: 'JSON text',      // the name a screen reader says
   });

   box.getValue() / box.setValue(text)     the whole text (setValue also clears undo history, shading and error marks)
   box.replaceAll(text)                    swap the whole text but keep undo (for small text; large text clears the history to save memory)
   box.lineCount() / box.lineText(line)    lines are numbered from 0 in this API
   box.setReadOnly(bool)
   box.setLineClasses(map)                 shade lines: a Map of line number -> CSS class; replaces the earlier shading
   box.getSelection()                      the selected text, '' when nothing is selected
   box.suggest()                           show the suggestion list (SQL); it also opens by itself while typing
   box.updateSchema()                      tell the SQL suggestions that the column names changed
   box.insertAtCursor(text)                type text at the cursor, or over the selection
   box.setCursor(line, ch) / box.moveToEnd() / box.focus()
   box.onChange(fn)                        fn() after every edit
   box.gotoOffset(offset, { select })      scroll to a character position and optionally select one character
   box.offsetToPosition(offset)            { line, ch } of a character position
   box.markError(offset)                   mark the character at offset and its line; box.clearError() removes it
   box.onScroll(fn) / box.getScroll() / box.scrollTo(left, top)
   box.setMode(name)                       change language
   box.refresh()                           call after the box was hidden while it was built
   box.destroy()                           remove it
   box.view                                the CodeMirror EditorView, for the rare thing the API does not cover
   hostElement.codeView                    the box, found from its host (the tests use this)

   Structra.codeView.colorize(preElement, text, 'json')
       colours text that is already on the page, with no editor (generated code, schemas, snippets)

   Large text: the editor draws only the lines on screen and keeps the document in a compact tree, so a 134 MB text (88 MB of
   JSON, 6.9 million lines) takes about 400 MB and opens in under a second (measured against CodeMirror 5: 720 MB, 1.8 s).
   Above BIG_FOLD characters this file turns folding off (finding where each { ends would scan most of the document), and
   colouring a line stops at MAX_COLOUR_LINE characters. The numbers were found by measuring (tests/perf/codeview.js).
   ============================================================ */

Structra.codeView = (() => {
  /** Above this many characters, the fold gutter is off: finding where each { ends would scan most of the document */
  const BIG_FOLD = 1.5 * 1024 * 1024;
  /** Above this many characters (or lines), replaceAll starts a fresh history: remembering the old text would cost as much again */
  const BIG_UNDO = 4 * 1024 * 1024;
  const BIG_UNDO_LINES = 150000;
  /** Above this many characters, colorize() leaves the text plain */
  const COLORIZE_MAX = 300000;
  /** A line longer than this is not coloured, so one huge line cannot freeze the page */
  const MAX_COLOUR_LINE = 2000;

  // DuckDB words that the PostgreSQL dialect does not know, so they are coloured and suggested like other keywords
  const DUCKDB_WORDS = 'summarize qualify pivot unpivot describe show explain copy attach detach install load using sample tablesample ' +
    'asof positional anti semi struct list map union exclude replace columns unnest generate_series list_agg string_agg approx_count_distinct ' +
    'approx_top_k median mode quantile arg_min arg_max regexp_matches json_extract json_extract_string strftime date_trunc date_diff';

  // Our name for a language -> how to get it. 'json' is our own line-by-line colouring, see jsonColouring.
  const MODES = {
    sql: { language: 'sql' },
    json: { fold: 'json' },
    javascript: { language: 'javascript' },
    typescript: { language: 'typescript' },
    xml: { language: 'xml' },
    yaml: { language: 'yaml' },
    toml: { language: 'toml' },
    python: { language: 'python' },
    csharp: { language: 'csharp' },
    java: { language: 'java' },
    go: { language: 'go' },
    rust: { language: 'rust' },
    powerfx: { language: 'powerfx' },
    powerautomate: { language: 'powerautomate' },
    text: {},
  };

  let libPromise = null;
  /** The editor library, loaded the first time any code box is made */
  function library() {
    if (!libPromise) {
      libPromise = Structra.libraryLoader.loadLibrary('codemirror6').then((result) => { defineStyle(result); return result; });
      libPromise.catch(() => { libPromise = null; });          // a failed load can be tried again
    }
    return libPromise;
  }

  /* ---------- colours: one set of class names for every language ---------- */

  let highlightStyle = null;
  function defineStyle(library) {
    if (highlightStyle) return;
    const tags = library.tags;
    highlightStyle = library.HighlightStyle.define([
      { tag: tags.keyword, class: 'tok-keyword' },
      { tag: [tags.atom, tags.bool], class: 'tok-bool' },
      { tag: tags.null, class: 'tok-null' },
      { tag: [tags.string, tags.special(tags.string), tags.regexp, tags.escape], class: 'tok-string' },
      { tag: [tags.number, tags.integer, tags.float], class: 'tok-number' },
      { tag: tags.comment, class: 'tok-comment' },
      { tag: [tags.propertyName, tags.definition(tags.propertyName), tags.attributeName], class: 'tok-property' },
      { tag: [tags.function(tags.variableName), tags.function(tags.propertyName), tags.standard(tags.variableName), tags.special(tags.variableName)], class: 'tok-function' },
      { tag: [tags.typeName, tags.className, tags.namespace], class: 'tok-type' },
      { tag: [tags.operator, tags.punctuation, tags.bracket, tags.meta], class: 'tok-punct' },
      { tag: tags.tagName, class: 'tok-keyword' },
      { tag: tags.invalid, class: 'tok-invalid' },
      { tag: tags.variableName, class: 'tok-variable' },
    ]);
  }

  /** JSON, one line at a time: strings, keys (a string followed by a colon), numbers, true/false, null, brackets.
      A JSON string never runs over a line break, so each line can be coloured alone: no state, no waiting. */
  const JSON_TOKEN = /"(?:[^"\\]|\\.)*"?|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\btrue\b|\bfalse\b|\bnull\b|[{}[\],:]/g;
  function jsonTokens(text, emit) {
    JSON_TOKEN.lastIndex = 0;
    let match;
    while ((match = JSON_TOKEN.exec(text)) !== null) {
      const matchedText = match[0];
      const charCode = matchedText.charCodeAt(0);
      let lineClass;
      if (charCode === 34) lineClass = /^\s*:/.test(text.slice(match.index + matchedText.length, match.index + matchedText.length + 64)) ? 'tok-property' : 'tok-string';
      else if (matchedText === 'true' || matchedText === 'false') lineClass = 'tok-bool';
      else if (matchedText === 'null') lineClass = 'tok-null';
      else if (charCode === 45 || (charCode >= 48 && charCode <= 57)) lineClass = 'tok-number';
      else lineClass = 'tok-punct';
      emit(match.index, match.index + matchedText.length, lineClass);
    }
  }

  /** The two Power Platform languages, as small stream parsers (CodeMirror has neither) */
  const POWER_FX_FUNCTIONS = /^(?:If|Switch|With|ForAll|Filter|LookUp|Sort|SortByColumns|Search|Patch|Collect|ClearCollect|Clear|Remove|Set|UpdateContext|Navigate|Notify|Concurrent|Text|Value|Date|Time|Now|Today|Len|Left|Right|Mid|Lower|Upper|Trim|Concat|Concatenate|Sum|Average|Min|Max|Count|CountRows|CountIf|First|Last|FirstN|LastN|Distinct|GroupBy|Ungroup|AddColumns|DropColumns|ShowColumns|RenameColumns|Table|Record|ParseJSON|JSON|IsBlank|IsEmpty|IsError|IfError|Coalesce|And|Or|Not|Round|RoundUp|RoundDown|Abs|Mod|Substitute|Replace|Split|Find|StartsWith|EndsWith|ColumnNames|Index|Sequence|DateAdd|DateDiff|DateValue|DateTimeValue|Boolean|Int)(?=\s*\()/;
  const powerFx = {
    name: 'powerfx',
    startState: () => ({ comment: false }),
    token(stream, state) {
      if (state.comment) {
        if (stream.match(/^.*?\*\//)) state.comment = false; else stream.skipToEnd();
        return 'comment';
      }
      if (stream.eatSpace()) return null;
      if (stream.match(/^"(?:[^"]|"")*"/)) return 'string';
      if (stream.match(/^\/\/.*/)) return 'comment';
      if (stream.match(/^\/\*/)) { state.comment = true; if (stream.match(/^.*?\*\//)) state.comment = false; else stream.skipToEnd(); return 'comment'; }
      if (stream.match(/^(?:true|false|Blank)\b/i)) return 'atom';
      if (stream.match(POWER_FX_FUNCTIONS)) return 'variableName.function';
      if (stream.match(/^(?:ThisItem|ThisRecord|Self|Parent)\b/)) return 'keyword';
      if (stream.match(/^\d+(?:\.\d+)?(?:e[-+]?\d+)?/i)) return 'number';
      if (stream.match(/^(?:[-+*/=<>!&|%^:;,.]+|[()[\]{}])/)) return 'operator';
      if (stream.match(/^[A-Za-z_]\w*/)) return 'variable';
      stream.next();
      return null;
    },
  };
  const powerAutomate = {
    name: 'powerautomate',
    token(stream) {
      if (stream.eatSpace()) return null;
      if (stream.match(/^'(?:[^']|'')*'/)) return 'string';
      if (stream.match(/^(?:true|false|null)\b/)) return 'atom';
      if (stream.match(/^@(?=[{a-zA-Z])/)) return 'keyword';
      if (stream.match(/^[A-Za-z_]\w*(?=\()/)) return 'variableName.function';
      if (stream.match(/^\d+(?:\.\d+)?/)) return 'number';
      if (stream.match(/^(?:\?\[|[()[\]{}.,?])/)) return 'operator';
      if (stream.match(/^[A-Za-z_]\w*/)) return 'variable';
      stream.next();
      return null;
    },
  };

  /** The language support for a mode: { extension, language } or null for plain text and our own JSON colouring */
  const languageCache = new Map();
  async function languageFor(library, name, options = {}) {
    const key = MODES[name] && MODES[name].language;
    if (!key) return null;
    const load = library.loadLanguage;
    switch (key) {
      case 'sql': {
        const languageModule = await load.sql();
        // DuckDB is close to PostgreSQL: its keywords plus the words above
        const dialect = languageModule.SQLDialect.define({ ...languageModule.PostgreSQL.spec, keywords: languageModule.PostgreSQL.spec.keywords + ' ' + DUCKDB_WORDS });
        const support = languageModule.sql({ dialect, schema: { data: options.columns || [] }, defaultTable: 'data', upperCaseKeywords: false });
        return { extension: support, language: support.language };
      }
      case 'javascript': { const languageModule = await load.javascript(); const languageSupport = languageModule.javascript(); return { extension: languageSupport, language: languageSupport.language }; }
      case 'typescript': { const languageModule = await load.javascript(); const languageSupport = languageModule.javascript({ typescript: true }); return { extension: languageSupport, language: languageSupport.language }; }
      case 'xml': { const languageModule = await load.xml(); const languageSupport = languageModule.xml(); return { extension: languageSupport, language: languageSupport.language }; }
      case 'yaml': { const languageModule = await load.yaml(); const languageSupport = languageModule.yaml(); return { extension: languageSupport, language: languageSupport.language }; }
      case 'python': { const languageModule = await load.python(); const languageSupport = languageModule.python(); return { extension: languageSupport, language: languageSupport.language }; }
      case 'java': { const languageModule = await load.java(); const languageSupport = languageModule.java(); return { extension: languageSupport, language: languageSupport.language }; }
      case 'go': { const languageModule = await load.go(); const languageSupport = languageModule.go(); return { extension: languageSupport, language: languageSupport.language }; }
      case 'rust': { const languageModule = await load.rust(); const languageSupport = languageModule.rust(); return { extension: languageSupport, language: languageSupport.language }; }
      case 'csharp': {
        if (!languageCache.has(key)) languageCache.set(key, library.StreamLanguage.define((await load.clike()).csharp));
        return { extension: languageCache.get(key), language: languageCache.get(key) };
      }
      case 'toml': {
        if (!languageCache.has(key)) languageCache.set(key, library.StreamLanguage.define((await load.toml()).toml));
        return { extension: languageCache.get(key), language: languageCache.get(key) };
      }
      case 'powerfx': {
        if (!languageCache.has(key)) languageCache.set(key, library.StreamLanguage.define(powerFx));
        return { extension: languageCache.get(key), language: languageCache.get(key) };
      }
      case 'powerautomate': {
        if (!languageCache.has(key)) languageCache.set(key, library.StreamLanguage.define(powerAutomate));
        return { extension: languageCache.get(key), language: languageCache.get(key) };
      }
      default: return null;
    }
  }

  /* ---------- the box ---------- */

  const sqlName = (name) => (/^[a-z_][a-z0-9_]*$/.test(name) ? name : '"' + String(name).replace(/"/g, '""') + '"');

  /** Folding for JSON text: from the bracket that a line leaves open to the bracket that closes it. Strings are skipped.
      The folded part shows as { ... } on one line. */
  function jsonFoldService(state, lineStart, lineEnd) {
    const text = state.sliceDoc(lineStart, lineEnd);
    let open = -1;
    let depth = 0;
    let inString = false;
    for (let i = 0; i < text.length; i++) {
      const character = text[i];
      if (inString) { if (character === '\\') i++; else if (character === '"') inString = false; continue; }
      if (character === '"') inString = true;
      else if (character === '{' || character === '[') { depth++; open = i; }
      else if (character === '}' || character === ']') depth--;
    }
    if (depth <= 0 || open < 0) return null;                    // nothing is left open on this line
    const doc = state.doc;
    let level = depth;
    for (let lineNumber = doc.lineAt(lineStart).number + 1; lineNumber <= doc.lines; lineNumber++) {
      const line = doc.line(lineNumber);
      let text = false;
      for (let i = 0; i < line.text.length; i++) {
        const character = line.text[i];
        if (text) { if (character === '\\') i++; else if (character === '"') text = false; continue; }
        if (character === '"') text = true;
        else if (character === '{' || character === '[') level++;
        else if (character === '}' || character === ']') {
          level--;
          if (level === 0) return line.from + i > lineStart + open + 1 ? { from: lineStart + open + 1, to: line.from + i } : null;
        }
      }
    }
    return null;
  }

  async function create(host, options = {}) {
    const lib = await library();
    const modeName = MODES[options.mode] ? options.mode : 'text';
    const mode = MODES[modeName];
    const initial = options.value || '';
    const {
      EditorState, EditorView, Compartment, StateEffect, StateField, RangeSetBuilder, Prec, Decoration, ViewPlugin, keymap,
      lineNumbers, drawSelection, placeholder, history, historyKeymap, defaultKeymap, bracketMatching, foldGutter, foldService,
      closeBrackets, closeBracketsKeymap, syntaxHighlighting, autocompletion, completionKeymap, acceptCompletion, startCompletion,
      completionStatus,
    } = lib;

    const handlers = [];
    const scrollHandlers = [];
    const language = new Compartment();        // the language and its suggestions
    const readOnlyPart = new Compartment();    // typing allowed or not
    let current = { mode: modeName, language: null };
    let readOnly = !!options.readOnly;

    // ----- shading of whole lines (the Compare panes) and the marked error (the JSON editor) -----
    const setShade = StateEffect.define();
    const shadeField = StateField.define({
      create: () => Decoration.none,
      update(value, transaction) {
        value = value.map(transaction.changes);
        for (const end of transaction.effects) {
          if (!end.is(setShade)) continue;
          const lines = [...end.value.entries()].filter(([line]) => line + 1 <= transaction.state.doc.lines).sort((first, builder) => first[0] - builder[0]);
          const builder = new RangeSetBuilder();
          for (const [line, lineClass] of lines) builder.add(transaction.state.doc.line(line + 1).from, transaction.state.doc.line(line + 1).from, Decoration.line({ class: lineClass }));
          value = builder.finish();
        }
        return value;
      },
      provide: (field) => EditorView.decorations.from(field),
    });
    const setError = StateEffect.define();
    const errorField = StateField.define({
      create: () => Decoration.none,
      update(value, transaction) {
        value = value.map(transaction.changes);
        for (const end of transaction.effects) {
          if (!end.is(setError)) continue;
          if (end.value === null || end.value >= transaction.state.doc.length) { value = Decoration.none; continue; }
          const line = transaction.state.doc.lineAt(end.value);
          value = Decoration.set([
            Decoration.line({ class: 'cv-error-line' }).range(line.from),
            Decoration.mark({ class: 'cv-error' }).range(end.value, end.value + 1),
          ]);
        }
        return value;
      },
      provide: (field) => EditorView.decorations.from(field),
    });

    // ----- colouring of JSON text, only for the lines in view -----
    const jsonMarks = {};
    ['tok-property', 'tok-string', 'tok-number', 'tok-bool', 'tok-null', 'tok-punct'].forEach((className) => { jsonMarks[className] = Decoration.mark({ class: className }); });
    const jsonColouring = ViewPlugin.fromClass(class {
      constructor(view) { this.decorations = this.build(view); }
      update(update) { if (update.docChanged || update.viewportChanged) this.decorations = this.build(update.view); }
      build(view) {
        const builder = new RangeSetBuilder();
        for (const { from, to } of view.visibleRanges) {
          let position = from;
          while (position <= to) {
            const line = view.state.doc.lineAt(position);
            if (line.length <= MAX_COLOUR_LINE) jsonTokens(line.text, (start, end, lineClass) => builder.add(line.from + start, line.from + end, jsonMarks[lineClass]));
            position = line.to + 1;
          }
        }
        return builder.finish();
      }
    }, { decorations: (plugin) => plugin.decorations });

    // ----- the pieces every box has -----
    const keys = Object.entries(options.extraKeys || {}).map(([key, run]) => ({ key, preventDefault: true, run: () => { run(); return true; } }));
    const baseExtensions = [
      options.lineNumbers !== false ? lineNumbers() : [],
      drawSelection(),
      history({ minDepth: 10 }),
      bracketMatching(),
      syntaxHighlighting(highlightStyle),
      options.placeholder ? placeholder(options.placeholder) : [],
      EditorView.contentAttributes.of({ 'aria-label': options.label || 'Code', spellcheck: 'false', autocorrect: 'off', autocapitalize: 'off' }),
      EditorView.updateListener.of((update) => { if (update.docChanged) handlers.forEach((handler) => handler()); }),
      shadeField,
      errorField,
      Prec.highest(keymap.of(keys)),
      keymap.of([...historyKeymap, ...defaultKeymap]),
    ];
    const editableParts = () => [
      readOnlyPart.of([EditorState.readOnly.of(readOnly), EditorView.editable.of(true)]),
      readOnly ? [] : closeBrackets(),
      readOnly ? [] : keymap.of(closeBracketsKeymap),
    ];
    // SQL: suggestions from the dialect's keywords and the table's columns; Tab accepts one and otherwise keeps moving focus
    const sqlParts = options.sql ? [
      autocompletion({ icons: false, defaultKeymap: false, aboveCursor: false }),
      Prec.high(keymap.of([{ key: 'Tab', run: acceptCompletion }, ...completionKeymap])),
    ] : [];

    const foldExtensions = (text) => {
      if (options.fold === false || text.length > BIG_FOLD) return [];
      const parts = [foldGutter({ openText: '▾', closedText: '▸' })];
      if (mode.fold === 'json') parts.push(foldService.of(jsonFoldService));
      return parts;
    };
    const stateFor = (text) => EditorState.create({
      doc: text,
      extensions: [
        baseExtensions, editableParts(), sqlParts,
        language.of(current.language ? current.language.extension : []),
        mode.fold === 'json' ? jsonColouring : [],
        foldExtensions(text),
      ],
    });

    // Load the language before the box shows, so the first paint is already coloured
    current.language = await languageFor(lib, modeName, { columns: options.sql ? options.sql.columns() : [] });
    host.classList.add('cv');
    if (options.growsWithText) host.classList.add('cv-grow');
    host.classList.toggle('cv-readonly', readOnly);
    const view = new EditorView({ state: stateFor(initial), parent: host });
    view.scrollDOM.addEventListener('scroll', () => scrollHandlers.forEach((scrollHandler) => scrollHandler()), { passive: true });

    // Escape closes an open suggestion list first. It must not also reach the app and close a panel.
    let listWasOpen = false;
    host.addEventListener('keydown', (end) => { if (end.key === 'Escape') listWasOpen = completionStatus(view.state) === 'active'; }, true);
    host.addEventListener('keydown', (end) => { if (end.key === 'Escape' && listWasOpen) { end.stopPropagation(); listWasOpen = false; } });

    let big = initial.length > BIG_FOLD;
    const lineAt = (lineIndex) => view.state.doc.line(Math.max(1, Math.min(view.state.doc.lines, lineIndex + 1)));

    const api = {
      view,
      /** True when the text was big enough that folding is off */
      get big() { return big; },
      getValue: () => view.state.doc.toString(),
      setValue(text) {
        big = text.length > BIG_FOLD;
        view.setState(stateFor(text));                            // a fresh state: no history, no shading, no error mark
      },
      replaceAll(text) {
        if (text.length > BIG_UNDO || view.state.doc.lines > BIG_UNDO_LINES) { api.setValue(text); return; }
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
      },
      lineCount: () => view.state.doc.lines,
      lineText: (line) => lineAt(line).text,
      setReadOnly(isReadOnly) {
        readOnly = !!isReadOnly;
        host.classList.toggle('cv-readonly', readOnly);
        view.dispatch({ effects: readOnlyPart.reconfigure([EditorState.readOnly.of(readOnly), EditorView.editable.of(true)]) });
      },
      setLineClasses(map) { view.dispatch({ effects: setShade.of(map) }); },
      getSelection() { const selection = view.state.selection.main; return view.state.sliceDoc(selection.from, selection.to); },
      suggest() { startCompletion(view); },
      async updateSchema() {
        if (modeName !== 'sql' || !options.sql) return;
        current.language = await languageFor(lib, 'sql', { columns: options.sql.columns() });
        view.dispatch({ effects: language.reconfigure(current.language.extension) });
      },
      insertAtCursor(text) { view.dispatch(view.state.replaceSelection(text)); view.focus(); },
      setCursor(line, character) {
        const l = lineAt(line);
        view.dispatch({ selection: { anchor: l.from + Math.max(0, Math.min(character, l.length)) }, scrollIntoView: true });
      },
      moveToEnd() { view.dispatch({ selection: { anchor: view.state.doc.length }, scrollIntoView: true }); },
      focus: () => view.focus(),
      refresh: () => view.requestMeasure(),
      onChange(callback) { handlers.push(callback); },
      gotoOffset(offset, { select = false } = {}) {
        const at = Math.max(0, Math.min(offset, view.state.doc.length));
        view.focus();
        view.dispatch({
          selection: select ? { anchor: at, head: Math.min(at + 1, view.state.doc.length) } : { anchor: at },
          effects: EditorView.scrollIntoView(at, { y: 'center' }),
        });
      },
      offsetToPosition(offset) {
        const line = view.state.doc.lineAt(Math.max(0, Math.min(offset, view.state.doc.length)));
        return { line: line.number - 1, ch: offset - line.from };
      },
      markError(offset) { view.dispatch({ effects: setError.of(offset) }); },
      clearError() { view.dispatch({ effects: setError.of(null) }); },
      onScroll(callback) { scrollHandlers.push(callback); },
      getScroll: () => ({ left: view.scrollDOM.scrollLeft, top: view.scrollDOM.scrollTop }),
      scrollTo(left, top) { view.scrollDOM.scrollLeft = left; view.scrollDOM.scrollTop = top; },
      async setMode(name) {
        const next = MODES[name] ? name : 'text';
        current = { mode: next, language: await languageFor(lib, next, { columns: options.sql ? options.sql.columns() : [] }) };
        view.dispatch({ effects: language.reconfigure(current.language ? current.language.extension : []) });
      },
      destroy() {
        view.destroy();
        handlers.length = 0;
        scrollHandlers.length = 0;
        delete host.codeView;
      },
    };
    host.codeView = api;
    return api;
  }

  /**
   * Colour a piece of text that is already on the page (a <pre>), without making an editor: for generated code, schemas,
   * snippets. The text is shown at once in plain form and coloured when the language file has arrived. Copying still
   * gives the same text. Very long text is left plain, because colouring it would only cost time.
   */
  async function colorize(element, text, modeName) {
    element.textContent = text;
    const token = (element._cvToken = (element._cvToken || 0) + 1);
    if (!text || text.length > COLORIZE_MAX) return;
    try {
      const lib = await library();
      const name = MODES[modeName] ? modeName : 'text';
      const fragment = document.createDocumentFragment();
      const span = (lineClass, text) => {
        if (!lineClass) { fragment.append(text); return; }
        const element = document.createElement('span');
        element.className = lineClass;
        element.textContent = text;
        fragment.append(element);
      };
      if (MODES[name].fold === 'json') {
        text.split('\n').forEach((line, i, all) => {
          let at = 0;
          if (line.length <= MAX_COLOUR_LINE) jsonTokens(line, (start, end, lineClass) => { if (start > at) span('', line.slice(at, start)); span(lineClass, line.slice(start, end)); at = end; });
          if (at < line.length) span('', line.slice(at));
          if (i < all.length - 1) span('', '\n');
        });
      } else {
        const found = await languageFor(lib, name);
        if (!found) return;
        const tree = found.language.parser.parse(text);
        lib.highlightCode(text, tree, highlightStyle, (text, lineClass) => span(lineClass, text), () => span('', '\n'));
      }
      if (token !== element._cvToken || element.textContent !== text) return;      // newer text arrived while this loaded
      element.textContent = '';
      element.append(fragment);
      element.classList.add('cv');
    } catch (error) {
      element.textContent = text;                                              // stay plain
    }
  }

  /** The best mode for the text of a file: a name from the list above */
  function modeForFormat(format) {
    return { json: 'json', xml: 'xml', yaml: 'yaml', yml: 'yaml', toml: 'toml', csv: 'text', tsv: 'text', ts: 'typescript' }[String(format).toLowerCase()] || (MODES[format] ? format : 'text');
  }

  return { create, colorize, modeForFormat, MODES, BIG_FOLD, sqlName };
})();
