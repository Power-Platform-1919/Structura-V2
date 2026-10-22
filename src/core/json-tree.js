/* ============================================================
   STRUCTRA V2 — JSON Tree Renderer
   Chunked, virtualized JSON tree view with:
   - IntersectionObserver-based lazy chunk loading
   - DOM recycling (offscreen chunks replaced with placeholders)
   - Chunk rehydration on scroll-back
   - Collapse/expand with depth control
   - Inline value editing
   - Key occurrence highlighting
   - Data-level filter (persists across recycle/rehydrate)
   - Path highlighting + bookmark support

   Uses Structra.virtualList for chunking mechanics when rendering
   large arrays. Object/primitive rendering is inline (no chunking).

   API:
     Structra.jsonTree.render(container, data, opts)
     Structra.jsonTree.expandAll(container)
     Structra.jsonTree.collapseAll(container)
     Structra.jsonTree.collapseToDepth(container, depth)
     Structra.jsonTree.highlightPath(container, path)
     Structra.jsonTree.highlightPaths(container, paths)
     Structra.jsonTree.setFilter(container, matchedPaths)
     Structra.jsonTree.setFilterByRegex(container, regex)
     Structra.jsonTree.clearFilter(container)
     Structra.jsonTree.renderInto(container, data)
   ============================================================ */

window.Structra = window.Structra || {};

