/* ============================================================
   STRUCTRA V2 - Command matching
   Structra.commandMatch.rank(commands, query) → the commands that match the typed text, best first.

   Order of the answer:
     1. the label starts with the text           ("exp" → Export as CSV)
     2. the label contains the text
     3. the id, the category or the extra search words contain the text
     4. a close match, from 5 letters on: the words are found in any order and with one typo ("exprt", "col exp", "tabel"), ranked by uFuzzy
   Exact matches (1 to 3) keep the order of the command list inside each group, and are always shown before a close match.
   uFuzzy (https://github.com/leeoniya/uFuzzy, MIT, src/libs/ufuzzy) does step 4. Without it, steps 1 to 3 still work.
   ============================================================ */

/* global uFuzzy */
window.Structra = window.Structra || {};

Structra.commandMatch = (() => {
  let finder = null;
  const OUT_OF_ORDER = 5;
  // Close matches start at 5 letters: with fewer, one missing letter matches too much ("sort" would offer "Keyboard Shortcuts")
  const MIN_CLOSE_LETTERS = 5;

  function fuzzyFinder() {
    if (finder === null) finder = typeof uFuzzy === 'function' ? new uFuzzy({ intraMode: 1 }) : false;
    return finder;
  }

  const text = (command) => [command.label, command.cat || '', command.id, command.keys || ''].join(' ');

  function rank(commands, query) {
    const needle = String(query || '').toLowerCase().trim();
    if (!needle) return commands.slice();
    const starts = [];
    const contains = [];
    const around = [];
    const rest = [];
    for (const command of commands) {
      const label = command.label.toLowerCase();
      if (label.startsWith(needle)) starts.push(command);
      else if (label.includes(needle)) contains.push(command);
      else if (command.id.includes(needle) || (command.cat && command.cat.toLowerCase().includes(needle)) || (command.keys && command.keys.includes(needle))) around.push(command);
      else rest.push(command);
    }
    const exact = [...starts, ...contains, ...around];
    const finderNow = fuzzyFinder();
    if (!finderNow || !rest.length || needle.split(' ').join('').length < MIN_CLOSE_LETTERS) return exact;
    // uFuzzy needs a haystack of strings; the answer is the positions in it, best first
    const [positions, , order] = finderNow.search(rest.map(text), needle, OUT_OF_ORDER);
    if (!positions || !positions.length) return exact;
    const close = order ? order.map((at) => rest[positions[at]]) : positions.map((at) => rest[at]);
    return [...exact, ...close];
  }

  return { rank };
})();
