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

  const kindOf = Structra.sharedHelpers.jsonTypeOf;

  const cap = (text) => (text ? text[0].toUpperCase() + text.slice(1) : text);
  const looksLikeDate = (text) => /\d{4}-\d{2}-\d{2}/.test(text) || /\d{2}\/\d{2}\/\d{4}/.test(text);
  const looksLikeUrl = (text) => /^https?:\/\//i.test(text);
  const looksLikeGuid = (text) => /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(text);
  const firstObjectKeys = (array) =>
    (array.length && array[0] && typeof array[0] === 'object' && !Array.isArray(array[0])) ? Object.keys(array[0]) : null;

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

  const powerAutomatePath = (path) => Structra.dataPaths.powerAutomate(path, { root: rootExpression(), dropBody: dropsBody(Structra.state && Structra.state.jsonData) });
  const powerFxPath = (path) => Structra.dataPaths.powerFx(path, { variable: source.fxVar || 'jsonText' });

  /* ========================================================
     POWER AUTOMATE
     ======================================================== */

  function powerAutomate(path, value) {
    const expression = powerAutomatePath(path);
    const rows = [row('Access value', expression)];
    const add = (label, code) => rows.push(row(label, code));
    // Inside a list item the position does not matter: it is "the current item" of the loop
    const inLoop = Structra.dataPaths.powerAutomateInLoop(path, source.loopName);
    if (inLoop) {
      rows.unshift(row(`Inside Apply to each over ${listName(inLoop.listPath)}`, inLoop.expr));
      rows.splice(1, 0, row('Inside Select, Filter array or Condition', Structra.dataPaths.powerAutomateInItem(path).expr));
    }

    switch (kindOf(value)) {
      case 'array': {
        add('Count (length)', `length(${expression})`);
        add('First item', `first(${expression})`);
        add('Last item', `last(${expression})`);
        add('Get item [0]', `${expression}?[0]`);
        add('Is empty?', `empty(${expression})`);
        add('Is not empty?', `greater(length(${expression}), 0)`);
        add('Apply to each (input)', expression);
        add('Current item', `items('Apply_to_each')`);
        add('Take first 5', `take(${expression}, 5)`);
        add('Skip first 5', `skip(${expression}, 5)`);
        add('Reverse', `reverse(${expression})`);
        add('Chunk (groups of 10)', `chunk(${expression}, 10)`);
        add('Union with another', `union(${expression}, variables('otherArray'))`);
        add('Intersection', `intersection(${expression}, variables('otherArray'))`);
        add('To JSON string', `string(${expression})`);
        add('Create array', `createArray(${expression}?[0], ${expression}?[1])`);

        const keys = firstObjectKeys(value);
        if (keys) {
          const firstKey = keys[0];
          if (firstKey) {
            add(`[0].${firstKey}`, `${expression}?[0]?['${firstKey}']`);
            add(`Current .${firstKey}`, `items('Apply_to_each')?['${firstKey}']`);
            add('Sort ascending', `sort(${expression}, '${firstKey}')`);
            add('Sort descending', `reverse(sort(${expression}, '${firstKey}'))`);
            add('Filter array: From', expression);
            add('Filter array: Where', `not(equals(item()?['${firstKey}'], null))`);
            add('Select: From', expression);
            add('Select: Map', `item()?['${firstKey}']`);
          }
          if (keys[1]) {
            add(`[0].${keys[1]}`, `${expression}?[0]?['${keys[1]}']`);
            add(`Current .${keys[1]}`, `items('Apply_to_each')?['${keys[1]}']`);
          }
        } else if (value.length && typeof value[0] === 'string') {
          add('Contains value', `contains(${expression}, 'searchValue')`);
          add('Join with comma', `join(${expression}, ',')`);
          add('Join with newline', `join(${expression}, decodeUriComponent('%0A'))`);
          add('Join with semicolon', `join(${expression}, ';')`);
          add('Sort alphabetically', `sort(${expression})`);
        } else if (value.length && typeof value[0] === 'number') {
          add('Min value', `min(${expression})`);
          add('Max value', `max(${expression})`);
          add('Sort numerically', `sort(${expression})`);
        }
        break;
      }

      case 'object': {
        const keys = Object.keys(value);
        const firstKey = keys[0] || 'key';
        add('To JSON string', `string(${expression})`);
        add('Add property', `addProperty(${expression}, 'newKey', 'newValue')`);
        add('Remove property', `removeProperty(${expression}, '${firstKey}')`);
        add('Set property', `setProperty(${expression}, '${firstKey}', 'newValue')`);
        for (const key of keys.slice(0, 10)) {
          const child = value[key];
          const at = `${expression}?['${key}']`;
          if (Array.isArray(child)) {
            add(`${key} (length)`, `length(${at})`);
            add(`${key}[0]`, `${at}?[0]`);
            add(`${key} first`, `first(${at})`);
          } else if (child === null) {
            add(`${key} (null)`, at);
            add(`${key} coalesce`, `coalesce(${at}, 'default')`);
          } else if (typeof child === 'object') {
            add(`${key} (object)`, at);
          } else if (typeof child === 'number') {
            add(Number.isInteger(child) ? `${key} (int)` : `${key} (float)`, `${Number.isInteger(child) ? 'int' : 'float'}(${at})`);
          } else if (typeof child === 'boolean') {
            add(`${key} (bool)`, at);
            add(`${key} is true`, `equals(${at}, true)`);
          } else {
            add(key, at);
          }
        }
        break;
      }

      case 'string': {
        add('To upper', `toUpper(${expression})`);
        add('To lower', `toLower(${expression})`);
        add('Length', `length(${expression})`);
        add('Trim', `trim(${expression})`);
        add('Contains', `contains(${expression}, 'searchText')`);
        add('Starts with', `startsWith(${expression}, 'prefix')`);
        add('Ends with', `endsWith(${expression}, 'suffix')`);
        add('Replace', `replace(${expression}, 'oldText', 'newText')`);
        add('Split', `split(${expression}, ',')`);
        add('Substring', `substring(${expression}, 0, 10)`);
        add('Slice', `slice(${expression}, 0, 10)`);
        add('Index of', `indexOf(${expression}, 'search')`);
        add('Last index of', `lastIndexOf(${expression}, 'search')`);
        add('Nth index of', `nthIndexOf(${expression}, 'search', 2)`);
        add('Chunk (every N chars)', `chunk(${expression}, 50)`);
        add('Default when empty', `if(empty(${expression}), 'default', ${expression})`);
        add('Null coalesce', `coalesce(${expression}, 'fallback')`);
        add('Concat', `concat(${expression}, ' ', 'suffix')`);
        add('Base64 encode', `base64(${expression})`);
        add('Base64 decode', `base64ToString(${expression})`);
        add('URI encode', `encodeUriComponent(${expression})`);
        add('URI decode', `decodeUriComponent(${expression})`);
        add('Parse as JSON', `json(${expression})`);
        add('Data URI', `dataUri(${expression})`);
        if (looksLikeDate(value)) {
          add('Format date', `formatDateTime(${expression}, 'dd/MM/yyyy')`);
          add('Format datetime', `formatDateTime(${expression}, 'yyyy-MM-ddTHH:mm:ss')`);
          add('Add 1 day', `addDays(${expression}, 1)`);
          add('Add 1 hour', `addHours(${expression}, 1)`);
          add('Convert time zone', `convertTimeZone(${expression}, 'UTC', 'AUS Eastern Standard Time')`);
          add('Ticks', `ticks(${expression})`);
          add('Day of week', `dayOfWeek(${expression})`);
          add('Start of day', `startOfDay(${expression})`);
          add('Start of month', `startOfMonth(${expression})`);
        }
        if (looksLikeUrl(value)) {
          add('URI host', `uriHost(${expression})`);
          add('URI path', `uriPath(${expression})`);
          add('URI query', `uriQuery(${expression})`);
          add('URI port', `uriPort(${expression})`);
          add('URI scheme', `uriScheme(${expression})`);
        }
        if (looksLikeGuid(value)) add('As GUID', `guid(${expression})`);
        break;
      }

      case 'number': {
        add('As integer', `int(${expression})`);
        add('As float', `float(${expression})`);
        add('As decimal', `decimal(string(${expression}))`);
        add('To string', `string(${expression})`);
        add('Add 1', `add(${expression}, 1)`);
        add('Subtract 1', `sub(${expression}, 1)`);
        add('Multiply by 2', `mul(${expression}, 2)`);
        add('Divide by 2', `div(${expression}, 2)`);
        add('Modulo 2', `mod(${expression}, 2)`);
        add('Greater than 0', `greater(${expression}, 0)`);
        add('Greater or equal 0', `greaterOrEquals(${expression}, 0)`);
        add('Less than 100', `less(${expression}, 100)`);
        add('Less or equal 100', `lessOrEquals(${expression}, 100)`);
        add('Equals 0', `equals(${expression}, 0)`);
        add('Format number', `formatNumber(${expression}, 'N2')`);
        add('Format currency', `formatNumber(${expression}, 'C2')`);
        add('Format percent', `formatNumber(div(${expression}, 100), 'P2')`);
        add('Random 1 to N', `rand(1, add(${expression}, 1))`);
        add('Range from 0', `range(0, ${expression})`);
        add('Is integer?', `isInt(string(${expression}))`);
        add('Is float?', `isFloat(string(${expression}))`);
        add('As bool (0 = false)', `bool(${expression})`);
        break;
      }

      case 'boolean': {
        add('Negate', `not(${expression})`);
        add('Is true?', `equals(${expression}, true)`);
        add('Is false?', `equals(${expression}, false)`);
        add('If / else', `if(equals(${expression}, true), 'Yes', 'No')`);
        add('AND', `and(${expression}, equals(1, 1))`);
        add('OR', `or(${expression}, equals(1, 1))`);
        add('To string', `string(${expression})`);
        add('To int (1 / 0)', `if(equals(${expression}, true), 1, 0)`);
        break;
      }

      case 'null': {
        add('Is null?', `equals(${expression}, null)`);
        add('Is not null?', `not(equals(${expression}, null))`);
        add('Coalesce to string', `coalesce(${expression}, 'fallback')`);
        add('Coalesce to number', `coalesce(${expression}, 0)`);
        add('If null', `if(equals(${expression}, null), 'N/A', ${expression})`);
        add('Empty check', `empty(${expression})`);
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
  const fxName = (key) => (SIMPLE_FX_NAME.test(key) ? key : `'${key.replace(/'/g, "''")}'`);
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
    for (const value of values) {
      if (value === null || value === undefined) continue;
      seen.add(kindOf(value));
      if (typeof value === 'string') {
        strings++;
        if (!ISO_DATE.test(value)) dates = false;
        if (!ISO_DATETIME.test(value)) datetimes = false;
      }
    }
    if (seen.size !== 1) return { kind: seen.size ? 'mixed' : 'text', value: `Text(${ref})`, literal: '"value"' };
    const firstType = [...seen][0];
    if (firstType === 'number') return { kind: 'number', value: `Value(${ref})`, literal: '0' };
    if (firstType === 'boolean') return { kind: 'boolean', value: `Boolean(${ref})`, literal: 'true' };
    if (firstType === 'string' && strings && datetimes) return { kind: 'datetime', value: `DateTimeValue(${ref})`, literal: 'Now()' };
    if (firstType === 'string' && strings && dates) return { kind: 'date', value: `DateValue(${ref})`, literal: 'Today()' };
    return { kind: 'text', value: `Text(${ref})`, literal: '"value"' };
  }

  const peek = (rows, parts) => rows.slice(0, 50).map((row) => {
    let current = row;
    for (const expression of parts) { if (current === null || typeof current !== 'object') return undefined; current = current[expression]; }
    return current;
  });

  /**
   * Every column a list of records offers: the plain fields, and for fields that hold an object
   * (SharePoint Choice and Person, lookups) their plain children as Parent.Child.
   * Each column knows how to read itself in Power Automate (steps) and Power Fx (value).
   */
  function listColumns(rows) {
    const columns = [];
    const first = rows.slice(0, 50).filter((row) => row && typeof row === 'object' && !Array.isArray(row));
    const keys = [];
    first.forEach((row) => Object.keys(row).forEach((key) => { if (!keys.includes(key)) keys.push(key); }));
    for (const key of keys) {
      const values = peek(first, [key]);
      const kinds = new Set(values.filter((value) => value !== null && value !== undefined).map(kindOf));
      if (kinds.has('object') && kinds.size === 1) {
        const children = [];
        values.forEach((value) => { if (value && typeof value === 'object') Object.keys(value).forEach((column) => { if (!children.includes(column)) children.push(column); }); });
        let count = 0;
        for (const child of children) {
          if (child.startsWith('@')) continue;
          const childValues = peek(first, [key, child]);
          if (childValues.some((item) => item !== null && item !== undefined && typeof item === 'object')) continue;   // deeper objects and lists stay out
          if (count++ >= 6) break;
          columns.push({ id: `${key}.${child}`, parts: [key, child], name: `${key}_${child}`, noise: false, ...fxConversion(childValues, `ThisRecord.${fxName(key)}.${fxName(child)}`) });
        }
      } else if (!kinds.has('object') && !kinds.has('array')) {
        columns.push({ id: key, parts: [key], name: key, noise: isNoise(key), ...fxConversion(values, `ThisRecord.${fxName(key)}`) });
      }
    }
    return columns;
  }

  /* Which columns the person switched off, per list. Kept for the session only. */
  const columnOff = new Map();

  /** listColumns plus the person's choice: each column carries on: true or false */
  /** A list at the top of the document is called the whole list, not $ */
  function listName(path) { return !path || path === '$' || path === '(root)' ? 'the whole list' : path; }

  function pickedColumns(listPath, rows) {
    const off = columnOff.get(listPath);
    return listColumns(rows).map((column) => ({ ...column, on: off ? !off.has(column.id) : !column.noise }));
  }

  function setColumn(listPath, rows, id, isOn) {
    let off = columnOff.get(listPath);
    if (!off) {
      // first change: start from the defaults (noise off) so the one change does not flip the rest
      off = new Set(listColumns(rows).filter((column) => column.noise).map((column) => column.id));
      columnOff.set(listPath, off);
    }
    if (isOn) off.delete(id); else off.add(id);
    if (Structra.events) Structra.events.emit('expressions:columns-changed', listPath);
  }

  function powerFx(path, value) {
    const expression = powerFxPath(path);
    const table = `ForAll(${expression}, ThisRecord)`;
    const rows = [row('Access (ParseJSON)', expression)];
    const add = (label, code) => rows.push(row(label, code));
    // Inside a list item, the item is "the current record": no position in the list is needed
    const record = Structra.dataPaths.powerFxInRecord(path, 'ThisRecord');
    if (record) {
      rows.push(row(`Inside ForAll, Filter or Sum over ${listName(record.listPath)}`, record.expr));
      rows.push(row(`In a gallery or data table over ${listName(record.listPath)}`, Structra.dataPaths.powerFxInRecord(path, 'ThisItem').expr));
    }

    switch (kindOf(value)) {
      case 'array': {
        add('As table', table);
        add('Count', `CountRows(${table})`);
        add('First item', `Index(${expression}, 1)`);
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
          const columns = pickedColumns(Structra.dataPaths.strip(path), value).filter((column) => column.on);
          const colExpr = (column) => `${fxName(column.name)}: ${column.value}`;
          const typedAll = columns.length ? `ForAll(${expression}, {${columns.slice(0, 40).map(colExpr).join(', ')}})` : null;
          if (typedAll) {
            add('Typed table (chosen columns)', typedAll);
            add('Collect typed table', `ClearCollect(colData, ${typedAll})`);
          }
          const first = columns[0];
          if (first) {
            const column = fxName(first.name);
            const typed = `ForAll(${expression}, {${colExpr(first)}})`;
            add(`[1] ${first.id}`, first.value.replace('ThisRecord', `Index(${expression}, 1)`));
            add('Gallery column', first.kind === 'text' ? `ThisItem.${first.parts.map(fxName).join('.')}` : `Text(ThisItem.${first.parts.map(fxName).join('.')})`);
            add('Filter (not blank)', `Filter(${typed}, !IsBlank(${column}))`);
            add('Filter (equals)', `Filter(${typed}, ${column} = ${first.literal})`);
            add('Sort ascending', `SortByColumns(${typed}, "${first.name}", SortOrder.Ascending)`);
            add('Sort descending', `SortByColumns(${typed}, "${first.name}", SortOrder.Descending)`);
            add('LookUp', `LookUp(${typed}, ${column} = ${first.literal})`);
            add('CountIf', `CountIf(${typed}, !IsBlank(${column}))`);
            add('Distinct', `Distinct(${typed}, ${column})`);
            if (first.kind === 'text') add('Search', `Search(${typed}, txtSearch.Text, "${first.name}")`);
            add('AddColumns', `AddColumns(${typed}, "Extra", "value")`);
          }
          if (columns.length >= 2) {
            add('GroupBy', `GroupBy(ForAll(${expression}, {${colExpr(columns[0])}, ${colExpr(columns[1])}}), "${columns[0].name}", "Items")`);
          }
        } else if (value.length && typeof value[0] === 'string') {
          const values = `ForAll(${expression}, {Value: Text(ThisRecord)})`;
          add('First (text)', `Text(Index(${expression}, 1))`);
          add('Concat all', `Concat(${values}, Value, ", ")`);
          add('Concat with newline', `Concat(${values}, Value, Char(10))`);
          add('Gallery display', 'Text(ThisItem.Value)');
          add('Filter contains', `Filter(${values}, txtSearch.Text in Value)`);
          add('Distinct values', `Distinct(${values}, Value)`);
        } else if (value.length && typeof value[0] === 'number') {
          const numbers = `ForAll(${expression}, {Value: Value(ThisRecord)})`;
          add('First (number)', `Value(Index(${expression}, 1))`);
          add('Sum', `Sum(${numbers}, Value)`);
          add('Average', `Average(${numbers}, Value)`);
          add('Max', `Max(${numbers}, Value)`);
          add('Min', `Min(${numbers}, Value)`);
          add('StdevP', `StdevP(${numbers}, Value)`);
          add('VarP', `VarP(${numbers}, Value)`);
        }
        break;
      }

      case 'object': {
        const keys = Object.keys(value);
        const name = cap(Structra.dataPaths.lastKey(path));
        add('Store in variable', `Set(var${name}, ${expression})`);
        add('UpdateContext', `UpdateContext({loc${name}: ${expression}})`);
        add('To JSON string', `JSON(${expression})`);
        add('ColumnNames', `ColumnNames(${expression})`);
        add('With (scope)', `With({rec: ${expression}}, Text(rec.${keys[0] || 'key'}))`);
        for (const key of keys.slice(0, 10)) {
          const child = value[key];
          const at = `${expression}.${key}`;
          if (Array.isArray(child)) {
            add(`${key} (table)`, `ForAll(${at}, ThisRecord)`);
            add(`${key} count`, `CountRows(ForAll(${at}, ThisRecord))`);
            add(`${key} first`, `Index(${at}, 1)`);
          } else if (child === null) {
            add(`${key} (null safe)`, `If(IsBlank(${at}), "N/A", Text(${at}))`);
          } else if (typeof child === 'object') {
            add(`${key} (record)`, at);
          } else if (typeof child === 'string') {
            add(`${key} (text)`, `Text(${at})`);
          } else if (typeof child === 'number') {
            add(`${key} (number)`, `Value(${at})`);
          } else if (typeof child === 'boolean') {
            add(`${key} (boolean)`, `Boolean(${at})`);
          } else {
            add(key, `Text(${at})`);
          }
        }
        break;
      }

      case 'string': {
        const textExpression = `Text(${expression})`;
        add('As text', textExpression);
        add('Upper', `Upper(${textExpression})`);
        add('Lower', `Lower(${textExpression})`);
        add('Proper', `Proper(${textExpression})`);
        add('Length', `Len(${textExpression})`);
        add('Trim', `Trim(${textExpression})`);
        add('TrimEnds', `TrimEnds(${textExpression})`);
        add('Left 10 chars', `Left(${textExpression}, 10)`);
        add('Right 10 chars', `Right(${textExpression}, 10)`);
        add('Mid (5, 10)', `Mid(${textExpression}, 5, 10)`);
        add('Find position', `Find("search", ${textExpression})`);
        add('Contains', `"searchText" in ${textExpression}`);
        add('StartsWith', `StartsWith(${textExpression}, "prefix")`);
        add('EndsWith', `EndsWith(${textExpression}, "suffix")`);
        add('IsBlank', `IsBlank(${textExpression})`);
        add('If blank', `If(IsBlank(${textExpression}), "default", ${textExpression})`);
        add('Coalesce', `Coalesce(${textExpression}, "fallback")`);
        add('Substitute', `Substitute(${textExpression}, "old", "new")`);
        add('Replace (position)', `Replace(${textExpression}, 1, 3, "new")`);
        add('Split to table', `Split(${textExpression}, ",")`);
        add('IsMatch (email)', `IsMatch(${textExpression}, Match.Email)`);
        add('Match (regex)', `Match(${textExpression}, "\\d+")`);
        add('MatchAll', `MatchAll(${textExpression}, "\\d+")`);
        add('IsNumeric', `IsNumeric(${textExpression})`);
        add('Newline to space', `Substitute(${textExpression}, Char(10), " ")`);
        add('EncodeUrl', `EncodeUrl(${textExpression})`);
        add('PlainText (HTML)', `PlainText(${textExpression})`);
        add('HashTags', `HashTags(${textExpression})`);
        add('Copy to clipboard', `Copy(${textExpression})`);
        add('Label.Text', textExpression);
        if (looksLikeDate(value)) {
          const dateExpression = `DateTimeValue(${textExpression})`;
          add('DateTimeValue', dateExpression);
          add('DateValue', `DateValue(${textExpression})`);
          add('Format date', `Text(${dateExpression}, "dd/mm/yyyy")`);
          add('DateAdd +1 day', `DateAdd(${dateExpression}, 1, TimeUnit.Days)`);
          add('DateDiff (days to now)', `DateDiff(${dateExpression}, Now(), TimeUnit.Days)`);
          add('Year', `Year(${dateExpression})`);
          add('Month', `Month(${dateExpression})`);
          add('Day', `Day(${dateExpression})`);
          add('IsToday', `IsToday(${dateExpression})`);
        }
        if (looksLikeUrl(value)) {
          add('Launch URL', `Launch(${textExpression})`);
          add('Download', `Download(${textExpression})`);
        }
        if (looksLikeGuid(value)) add('As GUID', `GUID(${textExpression})`);
        break;
      }

      case 'number': {
        const numberExpression = `Value(${expression})`;
        add('As number', numberExpression);
        add('As text', `Text(${numberExpression})`);
        add('Formatted #,##0.00', `Text(${numberExpression}, "#,##0.00")`);
        add('Currency', `Text(${numberExpression}, "$#,##0.00")`);
        add('Percent', `Text(${numberExpression} / 100, "0.00%")`);
        add('Round', `Round(${numberExpression}, 2)`);
        add('RoundUp', `RoundUp(${numberExpression}, 0)`);
        add('RoundDown', `RoundDown(${numberExpression}, 0)`);
        add('Trunc', `Trunc(${numberExpression})`);
        add('Int', `Int(${numberExpression})`);
        add('Abs', `Abs(${numberExpression})`);
        add('Sign', `Sign(${numberExpression})`);
        add('Sqrt', `Sqrt(${numberExpression})`);
        add('Power ^2', `Power(${numberExpression}, 2)`);
        add('Mod 2', `Mod(${numberExpression}, 2)`);
        add('Ln (natural log)', `Ln(${numberExpression})`);
        add('Log (base 10)', `Log(${numberExpression}, 10)`);
        add('Exp', `Exp(${numberExpression})`);
        add('Greater than 0', `${numberExpression} > 0`);
        add('Less or equal 100', `${numberExpression} <= 100`);
        add('Equals 0', `${numberExpression} = 0`);
        add('Between 0 and 100', `And(${numberExpression} >= 0, ${numberExpression} <= 100)`);
        add('Random 0 to N', `RandBetween(0, ${numberExpression})`);
        add('Sequence', `Sequence(${numberExpression})`);
        add('Label.Text', `Text(${numberExpression}, "#,##0")`);
        break;
      }

      case 'boolean': {
        const booleanExpression = `Boolean(${expression})`;
        add('As boolean', booleanExpression);
        add('Negate', `!${booleanExpression}`);
        add('If true / false', `If(${booleanExpression}, "Yes", "No")`);
        add('AND', `And(${booleanExpression}, true)`);
        add('OR', `Or(${booleanExpression}, false)`);
        add('To number (1 / 0)', `If(${booleanExpression}, 1, 0)`);
        add('Visible property', booleanExpression);
        add('Toggle.Value', booleanExpression);
        add('Switch pattern', `Switch(${booleanExpression}, true, "Active", false, "Inactive")`);
        break;
      }

      case 'null': {
        add('IsBlank', `IsBlank(${expression})`);
        add('Coalesce text', `Coalesce(Text(${expression}), "N/A")`);
        add('Coalesce number', `Coalesce(Value(${expression}), 0)`);
        add('If blank', `If(IsBlank(${expression}), "fallback", Text(${expression}))`);
        add('IfError', `IfError(Text(${expression}), "error fallback")`);
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
    const keys = isObj ? Object.keys(data).filter((key) => !key.startsWith('@')) : [];
    const keyPath = (key) => (/^[A-Za-z_$][\w$]*$/.test(key) ? `$.${key}` : `$['${key.replace(/'/g, "\\'")}']`);
    const scalarKey = keys.find((key) => data[key] === null || typeof data[key] !== 'object');
    const stringKey = keys.find((key) => typeof data[key] === 'string');
    const arrayKey = keys.find((key) => Array.isArray(data[key]));
    const variableName = source.fxVar || 'jsonText';

    const compose = [row('Compose (full output)', powerAutomatePath('$'))];
    if (stringKey) compose.push(row(`Initialize string variable (${stringKey})`, powerAutomatePath(keyPath(stringKey))));
    if (arrayKey) compose.push(row(`Initialize array variable (${arrayKey})`, powerAutomatePath(keyPath(arrayKey))));
    compose.push(row('JSON string', `string(${powerAutomatePath('$')})`));
    compose.push(row('Outputs reference', `outputs('Compose')`));

    const patterns = [];
    if (scalarKey) patterns.push(row(`PA: condition (${scalarKey} is null)`, `equals(${powerAutomatePath(keyPath(scalarKey))}, null)`));
    if (arrayKey) patterns.push(row(`PA: condition (${arrayKey} has items)`, `greater(length(${powerAutomatePath(keyPath(arrayKey))}), 0)`));
    if (stringKey) {
      patterns.push(row(`PA: empty string check (${stringKey})`, `empty(${powerAutomatePath(keyPath(stringKey))})`));
      patterns.push(row(`PA: ternary on ${stringKey}`, `if(equals(${powerAutomatePath(keyPath(stringKey))}, '${String(data[stringKey]).replace(/'/g, "''").slice(0, 30)}'), 'Yes', 'No')`));
    }
    patterns.push(
      row('Fx: set from JSON', `Set(varData, ParseJSON(${variableName}))`),
      row('Fx: ClearCollect', `ClearCollect(colData, ForAll(ParseJSON(${variableName}), ThisRecord))`),
      row('Fx: notify when empty', `If(IsEmpty(ForAll(ParseJSON(${variableName}), ThisRecord)), Notify("No data found", NotificationType.Warning))`),
      row('Fx: navigate with context', 'Navigate(scrDetail, ScreenTransition.None, {selectedItem: ThisItem})'),
    );
    return [{ title: 'Compose and variables', rows: compose }, { title: 'Common patterns', rows: patterns }];
  }

  // Recipes that start from the whole document: built when asked, so they follow the Source settings
  const staticSections = () => {
    const rootPath = powerAutomatePath('$');
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
        row('To JSON string', `string(${rootPath})`),
        row('Parse JSON string', `json(variables('jsonString'))`),
        row('Create object', `json(concat('{"key":"', variables('val'), '"}'))`),
        row('Set property', `setProperty(${rootPath}, 'newKey', 'newValue')`),
        row('Add property', `addProperty(${rootPath}, 'extraKey', 'extraValue')`),
        row('Remove property', `removeProperty(${rootPath}, 'unwantedKey')`),
        row('Chain set property', `setProperty(setProperty(${rootPath}, 'a', 1), 'b', 2)`),
        row('Union arrays', `union(${rootPath}?['arr1'], ${rootPath}?['arr2'])`),
        row('Intersection', `intersection(${rootPath}?['arr1'], ${rootPath}?['arr2'])`),
        row('XML from JSON', `xml(json(concat('{"root":', string(${rootPath}), '}')))`),
        row('Base64 encode', `base64(string(${rootPath}))`),
        row('Base64 decode', `base64ToString(${rootPath}?['encoded'])`),
      ],
    },
    ];
  };

  /* ========================================================
     FLOW ACTIONS: action JSON to paste into a cloud flow
     (Peek code / code view, under "actions"). Expressions start with @.
     ======================================================== */

  const j = (object) => JSON.stringify(object, null, 2);
  const flowAction = (label, note, name, action) => ({ label, note, code: j({ [name]: { ...action, runAfter: {} } }) });

  /** "Has a value": empty() only accepts text, lists and objects, so numbers and flags are checked against null */
  function hasValue(expression, sample) {
    return ['string', 'array', 'object'].includes(kindOf(sample)) ? `not(empty(${expression}))` : `not(equals(${expression}, null))`;
  }

  function flowActions(path, value) {
    const expression = powerAutomatePath(path);
    const at = (expression) => '@' + expression;
    const out = [];

    switch (kindOf(value)) {
      case 'array': {
        const keys = firstObjectKeys(value);
        const firstKey = keys && keys[0];
        out.push(flowAction('Compose: number of items', 'Shows how many items the list holds.', 'Count_items',
          { type: 'Compose', inputs: at(`length(${expression})`) }));
        if (keys && firstKey) {
          const map = {};
          pickedColumns(Structra.dataPaths.strip(path), value).filter((column) => column.on).slice(0, 40).forEach((column) => {
            map[column.name] = at(`item()${column.parts.map((x) => `?['${x.replace(/'/g, "''")}']`).join('')}`);
          });
          out.push(flowAction('Select: keep the chosen columns', 'Builds a smaller list with only the columns you chose.', 'Select',
            { type: 'Select', inputs: { from: at(expression), select: map } }));
          out.push(flowAction('Filter array: drop rows where a column is empty', `Keeps items where "${firstKey}" has a value.`, 'Filter_array',
            { type: 'Query', inputs: { from: at(expression), where: at(hasValue(`item()?['${firstKey}']`, value.find((item) => item && item[firstKey] != null) ? value.find((item) => item && item[firstKey] != null)[firstKey] : null)) } }));
          out.push(flowAction('Apply to each: work with one item at a time', 'Runs the inner actions once per item.', 'Apply_to_each',
            { type: 'Foreach', foreach: at(expression), actions: {
              Compose_current: { type: 'Compose', inputs: at(`items('Apply_to_each')?['${firstKey}']`), runAfter: {} } } }));
        } else {
          out.push(flowAction('Apply to each: work with one item at a time', 'Runs the inner actions once per item.', 'Apply_to_each',
            { type: 'Foreach', foreach: at(expression), actions: {
              Compose_current: { type: 'Compose', inputs: at("items('Apply_to_each')"), runAfter: {} } } }));
        }
        out.push(flowAction('Condition: only continue when the list has items', 'Add actions under "actions" for the yes path.', 'Condition',
          { type: 'If', expression: { and: [{ greater: [at(`length(${expression})`), 0] }] }, actions: {}, else: { actions: {} } }));
        break;
      }
      case 'object': {
        const firstKey = Object.keys(value)[0];
        out.push(flowAction('Compose: this object', 'Keeps the object for later steps.', 'Compose', { type: 'Compose', inputs: at(expression) }));
        if (firstKey) {
          out.push(flowAction(`Condition: "${firstKey}" has a value`, 'Add actions under "actions" for the yes path.', 'Condition',
            { type: 'If', expression: { and: [{ equals: [at(hasValue(`${expression}?['${firstKey}']`, value[firstKey])), true] }] }, actions: {}, else: { actions: {} } }));
        }
        break;
      }
      default: {
        out.push(flowAction('Compose: this value', 'Keeps the value for later steps.', 'Compose', { type: 'Compose', inputs: at(expression) }));
        out.push(flowAction('Condition: value is not empty', 'Add actions under "actions" for the yes path.', 'Condition',
          { type: 'If', expression: { and: [{ equals: [at(hasValue(expression, value)), true] }] }, actions: {}, else: { actions: {} } }));
        // A field of a list item is used per item: through Apply to each, or by testing every item at once
        const inLoop = Structra.dataPaths.powerAutomateInLoop(path, source.loopName);
        const inItem = Structra.dataPaths.powerAutomateInItem(path);
        if (inLoop && inItem) {
          const list = powerAutomatePath(inLoop.listPath);
          out.push(flowAction(`Apply to each: read this field of every item`, `Goes through every item of ${inLoop.listPath}.`, 'Apply_to_each',
            { type: 'Foreach', foreach: at(list), actions: { Compose_field: { type: 'Compose', inputs: at(inLoop.expr), runAfter: {} } } }));
          out.push(flowAction(`Filter array: keep items where this field has a value`, `Keeps the items of ${inLoop.listPath} where the field is filled in.`, 'Filter_array',
            { type: 'Query', inputs: { from: at(list), where: at(hasValue(inItem.expr, value)) } }));
        }
        const varType = { string: 'string', number: Number.isInteger(value) ? 'integer' : 'float', boolean: 'boolean' }[kindOf(value)];
        if (varType) {
          const name = (Structra.dataPaths.lastKey(path) || 'value').replace(/[^A-Za-z0-9_]/g, '_');
          out.push(flowAction('Initialize variable: keep this value in a variable', 'Create it at the top level of the flow, not inside a loop.', 'Initialize_variable',
            { type: 'InitializeVariable', inputs: { variables: [{ name, type: varType, value: at(expression) }] } }));
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
    out.push({ app: 'Power Automate', label: loop ? 'With the position in the list' : 'Expression', code: powerAutomatePath(path) });

    const convert = (expression) => {
      switch (kindOf(value)) {
        case 'number': return `Value(${expression})`;
        case 'boolean': return `Boolean(${expression})`;
        case 'string': return ISO_DATETIME.test(value) ? `DateTimeValue(${expression})` : ISO_DATE.test(value) ? `DateValue(${expression})` : `Text(${expression})`;
        default: return expression;
      }
    };
    const fxLoop = Structra.dataPaths.powerFxInRecord(path);
    if (fxLoop) out.push({ app: 'Power Fx', label: `Inside ForAll over ${fxLoop.listPath}`, code: convert(fxLoop.expr) });
    out.push({ app: 'Power Fx', label: fxLoop ? 'With the position in the list' : 'Formula', code: convert(powerFxPath(path)) });
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
    const loopAt = (count) => (count <= 1 ? base : `${base}_${count}`);

    if (arrays.length) {
      const each = [];
      const gallery = [];
      for (const list of arrays) {
        const raw = list.path === '(root)' ? '' : list.path;
        const depth = (raw.match(/\[(?:\*|\d+)\]/g) || []).length;          // how many lists this list sits inside
        const sample = Structra.dataPaths.resolve(data, raw.replace(/\[\*\]/g, '[0]'));
        const keys = Array.isArray(sample) ? firstObjectKeys(sample) : null;

        if (depth === 0) {
          each.push(row(list.path, powerAutomatePath(raw ? `$.${raw}` : '$')));
        } else {
          const inner = Structra.dataPaths.powerAutomateInLoop(raw, loopAt(depth));
          each.push(row(`${list.path}  (inside the loop over ${inner.listPath})`, inner.expr));
        }
        if (keys) {
          for (const key of keys.slice(0, 3)) each.push(row(`  .${key}`, `items('${loopAt(depth + 1)}')?['${key}']`));
        }
        const fxPath = Structra.dataPaths.powerFx(raw.replace(/\[\*\]/g, '[0]'), { variable: source.fxVar || 'jsonText' });
        gallery.push(row(list.path, `ForAll(${fxPath}, ThisRecord)`));
        if (keys && keys.length) {
          const columns = keys.slice(0, 4).map((key) => `${key}: Text(ThisRecord.${key})`).join(', ');
          gallery.push(row('  Typed', `ForAll(${fxPath}, {${columns}})`));
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