Structra.jsonTree = (() => {
  'use strict';

  const CHUNK_SIZE = 100;
  const OFFSCREEN_MARGIN = 3000;
  const esc = Structra.util.esc;

  /* ============================
     RENDER STATE (per container)
     ============================ */

  // WeakMap keyed by container element → render state
  const _states = new WeakMap();

  function getState(container) {
    return _states.get(container) || null;
  }

  function initState(container, data, opts) {
    const state = {
      data,
      opts: opts || {},
      lineCounter: 0,
      fileLine: 0,
      chunkId: 0,
      delegationBound: false,
      loadObserver: null,
      recycleObserver: null,
      highlightedEl: null,
      bookmarkedEls: [],
      filterMatchedPaths: null,
      filterPathRegex: null,
      filterScrollHandler: null,
    };
    _states.set(container, state);
    return state;
  }

  /* ============================
     CORE RENDER
     ============================ */

  function render(container, data, opts) {
    opts = opts || {};
    Structra.log.info('JsonTree', 'render()');
    const t0 = performance.now();

    const st = initState(container, data, opts);
    cleanup(container);
    container.innerHTML = '';

    if (!data) {
      container.innerHTML = '<span class="j-muted">No data</span>';
      return;
    }

    const lines = buildLines(st, data, '', 0);
    container.innerHTML = lines.join('');

    setupDelegation(container, st);
    setupObservers(container, st);

    Structra.log.perf('JsonTree', 'render() total (' + st.chunkId + ' chunks)', performance.now() - t0);
  }

  /* ============================
     LINE BUILDERS
     ============================ */

  function ln(st, content, path) {
    return `<span class="j-line" data-path="${esc(path)}" data-ln="${++st.fileLine}">${content}</span>`;
  }

  function valSpan(val, path) {
    if (val === null) return `<span class="j-null" data-path="${esc(path)}">null</span>`;
    if (typeof val === 'string') {
      const escaped = esc(
        val.replace(/\\/g, '\\\\')
           .replace(/\n/g, '\\n')
           .replace(/\r/g, '\\r')
           .replace(/\t/g, '\\t')
      ).replace(/\\[nrt\\]/g, m => `<span class="j-esc">${m}</span>`);
      return `<span class="j-str" data-path="${esc(path)}">&quot;${escaped}&quot;</span>`;
    }
    if (typeof val === 'number') return `<span class="j-num" data-path="${esc(path)}">${val}</span>`;
    if (typeof val === 'boolean') return `<span class="j-bool" data-path="${esc(path)}">${val}</span>`;
    return `<span data-path="${esc(path)}">${esc(String(val))}</span>`;
  }

  function countFileLines(val) {
    if (val === null || typeof val !== 'object') return 1;
    if (Array.isArray(val)) {
      if (val.length === 0) return 1;
      let count = 2;
      for (let i = 0; i < val.length; i++) count += countFileLines(val[i]);
      return count;
    }
    const keys = Object.keys(val);
    if (keys.length === 0) return 1;
    let count = 2;
    for (let i = 0; i < keys.length; i++) {
      const v = val[keys[i]];
      if (v && typeof v === 'object') count += countFileLines(v);
      else count += 1;
    }
    return count;
  }

  function buildLines(st, obj, path, indent) {
    const lines = [];
    const pad = '  '.repeat(indent);

    if (Array.isArray(obj)) {
      if (obj.length === 0) {
        lines.push(ln(st, `${pad}<span class="j-bracket">[]</span>`, path));
        return lines;
      }
      const id = 'bl' + (st.lineCounter++);
      lines.push(ln(st, `${pad}<span class="j-toggle" data-block="${id}">&#9660;</span><span class="j-bracket">[</span><span class="j-ellipsis" data-block="${id}" style="display:none"> ...${obj.length} items ]</span>`, path));
      const chunkStartLine = st.fileLine;

      // Render first chunk inline
      const renderCount = Math.min(obj.length, CHUNK_SIZE);
      const chunkHtml = buildChunkLines(st, obj, path, indent, 0, renderCount, obj.length, chunkStartLine);

      // Wrap in recyclable container
      const cid = 'jchunk' + (st.chunkId++);
      let blockContent = `<span class="j-chunk" id="${cid}" data-chunkpath="${esc(path || '')}" data-chunkindent="${indent}" data-chunkstart="0" data-chunkend="${renderCount}" data-chunktotal="${obj.length}" data-chunkstartline="${chunkStartLine}">${chunkHtml.join('')}</span>`;

      // Sentinel for remaining items
      if (obj.length > CHUNK_SIZE) {
        let skippedLines = 0;
        for (let i = CHUNK_SIZE; i < obj.length; i++) {
          skippedLines += countFileLines(obj[i]);
        }
        const sentinelStartLine = st.fileLine;
        st.fileLine += skippedLines;
        blockContent += makeSentinel(path, indent, CHUNK_SIZE, obj.length, sentinelStartLine);
      }

      lines.push(`<span class="j-block" data-block="${id}">${blockContent}</span>`);
      lines.push(`<span class="j-line j-close" data-path="${esc(path)}" data-close="${id}" data-ln="${++st.fileLine}">${pad}<span class="j-bracket">]</span></span>`);

    } else if (obj && typeof obj === 'object') {
      const keys = Object.keys(obj);
      if (keys.length === 0) {
        lines.push(ln(st, `${pad}<span class="j-bracket">{}</span>`, path));
        return lines;
      }
      const id = 'bl' + (st.lineCounter++);
      lines.push(ln(st, `${pad}<span class="j-toggle" data-block="${id}">&#9660;</span><span class="j-bracket">{</span><span class="j-ellipsis" data-block="${id}" style="display:none"> ...${keys.length} keys }</span>`, path));
      const inner = [];
      const innerPad = '  '.repeat(indent + 1);
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const needsBracket = /[.\[\]]/.test(key);
        const cp = path
          ? (needsBracket ? `${path}["${key}"]` : `${path}.${key}`)
          : (needsBracket ? `["${key}"]` : key);
        const comma = i < keys.length - 1 ? ',' : '';
        const value = obj[key];
        if (value && typeof value === 'object') {
          const keyStr = `${innerPad}<span class="j-key" data-path="${esc(cp)}">"${esc(key)}"</span>: `;
          const sub = buildLines(st, value, cp, indent + 1);
          if (sub.length > 0) {
            const first = sub[0].replace(/^<span class="j-line"[^>]*>(\s*)/, '');
            sub[0] = `<span class="j-line" data-path="${esc(cp)}" data-ln="${sub[0].match(/data-ln="(\d+)"/)[1]}">${keyStr}${first}`;
            for (let s = 0; s < sub.length; s++) inner.push(sub[s]);
            if (comma && inner.length) {
              const last = inner[inner.length - 1];
              const idx = last.lastIndexOf('</span>');
              if (idx !== -1) inner[inner.length - 1] = last.slice(0, idx) + comma + '</span>';
            }
          }
        } else {
          inner.push(ln(st, `${innerPad}<span class="j-key" data-path="${esc(cp)}">"${esc(key)}"</span>: ${valSpan(value, cp)}${comma}`, cp));
        }
      }
      lines.push(`<span class="j-block" data-block="${id}">${inner.join('')}</span>`);
      lines.push(`<span class="j-line j-close" data-path="${esc(path)}" data-close="${id}" data-ln="${++st.fileLine}">${pad}<span class="j-bracket">}</span></span>`);

    } else {
      lines.push(ln(st, pad + valSpan(obj, path), path));
    }
    return lines;
  }

  function buildChunkLines(st, arr, path, indent, start, end, total, startLine) {
    const lines = [];
    const innerPad = '  '.repeat(indent + 1);
    let currentLine = startLine || 0;
    for (let i = start; i < end; i++) {
      const item = arr[i];
      const cp = path ? `${path}[${i}]` : `[${i}]`;
      const needsComma = i < total - 1;
      if (item && typeof item === 'object') {
        const savedFileLine = st.fileLine;
        st.fileLine = currentLine;
        const sub = buildLines(st, item, cp, indent + 1);
        currentLine = st.fileLine;
        st.fileLine = savedFileLine;
        for (let s = 0; s < sub.length; s++) lines.push(sub[s]);
        if (needsComma && lines.length) {
          const last = lines[lines.length - 1];
          const idx = last.lastIndexOf('</span>');
          if (idx !== -1) lines[lines.length - 1] = last.slice(0, idx) + ',</span>';
        }
      } else {
        currentLine++;
        const comma = needsComma ? ',' : '';
        lines.push(`<span class="j-line" data-path="${esc(cp)}" data-ln="${currentLine}">${innerPad}${valSpan(item, cp)}${comma}</span>`);
      }
    }
    return lines;
  }

  function makeSentinel(path, indent, start, total, startLine) {
    const remaining = total - start;
    const pad = '  '.repeat(indent + 1);
    return `<span class="j-lazy-sentinel j-line" data-lazypath="${esc(path || '')}" data-indent="${indent}" data-start="${start}" data-total="${total}" data-startline="${startLine}" data-ln=""><span class="j-muted">${pad}// ${remaining} more items below...</span></span>`;
  }

  /* ============================
     CHUNK LOADING & RECYCLING
     ============================ */

  function cleanup(container) {
    const st = getState(container);
    if (!st) return;
    if (st.loadObserver) { st.loadObserver.disconnect(); st.loadObserver = null; }
    if (st.recycleObserver) { st.recycleObserver.disconnect(); st.recycleObserver = null; }
    removeFilterScrollLoader(container, st);
  }

  function setupObservers(container, st) {
    st.loadObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          st.loadObserver.unobserve(entry.target);
          loadNextChunk(container, st, entry.target);
        }
      }
    }, { root: container, rootMargin: '400px' });

    st.recycleObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const chunk = entry.target;
        if (!entry.isIntersecting) {
          if (!chunk.dataset.recycled) recycleChunk(chunk);
        } else {
          if (chunk.dataset.recycled) rehydrateChunk(container, st, chunk);
        }
      }
    }, { root: container, rootMargin: `${OFFSCREEN_MARGIN}px` });

    container.querySelectorAll('.j-lazy-sentinel').forEach(s => st.loadObserver.observe(s));
    container.querySelectorAll('.j-chunk').forEach(c => {
      const total = parseInt(c.dataset.chunktotal);
      if (total > CHUNK_SIZE) st.recycleObserver.observe(c);
    });
  }

  function recycleChunk(chunk) {
    const h = chunk.offsetHeight;
    if (h === 0) return;
    chunk.dataset.recycled = '1';
    chunk.innerHTML = '';
    chunk.style.height = h + 'px';
  }

  function rehydrateChunk(container, st, chunk) {
    const path = chunk.dataset.chunkpath || '';
    const indent = parseInt(chunk.dataset.chunkindent);
    const start = parseInt(chunk.dataset.chunkstart);
    const end = parseInt(chunk.dataset.chunkend);
    const total = parseInt(chunk.dataset.chunktotal);
    const startLine = parseInt(chunk.dataset.chunkstartline) || 0;

    const dataRef = st.data;
    const actualArr = path ? Structra.paths.resolve(dataRef, path) : dataRef;
    if (!actualArr || !Array.isArray(actualArr)) return;

    const lines = buildChunkLines(st, actualArr, path, indent, start, end, total, startLine);
    chunk.innerHTML = lines.join('');
    chunk.style.height = '';
    delete chunk.dataset.recycled;
    applyFilterToContainer(st, chunk);
  }

  function loadNextChunk(container, st, sentinel) {
    const path = sentinel.dataset.lazypath || '';
    const indent = parseInt(sentinel.dataset.indent);
    const start = parseInt(sentinel.dataset.start);
    const total = parseInt(sentinel.dataset.total);
    const startLine = parseInt(sentinel.dataset.startline) || 0;
    const end = Math.min(start + CHUNK_SIZE, total);

    const dataRef = st.data;
    const actualArr = path ? Structra.paths.resolve(dataRef, path) : dataRef;
    if (!actualArr || !Array.isArray(actualArr)) { sentinel.remove(); return; }

    // Create chunk container
    const chunk = document.createElement('span');
    chunk.className = 'j-chunk';
    chunk.dataset.chunkpath = path;
    chunk.dataset.chunkindent = indent;
    chunk.dataset.chunkstart = start;
    chunk.dataset.chunkend = end;
    chunk.dataset.chunktotal = total;
    chunk.dataset.chunkstartline = startLine;
    chunk.id = 'jchunk' + (st.chunkId++);

    const lines = buildChunkLines(st, actualArr, path, indent, start, end, total, startLine);
    chunk.innerHTML = lines.join('');
    applyFilterToContainer(st, chunk);

    // Calculate next chunk's start line
    let nextStartLine = startLine;
    for (let i = start; i < end; i++) {
      nextStartLine += countFileLines(actualArr[i]);
    }

    sentinel.parentNode.insertBefore(chunk, sentinel);

    const filterActive = !!(st.filterMatchedPaths || st.filterPathRegex);

    if (end < total) {
      sentinel.dataset.start = end;
      sentinel.dataset.startline = nextStartLine;
      const remaining = total - end;
      const pad = '  '.repeat(indent + 1);
      sentinel.innerHTML = `<span class="j-muted">${pad}// ${remaining} more items below...</span>`;
      if (!filterActive && st.loadObserver) st.loadObserver.observe(sentinel);
    } else {
      sentinel.remove();
    }

    if (st.recycleObserver && total > CHUNK_SIZE) st.recycleObserver.observe(chunk);
  }

  /* ============================
     EVENT DELEGATION
     ============================ */

  function setupDelegation(container, st) {
    if (st.delegationBound) return;
    st.delegationBound = true;

    let clickScrollTimer = null;
    const onPathSelect = st.opts.onPathSelect;
    const onContextMenu = st.opts.onContextMenu;

    container.addEventListener('click', e => {
      const tog = e.target.closest('.j-toggle');
      if (tog) { e.stopPropagation(); toggleCollapse(container, tog); return; }

      const keyEl = e.target.closest('.j-key');
      if (keyEl) {
        e.stopPropagation();
        highlightKeyOccurrences(container, keyEl);
        const p = keyEl.getAttribute('data-path');
        if (p && onPathSelect) {
          clearTimeout(clickScrollTimer);
          clickScrollTimer = setTimeout(() => onPathSelect(p), 250);
        }
        return;
      }

      clearKeyHighlights(container);

      const pathEl = e.target.closest('[data-path]');
      if (pathEl) {
        e.stopPropagation();
        const p = pathEl.getAttribute('data-path');
        if (p && onPathSelect) {
          clearTimeout(clickScrollTimer);
          clickScrollTimer = setTimeout(() => onPathSelect(p), 250);
        }
      }
    });

    container.addEventListener('dblclick', e => {
      clearTimeout(clickScrollTimer);

      const keyEl = e.target.closest('.j-key');
      if (keyEl) {
        e.stopPropagation();
        const keyName = extractKeyName(keyEl);
        if (keyName) Structra.events.emit('tree:search-key', keyName);
        return;
      }

      const valEl = e.target.closest('.j-str, .j-num, .j-bool, .j-null');
      if (valEl && valEl.dataset.path) {
        e.stopPropagation();
        startInlineEdit(container, st, valEl);
      }
    });

    container.addEventListener('contextmenu', e => {
      const pathEl = e.target.closest('[data-path]');
      if (pathEl) {
        e.preventDefault(); e.stopPropagation();
        if (onContextMenu) onContextMenu(e.clientX, e.clientY, pathEl.getAttribute('data-path'));
      }
    });
  }

  /* ============================
     COLLAPSE / EXPAND
     ============================ */

  function toggleCollapse(container, tog) {
    const blockId = tog.dataset.block;
    const parentLine = tog.closest('.j-line');
    let ellipsis = null, block = null;
    if (parentLine) {
      ellipsis = parentLine.querySelector(`.j-ellipsis[data-block="${blockId}"]`);
      const next = parentLine.nextElementSibling;
      if (next && next.classList.contains('j-block') && next.dataset.block === blockId) block = next;
    }
    if (!block) block = container.querySelector(`.j-block[data-block="${blockId}"]`);
    if (!ellipsis) ellipsis = container.querySelector(`.j-ellipsis[data-block="${blockId}"]`);
    if (!block) return;
    const collapsed = block.style.display === 'none';
    block.style.display = collapsed ? '' : 'none';
    if (ellipsis) ellipsis.style.display = collapsed ? 'none' : 'inline';
    tog.textContent = collapsed ? '\u25BC' : '\u25B6';
    const closeLine = block.nextElementSibling;
    if (closeLine && closeLine.dataset.close === blockId) {
      closeLine.style.display = collapsed ? '' : 'none';
    }
  }

  async function expandAll(container) {
    Structra.events.emit('loading:show', 'Expanding all…');
    await tick();
    container.classList.remove('all-collapsed');
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT, {
      acceptNode(node) {
        const cl = node.classList;
        if (cl.contains('j-block') || cl.contains('j-ellipsis') || cl.contains('j-toggle') || cl.contains('j-close')) return NodeFilter.FILTER_ACCEPT;
        return NodeFilter.FILTER_SKIP;
      }
    });
    let node;
    while ((node = walker.nextNode())) {
      if (node.classList.contains('j-block')) node.style.display = '';
      else if (node.classList.contains('j-ellipsis')) node.style.display = 'none';
      else if (node.classList.contains('j-toggle')) node.textContent = '\u25BC';
      else if (node.classList.contains('j-close')) node.style.display = '';
    }
    Structra.events.emit('loading:hide');
  }

  async function collapseAll(container) {
    Structra.events.emit('loading:show', 'Collapsing all…');
    await tick();
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT, {
      acceptNode(node) {
        const cl = node.classList;
        if (cl.contains('j-block') || cl.contains('j-ellipsis') || cl.contains('j-toggle') || cl.contains('j-close')) return NodeFilter.FILTER_ACCEPT;
        return NodeFilter.FILTER_SKIP;
      }
    });
    let node;
    while ((node = walker.nextNode())) {
      if (node.classList.contains('j-block')) node.style.display = 'none';
      else if (node.classList.contains('j-ellipsis')) node.style.display = 'inline';
      else if (node.classList.contains('j-toggle')) node.textContent = '\u25B6';
      else if (node.classList.contains('j-close')) node.style.display = 'none';
    }
    Structra.events.emit('loading:hide');
  }

  async function collapseToDepth(container, maxDepth) {
    Structra.events.emit('loading:show', 'Collapsing…');
    await tick();
    container.classList.remove('all-collapsed');
    const blocks = container.getElementsByClassName('j-block');
    const blockMap = Object.create(null);
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if (b.dataset.block) blockMap[b.dataset.block] = b;
    }
    const ellipses = container.getElementsByClassName('j-ellipsis');
    const ellMap = Object.create(null);
    for (let i = 0; i < ellipses.length; i++) {
      const e = ellipses[i];
      if (e.dataset.block) ellMap[e.dataset.block] = e;
    }
    const closes = container.getElementsByClassName('j-close');
    const closeMap = Object.create(null);
    for (let i = 0; i < closes.length; i++) {
      const c = closes[i];
      if (c.dataset.close) closeMap[c.dataset.close] = c;
    }
    const toggles = container.getElementsByClassName('j-toggle');
    for (let i = 0; i < toggles.length; i++) {
      const tog = toggles[i];
      const depth = getDepth(container, tog);
      const shouldCollapse = depth >= maxDepth;
      const blockId = tog.dataset.block;
      const block = blockMap[blockId];
      const ellipsis = ellMap[blockId];
      const closeLine = closeMap[blockId];
      if (block) block.style.display = shouldCollapse ? 'none' : '';
      if (ellipsis) ellipsis.style.display = shouldCollapse ? 'inline' : 'none';
      if (closeLine) closeLine.style.display = shouldCollapse ? 'none' : '';
      tog.textContent = shouldCollapse ? '\u25B6' : '\u25BC';
    }
    Structra.events.emit('loading:hide');
  }

  function getDepth(container, el) {
    let depth = 0;
    let node = el;
    while (node && node !== container) {
      if (node.classList && node.classList.contains('j-block')) depth++;
      node = node.parentElement;
    }
    return depth;
  }

  function expandParents(container, el) {
    let node = el.parentElement;
    while (node && node !== container) {
      if (node.classList.contains('j-block') && node.style.display === 'none') {
        node.style.display = '';
        const blockId = node.dataset.block;
        if (blockId) {
          const toggle = container.querySelector(`.j-toggle[data-block="${blockId}"]`);
          if (toggle) toggle.innerHTML = '&#9660;';
          const ellipsis = container.querySelector(`.j-ellipsis[data-block="${blockId}"]`);
          if (ellipsis) ellipsis.style.display = 'none';
          const closeLine = container.querySelector(`.j-close[data-close="${blockId}"]`);
          if (closeLine) closeLine.style.display = '';
        }
      }
      node = node.parentElement;
    }
  }

  /* ============================
     HIGHLIGHT & BOOKMARK
     ============================ */

  function highlightPath(container, path) {
    const st = getState(container);
    if (st && st.highlightedEl) { st.highlightedEl.classList.remove('highlighted'); st.highlightedEl = null; }
    if (!path) return;
    const match = container.querySelector(`.j-line[data-path="${CSS.escape(path)}"]`);
    if (match) {
      match.classList.add('highlighted');
      if (st) st.highlightedEl = match;
      expandParents(container, match);
      match.offsetHeight; // force reflow
      const matchRect = match.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const offsetTop = matchRect.top - containerRect.top + container.scrollTop;
      const targetScroll = offsetTop - container.clientHeight / 2 + matchRect.height / 2;
      container.scrollTo({ top: targetScroll, behavior: 'instant' });
    }
  }

  function highlightPaths(container, paths) {
    // Highlight multiple paths (for search results)
    const set = new Set(Array.isArray(paths) ? paths : []);
    container.querySelectorAll('.j-line').forEach(el => {
      const dp = el.getAttribute('data-path') || '';
      el.classList.toggle('find-match', set.has(dp));
    });
    // Scroll to first match
    const first = container.querySelector('.find-match');
    if (first) {
      expandParents(container, first);
      first.scrollIntoView({ block: 'center', behavior: 'instant' });
    }
  }

  function updateBookmarkHighlights(container, bookmarks) {
    const st = getState(container);
    if (!st) return;
    for (let i = 0; i < st.bookmarkedEls.length; i++) st.bookmarkedEls[i].classList.remove('bookmarked');
    st.bookmarkedEls = [];
    for (const b of bookmarks) {
      const el = container.querySelector(`.j-line[data-path="${CSS.escape(b)}"]`);
      if (el) { el.classList.add('bookmarked'); st.bookmarkedEls.push(el); }
    }
  }

  function highlightKeyByName(container, keyName) {
    clearKeyHighlights(container);
    if (!keyName) return;
    const allKeys = container.getElementsByClassName('j-key');
    for (let i = 0; i < allKeys.length; i++) {
      if (extractKeyName(allKeys[i]) === keyName) {
        allKeys[i].classList.add('j-key-hl');
      }
    }
    const first = container.querySelector('.j-key-hl');
    if (first) first.scrollIntoView({ behavior: 'instant', block: 'center' });
  }

  function extractKeyName(keyEl) {
    return keyEl.textContent.replace(/^"|"$/g, '');
  }

  function highlightKeyOccurrences(container, clickedKey) {
    clearKeyHighlights(container);
    const keyName = extractKeyName(clickedKey);
    if (!keyName) return;
    const allKeys = container.getElementsByClassName('j-key');
    for (let i = 0; i < allKeys.length; i++) {
      if (extractKeyName(allKeys[i]) === keyName) {
        allKeys[i].classList.add('j-key-hl');
      }
    }
  }

  function clearKeyHighlights(container) {
    const highlighted = container.getElementsByClassName('j-key-hl');
    while (highlighted.length > 0) highlighted[0].classList.remove('j-key-hl');
  }

  /* ============================
     INLINE EDITING
     ============================ */

  function startInlineEdit(container, st, valEl) {
    const path = valEl.dataset.path;
    const data = st.data;
    if (!path || !data) return;

    const currentVal = Structra.paths.resolve(data, path);
    let displayVal;
    if (currentVal === null) displayVal = 'null';
    else if (typeof currentVal === 'string') displayVal = currentVal;
    else displayVal = String(currentVal);

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'j-inline-edit';
    input.value = displayVal;
    input.style.cssText = 'font-family:var(--font-mono);font-size:inherit;padding:0 2px;border:1px solid var(--accent);border-radius:3px;background:var(--surface);color:var(--text);outline:none;min-width:40px;width:' + Math.max(60, valEl.offsetWidth + 20) + 'px;';

    const parent = valEl.parentNode;
    parent.replaceChild(input, valEl);
    input.focus();
    input.select();

    let committed = false;
    const commit = () => {
      if (committed) return;
      committed = true;
      const raw = input.value;
      let newVal;
      if (raw === 'null') newVal = null;
      else if (raw === 'true') newVal = true;
      else if (raw === 'false') newVal = false;
      else if (raw !== '' && !isNaN(Number(raw)) && raw.trim() === raw) newVal = Number(raw);
      else newVal = raw;

      Structra.paths.setNested(data, path, newVal);
      Structra.events.emit('tree:inline-edit', { path, value: newVal });
    };

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); }
      if (ev.key === 'Escape') { committed = true; if (input.parentNode) input.parentNode.replaceChild(valEl, input); }
    });
  }

  /* ============================
     FILTER (data-level, survives recycle/rehydrate)
     ============================ */

  function applyFilterToContainer(st, el) {
    if (!st.filterMatchedPaths && !st.filterPathRegex) return;

    const parent = el.parentNode;
    const next = el.nextSibling;
    if (parent) parent.removeChild(el);

    const lines = el.getElementsByClassName('j-line');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.classList.contains('j-lazy-sentinel')) {
        line.style.visibility = 'hidden';
        line.style.height = '1px';
        line.style.overflow = 'hidden';
        continue;
      }
      const dp = line.getAttribute('data-path') || '';

      if (st.filterPathRegex) {
        line.classList.toggle('filter-hidden', !st.filterPathRegex.test(dp));
      } else if (st.filterMatchedPaths) {
        const match = isAncestorMatched(st.filterMatchedPaths, dp);
        if (match) {
          line.classList.remove('filter-hidden');
          if (st.filterMatchedPaths.has(dp)) {
            line.querySelectorAll('.j-str, .j-num, .j-bool, .j-null').forEach(vs => vs.classList.add('filter-match'));
          }
        } else {
          line.classList.add('filter-hidden');
        }
      }
    }

    if (parent) {
      if (next) parent.insertBefore(el, next);
      else parent.appendChild(el);
    }
  }

  function isAncestorMatched(matchedPaths, dp) {
    if (matchedPaths.has('')) return true;
    if (matchedPaths.has(dp)) return true;
    let p = dp;
    while (p) {
      const lastDot = p.lastIndexOf('.');
      const lastBracket = p.lastIndexOf('[');
      const cut = Math.max(lastDot, lastBracket);
      if (cut <= 0) break;
      p = p.substring(0, cut);
      if (matchedPaths.has(p)) return true;
    }
    return false;
  }

  async function setFilter(container, matchedPaths) {
    const st = getState(container);
    if (!st) return;
    // Search returns paths written "$.a[0].b"; tree lines are written "a[0].b". The filter looks paths up, so keep them as a Set in the tree's form.
    st.filterMatchedPaths = new Set([...matchedPaths].map((p) => Structra.paths.strip(p)));
    st.filterPathRegex = null;
    if (st.loadObserver) st.loadObserver.disconnect();
    Structra.events.emit('loading:show', 'Applying filter…');
    await tick();
    applyFilterToContainer(st, container);
    installFilterScrollLoader(container, st);
    fillViewport(container, st, true);
  }

  async function setFilterByRegex(container, regex) {
    const st = getState(container);
    if (!st) return;
    st.filterPathRegex = regex;
    st.filterMatchedPaths = null;
    if (st.loadObserver) st.loadObserver.disconnect();
    Structra.events.emit('loading:show', 'Applying filter…');
    await tick();
    applyFilterToContainer(st, container);
    installFilterScrollLoader(container, st);
    fillViewport(container, st, true);
  }

  async function clearFilter(container) {
    const st = getState(container);
    if (!st) return;
    st.filterMatchedPaths = null;
    st.filterPathRegex = null;
    removeFilterScrollLoader(container, st);
    Structra.events.emit('loading:show', 'Clearing filter…');
    await tick();

    const parent = container.parentNode;
    const next = container.nextSibling;
    if (parent) parent.removeChild(container);

    container.querySelectorAll('.filter-hidden').forEach(el => el.classList.remove('filter-hidden'));
    container.querySelectorAll('.filter-match').forEach(el => el.classList.remove('filter-match'));
    container.querySelectorAll('.j-lazy-sentinel').forEach(s => {
      s.style.visibility = '';
      s.style.height = '';
      s.style.overflow = '';
    });

    if (parent) {
      if (next) parent.insertBefore(container, next);
      else parent.appendChild(container);
    }
    if (st.loadObserver) {
      container.querySelectorAll('.j-lazy-sentinel').forEach(s => st.loadObserver.observe(s));
    }
    Structra.events.emit('loading:hide');
  }

  function fillViewport(container, st, dismissSpinner) {
    if (!container.clientHeight) { if (dismissSpinner) Structra.events.emit('loading:hide'); return; }
    const maxIterations = 200;
    let iterations = 0;
    const doFill = () => {
      if (iterations++ >= maxIterations) { if (dismissSpinner) Structra.events.emit('loading:hide'); return; }
      const sentinel = container.querySelector('.j-lazy-sentinel');
      if (!sentinel) { if (dismissSpinner) Structra.events.emit('loading:hide'); return; }
      if (container.scrollHeight > container.clientHeight + 100) { if (dismissSpinner) Structra.events.emit('loading:hide'); return; }
      loadNextChunk(container, st, sentinel);
      requestAnimationFrame(doFill);
    };
    requestAnimationFrame(doFill);
  }

  function installFilterScrollLoader(container, st) {
    removeFilterScrollLoader(container, st);
    let loading = false;
    st.filterScrollHandler = () => {
      if (loading) return;
      const sentinel = container.querySelector('.j-lazy-sentinel');
      if (!sentinel) return;
      const remaining = container.scrollHeight - container.scrollTop - container.clientHeight;
      if (remaining < 600) {
        loading = true;
        Structra.events.emit('loading:show', 'Loading more…');
        let chunksLoaded = 0;
        const maxChunksPerScroll = 30;
        const doLoad = () => {
          const s = container.querySelector('.j-lazy-sentinel');
          if (!s || chunksLoaded >= maxChunksPerScroll) { loading = false; Structra.events.emit('loading:hide'); return; }
          const rem = container.scrollHeight - container.scrollTop - container.clientHeight;
          if (rem > 400 && chunksLoaded > 0) { loading = false; Structra.events.emit('loading:hide'); return; }
          loadNextChunk(container, st, s);
          chunksLoaded++;
          requestAnimationFrame(doLoad);
        };
        requestAnimationFrame(doLoad);
      }
    };
    container.addEventListener('scroll', st.filterScrollHandler, { passive: true });
  }

  function removeFilterScrollLoader(container, st) {
    if (st && st.filterScrollHandler) {
      container.removeEventListener('scroll', st.filterScrollHandler);
      st.filterScrollHandler = null;
    }
  }

  /* ============================
     RENDER INTO (read-only, no callbacks)
     ============================ */

  function renderInto(container, data) {
    const st = initState(container, data, {});
    container.innerHTML = buildLines(st, data, '', 0).join('');
    setupDelegation(container, st);
    setupObservers(container, st);
  }

  /* --- Utility --- */
  const tick = Structra.util.nextTick;

  /* ============================
     PUBLIC API
     ============================ */

  return {
    render,
    renderInto,
    expandAll,
    collapseAll,
    collapseToDepth,
    highlightPath,
    highlightPaths,
    highlightKeyByName,
    updateBookmarkHighlights,
    expandParents,
    setFilter,
    setFilterByRegex,
    clearFilter,
  };
})();
