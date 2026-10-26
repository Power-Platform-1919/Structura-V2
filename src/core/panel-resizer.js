/* ============================================================
   STRUCTRA V2 - Panel Resizer
   Structra.panelResizer - drag a panel edge to change its width.
   The width lives in a CSS variable, so layout.css stays in charge,
   and the chosen width is remembered between visits.

   API:
     Structra.panelResizer.attach(panel, { name, edge, cssVar, min, max })
       panel   the element to resize
       name    storage key suffix, e.g. 'query'
       edge    'right' for a panel on the left side of the page, 'left' for one on the right
       cssVar  e.g. '--query-panel-w'
       min/max width limits in px

   The handle is keyboard accessible: focus it and use the arrow keys.
   ============================================================ */

window.Structra = window.Structra || {};

Structra.panelResizer = (() => {
  const storageKey = (name) => 'structra.panelWidth.' + name;
  const KEYBOARD_STEP_PIXELS = 16;

  function readSaved(name) {
    try {
      const saved = parseInt(localStorage.getItem(storageKey(name)), 10);
      return Number.isFinite(saved) ? saved : null;
    } catch { return null; }
  }

  function save(name, pixels) {
    try { localStorage.setItem(storageKey(name), String(pixels)); } catch { /* storage unavailable */ }
  }

  function attach(panel, options) {
    if (!panel || panel.querySelector(':scope > .panel-resizer')) return;
    const { name, edge, cssVar, min = 200, max = 640 } = options;
    const clamp = (pixels) => Math.max(min, Math.min(max, Math.round(pixels)));
    const apply = (pixels) => document.documentElement.style.setProperty(cssVar, pixels + 'px');

    const saved = readSaved(name);
    if (saved !== null) apply(clamp(saved));

    const handle = document.createElement('div');
    handle.className = 'panel-resizer panel-resizer-' + edge;
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-orientation', 'vertical');
    handle.setAttribute('aria-label', 'Resize ' + name + ' panel');
    handle.tabIndex = 0;
    handle.title = 'Drag to resize';
    panel.appendChild(handle);

    handle.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      handle.setPointerCapture(event.pointerId);
      handle.classList.add('dragging');
      document.body.style.userSelect = 'none';
      const startX = event.clientX;
      const startW = panel.getBoundingClientRect().width;
      const sign = edge === 'right' ? 1 : -1;

      const move = (event) => apply(clamp(startW + sign * (event.clientX - startX)));
      const stopDragging = () => {
        handle.classList.remove('dragging');
        document.body.style.userSelect = '';
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', stopDragging);
        save(name, Math.round(panel.getBoundingClientRect().width));
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', stopDragging);
    });

    handle.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const grow = (event.key === 'ArrowRight') === (edge === 'right');
      const next = clamp(panel.getBoundingClientRect().width + (grow ? KEYBOARD_STEP_PIXELS : -KEYBOARD_STEP_PIXELS));
      apply(next);
      save(name, next);
    });

    handle.addEventListener('dblclick', () => {
      document.documentElement.style.removeProperty(cssVar);
      try { localStorage.removeItem(storageKey(name)); } catch { /* storage unavailable */ }
    });
  }

  return { attach };
})();
