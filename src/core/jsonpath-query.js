/**
 * JSONPath - find values by path.
 *
 *   await Structra.jsonpathQuery.query(data, '$.value[*].Requester.Email')
 *     → [{ path: '$.value[0].Requester.Email', value: 'ann@contoso.com' }, ...]
 *
 * The engine is json-p3 (MIT, src/libs/json-p3), which passes all 715 tests of the official JSONPath standard (RFC 9535).
 * This file is the thin layer around it that keeps what people of this app are used to:
 *   - the leading $ is optional:  'value[0].Title' works too
 *   - a dot before an index:      'value.0.Title' works too (it is tried as [0], and as the key "0" when that finds nothing)
 *   - a pattern test:             [?(@.Email =~ /^ann/i)]  (a real JavaScript pattern: \d, flags i m s; the standard's own
 *                                 match() and search() work as well)
 * and gives results the way the rest of the app reads them: a path like $.value[0]['odd key'].
 *
 * Where the standard and the old engine of this app differed, the standard wins:
 *   - [?(@.Email)] is true when the field exists, also when its value is null (it used to skip null; write @.Email != null for that)
 *   - == compares without converting: "5" and 5 are different (it used to treat them as equal)
 *
 *   await Structra.jsonpathQuery.queryStrict(data, expression)   the standard only, no conveniences (the compliance tool uses it)
 */
