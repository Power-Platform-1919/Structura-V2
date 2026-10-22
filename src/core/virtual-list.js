/* ============================================================
   STRUCTRA V2 — Virtual List
   Generic chunked virtualization with IntersectionObserver-based
   loading, DOM recycling, and rehydration.

   Used by: tree view, table view (virtual scroll), graph view.
   All rendering logic is delegated to callbacks — this module
   only manages chunks, sentinels, and visibility.

   API:
     Structra.virtualList.create(opts) → VirtualListController

   Options:
     container    : HTMLElement — scrollable container
     totalItems   : number — total data items
     chunkSize    : number — items per chunk (default 100)
     offscreenPx  : number — px buffer before recycling (default 3000)
     buildChunk   : (start, end, total) → string|HTMLElement — render items
     rehydrate    : (chunkEl, start, end, total) → void — re-render recycled chunk
     sentinelHtml : (remaining, start) → string — sentinel placeholder text
     onChunkLoaded: (chunkEl, start, end) → void — post-insert hook (optional)

   Controller:
     .loadAll()         — force-load all remaining chunks
     .destroy()         — disconnect observers, remove handlers
     .getChunk(index)   — get chunk element containing item at index
     .scrollToItem(idx) — scroll to make item visible
     .applyToChunks(fn) — iterate all chunk elements
     .reset(totalItems) — reset with new total
   ============================================================ */

window.Structra = window.Structra || {};

