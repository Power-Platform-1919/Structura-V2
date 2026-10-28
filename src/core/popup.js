/* ============================================================
   STRUCTRA V2 - Popup
   Structra.popup.watch(element, options) - the one place that closes a floating menu or panel.

   A menu, a dropdown or a small panel that is added to the page (context menus, the column menu, the bookmark list, a summary box) must close:
     - when the pointer goes down anywhere outside it,
     - when Escape is pressed (only the popup in front closes; a dialog behind it stays),
     - when another popup opens (one at a time), and
     - when the window loses the focus, if asked.
   and every listener must be removed when it closes, however it closed. Before this module each menu wrote that for itself (eight places),
   and some left a key listener behind after an outside click.

   Usage:
     const popup = Structra.popup.watch(menu, { anchor: button, closeOnBlur: true, onClose: () => { this._menu = null; } });
     popup.close();            // from a menu item, or from anywhere: removes the element, the listeners, and calls onClose once
   options: anchor (a click on it does not count as outside: the button that opens and closes it), closeOnBlur, onClose, keep (do not remove
   the element when it closes), stay (do not close the other popups).
   Structra.popup.closeTop() closes the popup in front and returns true when there was one; Structra.popup.count() says how many are open.
   ============================================================ */

window.Structra = window.Structra || {};

Structra.popup = (() => {
  const open = [];
  // a popup whose element was taken off the page by other code is finished: close it, so it does not take an Escape
  const prune = () => { for (const popup of [...open]) if (!popup.element.isConnected) popup.close(); };

  function watch(element, options = {}) {
    prune();
    if (!options.stay) for (const other of [...open]) other.close();
    const controller = new AbortController();
    let closed = false;
    const popup = {
      element,
      close() {
        if (closed) return;
        closed = true;
        controller.abort();
        const at = open.indexOf(popup);
        if (at >= 0) open.splice(at, 1);
        if (!options.keep && element.isConnected) element.remove();
        if (options.onClose) options.onClose();
      },
    };
    open.push(popup);
    // The pointer listener starts at once: the pointer-down that opened the popup (a right-click, a click on its button) has already been
    // delivered, so it cannot close the popup. (A short wait here left a moment in which a click outside did nothing.)
    const inside = (target) => element.contains(target) || (options.anchor && options.anchor.contains(target));
    document.addEventListener('mousedown', (event) => { if (!inside(event.target)) popup.close(); }, { capture: true, signal: controller.signal });
    if (options.closeOnBlur) window.addEventListener('blur', () => popup.close(), { signal: controller.signal });
    return popup;
  }

  function closeTop() {
    prune();
    const front = open[open.length - 1];
    if (!front) return false;
    front.close();
    return true;
  }

  // Escape closes the popup in front and nothing else: the listener comes first (capture) and stops the key there
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    prune();
    if (!open.length) return;
    event.stopPropagation();
    closeTop();
  }, true);

  return { watch, closeTop, count: () => open.length };
})();