Structra.jsonpathQuery = (() => {
  const LOGICAL_TYPE = 1;
  const VALUE_TYPE = 3;

  /* ---------- results the way the app reads them ---------- */

  const childPath = (path, key) => Structra.dataPaths.child(path, key);
  const pathOf = (location) => location.reduce((path, key) => childPath(path, key), '$');

  /* ---------- the engine ---------- */

  let environment = null;

  async function load() {
    if (environment) return environment;
    const library = await Structra.libraryLoader.loadLibrary('jsonp3');
    // The library stops a descendant search (..) at 100 levels by default; real files go deeper. The engine's own stack gives out near 3,000.
    environment = new library.JSONPathEnvironment({ maxRecursionDepth: 100000 });
    // =~ in a filter is turned into regex(@.field, 'pattern', 'flags'): the standard's match() and search() only know a small
    // pattern language (no \d, no flags), and people write ordinary JavaScript patterns
    const compiled = new Map();
    // First pass of a query that uses =~: the function only notes each pattern and the texts it is asked about (and says "no match"),
    // so the patterns can be tried in the sandbox before they run for real on the page
    environment.collecting = null;
    environment.functions.regex = {
      argTypes: [VALUE_TYPE, VALUE_TYPE, VALUE_TYPE],
      returnType: LOGICAL_TYPE,
      call(value, pattern, flags) {
        if (typeof value !== 'string' || typeof pattern !== 'string') return false;
        if (environment.collecting) {
          const key = (typeof flags === 'string' ? flags : '') + '/' + pattern;
          const entry = environment.collecting.get(key) || { pattern, flags: typeof flags === 'string' ? flags : '', samples: [] };
          if (entry.samples.length < 400) entry.samples.push(value);
          environment.collecting.set(key, entry);
          return false;
        }
        const key = flags + '/' + pattern;
        let expression = compiled.get(key);
        if (expression === undefined) {
          // A pattern that can run for ever on some text must not freeze the page
          if (Structra.sharedHelpers.isRiskyRegex(pattern)) throw new Error(Structra.sharedHelpers.RISKY_REGEX_MESSAGE);
          try { expression = new RegExp(pattern, typeof flags === 'string' ? flags : ''); } catch { expression = null; }
          compiled.set(key, expression);
        }
        return expression ? expression.test(value) : false;
      },
    };
    return environment;
  }

  /* ---------- the conveniences, written as the standard's own syntax ---------- */

  /** @.field =~ /pattern/flags  →  regex(@.field, 'pattern', 'flags') */
  function rewritePatternTests(source) {
    return source.replace(/(@[^\s=!<>~&|()]*)\s*=~\s*\/((?:\\.|[^/\\])+)\/([a-z]*)/g, (whole, reference, pattern, flags) => {
      const quote = (text) => "'" + text.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
      return `regex(${reference}, ${quote(pattern)}, ${quote(flags)})`;
    });
  }

  /** .0 between names: tried as [0] first, as ['0'] when that finds nothing (a key can be a number) */
  function dotNumbers(source, form) {
    let out = '', depth = 0, quote = null, found = false;
    for (let i = 0; i < source.length; i++) {
      const character = source[i];
      if (quote) { out += character; if (character === '\\') { out += source[++i] || ''; } else if (character === quote) quote = null; continue; }
      if (character === '"' || character === "'") { quote = character; out += character; continue; }
      if (character === '[' || character === '(') depth++;
      else if (character === ']' || character === ')') depth--;
      else if (character === '.' && depth === 0 && source[i - 1] !== '.' && source[i + 1] !== '.') {
        const number = /^\d+(?![\w$])/.exec(source.slice(i + 1));
        if (number) { out += form(number[0]); i += number[0].length; found = true; continue; }
      }
      out += character;
    }
    return { text: out, found };
  }

  function prepare(expression) {
    let source = String(expression).trim();
    source = rewritePatternTests(source);
    if (!source.startsWith('$')) source = source.startsWith('[') ? '$' + source : (source.startsWith('.') ? '$' + source : '$.' + source);
    const asIndex = dotNumbers(source, (number) => `[${number}]`);
    const asKey = dotNumbers(source, (number) => `['${number}']`); // path-ok: rewrites a query the user typed, not a path we write
    return { changed: source !== String(expression), index: asIndex.text, key: asKey.found ? asKey.text : null };
  }

  /** The library's message, with where it went wrong when the text is the one the person wrote */
  function explain(error, expression, changed) {
    if (error instanceof RangeError) return new Error('This document is nested too deeply for this query');
    const span = error && error.span;
    const at = Array.isArray(span) ? span[0] : (span && typeof span === 'object' ? span.start : span);
    const where = !changed && Number.isInteger(at) ? ` (at character ${at + 1} of "${expression}")` : (changed ? ` (in "${expression}")` : '');
    return new Error(String((error && error.message) || error).replace(/\s+$/, '') + where);
  }

  const toMatches = (nodes) => nodes.map((node) => ({ path: pathOf(node.location), value: node.value }));

  /** Try every =~ pattern of the query on the longest real texts it will meet, in the sandbox, before running it on the page */
  async function probePatterns(engine, prepared, data) {
    engine.collecting = new Map();
    let entries;
    try {
      try { engine.find(prepared.index, data); } catch { /* the real run reports query errors */ }
      entries = [...engine.collecting.values()];
    } finally { engine.collecting = null; }
    for (const entry of entries) {
      try { await Structra.sandbox.probePattern(entry.pattern, entry.flags, Structra.sandbox.pickSamples(entry.samples)); }
      catch (error) {
        if (error.timedOut) throw new Error(Structra.sharedHelpers.RISKY_REGEX_MESSAGE);
        // Not a valid pattern, or no worker available: the real run below handles these as before
      }
    }
  }

  async function query(data, expression) {
    const engine = await load();
    const prepared = prepare(expression);
    if (prepared.changed && /\bregex\(/.test(prepared.index)) await probePatterns(engine, prepared, data);
    try {
      let found = toMatches(engine.find(prepared.index, data));
      if (!found.length && prepared.key) found = toMatches(engine.find(prepared.key, data));
      return found;
    } catch (error) {
      throw explain(error, String(expression).trim(), prepared.changed);
    }
  }

  async function queryStrict(data, expression) {
    const engine = await load();
    return toMatches(engine.find(expression, data));
  }

  // The engine is a small file: fetch it when the page is idle, so the first query does not wait for it
  if (Structra.sharedHelpers && Structra.sharedHelpers.runWhenIdle && typeof document !== 'undefined') Structra.sharedHelpers.runWhenIdle(() => { load().catch(() => { /* loaded again when a query needs it */ }); });

  return { query, queryStrict };
})();
