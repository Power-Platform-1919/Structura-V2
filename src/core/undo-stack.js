/**
 * Undo/Redo - one history per tab, so Ctrl+Z in one tab never changes another.
 *
 * A history is a list of snapshots of the document. The first snapshot is the document as it was before
 * the first change; every change adds the document as it is after the change. Undo and Redo move along it.
 *
 *   Structra.undoStack.push(data, 'Sort Keys A→Z')   record a state (call it before a change for the original, and after it for the result)
 *   Structra.undoStack.undo() / redo()               return the document to show, or null when there is nothing to do
 *
 * Wiring (generated from the code below; update it when you add or remove an event):
 *   Listens to: tabs:closed
 */
Structra.undoStack = (() => {
  const MAX_SNAPSHOTS = 20;
  // Each snapshot is a JSON string, so a very large document would cost 20 copies; skip those
  const MAX_SNAPSHOT_CHARS = 25 * 1024 * 1024;
  // ...and the steps of one tab together stay under this, so 20 steps of a 20 MB file do not hold 400 MB: the oldest go first,
  // but the last two always stay (the document and the step before it), so one Undo is always there
  const MAX_TAB_CHARS = 60 * 1024 * 1024;
  const histories = new Map();   // tabId → { stack: [{ data, label, timestamp }], index }

  const activeTab = () => Structra.tabs && Structra.tabs.activeId;
  const historyOf = (tabId, create) => {
    const id = tabId == null ? activeTab() : tabId;
    if (!histories.has(id) && create) histories.set(id, { stack: [], index: -1 });
    return histories.get(id) || null;
  };

  /**
   * Record a state of the document.
   * @returns {boolean} false when the document is too large to keep a copy of (the change cannot be undone)
   */
  function push(data, label, tabId) {
    const snapshot = JSON.stringify(data);
    if (snapshot.length > MAX_SNAPSHOT_CHARS) return false;
    const tabHistory = historyOf(tabId, true);
    if (tabHistory.index >= 0 && tabHistory.stack[tabHistory.index].data === snapshot) return true;   // nothing changed
    tabHistory.stack = tabHistory.stack.slice(0, tabHistory.index + 1);                                // a new change ends the redo path
    tabHistory.stack.push({ data: snapshot, label, timestamp: Date.now() });
    if (tabHistory.stack.length > MAX_SNAPSHOTS) tabHistory.stack.shift();
    let held = tabHistory.stack.reduce((sum, step) => sum + step.data.length, 0);
    while (held > MAX_TAB_CHARS && tabHistory.stack.length > 2) held -= tabHistory.stack.shift().data.length;
    tabHistory.index = tabHistory.stack.length - 1;
    return true;
  }

  function canUndo(tabId) { const tabHistory = historyOf(tabId); return !!tabHistory && tabHistory.index > 0; }
  function canRedo(tabId) { const tabHistory = historyOf(tabId); return !!tabHistory && tabHistory.index < tabHistory.stack.length - 1; }

  function undo(tabId) {
    const tabHistory = historyOf(tabId);
    if (!tabHistory || tabHistory.index <= 0) return null;
    tabHistory.index--;
    return JSON.parse(tabHistory.stack[tabHistory.index].data);
  }

  function redo(tabId) {
    const tabHistory = historyOf(tabId);
    if (!tabHistory || tabHistory.index >= tabHistory.stack.length - 1) return null;
    tabHistory.index++;
    return JSON.parse(tabHistory.stack[tabHistory.index].data);
  }

  /** Label of the step Undo would undo, for messages like "Undid: Sort Keys A→Z" */
  function nextUndoLabel(tabId) { const tabHistory = historyOf(tabId); return tabHistory && tabHistory.index > 0 ? tabHistory.stack[tabHistory.index].label : null; }
  function nextRedoLabel(tabId) { const tabHistory = historyOf(tabId); return tabHistory && tabHistory.index < tabHistory.stack.length - 1 ? tabHistory.stack[tabHistory.index + 1].label : null; }

  function current(tabId) {
    const tabHistory = historyOf(tabId);
    if (!tabHistory || tabHistory.index < 0) return null;
    return { label: tabHistory.stack[tabHistory.index].label, index: tabHistory.index, total: tabHistory.stack.length };
  }

  function clear(tabId) { histories.delete(tabId == null ? activeTab() : tabId); }

  function getHistory(tabId) {
    const tabHistory = historyOf(tabId);
    return tabHistory ? tabHistory.stack.map((snapshot, i) => ({ label: snapshot.label, active: i === tabHistory.index, timestamp: snapshot.timestamp })) : [];
  }

  // A closed tab takes its history with it
  if (Structra.events) Structra.events.on('tabs:closed', (id) => histories.delete(id));

  return { push, undo, redo, canUndo, canRedo, nextUndoLabel, nextRedoLabel, current, clear, getHistory };
})();
