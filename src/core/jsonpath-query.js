/**
 * JSONPath - find values by path.
 *
 *   Structra.jsonpathQuery.query(data, '$.value[*].Requester.Email')
 *     → [{ path: '$.value[0].Requester.Email', value: 'ann@contoso.com' }, ...]
 *
 * Supported (the parts people use):
 *   $              the whole document (optional at the start: 'value[0].Title' works too)
 *   .key  ['key']  a field            .*  [*]  every field or item
 *   [2]  [-1]      an item            [0:3] [1:]  a range of items
 *   ..key          the field at any depth
 *   [?(@.Cost > 100 && @.Approved == true)]   items that pass a test (== != > >= < <= =~, && ||)
 *   ['a','b'] [0,2]  several at once
 */
Structra.jsonpathQuery = (() => {

  /* ---------- reading the expression ---------- */

  function parse(expression) {
    const source = String(expression).trim();
    let i = 0;
    const steps = [];
    const fail = (message) => { throw new Error(`${message} (at character ${i + 1} of "${source}")`); };

    if (source[i] === '$') i++;
    while (i < source.length) {
      if (source.startsWith('..', i)) {
        i += 2;
        steps.push({ type: 'descend' });
        if (source[i] === '[') continue;                       // ..[?(...)]
        if (source[i] === '*') { i++; steps.push({ type: 'wild' }); continue; }
        const name = readName();
        if (!name) fail('Expected a field name after ..');
        steps.push({ type: 'keys', keys: [name] });
      } else if (source[i] === '.') {
        i++;
        if (source[i] === '*') { i++; steps.push({ type: 'wild' }); continue; }
        const name = readName();
        if (!name) fail('Expected a field name after .');
        steps.push({ type: 'keys', keys: [name] });
      } else if (source[i] === '[') {
        steps.push(readBracket());
      } else if (steps.length === 0 || /\s/.test(source[i])) {
        // 'value[0].Title' or '*.email' without the leading $
        if (/\s/.test(source[i])) { i++; continue; }
        if (source[i] === '*') { i++; steps.push({ type: 'wild' }); continue; }
        const name = readName();
        if (!name) fail('Unexpected character');
        steps.push({ type: 'keys', keys: [name] });
      } else {
        fail('Unexpected character');
      }
    }
    return steps;

    function readName() {
      const match = /^[^.\[\]\s,()=<>!&|*]+/.exec(source.slice(i));
      if (!match) return '';
      i += match[0].length;
      return match[0];
    }

    function readBracket() {
      i++;                                                   // [
      while (source[i] === ' ') i++;
      if (source[i] === '*') { i++; closeBracket(); return { type: 'wild' }; }
      if (source[i] === '?') {
        i++;
        if (source[i] === '(') {
          let depth = 0, start = i;
          for (; i < source.length; i++) {
            if (source[i] === '(') depth++;
            else if (source[i] === ')' && --depth === 0) { i++; break; }
            else if (source[i] === '"' || source[i] === "'") { const quote = source[i]; i++; while (i < source.length && source[i] !== quote) i++; }
          }
          const body = source.slice(start + 1, i - 1);
          closeBracket();
          return { type: 'filter', test: parseTest(body) };
        }
        fail('A filter looks like [?(@.field == "value")]');
      }
      // names, numbers, slices, separated by commas
      const items = [];
      for (;;) {
        while (source[i] === ' ') i++;
        if (source[i] === "'" || source[i] === '"') {
          const quote = source[i++]; let text = '';
          while (i < source.length && source[i] !== quote) { if (source[i] === '\\') i++; text += source[i++]; }
          if (source[i] !== quote) fail('A quote is not closed');
          i++;
          items.push({ key: text });
        } else {
          const match = /^(-?\d*)(?::(-?\d*))?(?::(-?\d*))?/.exec(source.slice(i));
          if (!match || !match[0]) fail('Expected a number, a range or a quoted name');
          i += match[0].length;
          if (match[0].includes(':')) items.push({ slice: [match[1] === '' ? null : +match[1], match[2] === undefined || match[2] === '' ? null : +match[2], match[3] === undefined || match[3] === '' ? 1 : +match[3]] });
          else items.push({ index: +match[1] });
        }
        while (source[i] === ' ') i++;
        if (source[i] === ',') { i++; continue; }
        break;
      }
      closeBracket();
      return { type: 'select', items };
    }

    function closeBracket() {
      while (source[i] === ' ') i++;
      if (source[i] !== ']') fail('Expected ]');
      i++;
    }
  }

  /* ---------- filters: @.a.b == 3 && @.c ---------- */

  function parseTest(body) {
    // split on || first, then &&, outside quotes
    const splitOn = (text, operation) => {
      const out = []; let current = '', quote = null;
      for (let position = 0; position < text.length; position++) {
        const character = text[position];
        if (quote) { current += character; if (character === quote) quote = null; continue; }
        if (character === '"' || character === "'") { quote = character; current += character; continue; }
        if (text.startsWith(operation, position)) { out.push(current); current = ''; position += operation.length - 1; continue; }
        current += character;
      }
      out.push(current);
      return out;
    };
    const orGroups = splitOn(body, '||').map((part) => splitOn(part, '&&').map(parseComparison));
    return (node) => orGroups.some((andGroup) => andGroup.every((predicate) => predicate(node)));
  }

  function parseComparison(text) {
    const condition = text.trim();
    const match = /^(@[^\s=!<>~]*)\s*(==|!=|>=|<=|=~|>|<)\s*(.+)$/.exec(condition);
    const read = (reference) => {
      const keys = reference.replace(/^@\.?/, '').split('.').filter(Boolean);
      return (node) => keys.reduce((value, index) => (value === null || value === undefined ? undefined : value[index]), node);
    };
    if (!match) {
      if (/^!?@[\w$.]*$/.test(condition)) { const isNegated = condition[0] === '!'; const get = read(condition.replace(/^!/, '')); return (node) => (get(node) !== undefined && get(node) !== null && get(node) !== false) !== isNegated; }
      throw new Error(`Cannot read the filter test "${condition}". Try @.field == "value"`);
    }
    const get = read(match[1]);
    const literalValue = literal(match[3].trim());
    const operation = match[2];
    return (node) => {
      const found = get(node);
      switch (operation) {
        case '==': return found === literalValue || (found != null && literalValue != null && typeof found !== 'object' && String(found) === String(literalValue));
        case '!=': return !(found === literalValue || (found != null && literalValue != null && typeof found !== 'object' && String(found) === String(literalValue)));
        case '>': return found > literalValue;
        case '>=': return found >= literalValue;
        case '<': return found < literalValue;
        case '<=': return found <= literalValue;
        case '=~': return typeof found === 'string' && literalValue instanceof RegExp && literalValue.test(found);
        default: return false;
      }
    };
  }

  function literal(text) {
    if (/^(['"]).*\1$/.test(text)) return text.slice(1, -1);
    if (text === 'true') return true;
    if (text === 'false') return false;
    if (text === 'null') return null;
    if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
    const pattern = /^\/(.*)\/([a-z]*)$/.exec(text);
    if (pattern) return new RegExp(pattern[1], pattern[2]);
    return text;
  }

  /* ---------- running it ---------- */

  const childPath = (path, key) => (typeof key === 'number' ? `${path}[${key}]` : (/^[A-Za-z_$][\w$]*$/.test(key) ? `${path}.${key}` : `${path}['${String(key).replace(/'/g, "\\'")}']`));
  const children = (node) => {
    const value = node.value;
    if (Array.isArray(value)) return value.map((x, i) => ({ path: childPath(node.path, i), value: x, key: i }));
    if (value && typeof value === 'object') return Object.keys(value).map((key) => ({ path: childPath(node.path, key), value: value[key], key: key }));
    return [];
  };

  function query(data, expression) {
    const steps = parse(expression);
    let nodes = [{ path: '$', value: data }];
    for (const step of steps) {
      const next = [];
      for (const node of nodes) {
        const value = node.value;
        if (step.type === 'keys') {
          if (value && typeof value === 'object' && !Array.isArray(value)) {
            for (const key of step.keys) if (Object.prototype.hasOwnProperty.call(value, key)) next.push({ path: childPath(node.path, key), value: value[key] });
          } else if (Array.isArray(value) && /^\d+$/.test(step.keys[0])) {
            const index = Number(step.keys[0]);
            if (index < value.length) next.push({ path: childPath(node.path, index), value: value[index] });
          }
        } else if (step.type === 'wild') {
          next.push(...children(node));
        } else if (step.type === 'descend') {
          const stack = [node];
          while (stack.length) {
            const node = stack.shift();
            next.push(node);
            stack.unshift(...children(node));
          }
        } else if (step.type === 'select') {
          for (const item of step.items) {
            if (item.key !== undefined) {
              if (value && typeof value === 'object' && !Array.isArray(value) && Object.prototype.hasOwnProperty.call(value, item.key)) next.push({ path: childPath(node.path, item.key), value: value[item.key] });
            } else if (Array.isArray(value)) {
              if (item.index !== undefined) {
                const index = item.index < 0 ? value.length + item.index : item.index;
                if (index >= 0 && index < value.length) next.push({ path: childPath(node.path, index), value: value[index] });
              } else {
                // Slice rules of RFC 9535: a negative step walks backwards ([::-1] reverses), a step of 0 selects nothing.
                // (A negative step used to loop forever and freeze the page.)
                const [start, end, sliceStep] = item.slice;
                const length = value.length;
                const fromEnd = (n) => (n < 0 ? length + n : n);
                if (sliceStep > 0) {
                  const lower = start === null ? 0 : Math.min(Math.max(fromEnd(start), 0), length);
                  const upper = end === null ? length : Math.min(Math.max(fromEnd(end), 0), length);
                  for (let index = lower; index < upper; index += sliceStep) next.push({ path: childPath(node.path, index), value: value[index] });
                } else if (sliceStep < 0) {
                  const upper = start === null ? length - 1 : Math.min(Math.max(fromEnd(start), -1), length - 1);
                  const lower = end === null ? -1 : Math.min(Math.max(fromEnd(end), -1), length - 1);
                  for (let index = upper; index > lower; index += sliceStep) next.push({ path: childPath(node.path, index), value: value[index] });
                }
              }
            }
          }
        } else if (step.type === 'filter') {
          for (const child of children(node)) if (child.value !== null && typeof child.value === 'object' ? step.test(child.value) : step.test(child.value)) next.push(child);
        }
      }
      nodes = next;
    }
    return nodes.map(({ path, value }) => ({ path, value }));
  }

  return { query, parse };
})();
