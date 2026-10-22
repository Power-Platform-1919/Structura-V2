/* ============================================================
   STRUCTRA V2 — Power Platform Expressions
   Structra.expressions — ready-to-paste expressions for a data path.

   Every function returns plain data, never HTML:
     rows      → [{ label, code }]
     sections  → [{ title, rows }]

   API:
     Structra.expressions.powerAutomate(path, value) → rows
     Structra.expressions.powerFx(path, value)       → rows
     Structra.expressions.helpers(data)              → sections
   ============================================================ */

window.Structra = window.Structra || {};

Structra.expressions = (() => {
  const row = (label, code) => ({ label, code });

  const kindOf = Structra.util.typeOf;

  const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
  const looksLikeDate = (s) => /\d{4}-\d{2}-\d{2}/.test(s) || /\d{2}\/\d{2}\/\d{4}/.test(s);
  const looksLikeUrl = (s) => /^https?:\/\//i.test(s);
  const looksLikeGuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(s);
  const firstObjectKeys = (arr) =>
    (arr.length && arr[0] && typeof arr[0] === 'object' && !Array.isArray(arr[0])) ? Object.keys(arr[0]) : null;

  /* ========================================================
     POWER AUTOMATE
     ======================================================== */

  function powerAutomate(path, value) {
    const p = Structra.paths.powerAutomate(path);
    const rows = [row('Access value', p)];
    const add = (label, code) => rows.push(row(label, code));

    switch (kindOf(value)) {
      case 'array': {
        add('Count (length)', `length(${p})`);
        add('First item', `first(${p})`);
        add('Last item', `last(${p})`);
        add('Get item [0]', `${p}[0]`);
        add('Is empty?', `equals(length(${p}), 0)`);
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
        add('Create array', `createArray(${p}[0], ${p}[1])`);

        const keys = firstObjectKeys(value);
        if (keys) {
          const k = keys[0];
          if (k) {
            add(`[0].${k}`, `${p}[0]?['${k}']`);
            add(`Current .${k}`, `items('Apply_to_each')?['${k}']`);
            add('Sort ascending', `sort(${p}, '${k}')`);
            add('Sort descending', `reverse(sort(${p}, '${k}'))`);
            add('Filter array: From', p);
            add('Filter array: Where', `not(equals(item()?['${k}'], null))`);
            add('Select: From', p);
            add('Select: Map', `item()?['${k}']`);
          }
          if (keys[1]) {
            add(`[0].${keys[1]}`, `${p}[0]?['${keys[1]}']`);
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
        add('Key count (approx.)', `length(string(${p}))`);
        for (const k of keys.slice(0, 10)) {
          const v = value[k];
          const at = `${p}?['${k}']`;
          if (Array.isArray(v)) {
            add(`${k} (length)`, `length(${at})`);
            add(`${k}[0]`, `${at}[0]`);
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
        add('String value', p);
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
        add('Number value', p);
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
        add('Boolean value', p);
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

  function powerFx(path, value) {
    const p = Structra.paths.powerFx(path);
    const table = `ForAll(${p}, ThisRecord)`;
    const rows = [row('Access (ParseJSON)', p)];
    const add = (label, code) => rows.push(row(label, code));

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
          const k = keys[0];
          if (k) {
            const typed = `ForAll(${p}, {${k}: Text(ThisRecord.${k})})`;
            add(`[1].${k} as text`, `Text(Index(${p}, 1).${k})`);
            add(`[1].${k} as number`, `Value(Index(${p}, 1).${k})`);
            add('Gallery column', `Text(ThisItem.${k})`);
            add('Filter (not blank)', `Filter(ForAll(${p}, {val: Text(ThisRecord.${k})}), !IsBlank(val))`);
            add('Filter (equals)', `Filter(${typed}, ${k} = "value")`);
            add('Sort ascending', `SortByColumns(${typed}, "${k}", SortOrder.Ascending)`);
            add('Sort descending', `SortByColumns(${typed}, "${k}", SortOrder.Descending)`);
            add('LookUp', `LookUp(${typed}, ${k} = "value")`);
            add('CountIf', `CountIf(${typed}, !IsBlank(${k}))`);
            add('Distinct', `Distinct(${typed}, ${k})`);
            add('Search', `Search(${typed}, txtSearch.Text, "${k}")`);
            add('AddColumns', `AddColumns(${typed}, "Extra", "value")`);
          }
          if (keys[1]) {
            add(`[1].${keys[1]} as text`, `Text(Index(${p}, 1).${keys[1]})`);
            add(`Gallery .${keys[1]}`, `Text(ThisItem.${keys[1]})`);
          }
          if (keys.length) {
            const cols = keys.slice(0, 5).map((c) => `${c}: Text(ThisRecord.${c})`).join(', ');
            add('Typed table', `ForAll(${p}, {${cols}})`);
          }
          if (keys.length >= 2) {
            add('GroupBy', `GroupBy(ForAll(${p}, {${keys[0]}: Text(ThisRecord.${keys[0]}), ${keys[1]}: Text(ThisRecord.${keys[1]})}), "${keys[0]}", "Items")`);
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
        const name = cap(Structra.paths.lastKey(path));
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
     HELPERS — whole-document patterns
     ======================================================== */

  const PP = "body('Parse_JSON')";

  const STATIC_SECTIONS = [
    {
      title: 'Compose and variables',
      rows: [
        row('Compose (full output)', PP),
        row('Initialize string variable', `${PP}?['keyName']`),
        row('Initialize array variable', `${PP}?['arrayName']`),
        row('JSON string', `string(${PP})`),
        row('Outputs reference', `outputs('Compose')`),
      ],
    },
    {
      title: 'Common patterns',
      rows: [
        row('PA: condition (is null)', `equals(${PP}?['key'], null)`),
        row('PA: condition (not empty)', `greater(length(${PP}?['arr']), 0)`),
        row('PA: empty string check', `empty(${PP}?['key'])`),
        row('PA: ternary', `if(equals(${PP}?['status'], 'active'), 'Yes', 'No')`),
        row('Fx: set from JSON', 'Set(varData, ParseJSON(jsonText))'),
        row('Fx: ClearCollect', 'ClearCollect(colData, ForAll(ParseJSON(jsonText), ThisRecord))'),
        row('Fx: notify when empty', 'If(IsEmpty(ForAll(ParseJSON(jsonText), ThisRecord)), Notify("No data found", NotificationType.Warning))'),
        row('Fx: navigate with context', 'Navigate(scrDetail, ScreenTransition.None, {selectedItem: ThisItem})'),
      ],
    },
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
    const arrays = Structra.engine.findAllArrays(data, '');

    if (arrays.length) {
      const each = [];
      const gallery = [];
      for (const a of arrays) {
        const raw = a.path === '(root)' ? '' : a.path;
        each.push(row(a.path, Structra.paths.powerAutomate(raw)));
        const sample = Structra.paths.resolve(data, raw);
        const keys = Array.isArray(sample) ? firstObjectKeys(sample) : null;
        if (keys) {
          for (const k of keys.slice(0, 3)) each.push(row(`  .${k}`, `items('Apply_to_each')?['${k}']`));
        }
        const fx = Structra.paths.powerFx(raw);
        gallery.push(row(a.path, `ForAll(${fx}, ThisRecord)`));
        if (keys && keys.length) {
          const cols = keys.slice(0, 4).map((k) => `${k}: Text(ThisRecord.${k})`).join(', ');
          gallery.push(row('  Typed', `ForAll(${fx}, {${cols}})`));
        }
      }
      sections.push({ title: 'Apply to each (Power Automate)', rows: each });
      sections.push(STATIC_SECTIONS[0]);
      sections.push({ title: 'Gallery and data table items (Canvas app)', rows: gallery });
      sections.push(...STATIC_SECTIONS.slice(1));
    } else {
      sections.push(...STATIC_SECTIONS);
    }

    sections.push({ title: 'Likely connector shape', note: connectorShape(data), rows: [] });
    return sections;
  }

  return { powerAutomate, powerFx, helpers, connectorShape };
})();
