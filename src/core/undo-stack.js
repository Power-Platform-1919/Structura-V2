/**
 * Undo/Redo - one history per tab, so Ctrl+Z in one tab never changes another.
 *
 * A history is a list of steps. The first step is the document as it was before the first change; every change adds a step.
 * Undo and Redo move along the list. Only the document at the current step is kept whole (as JSON text); every other step is kept as
 * the small edit that leads to it from the one before: the part of the text that was taken out and the part that was put in, found
 * by cutting away what the two texts share at the start and at the end. A one-key change in a 20 MB file costs a few bytes instead of
 * another 20 MB, so all the steps fit where only three whole copies used to.
 *
 *   Structra.undoStack.push(data, 'Sort Keys A→Z')   record a state (call it before a change for the original, and after it for the result)
 *   Structra.undoStack.undo() / redo()               return the document to show, or null when there is nothing to do
 *
 * Wiring (generated from the code below; update it when you add or remove an event):
 *   Listens to: tabs:closed
 */
Structra.undoStack = (() => {
  const MAX_STEPS = 50;
  // A change is found by comparing two copies of the text, so a very large document is skipped (it could not be undone)
  const MAX_SNAPSHOT_CHARS = 25 * 1024 * 1024;
  // The edits of one tab together (the whole copy not counted) stay under this: the oldest go first, but the last two steps always stay,
  // so one Undo is always there. A change that rewrites most of the document (sort, replace all) is an edit as big as the document.
  const MAX_EDIT_CHARS = 60 * 1024 * 1024;
  // tabId → { steps: [{ label, timestamp, edit }], index, text }.  text is the document at steps[index].
  // edit (steps after the first): { at, taken, put }  the step before has `taken` where this one has `put`, both starting at position `at`
  const histories = new Map();

  const activeTab = () => Structra.tabs && Structra.tabs.activeId;
  const historyOf = (tabId, create) => {
    const id = tabId == null ? activeTab() : tabId;
    if (!histories.has(id) && create) histories.set(id, { steps: [], index: -1, text: '' });
    return histories.get(id) || null;
  };

  /** The edit that turns text `before` into text `after` */
  function editBetween(before, after) {
    const shortest = Math.min(before.length, after.length);
    let start = 0;
    while (start < shortest && before.charCodeAt(start) === after.charCodeAt(start)) start++;
    let end = 0;
    while (end < shortest - start && before.charCodeAt(before.length - 1 - end) === after.charCodeAt(after.length - 1 - end)) end++;
    return { at: start, taken: before.slice(start, before.length - end), put: after.slice(start, after.length - end) };
  }

  /** Text after the step `edit` leads to (forward), or before it (backward) */
  function apply(text, edit, forward) {
    const out = forward ? edit.put : edit.taken;
    const was = forward ? edit.taken : edit.put;
    return text.slice(0, edit.at) + out + text.slice(edit.at + was.length);
  }

  /**
   * Record a state of the document.
   * @returns {boolean} false when the document is too large to keep a copy of (the change cannot be undone)
   */
  function push(data, label, tabId) {
    const snapshot = JSON.stringify(data);
    if (snapshot.length > MAX_SNAPSHOT_CHARS) return false;
    const history = historyOf(tabId, true);
    if (history.index >= 0 && history.text === snapshot) return true;     // nothing changed
    history.steps = history.steps.slice(0, history.index + 1);            // a new change ends the redo path
    const step = { label, timestamp: Date.now(), edit: null };
    if (history.index >= 0) step.edit = editBetween(history.text, snapshot);
    history.steps.push(step);
    history.text = snapshot;
    history.index = history.steps.length - 1;
    // keep within the limits: the oldest step goes, and the step after it becomes the first (it no longer needs its edit)
    const dropOldest = () => { history.steps.shift(); history.steps[0].edit = null; history.index--; };
    while (history.steps.length > MAX_STEPS) dropOldest();
    let held = history.steps.reduce((sum, item) => sum + (item.edit ? item.edit.taken.length + item.edit.put.length : 0), 0);
    while (held > MAX_EDIT_CHARS && history.steps.length > 2) {
      const next = history.steps[1].edit;
      held -= next ? next.taken.length + next.put.length : 0;
      dropOldest();
    }
    return true;
  }

  function canUndo(tabId) { const history = historyOf(tabId); return !!history && history.index > 0; }
  function canRedo(tabId) { const history = historyOf(tabId); return !!history && history.index < history.steps.length - 1; }

  function undo(tabId) {
    const history = historyOf(tabId);
    if (!history || history.index <= 0) return null;
    history.text = apply(history.text, history.steps[history.index].edit, false);
    history.index--;
    return JSON.parse(history.text);
  }

  function redo(tabId) {
    const history = historyOf(tabId);
    if (!history || history.index >= history.steps.length - 1) return null;
    history.index++;
    history.text = apply(history.text, history.steps[history.index].edit, true);
    return JSON.parse(history.text);
  }

  /** Label of the step Undo would undo, for messages like "Undid: Sort Keys A→Z" */
  function nextUndoLabel(tabId) { const history = historyOf(tabId); return history && history.index > 0 ? history.steps[history.index].label : null; }
  function nextRedoLabel(tabId) { const history = historyOf(tabId); return history && history.index < history.steps.length - 1 ? history.steps[history.index + 1].label : null; }

  function current(tabId) {
    const history = historyOf(tabId);
    if (!history || history.index < 0) return null;
    return { label: history.steps[history.index].label, index: history.index, total: history.steps.length };
  }

  function clear(tabId) { histories.delete(tabId == null ? activeTab() : tabId); }

  function getHistory(tabId) {
    const history = historyOf(tabId);
    return history ? history.steps.map((step, i) => ({ label: step.label, active: i === history.index, timestamp: step.timestamp })) : [];
  }

  /** How much text the history of a tab holds: the whole copy and the edits (for tests and for checking memory) */
  function sizeOf(tabId) {
    const history = historyOf(tabId);
    if (!history) return { whole: 0, edits: 0, steps: 0 };
    return { whole: history.text.length, edits: history.steps.reduce((sum, step) => sum + (step.edit ? step.edit.taken.length + step.edit.put.length : 0), 0), steps: history.steps.length };
  }

  // A closed tab takes its history with it
  if (Structra.events) Structra.events.on('tabs:closed', (id) => histories.delete(id));

  return { push, undo, redo, canUndo, canRedo, nextUndoLabel, nextRedoLabel, current, clear, getHistory, sizeOf };
})();
