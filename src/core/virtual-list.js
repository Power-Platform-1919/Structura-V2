/* ============================================================
   STRUCTRA V2 - Virtual List
   Generic chunked virtualization with IntersectionObserver-based
   loading, DOM recycling, and rehydration.

   Used by: tree view, table view (virtual scroll), graph view.
   All rendering logic is delegated to callbacks - this module
   only manages chunks, sentinels, and visibility.

   API:
     Structra.virtualList.create(opts) → VirtualListController

   Options:
     container    : HTMLElement - scrollable container
     totalItems   : number - total data items
     chunkSize    : number - items per chunk (default 100)
     offscreenPx  : number - px buffer before recycling (default 3000)
     buildChunk   : (start, end, total) → string|HTMLElement - render items
     rehydrate    : (chunkEl, start, end, total) → void - re-render recycled chunk
     sentinelHtml : (remaining, start) → string - sentinel placeholder text
     onChunkLoaded: (chunkEl, start, end) → void - post-insert hook (optional)

   Controller:
     .loadAll()         - force-load all remaining chunks
     .destroy()         - disconnect observers, remove handlers
     .getChunk(index)   - get chunk element containing item at index
     .scrollToItem(idx) - scroll to make item visible
     .applyToChunks(fn) - iterate all chunk elements
     .reset(totalItems) - reset with new total
   ============================================================ */

window.Structra = window.Structra || {};

Structra.virtualList = (() => {

  function create(options) {
    const {
      container,
      totalItems,
      chunkSize = 100,
      offscreenPx = 3000,
      buildChunk,
      rehydrate,
      sentinelHtml,
      onChunkLoaded,
      root: scrollRoot = container,   // element that scrolls (observer root)
      chunkTag = 'div',               // 'tbody' when the container is a <table>
      sentinelTag = chunkTag,
    } = options;

    let _total = totalItems;
    let _loadObserver = null;
    let _recycleObserver = null;
    let _chunkId = 0;
    let _destroyed = false;

    /* --- Sentinel Factory --- */
    function makeSentinel(start) {
      const remaining = _total - start;
      const element = document.createElement(sentinelTag);
      element.className = 'vl-sentinel';
      element.dataset.vlStart = start;
      element.dataset.vlTotal = _total;
      if (sentinelHtml) {
        element.innerHTML = sentinelHtml(remaining, start);
      } else {
        element.innerHTML = `<span class="vl-muted">// ${remaining} more items…</span>`;
      }
      return element;
    }

    /* --- Chunk Wrapper --- */
    function wrapChunk(content, start, end) {
      const element = document.createElement(chunkTag);
      element.className = 'vl-chunk';
      element.dataset.vlStart = start;
      element.dataset.vlEnd = end;
      element.dataset.vlTotal = _total;
      element.id = 'vlc' + (_chunkId++);

      if (typeof content === 'string') {
        element.innerHTML = content;
      } else if (content instanceof HTMLElement) {
        element.appendChild(content);
      }

      return element;
    }

    /* --- Recycle / Rehydrate --- */
    function recycleChunk(chunk) {
      const height = chunk.offsetHeight;
      if (height === 0) return;
      chunk.dataset.vlRecycled = '1';
      if (chunk.tagName === 'TBODY') {
        // An empty row group collapses, so keep its height with a spacer row
        chunk.innerHTML = `<tr class="vl-spacer" style="height:${height}px"><td></td></tr>`;
      } else {
        chunk.innerHTML = '';
        chunk.style.height = height + 'px';
      }
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
      const chunkElement = wrapChunk(content, start, end);

      // Insert before sentinel
      sentinel.parentNode.insertBefore(chunkElement, sentinel);

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
        _recycleObserver.observe(chunkElement);
      }

      if (onChunkLoaded) onChunkLoaded(chunkElement, start, end);
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
      }, { root: scrollRoot, rootMargin: '400px' });

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
      }, { root: scrollRoot, rootMargin: `${offscreenPx}px` });

      // Observe existing sentinels and chunks
      container.querySelectorAll('.vl-sentinel').forEach(startIndex => _loadObserver.observe(startIndex));
      container.querySelectorAll('.vl-chunk').forEach(element => {
        if (parseInt(element.dataset.vlTotal) > chunkSize) _recycleObserver.observe(element);
      });
    }

    /* --- Initial Render --- */
    function init() {
      if (_total <= 0) return;

      // Render first chunk inline
      const firstEnd = Math.min(_total, chunkSize);
      const content = buildChunk(0, firstEnd, _total);
      const chunkElement = wrapChunk(content, 0, firstEnd);
      container.appendChild(chunkElement);
      if (onChunkLoaded) onChunkLoaded(chunkElement, 0, firstEnd);

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
      for (const chunk of chunks) {
        const startIndex = parseInt(chunk.dataset.vlStart);
        const endIndex = parseInt(chunk.dataset.vlEnd);
        if (index >= startIndex && index < endIndex) return chunk;
      }
      return null;
    }

    function scrollToItem(index) {
      const chunk = getChunk(index);
      if (chunk) {
        chunk.scrollIntoView({ block: 'center', behavior: 'instant' });
      }
    }

    function applyToChunks(callback) {
      container.querySelectorAll('.vl-chunk').forEach(callback);
    }

    function reset(newTotal) {
      destroy();
      _total = newTotal;
      _chunkId = 0;
      // Only remove what this list created (the container may also hold a table header)
      container.querySelectorAll(':scope > .vl-chunk, :scope > .vl-sentinel').forEach((element) => element.remove());
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
