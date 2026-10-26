/**
 * Undo/Redo - one history per tab, so Ctrl+Z in one tab never changes another.
 *
 * A history is a list of snapshots of the document. The first snapshot is the document as it was before
 * the first change; every change adds the document as it is after the change. Undo and Redo move along it.
 *
 *   Structra.undoStack.push(data, 'Sort Keys A→Z')   record a state (call it before a change for the original, and after it for the result)
 *   Structra.undoStack.undo() / redo()               return the document to show, or null when there is nothing to do
 */
Structra.undoStack = (() => {
  const MAX_SNAPSHOTS = 20;
  // Each snapshot is a JSON string, so a very large document would cost 20 copies; skip those
  const MAX_SNAPSHOT_CHARS = 25 * 1024 * 1024;
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
    const h = historyOf(tabId, true);
    if (h.index >= 0 && h.stack[h.index].data === snapshot) return true;   // nothing changed
    h.stack = h.stack.slice(0, h.index + 1);                                // a new change ends the redo path
    h.stack.push({ data: snapshot, label, timestamp: Date.now() });
    if (h.stack.length > MAX_SNAPSHOTS) h.stack.shift();
    h.index = h.stack.length - 1;
    return true;
  }

  function canUndo(tabId) { const h = historyOf(tabId); return !!h && h.index > 0; }
  function canRedo(tabId) { const h = historyOf(tabId); return !!h && h.index < h.stack.length - 1; }

  function undo(tabId) {
    const h = historyOf(tabId);
    if (!h || h.index <= 0) return null;
    h.index--;
    return JSON.parse(h.stack[h.index].data);
  }

  function redo(tabId) {
    const h = historyOf(tabId);
    if (!h || h.index >= h.stack.length - 1) return null;
    h.index++;
    return JSON.parse(h.stack[h.index].data);
  }

  /** Label of the step Undo would undo, for messages like "Undid: Sort Keys A→Z" */
  function nextUndoLabel(tabId) { const h = historyOf(tabId); return h && h.index > 0 ? h.stack[h.index].label : null; }
  function nextRedoLabel(tabId) { const h = historyOf(tabId); return h && h.index < h.stack.length - 1 ? h.stack[h.index + 1].label : null; }

  function current(tabId) {
    const h = historyOf(tabId);
    if (!h || h.index < 0) return null;
    return { label: h.stack[h.index].label, index: h.index, total: h.stack.length };
  }

  function clear(tabId) { histories.delete(tabId == null ? activeTab() : tabId); }

  function getHistory(tabId) {
    const h = historyOf(tabId);
    return h ? h.stack.map((s, i) => ({ label: s.label, active: i === h.index, timestamp: s.timestamp })) : [];
  }

  // A closed tab takes its history with it
  if (Structra.events) Structra.events.on('tabs:closed', (id) => histories.delete(id));

  return { push, undo, redo, canUndo, canRedo, nextUndoLabel, nextRedoLabel, current, clear, getHistory };
})();