Structra.virtualList = (() => {

  function create(opts) {
    const {
      container,
      totalItems,
      chunkSize = 100,
      offscreenPx = 3000,
      buildChunk,
      rehydrate,
      sentinelHtml,
      onChunkLoaded,
    } = opts;

    let _total = totalItems;
    let _loadObserver = null;
    let _recycleObserver = null;
    let _chunkId = 0;
    let _destroyed = false;

    /* --- Sentinel Factory --- */
    function makeSentinel(start) {
      const remaining = _total - start;
      const el = document.createElement('div');
      el.className = 'vl-sentinel';
      el.dataset.vlStart = start;
      el.dataset.vlTotal = _total;
      if (sentinelHtml) {
        el.innerHTML = sentinelHtml(remaining, start);
      } else {
        el.innerHTML = `<span class="vl-muted">// ${remaining} more items…</span>`;
      }
      return el;
    }

    /* --- Chunk Wrapper --- */
    function wrapChunk(content, start, end) {
      const el = document.createElement('div');
      el.className = 'vl-chunk';
      el.dataset.vlStart = start;
      el.dataset.vlEnd = end;
      el.dataset.vlTotal = _total;
      el.id = 'vlc' + (_chunkId++);

      if (typeof content === 'string') {
        el.innerHTML = content;
      } else if (content instanceof HTMLElement) {
        el.appendChild(content);
      }

      return el;
    }

    /* --- Recycle / Rehydrate --- */
    function recycleChunk(chunk) {
      const h = chunk.offsetHeight;
      if (h === 0) return;
      chunk.dataset.vlRecycled = '1';
      chunk.innerHTML = '';
      chunk.style.height = h + 'px';
    }

    function rehydrateChunk(chunk) {
      const start = parseInt(chunk.dataset.vlStart);
      const end = parseInt(chunk.dataset.vlEnd);
      const total = parseInt(chunk.dataset.vlTotal);

      if (rehydrate) {
        rehydrate(chunk, start, end, total);
      } else if (buildChunk) {
        const content = buildChunk(start, end, total);
        if (typeof content === 'string') chunk.innerHTML = content;
        else if (content instanceof HTMLElement) {
          chunk.innerHTML = '';
          chunk.appendChild(content);
        }
      }

      chunk.style.height = '';
      delete chunk.dataset.vlRecycled;
    }

    /* --- Load Next Chunk --- */
    function loadNextChunk(sentinel) {
      const start = parseInt(sentinel.dataset.vlStart);
      const total = parseInt(sentinel.dataset.vlTotal);
      const end = Math.min(start + chunkSize, total);

      // Build chunk content
      const content = buildChunk(start, end, total);
      const chunkEl = wrapChunk(content, start, end);

      // Insert before sentinel
      sentinel.parentNode.insertBefore(chunkEl, sentinel);

      // Update or remove sentinel
      if (end < total) {
        sentinel.dataset.vlStart = end;
        const remaining = total - end;
        if (sentinelHtml) {
          sentinel.innerHTML = sentinelHtml(remaining, end);
        } else {
          sentinel.innerHTML = `<span class="vl-muted">// ${remaining} more items…</span>`;
        }
        if (_loadObserver) _loadObserver.observe(sentinel);
      } else {
        sentinel.remove();
      }

      // Observe for recycling if total > chunkSize
      if (_recycleObserver && total > chunkSize) {
        _recycleObserver.observe(chunkEl);
      }

      if (onChunkLoaded) onChunkLoaded(chunkEl, start, end);
    }

    /* --- Setup Observers --- */
    function setupObservers() {
      // Forward loading observer
      _loadObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            _loadObserver.unobserve(entry.target);
            loadNextChunk(entry.target);
          }
        }
      }, { root: container, rootMargin: '400px' });

      // Recycle/rehydrate observer
      _recycleObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          const chunk = entry.target;
          if (!entry.isIntersecting) {
            if (!chunk.dataset.vlRecycled) recycleChunk(chunk);
          } else {
            if (chunk.dataset.vlRecycled) rehydrateChunk(chunk);
          }
        }
      }, { root: container, rootMargin: `${offscreenPx}px` });

      // Observe existing sentinels and chunks
      container.querySelectorAll('.vl-sentinel').forEach(s => _loadObserver.observe(s));
      container.querySelectorAll('.vl-chunk').forEach(c => {
        if (parseInt(c.dataset.vlTotal) > chunkSize) _recycleObserver.observe(c);
      });
    }

    /* --- Initial Render --- */
    function init() {
      if (_total <= 0) return;

      // Render first chunk inline
      const firstEnd = Math.min(_total, chunkSize);
      const content = buildChunk(0, firstEnd, _total);
      const chunkEl = wrapChunk(content, 0, firstEnd);
      container.appendChild(chunkEl);
      if (onChunkLoaded) onChunkLoaded(chunkEl, 0, firstEnd);

      // Add sentinel for remaining items
      if (_total > chunkSize) {
        const sentinel = makeSentinel(chunkSize);
        container.appendChild(sentinel);
      }

      setupObservers();
    }

    /* --- Public Controller --- */
    function destroy() {
      _destroyed = true;
      if (_loadObserver) { _loadObserver.disconnect(); _loadObserver = null; }
      if (_recycleObserver) { _recycleObserver.disconnect(); _recycleObserver = null; }
    }

    function loadAll() {
      let sentinel = container.querySelector('.vl-sentinel');
      let safety = 0;
      while (sentinel && safety++ < 10000) {
        loadNextChunk(sentinel);
        sentinel = container.querySelector('.vl-sentinel');
      }
    }

    function getChunk(index) {
      const chunks = container.querySelectorAll('.vl-chunk');
      for (const c of chunks) {
        const s = parseInt(c.dataset.vlStart);
        const e = parseInt(c.dataset.vlEnd);
        if (index >= s && index < e) return c;
      }
      return null;
    }

    function scrollToItem(index) {
      const chunk = getChunk(index);
      if (chunk) {
        chunk.scrollIntoView({ block: 'center', behavior: 'instant' });
      }
    }

    function applyToChunks(fn) {
      container.querySelectorAll('.vl-chunk').forEach(fn);
    }

    function reset(newTotal) {
      destroy();
      _total = newTotal;
      _chunkId = 0;
      container.innerHTML = '';
      init();
    }

    return {
      init,
      destroy,
      loadAll,
      getChunk,
      scrollToItem,
      applyToChunks,
      reset,
      get destroyed() { return _destroyed; },
      get container() { return container; },
    };
  }

  return { create };
})();
