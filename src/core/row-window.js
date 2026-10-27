/* ============================================================
   STRUCTRA V2 - Row Window
   Structra.rowWindow - the one door to @tanstack/virtual-core (MIT).

   For a long list of equal-height rows it answers: which rows are on screen, how tall the whole list is, and scrolls to a row.
   Nothing else in the app talks to the library, so a change or a replacement of it touches this file only.

   API:
     const win = await Structra.rowWindow.create({ scrollElement, count, rowHeight, headerHeight, onChange })
     win.items()                      → [{ index, start, end }] the rows to draw (a few extra above and below)
     win.totalSize()                  → height of the whole list in pixels
     win.margin()                     → pixels above the first row (the sticky header)
     win.scrollToIndex(index, align)  → 'auto' | 'center' | 'start' | 'end'
     win.setMeasurements({ rowHeight, headerHeight })   → correct the guesses once real heights are known
     win.destroy()
   create() rejects when the library cannot be loaded; the caller decides what to show instead.
   ============================================================ */
'use strict';

Structra.rowWindow = (() => {
  const OVERSCAN_ROWS = 12;

  async function create({ scrollElement, count, rowHeight, headerHeight, onChange }) {
    const library = await Structra.libraryLoader.loadLibrary('virtualcore');
    let height = rowHeight;
    let header = headerHeight;

    // The sticky header sits above the first row, inside the scrolling box, so the first row starts below it
    // and scrolling to a row must not leave it under the header.
    const options = () => ({
      count,
      getScrollElement: () => scrollElement,
      estimateSize: () => height,
      overscan: OVERSCAN_ROWS,
      scrollMargin: header,
      scrollPaddingStart: header,
      observeElementRect: library.observeElementRect,
      observeElementOffset: library.observeElementOffset,
      scrollToFn: library.elementScroll,
      onChange: () => onChange && onChange(),
    });

    const virtualizer = new library.Virtualizer(options());
    const unmount = virtualizer._didMount();
    virtualizer._willUpdate();

    return {
      items: () => virtualizer.getVirtualItems(),
      totalSize: () => virtualizer.getTotalSize(),
      margin: () => virtualizer.options.scrollMargin,
      scrollToIndex: (index, align = 'auto') => virtualizer.scrollToIndex(index, { align }),
      setMeasurements({ rowHeight: newRowHeight, headerHeight: newHeaderHeight }) {
        if (newRowHeight) height = newRowHeight;
        if (newHeaderHeight) header = newHeaderHeight;
        virtualizer.setOptions(options());
        virtualizer.measure();
      },
      destroy() { unmount(); },
    };
  }

  return { create };
})();
