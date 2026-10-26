/* ============================================================
   STRUCTRA V2 - Path Navigation History
   Structra.pathHistory - back / forward through the paths you visited.
   One history per tab.

   API:
     Structra.pathHistory.back()       → go to the previous path
     Structra.pathHistory.forward()    → go to the next path
     Structra.pathHistory.canBack()    → boolean
     Structra.pathHistory.canForward() → boolean

   Events:
     'nav:changed' → emitted whenever history or the active tab changes

   Wiring (generated from the code below; update it when you add or remove an event):
     Listens to: state:currentPath, state:jsonData, tabs:switched, tabs:closed
     Emits: nav:changed
     Sets state: currentPath
   ============================================================ */

window.Structra = window.Structra || {};

Structra.pathHistory = (() => {
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
    const timeline = current();
    if (timeline.items[timeline.index] === path) return;
    timeline.items = timeline.items.slice(0, timeline.index + 1);   // a new visit drops the forward history
    timeline.items.push(path);
    if (timeline.items.length > MAX_ENTRIES) timeline.items.shift();
    timeline.index = timeline.items.length - 1;
    Structra.events.emit('nav:changed');
  }

  function moveBy(step) {
    const timeline = current();
    const next = timeline.index + step;
    if (next < 0 || next >= timeline.items.length) return;
    timeline.index = next;
    replaying = true;
    try {
      Structra.setState('currentPath', timeline.items[next]);
    } finally {
      replaying = false;
    }
    Structra.events.emit('nav:changed');
  }

  const back = () => moveBy(-1);
  const forward = () => moveBy(1);
  const canBack = () => current().index > 0;
  const canForward = () => { const timeline = current(); return timeline.index < timeline.items.length - 1; };

  Structra.events.on('state:currentPath', (change) => record(change.value));

  // New data in a tab starts a fresh history
  Structra.events.on('state:jsonData', () => {
    stacks.set(Structra.tabs.activeId, { items: [], index: -1 });
    Structra.events.emit('nav:changed');
  });
  Structra.events.on('tabs:switched', () => Structra.events.emit('nav:changed'));
  Structra.events.on('tabs:closed', (tabId) => stacks.delete(tabId));

  return { back, forward, canBack, canForward };
})();
