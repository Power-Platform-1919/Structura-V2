/* ============================================================
   STRUCTRA V2 - Path Navigation History
   Structra.nav - back / forward through the paths you visited.
   One history per tab.

   API:
     Structra.nav.back()       → go to the previous path
     Structra.nav.forward()    → go to the next path
     Structra.nav.canBack()    → boolean
     Structra.nav.canForward() → boolean

   Events:
     'nav:changed' → emitted whenever history or the active tab changes
   ============================================================ */

window.Structra = window.Structra || {};

Structra.nav = (() => {
  const MAX_ENTRIES = 100;
  const stacks = new Map();     // tabId → { items: string[], index: number }
  let replaying = false;        // true while back/forward sets the path itself

  function current() {
    const id = Structra.tabs.activeId;
    if (!stacks.has(id)) stacks.set(id, { items: [], index: -1 });
    return stacks.get(id);
  }

  function record(path) {
    if (replaying || !path) return;
    const s = current();
    if (s.items[s.index] === path) return;
    s.items = s.items.slice(0, s.index + 1);   // a new visit drops the forward history
    s.items.push(path);
    if (s.items.length > MAX_ENTRIES) s.items.shift();
    s.index = s.items.length - 1;
    Structra.events.emit('nav:changed');
  }

  function go(step) {
    const s = current();
    const next = s.index + step;
    if (next < 0 || next >= s.items.length) return;
    s.index = next;
    replaying = true;
    try {
      Structra.set('currentPath', s.items[next]);
    } finally {
      replaying = false;
    }
    Structra.events.emit('nav:changed');
  }

  const back = () => go(-1);
  const forward = () => go(1);
  const canBack = () => current().index > 0;
  const canForward = () => { const s = current(); return s.index < s.items.length - 1; };

  Structra.events.on('state:currentPath', (d) => record(d.value));

  // New data in a tab starts a fresh history
  Structra.events.on('state:jsonData', () => {
    stacks.set(Structra.tabs.activeId, { items: [], index: -1 });
    Structra.events.emit('nav:changed');
  });
  Structra.events.on('tabs:switched', () => Structra.events.emit('nav:changed'));
  Structra.events.on('tabs:closed', (tabId) => stacks.delete(tabId));

  return { back, forward, canBack, canForward };
})();
