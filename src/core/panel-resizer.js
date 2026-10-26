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
  const KEY = (name) => 'structra.panelWidth.' + name;
  const STEP = 16;

  function readSaved(name) {
    try {
      const v = parseInt(localStorage.getItem(KEY(name)), 10);
      return Number.isFinite(v) ? v : null;
    } catch { return null; }
  }

  function save(name, px) {
    try { localStorage.setItem(KEY(name), String(px)); } catch { /* storage unavailable */ }
  }

  function attach(panel, opts) {
    if (!panel || panel.querySelector(':scope > .panel-resizer')) return;
    const { name, edge, cssVar, min = 200, max = 640 } = opts;
    const clamp = (px) => Math.max(min, Math.min(max, Math.round(px)));
    const apply = (px) => document.documentElement.style.setProperty(cssVar, px + 'px');

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

    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      handle.classList.add('dragging');
      document.body.style.userSelect = 'none';
      const startX = e.clientX;
      const startW = panel.getBoundingClientRect().width;
      const sign = edge === 'right' ? 1 : -1;

      const move = (ev) => apply(clamp(startW + sign * (ev.clientX - startX)));
      const up = () => {
        handle.classList.remove('dragging');
        document.body.style.userSelect = '';
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        save(name, Math.round(panel.getBoundingClientRect().width));
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
    });

    handle.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const grow = (e.key === 'ArrowRight') === (edge === 'right');
      const next = clamp(panel.getBoundingClientRect().width + (grow ? STEP : -STEP));
      apply(next);
      save(name, next);
    });

    handle.addEventListener('dblclick', () => {
      document.documentElement.style.removeProperty(cssVar);
      try { localStorage.removeItem(KEY(name)); } catch { /* storage unavailable */ }
    });
  }

  return { attach };
})();
