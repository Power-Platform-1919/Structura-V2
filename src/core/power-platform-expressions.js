/* ============================================================
   STRUCTRA V2 - Power Platform Expressions
   Structra.powerPlatformExpressions - ready-to-paste expressions for a data path.

   Every function returns plain data, never HTML:
     rows      → [{ label, code }]
     sections  → [{ title, rows }]

   API:
     Structra.powerPlatformExpressions.powerAutomate(path, value) → rows
     Structra.powerPlatformExpressions.powerFx(path, value)       → rows
     Structra.powerPlatformExpressions.helpers(data)              → sections
     Structra.powerPlatformExpressions.flowActions(path, value)   → [{ label, note, code }]  action JSON for a cloud flow
     Structra.powerPlatformExpressions.getSource() / setSource({...})
        where the JSON comes from, so expressions start at the right place:
        { kind: 'action' | 'trigger' | 'item' | 'custom', name, fxVar, fullOutput: 'auto' | true | false }
        Changing it emits 'expressions:source-changed'.

   Wiring (generated from the code below; update it when you add or remove an event):
     Emits: expressions:source-changed, expressions:columns-changed
   ============================================================ */

window.Structra = window.Structra || {};

Structra.powerPlatformExpressions = (() => {
  const row = (label, code) => ({ label, code });

  const kindOf = Structra.sharedHelpers.typeOf;

  const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
  const looksLikeDate = (s) => /\d{4}-\d{2}-\d{2}/.test(s) || /\d{2}\/\d{2}\/\d{4}/.test(s);
  const looksLikeUrl = (s) => /^https?:\/\//i.test(s);
  const looksLikeGuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(s);
  const firstObjectKeys = (arr) =>
    (arr.length && arr[0] && typeof arr[0] === 'object' && !Array.isArray(arr[0])) ? Object.keys(arr[0]) : null;

  /* ========================================================
     SOURCE: where the JSON came from in the flow or app
     ======================================================== */

  const SOURCE_KEY = 'structra.ppSource';
  const DEFAULT_SOURCE = { kind: 'action', name: 'Parse_JSON', fxVar: 'jsonText', fullOutput: 'auto', loopName: 'Apply_to_each' };

  function loadSource() {
    try { return { ...DEFAULT_SOURCE, ...JSON.parse(localStorage.getItem(SOURCE_KEY) || '{}') }; } catch { return { ...DEFAULT_SOURCE }; }
  }
  let source = loadSource();

  const getSource = () => ({ ...source });

  function setSource(patch) {
    source = { ...source, ...patch };
    try { localStorage.setItem(SOURCE_KEY, JSON.stringify(source)); } catch { /* not saved in a private window */ }
    if (Structra.events) Structra.events.emit('expressions:source-changed', getSource());
  }

  /** The expression a Power Automate path starts from */
  function rootExpression() {
    const name = (source.name || '').trim();
    switch (source.kind) {
      case 'trigger': return 'triggerBody()';
      case 'item': return `items('${name || 'Apply_to_each'}')`;
      case 'custom': return name || "body('Parse_JSON')";
      default: return `body('${name || 'Parse_JSON'}')`;
    }
  }

  /** A whole action output ({ statusCode, headers, body }) already starts at body, so skip that key */
  function dropsBody(data) {
    if (source.fullOutput === true) return true;
    if (source.fullOutput === false) return false;
    return !!data && typeof data === 'object' && !Array.isArray(data)
      && !!data.body && typeof data.body === 'object' && ('statusCode' in data || 'headers' in data);
  }

  const pa = (path) => Structra.dataPaths.powerAutomate(path, { root: rootExpression(), dropBody: dropsBody(Structra.state && Structra.state.jsonData) });
  const fx = (path) => Structra.dataPaths.powerFx(path, { variable: source.fxVar || 'jsonText' });

  /* ========================================================
     POWER AUTOMATE
     ======================================================== */

  function powerAutomate(path, value) {
    const p = pa(path);
    const rows = [row('Access value', p)];
    const add = (label, code) => rows.push(row(label, code));
    // Inside a list item the position does not matter: it is "the current item" of the loop
    const inLoop = Structra.dataPaths.powerAutomateInLoop(path, source.loopName);
    if (inLoop) {
      rows.unshift(row(`Inside Apply to each over ${listName(inLoop.listPath)}`, inLoop.expr));
      rows.splice(1, 0, row('Inside Select, Filter array or Condition', Structra.dataPaths.powerAutomateInItem(path).expr));
    }

    switch (kindOf(value)) {
      case 'array': {
        add('Count (length)', `length(${p})`);
        add('First item', `first(${p})`);
        add('Last item', `last(${p})`);
        add('Get item [0]', `${p}?[0]`);
        add('Is empty?', `empty(${p})`);
        add('Is not empty?', `greater(length(${p}), 0)`);
        add('Apply to each (input)', p);
        add('Current item', `items('Apply_to_each')`);
        add('Take first 5', `take(${p}, 5)`);
        add('Skip first 5', `skip(${p}, 5)`);
        add('Reverse', `reverse(${p})`);
        add('Chunk (groups of 10)', `chunk(${p}, 10)`);
        add('Union with another', `union(${p}, variables('otherArray'))`);
        add('Intersection', `intersection(${p}, variables('otherArray'))`);
        add('To JSON string', `string(${p})`);
        add('Create array', `createArray(${p}?[0], ${p}?[1])`);

        const keys = firstObjectKeys(value);
        if (keys) {
          const k = keys[0];
          if (k) {
            add(`[0].${k}`, `${p}?[0]?['${k}']`);
            add(`Current .${k}`, `items('Apply_to_each')?['${k}']`);
            add('Sort ascending', `sort(${p}, '${k}')`);
            add('Sort descending', `reverse(sort(${p}, '${k}'))`);
            add('Filter array: From', p);
            add('Filter array: Where', `not(equals(item()?['${k}'], null))`);
            add('Select: From', p);
            add('Select: Map', `item()?['${k}']`);
          }
          if (keys[1]) {
            add(`[0].${keys[1]}`, `${p}?[0]?['${keys[1]}']`);
            add(`Current .${keys[1]}`, `items('Apply_to_each')?['${keys[1]}']`);
          }
        } else if (value.length && typeof value[0] === 'string') {
          add('Contains value', `contains(${p}, 'searchValue')`);
          add('Join with comma', `join(${p}, ',')`);
          add('Join with newline', `join(${p}, decodeUriComponent('%0A'))`);
          add('Join with semicolon', `join(${p}, ';')`);
          add('Sort alphabetically', `sort(${p})`);
        } else if (value.length && typeof value[0] === 'number') {
          add('Min value', `min(${p})`);
          add('Max value', `max(${p})`);
          add('Sort numerically', `sort(${p})`);
        }
        break;
      }

      case 'object': {
        const keys = Object.keys(value);
        const k0 = keys[0] || 'key';
        add('To JSON string', `string(${p})`);
        add('Add property', `addProperty(${p}, 'newKey', 'newValue')`);
        add('Remove property', `removeProperty(${p}, '${k0}')`);
        add('Set property', `setProperty(${p}, '${k0}', 'newValue')`);
        for (const k of keys.slice(0, 10)) {
          const v = value[k];
          const at = `${p}?['${k}']`;
          if (Array.isArray(v)) {
            add(`${k} (length)`, `length(${at})`);
            add(`${k}[0]`, `${at}?[0]`);
            add(`${k} first`, `first(${at})`);
          } else if (v === null) {
            add(`${k} (null)`, at);
            add(`${k} coalesce`, `coalesce(${at}, 'default')`);
          } else if (typeof v === 'object') {
            add(`${k} (object)`, at);
          } else if (typeof v === 'number') {
            add(Number.isInteger(v) ? `${k} (int)` : `${k} (float)`, `${Number.isInteger(v) ? 'int' : 'float'}(${at})`);
          } else if (typeof v === 'boolean') {
            add(`${k} (bool)`, at);
            add(`${k} is true`, `equals(${at}, true)`);
          } else {
            add(k, at);
          }
        }
        break;
      }

      case 'string': {
        add('To upper', `toUpper(${p})`);
        add('To lower', `toLower(${p})`);
        add('Length', `length(${p})`);
        add('Trim', `trim(${p})`);
        add('Contains', `contains(${p}, 'searchText')`);
        add('Starts with', `startsWith(${p}, 'prefix')`);
        add('Ends with', `endsWith(${p}, 'suffix')`);
        add('Replace', `replace(${p}, 'oldText', 'newText')`);
        add('Split', `split(${p}, ',')`);
        add('Substring', `substring(${p}, 0, 10)`);
        add('Slice', `slice(${p}, 0, 10)`);
        add('Index of', `indexOf(${p}, 'search')`);
        add('Last index of', `lastIndexOf(${p}, 'search')`);
        add('Nth index of', `nthIndexOf(${p}, 'search', 2)`);
        add('Chunk (every N chars)', `chunk(${p}, 50)`);
        add('Default when empty', `if(empty(${p}), 'default', ${p})`);
        add('Null coalesce', `coalesce(${p}, 'fallback')`);
        add('Concat', `concat(${p}, ' ', 'suffix')`);
        add('Base64 encode', `base64(${p})`);
        add('Base64 decode', `base64ToString(${p})`);
        add('URI encode', `encodeUriComponent(${p})`);
        add('URI decode', `decodeUriComponent(${p})`);
        add('Parse as JSON', `json(${p})`);
        add('Data URI', `dataUri(${p})`);
        if (looksLikeDate(value)) {
          add('Format date', `formatDateTime(${p}, 'dd/MM/yyyy')`);
          add('Format datetime', `formatDateTime(${p}, 'yyyy-MM-ddTHH:mm:ss')`);
          add('Add 1 day', `addDays(${p}, 1)`);
          add('Add 1 hour', `addHours(${p}, 1)`);
          add('Convert time zone', `convertTimeZone(${p}, 'UTC', 'AUS Eastern Standard Time')`);
          add('Ticks', `ticks(${p})`);
          add('Day of week', `dayOfWeek(${p})`);
          add('Start of day', `startOfDay(${p})`);
          add('Start of month', `startOfMonth(${p})`);
        }
        if (looksLikeUrl(value)) {
          add('URI host', `uriHost(${p})`);
          add('URI path', `uriPath(${p})`);
          add('URI query', `uriQuery(${p})`);
          add('URI port', `uriPort(${p})`);
          add('URI scheme', `uriScheme(${p})`);
        }
        if (looksLikeGuid(value)) add('As GUID', `guid(${p})`);
        break;
      }

      case 'number': {
        add('As integer', `int(${p})`);
        add('As float', `float(${p})`);
        add('As decimal', `decimal(string(${p}))`);
        add('To string', `string(${p})`);
        add('Add 1', `add(${p}, 1)`);
        add('Subtract 1', `sub(${p}, 1)`);
        add('Multiply by 2', `mul(${p}, 2)`);
        add('Divide by 2', `div(${p}, 2)`);
        add('Modulo 2', `mod(${p}, 2)`);
        add('Greater than 0', `greater(${p}, 0)`);
        add('Greater or equal 0', `greaterOrEquals(${p}, 0)`);
        add('Less than 100', `less(${p}, 100)`);
        add('Less or equal 100', `lessOrEquals(${p}, 100)`);
        add('Equals 0', `equals(${p}, 0)`);
        add('Format number', `formatNumber(${p}, 'N2')`);
        add('Format currency', `formatNumber(${p}, 'C2')`);
        add('Format percent', `formatNumber(div(${p}, 100), 'P2')`);
        add('Random 1 to N', `rand(1, add(${p}, 1))`);
        add('Range from 0', `range(0, ${p})`);
        add('Is integer?', `isInt(string(${p}))`);
        add('Is float?', `isFloat(string(${p}))`);
        add('As bool (0 = false)', `bool(${p})`);
        break;
      }

      case 'boolean': {
        add('Negate', `not(${p})`);
        add('Is true?', `equals(${p}, true)`);
        add('Is false?', `equals(${p}, false)`);
        add('If / else', `if(equals(${p}, true), 'Yes', 'No')`);
        add('AND', `and(${p}, equals(1, 1))`);
        add('OR', `or(${p}, equals(1, 1))`);
        add('To string', `string(${p})`);
        add('To int (1 / 0)', `if(equals(${p}, true), 1, 0)`);
        break;
      }

      case 'null': {
        add('Is null?', `equals(${p}, null)`);
        add('Is not null?', `not(equals(${p}, null))`);
        add('Coalesce to string', `coalesce(${p}, 'fallback')`);
        add('Coalesce to number', `coalesce(${p}, 0)`);
        add('If null', `if(equals(${p}, null), 'N/A', ${p})`);
        add('Empty check', `empty(${p})`);
        break;
      }
    }
    return rows;
  }

  /* ========================================================
     POWER FX (Canvas apps)
     ======================================================== */

  /* ---- Power Fx: pick the right conversion for each column from the values it really holds ---- */

  const SIMPLE_FX_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
  const fxName = (k) => (SIMPLE_FX_NAME.test(k) ? k : `'${k.replace(/'/g, "''")}'`);
  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
  const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

  /* ---- The columns a list of records can be built from (Select, typed tables) ---- */

  /** Keys that carry plumbing, not business data: off by default, but still pickable */
  const isNoise = (key) => key.startsWith('@') || key === 'ItemInternalId' || key === 'odata.etag';

  /** How a Power Fx column is converted, from the values it really holds */
  function fxConversion(values, ref) {
    const seen = new Set();
    let dates = true;
    let datetimes = true;
    let strings = 0;
    for (const v of values) {
      if (v === null || v === undefined) continue;
      seen.add(kindOf(v));
      if (typeof v === 'string') {
        strings++;
        if (!ISO_DATE.test(v)) dates = false;
        if (!ISO_DATETIME.test(v)) datetimes = false;
      }
    }
    if (seen.size !== 1) return { kind: seen.size ? 'mixed' : 'text', value: `Text(${ref})`, literal: '"value"' };
    const t = [...seen][0];
    if (t === 'number') return { kind: 'number', value: `Value(${ref})`, literal: '0' };
    if (t === 'boolean') return { kind: 'boolean', value: `Boolean(${ref})`, literal: 'true' };
    if (t === 'string' && strings && datetimes) return { kind: 'datetime', value: `DateTimeValue(${ref})`, literal: 'Now()' };
    if (t === 'string' && strings && dates) return { kind: 'date', value: `DateValue(${ref})`, literal: 'Today()' };
    return { kind: 'text', value: `Text(${ref})`, literal: '"value"' };
  }

  const peek = (rows, parts) => rows.slice(0, 50).map((r) => {
    let v = r;
    for (const p of parts) { if (v === null || typeof v !== 'object') return undefined; v = v[p]; }
    return v;
  });

  /**
   * Every column a list of records offers: the plain fields, and for fields that hold an object
   * (SharePoint Choice and Person, lookups) their plain children as Parent.Child.
   * Each column knows how to read itself in Power Automate (steps) and Power Fx (value).
   */
  function listColumns(rows) {
    const cols = [];
    const first = rows.slice(0, 50).filter((r) => r && typeof r === 'object' && !Array.isArray(r));
    const keys = [];
    first.forEach((r) => Object.keys(r).forEach((k) => { if (!keys.includes(k)) keys.push(k); }));
    for (const key of keys) {
      const values = peek(first, [key]);
      const kinds = new Set(values.filter((v) => v !== null && v !== undefined).map(kindOf));
      if (kinds.has('object') && kinds.size === 1) {
        const children = [];
        values.forEach((o) => { if (o && typeof o === 'object') Object.keys(o).forEach((c) => { if (!children.includes(c)) children.push(c); }); });
        let n = 0;
        for (const child of children) {
          if (child.startsWith('@')) continue;
          const cv = peek(first, [key, child]);
          if (cv.some((v) => v !== null && v !== undefined && typeof v === 'object')) continue;   // deeper objects and lists stay out
          if (n++ >= 6) break;
          cols.push({ id: `${key}.${child}`, parts: [key, child], name: `${key}_${child}`, noise: false, ...fxConversion(cv, `ThisRecord.${fxName(key)}.${fxName(child)}`) });
        }
      } else if (!kinds.has('object') && !kinds.has('array')) {
        cols.push({ id: key, parts: [key], name: key, noise: isNoise(key), ...fxConversion(values, `ThisRecord.${fxName(key)}`) });
      }
    }
    return cols;
  }

  /* Which columns the person switched off, per list. Kept for the session only. */
  const columnOff = new Map();

  /** listColumns plus the person's choice: each column carries on: true or false */
  /** A list at the top of the document is called the whole list, not $ */
  function listName(p) { return !p || p === '$' || p === '(root)' ? 'the whole list' : p; }

  function pickedColumns(listPath, rows) {
    const off = columnOff.get(listPath);
    return listColumns(rows).map((c) => ({ ...c, on: off ? !off.has(c.id) : !c.noise }));
  }

  function setColumn(listPath, rows, id, on) {
    let off = columnOff.get(listPath);
    if (!off) {
      // first change: start from the defaults (noise off) so the one change does not flip the rest
      off = new Set(listColumns(rows).filter((c) => c.noise).map((c) => c.id));
      columnOff.set(listPath, off);
    }
    if (on) off.delete(id); else off.add(id);
    if (Structra.events) Structra.events.emit('expressions:columns-changed', listPath);
  }

  function powerFx(path, value) {
    const p = fx(path);
    const table = `ForAll(${p}, ThisRecord)`;
    const rows = [row('Access (ParseJSON)', p)];
    const add = (label, code) => rows.push(row(label, code));
    // Inside a list item, the item is "the current record": no position in the list is needed
    const rec = Structra.dataPaths.powerFxInRecord(path, 'ThisRecord');
    if (rec) {
      rows.push(row(`Inside ForAll, Filter or Sum over ${listName(rec.listPath)}`, rec.expr));
      rows.push(row(`In a gallery or data table over ${listName(rec.listPath)}`, Structra.dataPaths.powerFxInRecord(path, 'ThisItem').expr));
    }

    switch (kindOf(value)) {
      case 'array': {
        add('As table', table);
        add('Count', `CountRows(${table})`);
        add('First item', `Index(${p}, 1)`);
        add('Last item', `Last(${table})`);
        add('FirstN (5)', `FirstN(${table}, 5)`);
        add('LastN (5)', `LastN(${table}, 5)`);
        add('IsEmpty', `IsEmpty(${table})`);
        add('Shuffle', `Shuffle(${table})`);
        add('Gallery.Items', table);
        add('ClearCollect', `ClearCollect(colData, ${table})`);
        add('JSON export', `JSON(${table})`);

        const keys = firstObjectKeys(value);
        if (keys) {
          // Chosen columns, each converted by what it holds: numbers with Value, flags with Boolean, ISO dates with DateValue
          const cols = pickedColumns(Structra.dataPaths.strip(path), value).filter((c) => c.on);
          const colExpr = (c) => `${fxName(c.name)}: ${c.value}`;
          const typedAll = cols.length ? `ForAll(${p}, {${cols.slice(0, 40).map(colExpr).join(', ')}})` : null;
          if (typedAll) {
            add('Typed table (chosen columns)', typedAll);
            add('Collect typed table', `ClearCollect(colData, ${typedAll})`);
          }
          const first = cols[0];
          if (first) {
            const col = fxName(first.name);
            const typed = `ForAll(${p}, {${colExpr(first)}})`;
            add(`[1] ${first.id}`, first.value.replace('ThisRecord', `Index(${p}, 1)`));
            add('Gallery column', first.kind === 'text' ? `ThisItem.${first.parts.map(fxName).join('.')}` : `Text(ThisItem.${first.parts.map(fxName).join('.')})`);
            add('Filter (not blank)', `Filter(${typed}, !IsBlank(${col}))`);
            add('Filter (equals)', `Filter(${typed}, ${col} = ${first.literal})`);
            add('Sort ascending', `SortByColumns(${typed}, "${first.name}", SortOrder.Ascending)`);
            add('Sort descending', `SortByColumns(${typed}, "${first.name}", SortOrder.Descending)`);
            add('LookUp', `LookUp(${typed}, ${col} = ${first.literal})`);
            add('CountIf', `CountIf(${typed}, !IsBlank(${col}))`);
            add('Distinct', `Distinct(${typed}, ${col})`);
            if (first.kind === 'text') add('Search', `Search(${typed}, txtSearch.Text, "${first.name}")`);
            add('AddColumns', `AddColumns(${typed}, "Extra", "value")`);
          }
          if (cols.length >= 2) {
            add('GroupBy', `GroupBy(ForAll(${p}, {${colExpr(cols[0])}, ${colExpr(cols[1])}}), "${cols[0].name}", "Items")`);
          }
        } else if (value.length && typeof value[0] === 'string') {
          const vals = `ForAll(${p}, {Value: Text(ThisRecord)})`;
          add('First (text)', `Text(Index(${p}, 1))`);
          add('Concat all', `Concat(${vals}, Value, ", ")`);
          add('Concat with newline', `Concat(${vals}, Value, Char(10))`);
          add('Gallery display', 'Text(ThisItem.Value)');
          add('Filter contains', `Filter(${vals}, txtSearch.Text in Value)`);
          add('Distinct values', `Distinct(${vals}, Value)`);
        } else if (value.length && typeof value[0] === 'number') {
          const nums = `ForAll(${p}, {Value: Value(ThisRecord)})`;
          add('First (number)', `Value(Index(${p}, 1))`);
          add('Sum', `Sum(${nums}, Value)`);
          add('Average', `Average(${nums}, Value)`);
          add('Max', `Max(${nums}, Value)`);
          add('Min', `Min(${nums}, Value)`);
          add('StdevP', `StdevP(${nums}, Value)`);
          add('VarP', `VarP(${nums}, Value)`);
        }
        break;
      }

      case 'object': {
        const keys = Object.keys(value);
        const name = cap(Structra.dataPaths.lastKey(path));
        add('Store in variable', `Set(var${name}, ${p})`);
        add('UpdateContext', `UpdateContext({loc${name}: ${p}})`);
        add('To JSON string', `JSON(${p})`);
        add('ColumnNames', `ColumnNames(${p})`);
        add('With (scope)', `With({rec: ${p}}, Text(rec.${keys[0] || 'key'}))`);
        for (const k of keys.slice(0, 10)) {
          const v = value[k];
          const at = `${p}.${k}`;
          if (Array.isArray(v)) {
            add(`${k} (table)`, `ForAll(${at}, ThisRecord)`);
            add(`${k} count`, `CountRows(ForAll(${at}, ThisRecord))`);
            add(`${k} first`, `Index(${at}, 1)`);
          } else if (v === null) {
            add(`${k} (null safe)`, `If(IsBlank(${at}), "N/A", Text(${at}))`);
          } else if (typeof v === 'object') {
            add(`${k} (record)`, at);
          } else if (typeof v === 'string') {
            add(`${k} (text)`, `Text(${at})`);
          } else if (typeof v === 'number') {
            add(`${k} (number)`, `Value(${at})`);
          } else if (typeof v === 'boolean') {
            add(`${k} (boolean)`, `Boolean(${at})`);
          } else {
            add(k, `Text(${at})`);
          }
        }
        break;
      }

      case 'string': {
        const t = `Text(${p})`;
        add('As text', t);
        add('Upper', `Upper(${t})`);
        add('Lower', `Lower(${t})`);
        add('Proper', `Proper(${t})`);
        add('Length', `Len(${t})`);
        add('Trim', `Trim(${t})`);
        add('TrimEnds', `TrimEnds(${t})`);
        add('Left 10 chars', `Left(${t}, 10)`);
        add('Right 10 chars', `Right(${t}, 10)`);
        add('Mid (5, 10)', `Mid(${t}, 5, 10)`);
        add('Find position', `Find("search", ${t})`);
        add('Contains', `"searchText" in ${t}`);
        add('StartsWith', `StartsWith(${t}, "prefix")`);
        add('EndsWith', `EndsWith(${t}, "suffix")`);
        add('IsBlank', `IsBlank(${t})`);
        add('If blank', `If(IsBlank(${t}), "default", ${t})`);
        add('Coalesce', `Coalesce(${t}, "fallback")`);
        add('Substitute', `Substitute(${t}, "old", "new")`);
        add('Replace (position)', `Replace(${t}, 1, 3, "new")`);
        add('Split to table', `Split(${t}, ",")`);
        add('IsMatch (email)', `IsMatch(${t}, Match.Email)`);
        add('Match (regex)', `Match(${t}, "\\d+")`);
        add('MatchAll', `MatchAll(${t}, "\\d+")`);
        add('IsNumeric', `IsNumeric(${t})`);
        add('Newline to space', `Substitute(${t}, Char(10), " ")`);
        add('EncodeUrl', `EncodeUrl(${t})`);
        add('PlainText (HTML)', `PlainText(${t})`);
        add('HashTags', `HashTags(${t})`);
        add('Copy to clipboard', `Copy(${t})`);
        add('Label.Text', t);
        if (looksLikeDate(value)) {
          const d = `DateTimeValue(${t})`;
          add('DateTimeValue', d);
          add('DateValue', `DateValue(${t})`);
          add('Format date', `Text(${d}, "dd/mm/yyyy")`);
          add('DateAdd +1 day', `DateAdd(${d}, 1, TimeUnit.Days)`);
          add('DateDiff (days to now)', `DateDiff(${d}, Now(), TimeUnit.Days)`);
          add('Year', `Year(${d})`);
          add('Month', `Month(${d})`);
          add('Day', `Day(${d})`);
          add('IsToday', `IsToday(${d})`);
        }
        if (looksLikeUrl(value)) {
          add('Launch URL', `Launch(${t})`);
          add('Download', `Download(${t})`);
        }
        if (looksLikeGuid(value)) add('As GUID', `GUID(${t})`);
        break;
      }

      case 'number': {
        const n = `Value(${p})`;
        add('As number', n);
        add('As text', `Text(${n})`);
        add('Formatted #,##0.00', `Text(${n}, "#,##0.00")`);
        add('Currency', `Text(${n}, "$#,##0.00")`);
        add('Percent', `Text(${n} / 100, "0.00%")`);
        add('Round', `Round(${n}, 2)`);
        add('RoundUp', `RoundUp(${n}, 0)`);
        add('RoundDown', `RoundDown(${n}, 0)`);
        add('Trunc', `Trunc(${n})`);
        add('Int', `Int(${n})`);
        add('Abs', `Abs(${n})`);
        add('Sign', `Sign(${n})`);
        add('Sqrt', `Sqrt(${n})`);
        add('Power ^2', `Power(${n}, 2)`);
        add('Mod 2', `Mod(${n}, 2)`);
        add('Ln (natural log)', `Ln(${n})`);
        add('Log (base 10)', `Log(${n}, 10)`);
        add('Exp', `Exp(${n})`);
        add('Greater than 0', `${n} > 0`);
        add('Less or equal 100', `${n} <= 100`);
        add('Equals 0', `${n} = 0`);
        add('Between 0 and 100', `And(${n} >= 0, ${n} <= 100)`);
        add('Random 0 to N', `RandBetween(0, ${n})`);
        add('Sequence', `Sequence(${n})`);
        add('Label.Text', `Text(${n}, "#,##0")`);
        break;
      }

      case 'boolean': {
        const b = `Boolean(${p})`;
        add('As boolean', b);
        add('Negate', `!${b}`);
        add('If true / false', `If(${b}, "Yes", "No")`);
        add('AND', `And(${b}, true)`);
        add('OR', `Or(${b}, false)`);
        add('To number (1 / 0)', `If(${b}, 1, 0)`);
        add('Visible property', b);
        add('Toggle.Value', b);
        add('Switch pattern', `Switch(${b}, true, "Active", false, "Inactive")`);
        break;
      }

      case 'null': {
        add('IsBlank', `IsBlank(${p})`);
        add('Coalesce text', `Coalesce(Text(${p}), "N/A")`);
        add('Coalesce number', `Coalesce(Value(${p}), 0)`);
        add('If blank', `If(IsBlank(${p}), "fallback", Text(${p}))`);
        add('IfError', `IfError(Text(${p}), "error fallback")`);
        break;
      }
    }
    return rows;
  }

  /* ========================================================
     HELPERS - whole-document patterns
     ======================================================== */

  /**
   * The first two helper sections use the names that are really in the document, so a copied expression
   * returns something. They also follow the Source settings (action name, trigger, loop) like the other tabs.
   */
  function patternSections(data) {
    const isObj = data && typeof data === 'object' && !Array.isArray(data);
    const keys = isObj ? Object.keys(data).filter((k) => !k.startsWith('@')) : [];
    const keyPath = (k) => (/^[A-Za-z_$][\w$]*$/.test(k) ? `$.${k}` : `$['${k.replace(/'/g, "\\'")}']`);
    const scalarKey = keys.find((k) => data[k] === null || typeof data[k] !== 'object');
    const stringKey = keys.find((k) => typeof data[k] === 'string');
    const arrayKey = keys.find((k) => Array.isArray(data[k]));
    const v = source.fxVar || 'jsonText';

    const compose = [row('Compose (full output)', pa('$'))];
    if (stringKey) compose.push(row(`Initialize string variable (${stringKey})`, pa(keyPath(stringKey))));
    if (arrayKey) compose.push(row(`Initialize array variable (${arrayKey})`, pa(keyPath(arrayKey))));
    compose.push(row('JSON string', `string(${pa('$')})`));
    compose.push(row('Outputs reference', `outputs('Compose')`));

    const patterns = [];
    if (scalarKey) patterns.push(row(`PA: condition (${scalarKey} is null)`, `equals(${pa(keyPath(scalarKey))}, null)`));
    if (arrayKey) patterns.push(row(`PA: condition (${arrayKey} has items)`, `greater(length(${pa(keyPath(arrayKey))}), 0)`));
    if (stringKey) {
      patterns.push(row(`PA: empty string check (${stringKey})`, `empty(${pa(keyPath(stringKey))})`));
      patterns.push(row(`PA: ternary on ${stringKey}`, `if(equals(${pa(keyPath(stringKey))}, '${String(data[stringKey]).replace(/'/g, "''").slice(0, 30)}'), 'Yes', 'No')`));
    }
    patterns.push(
      row('Fx: set from JSON', `Set(varData, ParseJSON(${v}))`),
      row('Fx: ClearCollect', `ClearCollect(colData, ForAll(ParseJSON(${v}), ThisRecord))`),
      row('Fx: notify when empty', `If(IsEmpty(ForAll(ParseJSON(${v}), ThisRecord)), Notify("No data found", NotificationType.Warning))`),
      row('Fx: navigate with context', 'Navigate(scrDetail, ScreenTransition.None, {selectedItem: ThisItem})'),
    );
    return [{ title: 'Compose and variables', rows: compose }, { title: 'Common patterns', rows: patterns }];
  }

  // Recipes that start from the whole document: built when asked, so they follow the Source settings
  const staticSections = () => {
    const PP = pa('$');
    return [
    null,
    null,
    {
      title: 'Date and time',
      rows: [
        row('PA: current UTC', 'utcNow()'),
        row('PA: format date', `formatDateTime(utcNow(), 'yyyy-MM-dd')`),
        row('PA: format time', `formatDateTime(utcNow(), 'HH:mm:ss')`),
        row('PA: format full', `formatDateTime(utcNow(), 'yyyy-MM-ddTHH:mm:ssZ')`),
        row('PA: add days', 'addDays(utcNow(), 7)'),
        row('PA: add hours', 'addHours(utcNow(), 2)'),
        row('PA: add minutes', 'addMinutes(utcNow(), 30)'),
        row('PA: convert time zone', `convertTimeZone(utcNow(), 'UTC', 'Eastern Standard Time')`),
        row('PA: start of day', 'startOfDay(utcNow())'),
        row('PA: start of month', 'startOfMonth(utcNow())'),
        row('PA: day of week', 'dayOfWeek(utcNow())'),
        row('PA: ticks (compare)', 'ticks(utcNow())'),
        row('Fx: Now', 'Now()'),
        row('Fx: Today', 'Today()'),
        row('Fx: format date', 'Text(Now(), "yyyy-mm-dd hh:mm:ss")'),
        row('Fx: DateAdd days', 'DateAdd(Now(), 7, TimeUnit.Days)'),
        row('Fx: DateDiff', 'DateDiff(Today(), DateValue("2025-12-31"), TimeUnit.Days)'),
        row('Fx: IsToday', 'IsToday(DateTimeValue("2025-01-01"))'),
        row('Fx: month names', 'Calendar.MonthsLong()'),
      ],
    },
    {
      title: 'Workflow and trigger (Power Automate)',
      rows: [
        row('Trigger body', 'triggerBody()'),
        row('Trigger outputs', 'triggerOutputs()'),
        row('Trigger headers', `triggerOutputs()['headers']`),
        row('Action output', `outputs('Action_Name')`),
        row('Action body', `body('Action_Name')`),
        row('Scope action status', `result('Scope_Name')?[0]?['status']`),
        row('Variable', `variables('varName')`),
        row('Workflow run ID', 'workflow().run.name'),
        row('Workflow name', 'workflow().tags.flowDisplayName'),
        row('Parameter', `parameters('paramName')`),
        row('Optional trigger key', `coalesce(triggerBody()?['optionalKey'], 'default')`),
        row('Scope error message', `result('Scope_Name')?[0]?['error']?['message']`),
      ],
    },
    {
      title: 'Data manipulation (Power Automate)',
      rows: [
        row('To JSON string', `string(${PP})`),
        row('Parse JSON string', `json(variables('jsonString'))`),
        row('Create object', `json(concat('{"key":"', variables('val'), '"}'))`),
        row('Set property', `setProperty(${PP}, 'newKey', 'newValue')`),
        row('Add property', `addProperty(${PP}, 'extraKey', 'extraValue')`),
        row('Remove property', `removeProperty(${PP}, 'unwantedKey')`),
        row('Chain set property', `setProperty(setProperty(${PP}, 'a', 1), 'b', 2)`),
        row('Union arrays', `union(${PP}?['arr1'], ${PP}?['arr2'])`),
        row('Intersection', `intersection(${PP}?['arr1'], ${PP}?['arr2'])`),
        row('XML from JSON', `xml(json(concat('{"root":', string(${PP}), '}')))`),
        row('Base64 encode', `base64(string(${PP}))`),
        row('Base64 decode', `base64ToString(${PP}?['encoded'])`),
      ],
    },
    ];
  };

  /* ========================================================
     FLOW ACTIONS: action JSON to paste into a cloud flow
     (Peek code / code view, under "actions"). Expressions start with @.
     ======================================================== */

  const j = (obj) => JSON.stringify(obj, null, 2);
  const fa = (label, note, name, action) => ({ label, note, code: j({ [name]: { ...action, runAfter: {} } }) });

  /** "Has a value": empty() only accepts text, lists and objects, so numbers and flags are checked against null */
  function hasValue(expr, sample) {
    return ['string', 'array', 'object'].includes(kindOf(sample)) ? `not(empty(${expr}))` : `not(equals(${expr}, null))`;
  }

  function flowActions(path, value) {
    const p = pa(path);
    const at = (expr) => '@' + expr;
    const out = [];

    switch (kindOf(value)) {
      case 'array': {
        const keys = firstObjectKeys(value);
        const k = keys && keys[0];
        out.push(fa('Compose: number of items', 'Shows how many items the list holds.', 'Count_items',
          { type: 'Compose', inputs: at(`length(${p})`) }));
        if (keys && k) {
          const map = {};
          pickedColumns(Structra.dataPaths.strip(path), value).filter((c) => c.on).slice(0, 40).forEach((c) => {
            map[c.name] = at(`item()${c.parts.map((x) => `?['${x.replace(/'/g, "''")}']`).join('')}`);
          });
          out.push(fa('Select: keep the chosen columns', 'Builds a smaller list with only the columns you chose.', 'Select',
            { type: 'Select', inputs: { from: at(p), select: map } }));
          out.push(fa('Filter array: drop rows where a column is empty', `Keeps items where "${k}" has a value.`, 'Filter_array',
            { type: 'Query', inputs: { from: at(p), where: at(hasValue(`item()?['${k}']`, value.find((r) => r && r[k] != null) ? value.find((r) => r && r[k] != null)[k] : null)) } }));
          out.push(fa('Apply to each: work with one item at a time', 'Runs the inner actions once per item.', 'Apply_to_each',
            { type: 'Foreach', foreach: at(p), actions: {
              Compose_current: { type: 'Compose', inputs: at(`items('Apply_to_each')?['${k}']`), runAfter: {} } } }));
        } else {
          out.push(fa('Apply to each: work with one item at a time', 'Runs the inner actions once per item.', 'Apply_to_each',
            { type: 'Foreach', foreach: at(p), actions: {
              Compose_current: { type: 'Compose', inputs: at("items('Apply_to_each')"), runAfter: {} } } }));
        }
        out.push(fa('Condition: only continue when the list has items', 'Add actions under "actions" for the yes path.', 'Condition',
          { type: 'If', expression: { and: [{ greater: [at(`length(${p})`), 0] }] }, actions: {}, else: { actions: {} } }));
        break;
      }
      case 'object': {
        const k = Object.keys(value)[0];
        out.push(fa('Compose: this object', 'Keeps the object for later steps.', 'Compose', { type: 'Compose', inputs: at(p) }));
        if (k) {
          out.push(fa(`Condition: "${k}" has a value`, 'Add actions under "actions" for the yes path.', 'Condition',
            { type: 'If', expression: { and: [{ equals: [at(hasValue(`${p}?['${k}']`, value[k])), true] }] }, actions: {}, else: { actions: {} } }));
        }
        break;
      }
      default: {
        out.push(fa('Compose: this value', 'Keeps the value for later steps.', 'Compose', { type: 'Compose', inputs: at(p) }));
        out.push(fa('Condition: value is not empty', 'Add actions under "actions" for the yes path.', 'Condition',
          { type: 'If', expression: { and: [{ equals: [at(hasValue(p, value)), true] }] }, actions: {}, else: { actions: {} } }));
        // A field of a list item is used per item: through Apply to each, or by testing every item at once
        const inLoop = Structra.dataPaths.powerAutomateInLoop(path, source.loopName);
        const inItem = Structra.dataPaths.powerAutomateInItem(path);
        if (inLoop && inItem) {
          const list = pa(inLoop.listPath);
          out.push(fa(`Apply to each: read this field of every item`, `Goes through every item of ${inLoop.listPath}.`, 'Apply_to_each',
            { type: 'Foreach', foreach: at(list), actions: { Compose_field: { type: 'Compose', inputs: at(inLoop.expr), runAfter: {} } } }));
          out.push(fa(`Filter array: keep items where this field has a value`, `Keeps the items of ${inLoop.listPath} where the field is filled in.`, 'Filter_array',
            { type: 'Query', inputs: { from: at(list), where: at(hasValue(inItem.expr, value)) } }));
        }
        const varType = { string: 'string', number: Number.isInteger(value) ? 'integer' : 'float', boolean: 'boolean' }[kindOf(value)];
        if (varType) {
          const name = (Structra.dataPaths.lastKey(path) || 'value').replace(/[^A-Za-z0-9_]/g, '_');
          out.push(fa('Initialize variable: keep this value in a variable', 'Create it at the top level of the flow, not inside a loop.', 'Initialize_variable',
            { type: 'InitializeVariable', inputs: { variables: [{ name, type: varType, value: at(p) }] } }));
        }
      }
    }
    return out;
  }

  /**
   * The few expressions a maker wants right after clicking a value, for the Node panel:
   * [{ app: 'Power Automate' | 'Power Fx', label, code }]
   */
  function quick(path, value) {
    const out = [];
    const loop = Structra.dataPaths.powerAutomateInLoop(path, source.loopName);
    if (loop) {
      out.push({ app: 'Power Automate', label: `In Apply to each over ${listName(loop.listPath)}`, code: loop.expr });
      out.push({ app: 'Power Automate', label: 'In Select, Filter array or Condition', code: Structra.dataPaths.powerAutomateInItem(path).expr });
    }
    out.push({ app: 'Power Automate', label: loop ? 'With the position in the list' : 'Expression', code: pa(path) });

    const convert = (expr) => {
      switch (kindOf(value)) {
        case 'number': return `Value(${expr})`;
        case 'boolean': return `Boolean(${expr})`;
        case 'string': return ISO_DATETIME.test(value) ? `DateTimeValue(${expr})` : ISO_DATE.test(value) ? `DateValue(${expr})` : `Text(${expr})`;
        default: return expr;
      }
    };
    const fxLoop = Structra.dataPaths.powerFxInRecord(path);
    if (fxLoop) out.push({ app: 'Power Fx', label: `Inside ForAll over ${fxLoop.listPath}`, code: convert(fxLoop.expr) });
    out.push({ app: 'Power Fx', label: fxLoop ? 'With the position in the list' : 'Formula', code: convert(fx(path)) });
    return out;
  }

  /** Guess which connector produced this JSON */
  function connectorShape(data) {
    if (Array.isArray(data)) return 'Direct array response (no wrapper)';
    if (data && typeof data === 'object') {
      const keys = Object.keys(data);
      if (Array.isArray(data.value)) return 'OData / SharePoint / Dataverse list response (body.value[])';
      if (data.body && typeof data.body === 'object') return 'HTTP action response with body wrapper';
      if (data.d && typeof data.d === 'object') return 'Legacy OData v2 response (d.results[])';
      if (Array.isArray(data.results)) return 'Search or results-style response';
      if (keys.includes('@odata.context')) return 'OData v4 response';
    }
    return 'Custom or unknown JSON shape';
  }

  function helpers(data) {
    const sections = [];
    const arrays = Structra.dataEngine.findAllArrays(data, '');
    const patterns = patternSections(data);
    const base = source.loopName || 'Apply_to_each';
    // Power Automate names the second loop Apply_to_each_2, the third Apply_to_each_3, and so on
    const loopAt = (n) => (n <= 1 ? base : `${base}_${n}`);

    if (arrays.length) {
      const each = [];
      const gallery = [];
      for (const a of arrays) {
        const raw = a.path === '(root)' ? '' : a.path;
        const depth = (raw.match(/\[(?:\*|\d+)\]/g) || []).length;          // how many lists this list sits inside
        const sample = Structra.dataPaths.resolve(data, raw.replace(/\[\*\]/g, '[0]'));
        const keys = Array.isArray(sample) ? firstObjectKeys(sample) : null;

        if (depth === 0) {
          each.push(row(a.path, pa(raw ? `$.${raw}` : '$')));
        } else {
          const inner = Structra.dataPaths.powerAutomateInLoop(raw, loopAt(depth));
          each.push(row(`${a.path}  (inside the loop over ${inner.listPath})`, inner.expr));
        }
        if (keys) {
          for (const k of keys.slice(0, 3)) each.push(row(`  .${k}`, `items('${loopAt(depth + 1)}')?['${k}']`));
        }
        const fxPath = Structra.dataPaths.powerFx(raw.replace(/\[\*\]/g, '[0]'), { variable: source.fxVar || 'jsonText' });
        gallery.push(row(a.path, `ForAll(${fxPath}, ThisRecord)`));
        if (keys && keys.length) {
          const cols = keys.slice(0, 4).map((k) => `${k}: Text(ThisRecord.${k})`).join(', ');
          gallery.push(row('  Typed', `ForAll(${fxPath}, {${cols}})`));
        }
      }
      sections.push({ title: 'Apply to each (Power Automate)', rows: each });
      sections.push(patterns[0]);
      sections.push({ title: 'Gallery and data table items (Canvas app)', rows: gallery });
      sections.push(patterns[1], ...staticSections().slice(2));
    } else {
      sections.push(...patterns, ...staticSections().slice(2));
    }

    sections.push({ title: 'Likely connector shape', note: connectorShape(data), rows: [] });
    return sections;
  }

  return { powerAutomate, powerFx, helpers, flowActions, quick, connectorShape, getSource, setSource, pickedColumns, setColumn };
})();
