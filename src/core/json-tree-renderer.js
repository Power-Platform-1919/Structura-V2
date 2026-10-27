/* ============================================================
   STRUCTRA V2 - JSON Tree Renderer
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
     Structra.jsonTreeRenderer.render(container, data, opts)
     Structra.jsonTreeRenderer.expandAll(container)
     Structra.jsonTreeRenderer.collapseAll(container)
     Structra.jsonTreeRenderer.collapseToDepth(container, depth)
     Structra.jsonTreeRenderer.highlightPath(container, path)
     Structra.jsonTreeRenderer.highlightPaths(container, paths)
     Structra.jsonTreeRenderer.setFilter(container, matchedPaths)
     Structra.jsonTreeRenderer.setFilterByRegex(container, regex)
     Structra.jsonTreeRenderer.clearFilter(container)
     Structra.jsonTreeRenderer.renderInto(container, data)

   Wiring (generated from the code below; update it when you add or remove an event):
     Emits: tree:search-key, loading:show, loading:hide, tree:inline-edit
   ============================================================ */

window.Structra = window.Structra || {};

Structra.jsonTreeRenderer = (() => {
  'use strict';

  const CHUNK_SIZE = 100;
  const OFFSCREEN_MARGIN = 3000;
  const escapeHtml = Structra.sharedHelpers.escapeHtml;

  /* ============================
     RENDER STATE (per container)
     ============================ */

  // WeakMap keyed by container element → render state
  const _states = new WeakMap();

  function getState(container) {
    return _states.get(container) || null;
  }

  function initState(container, data, options) {
    const state = {
      data,
      opts: options || {},
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

  function render(container, data, options) {
    options = options || {};
    Structra.log.info('JsonTree', 'render()');
    const startTime = performance.now();

    const treeState = initState(container, data, options);
    cleanup(container);
    container.innerHTML = '';

    if (!data) {
      container.innerHTML = '<span class="j-muted">No data</span>';
      return;
    }

    const lines = buildLines(treeState, data, '', 0);
    container.innerHTML = lines.join('');
    sizeNumberMargin(container, treeState);

    setupDelegation(container, treeState);
    setupObservers(container, treeState);

    Structra.log.perf('JsonTree', 'render() total (' + treeState.chunkId + ' chunks)', performance.now() - startTime);
  }

  /* ============================
     LINE BUILDERS
     ============================ */

  /**
   * The line numbers sit in a margin that is as wide as the biggest number in the file, set once here (CSS reads
   * --ln-digits). The Editor's margin works the same way: CodeMirror measures a hidden number made of 9s. Without this, a
   * number with more digits would push its line's text to the right, and the lines would no longer line up.
   * After buildLines, fileLine is the last line number of the whole file, including chunks that are not drawn yet.
   */
  function sizeNumberMargin(container, treeState) {
    container.style.setProperty('--ln-digits', String(Math.max(2, String(treeState.fileLine).length)));
  }

  function makeLine(treeState, content, path) {
    return `<span class="j-line" data-path="${escapeHtml(path)}" data-ln="${++treeState.fileLine}">${content}</span>`;
  }

  function valSpan(value, path) {
    if (value === null) return `<span class="j-null" data-path="${escapeHtml(path)}">null</span>`;
    if (typeof value === 'string') {
      const escaped = escapeHtml(
        value.replace(/\\/g, '\\\\')
           .replace(/"/g, '\\"')
           .replace(/\n/g, '\\n')
           .replace(/\r/g, '\\r')
           .replace(/\t/g, '\\t')
      ).replace(/\\(?:[nrt\\]|&quot;)/g, match => `<span class="j-esc">${match}</span>`);
      return `<span class="j-str" data-path="${escapeHtml(path)}">&quot;${escaped}&quot;</span>`;
    }
    if (typeof value === 'number') return `<span class="j-num" data-path="${escapeHtml(path)}">${value}</span>`;
    if (typeof value === 'boolean') return `<span class="j-bool" data-path="${escapeHtml(path)}">${value}</span>`;
    return `<span data-path="${escapeHtml(path)}">${escapeHtml(String(value))}</span>`;
  }

  function countFileLines(value) {
    if (value === null || typeof value !== 'object') return 1;
    if (Array.isArray(value)) {
      if (value.length === 0) return 1;
      let count = 2;
      for (let i = 0; i < value.length; i++) count += countFileLines(value[i]);
      return count;
    }
    const keys = Object.keys(value);
    if (keys.length === 0) return 1;
    let count = 2;
    for (let i = 0; i < keys.length; i++) {
      const child = value[keys[i]];
      if (child && typeof child === 'object') count += countFileLines(child);
      else count += 1;
    }
    return count;
  }

  function buildLines(treeState, object, path, indent) {
    const lines = [];
    const pad = '  '.repeat(indent);

    if (Array.isArray(object)) {
      if (object.length === 0) {
        lines.push(makeLine(treeState, `${pad}<span class="j-bracket">[]</span>`, path));
        return lines;
      }
      const id = 'bl' + (treeState.lineCounter++);
      lines.push(makeLine(treeState, `${pad}<span class="j-toggle" data-block="${id}">&#9660;</span><span class="j-bracket">[</span><span class="j-ellipsis" data-block="${id}" style="display:none"> ...${object.length} items ]</span>`, path));
      const chunkStartLine = treeState.fileLine;

      // Render first chunk inline
      const renderCount = Math.min(object.length, CHUNK_SIZE);
      const chunkHtml = buildChunkLines(treeState, object, path, indent, 0, renderCount, object.length, chunkStartLine);
      // The lines of the items are numbered inside buildChunkLines; carry on from the last one
      if (chunkHtml.endLine != null) treeState.fileLine = chunkHtml.endLine;

      // Wrap in recyclable container
      const chunkKey = 'jchunk' + (treeState.chunkId++);
      let blockContent = `<span class="j-chunk" id="${chunkKey}" data-chunkpath="${escapeHtml(path || '')}" data-chunkindent="${indent}" data-chunkstart="0" data-chunkend="${renderCount}" data-chunktotal="${object.length}" data-chunkstartline="${chunkStartLine}">${chunkHtml.join('')}</span>`;

      // Sentinel for remaining items
      if (object.length > CHUNK_SIZE) {
        let skippedLines = 0;
        for (let i = CHUNK_SIZE; i < object.length; i++) {
          skippedLines += countFileLines(object[i]);
        }
        const sentinelStartLine = treeState.fileLine;
        treeState.fileLine += skippedLines;
        blockContent += makeSentinel(path, indent, CHUNK_SIZE, object.length, sentinelStartLine);
      }

      lines.push(`<span class="j-block" data-block="${id}">${blockContent}</span>`);
      lines.push(`<span class="j-line j-close" data-path="${escapeHtml(path)}" data-close="${id}" data-ln="${++treeState.fileLine}">${pad}<span class="j-bracket">]</span></span>`);

    } else if (object && typeof object === 'object') {
      const keys = Object.keys(object);
      if (keys.length === 0) {
        lines.push(makeLine(treeState, `${pad}<span class="j-bracket">{}</span>`, path));
        return lines;
      }
      const id = 'bl' + (treeState.lineCounter++);
      lines.push(makeLine(treeState, `${pad}<span class="j-toggle" data-block="${id}">&#9660;</span><span class="j-bracket">{</span><span class="j-ellipsis" data-block="${id}" style="display:none"> ...${keys.length} keys }</span>`, path));
      const inner = [];
      const innerPad = '  '.repeat(indent + 1);
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const needsBracket = /[.\[\]]/.test(key);
        const childPath = path
          ? (needsBracket ? `${path}["${key}"]` : `${path}.${key}`)
          : (needsBracket ? `["${key}"]` : key);
        const comma = i < keys.length - 1 ? ',' : '';
        const value = object[key];
        if (value && typeof value === 'object') {
          const keyText = `${innerPad}<span class="j-key" data-path="${escapeHtml(childPath)}">"${escapeHtml(key)}"</span>: `;
          const subLines = buildLines(treeState, value, childPath, indent + 1);
          if (subLines.length > 0) {
            const first = subLines[0].replace(/^<span class="j-line"[^>]*>(\s*)/, '');
            subLines[0] = `<span class="j-line" data-path="${escapeHtml(childPath)}" data-ln="${subLines[0].match(/data-ln="(\d+)"/)[1]}">${keyText}${first}`;
            for (let index = 0; index < subLines.length; index++) inner.push(subLines[index]);
            if (comma && inner.length) {
              const last = inner[inner.length - 1];
              const index = last.lastIndexOf('</span>');
              if (index !== -1) inner[inner.length - 1] = last.slice(0, index) + comma + '</span>';
            }
          }
        } else {
          inner.push(makeLine(treeState, `${innerPad}<span class="j-key" data-path="${escapeHtml(childPath)}">"${escapeHtml(key)}"</span>: ${valSpan(value, childPath)}${comma}`, childPath));
        }
      }
      lines.push(`<span class="j-block" data-block="${id}">${inner.join('')}</span>`);
      lines.push(`<span class="j-line j-close" data-path="${escapeHtml(path)}" data-close="${id}" data-ln="${++treeState.fileLine}">${pad}<span class="j-bracket">}</span></span>`);

    } else {
      lines.push(makeLine(treeState, pad + valSpan(object, path), path));
    }
    return lines;
  }

  function buildChunkLines(treeState, array, path, indent, start, end, total, startLine) {
    const lines = [];
    const innerPad = '  '.repeat(indent + 1);
    let currentLine = startLine || 0;
    for (let i = start; i < end; i++) {
      const item = array[i];
      const childPath = path ? `${path}[${i}]` : `[${i}]`;
      const needsComma = i < total - 1;
      if (item && typeof item === 'object') {
        const savedFileLine = treeState.fileLine;
        treeState.fileLine = currentLine;
        const subLines = buildLines(treeState, item, childPath, indent + 1);
        currentLine = treeState.fileLine;
        treeState.fileLine = savedFileLine;
        for (let index = 0; index < subLines.length; index++) lines.push(subLines[index]);
        if (needsComma && lines.length) {
          const last = lines[lines.length - 1];
          const index = last.lastIndexOf('</span>');
          if (index !== -1) lines[lines.length - 1] = last.slice(0, index) + ',</span>';
        }
      } else {
        currentLine++;
        const comma = needsComma ? ',' : '';
        lines.push(`<span class="j-line" data-path="${escapeHtml(childPath)}" data-ln="${currentLine}">${innerPad}${valSpan(item, childPath)}${comma}</span>`);
      }
    }
    lines.endLine = currentLine;
    return lines;
  }

  function makeSentinel(path, indent, start, total, startLine) {
    const remaining = total - start;
    const pad = '  '.repeat(indent + 1);
    return `<span class="j-lazy-sentinel j-line" data-lazypath="${escapeHtml(path || '')}" data-indent="${indent}" data-start="${start}" data-total="${total}" data-startline="${startLine}" data-ln=""><span class="j-muted">${pad}// ${remaining} more items below...</span></span>`;
  }

  /* ============================
     CHUNK LOADING & RECYCLING
     ============================ */

  function cleanup(container) {
    const treeState = getState(container);
    if (!treeState) return;
    if (treeState.loadObserver) { treeState.loadObserver.disconnect(); treeState.loadObserver = null; }
    if (treeState.recycleObserver) { treeState.recycleObserver.disconnect(); treeState.recycleObserver = null; }
    removeFilterScrollLoader(container, treeState);
  }

  function setupObservers(container, treeState) {
    treeState.loadObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          treeState.loadObserver.unobserve(entry.target);
          loadNextChunk(container, treeState, entry.target);
        }
      }
    }, { root: container, rootMargin: '400px' });

    treeState.recycleObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const chunk = entry.target;
        if (!entry.isIntersecting) {
          if (!chunk.dataset.recycled) recycleChunk(chunk);
        } else {
          if (chunk.dataset.recycled) rehydrateChunk(container, treeState, chunk);
        }
      }
    }, { root: container, rootMargin: `${OFFSCREEN_MARGIN}px` });

    container.querySelectorAll('.j-lazy-sentinel').forEach(sentinel => treeState.loadObserver.observe(sentinel));
    container.querySelectorAll('.j-chunk').forEach(closer => {
      const total = parseInt(closer.dataset.chunktotal);
      if (total > CHUNK_SIZE) treeState.recycleObserver.observe(closer);
    });
  }

  function recycleChunk(chunk) {
    const height = chunk.offsetHeight;
    if (height === 0) return;
    chunk.dataset.recycled = '1';
    chunk.innerHTML = '';
    chunk.style.height = height + 'px';
  }

  function rehydrateChunk(container, treeState, chunk) {
    const path = chunk.dataset.chunkpath || '';
    const indent = parseInt(chunk.dataset.chunkindent);
    const start = parseInt(chunk.dataset.chunkstart);
    const end = parseInt(chunk.dataset.chunkend);
    const total = parseInt(chunk.dataset.chunktotal);
    const startLine = parseInt(chunk.dataset.chunkstartline) || 0;

    const dataRef = treeState.data;
    const actualArray = path ? Structra.dataPaths.resolve(dataRef, path) : dataRef;
    if (!actualArray || !Array.isArray(actualArray)) return;

    const lines = buildChunkLines(treeState, actualArray, path, indent, start, end, total, startLine);
    chunk.innerHTML = lines.join('');
    chunk.style.height = '';
    delete chunk.dataset.recycled;
    applyFilterToContainer(treeState, chunk);
  }

  function loadNextChunk(container, treeState, sentinel) {
    const path = sentinel.dataset.lazypath || '';
    const indent = parseInt(sentinel.dataset.indent);
    const start = parseInt(sentinel.dataset.start);
    const total = parseInt(sentinel.dataset.total);
    const startLine = parseInt(sentinel.dataset.startline) || 0;
    const end = Math.min(start + CHUNK_SIZE, total);

    const dataRef = treeState.data;
    const actualArray = path ? Structra.dataPaths.resolve(dataRef, path) : dataRef;
    if (!actualArray || !Array.isArray(actualArray)) { sentinel.remove(); return; }

    // Create chunk container
    const chunk = document.createElement('span');
    chunk.className = 'j-chunk';
    chunk.dataset.chunkpath = path;
    chunk.dataset.chunkindent = indent;
    chunk.dataset.chunkstart = start;
    chunk.dataset.chunkend = end;
    chunk.dataset.chunktotal = total;
    chunk.dataset.chunkstartline = startLine;
    chunk.id = 'jchunk' + (treeState.chunkId++);

    const lines = buildChunkLines(treeState, actualArray, path, indent, start, end, total, startLine);
    chunk.innerHTML = lines.join('');
    applyFilterToContainer(treeState, chunk);

    // Calculate next chunk's start line
    let nextStartLine = startLine;
    for (let i = start; i < end; i++) {
      nextStartLine += countFileLines(actualArray[i]);
    }

    sentinel.parentNode.insertBefore(chunk, sentinel);

    const filterActive = !!(treeState.filterMatchedPaths || treeState.filterPathRegex);

    if (end < total) {
      sentinel.dataset.start = end;
      sentinel.dataset.startline = nextStartLine;
      const remaining = total - end;
      const pad = '  '.repeat(indent + 1);
      sentinel.innerHTML = `<span class="j-muted">${pad}// ${remaining} more items below...</span>`;
      if (!filterActive && treeState.loadObserver) treeState.loadObserver.observe(sentinel);
    } else {
      sentinel.remove();
    }

    if (treeState.recycleObserver && total > CHUNK_SIZE) treeState.recycleObserver.observe(chunk);
  }

  /* ============================
     EVENT DELEGATION
     ============================ */

  function setupDelegation(container, treeState) {
    if (treeState.delegationBound) return;
    treeState.delegationBound = true;

    let clickScrollTimer = null;
    const onPathSelect = treeState.opts.onPathSelect;
    const onContextMenu = treeState.opts.onContextMenu;

    container.addEventListener('click', event => {
      const toggle = event.target.closest('.j-toggle');
      if (toggle) { event.stopPropagation(); toggleCollapse(container, toggle); return; }
      const ellipsisElement = event.target.closest('.j-ellipsis');
      if (ellipsisElement && ellipsisElement.dataset.block) {
        const owner = container.querySelector(`.j-toggle[data-block="${ellipsisElement.dataset.block}"]`);
        if (owner) { event.stopPropagation(); toggleCollapse(container, owner); return; }
      }

      const keyElement = event.target.closest('.j-key');
      if (keyElement) {
        event.stopPropagation();
        highlightKeyOccurrences(container, keyElement);
        const path = keyElement.getAttribute('data-path');
        if (path && onPathSelect) {
          clearTimeout(clickScrollTimer);
          clickScrollTimer = setTimeout(() => onPathSelect(path), 250);
        }
        return;
      }

      clearKeyHighlights(container);

      const pathElement = event.target.closest('[data-path]');
      if (pathElement) {
        event.stopPropagation();
        const path = pathElement.getAttribute('data-path');
        if (path && onPathSelect) {
          clearTimeout(clickScrollTimer);
          clickScrollTimer = setTimeout(() => onPathSelect(path), 250);
        }
      }
    });

    container.addEventListener('dblclick', event => {
      clearTimeout(clickScrollTimer);

      const keyElement = event.target.closest('.j-key');
      if (keyElement) {
        event.stopPropagation();
        const keyName = extractKeyName(keyElement);
        if (keyName) Structra.events.emit('tree:search-key', keyName);
        return;
      }

      const valElement = event.target.closest('.j-str, .j-num, .j-bool, .j-null');
      if (valElement && valElement.dataset.path) {
        event.stopPropagation();
        startInlineEdit(container, treeState, valElement);
      }
    });

    container.addEventListener('contextmenu', event => {
      const pathElement = event.target.closest('[data-path]');
      if (pathElement) {
        event.preventDefault(); event.stopPropagation();
        if (onContextMenu) onContextMenu(event.clientX, event.clientY, pathElement.getAttribute('data-path'));
      }
    });
  }

  /* ============================
     COLLAPSE / EXPAND
     ============================ */

  function toggleCollapse(container, toggle) {
    const blockId = toggle.dataset.block;
    const parentLine = toggle.closest('.j-line');
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
    toggle.textContent = collapsed ? '\u25BC' : '\u25B6';
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
        const classList = node.classList;
        if (classList.contains('j-block') || classList.contains('j-ellipsis') || classList.contains('j-toggle') || classList.contains('j-close')) return NodeFilter.FILTER_ACCEPT;
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
        const classList = node.classList;
        if (classList.contains('j-block') || classList.contains('j-ellipsis') || classList.contains('j-toggle') || classList.contains('j-close')) return NodeFilter.FILTER_ACCEPT;
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
      const block = blocks[i];
      if (block.dataset.block) blockMap[block.dataset.block] = block;
    }
    const ellipses = container.getElementsByClassName('j-ellipsis');
    const ellMap = Object.create(null);
    for (let i = 0; i < ellipses.length; i++) {
      const ellipsis = ellipses[i];
      if (ellipsis.dataset.block) ellMap[ellipsis.dataset.block] = ellipsis;
    }
    const closes = container.getElementsByClassName('j-close');
    const closeMap = Object.create(null);
    for (let i = 0; i < closes.length; i++) {
      const closer = closes[i];
      if (closer.dataset.close) closeMap[closer.dataset.close] = closer;
    }
    const toggles = container.getElementsByClassName('j-toggle');
    for (let i = 0; i < toggles.length; i++) {
      const toggle = toggles[i];
      const depth = getDepth(container, toggle);
      const shouldCollapse = depth >= maxDepth;
      const blockId = toggle.dataset.block;
      const block = blockMap[blockId];
      const ellipsis = ellMap[blockId];
      const closeLine = closeMap[blockId];
      if (block) block.style.display = shouldCollapse ? 'none' : '';
      if (ellipsis) ellipsis.style.display = shouldCollapse ? 'inline' : 'none';
      if (closeLine) closeLine.style.display = shouldCollapse ? 'none' : '';
      toggle.textContent = shouldCollapse ? '\u25B6' : '\u25BC';
    }
    Structra.events.emit('loading:hide');
  }

  function getDepth(container, element) {
    let depth = 0;
    let node = element;
    while (node && node !== container) {
      if (node.classList && node.classList.contains('j-block')) depth++;
      node = node.parentElement;
    }
    return depth;
  }

  function expandParents(container, element) {
    let node = element.parentElement;
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
    const treeState = getState(container);
    if (treeState && treeState.highlightedEl) { treeState.highlightedEl.classList.remove('highlighted'); treeState.highlightedEl = null; }
    if (!path) return;
    const match = container.querySelector(`.j-line[data-path="${CSS.escape(Structra.dataPaths.strip(path))}"]`);
    if (match) {
      match.classList.add('highlighted');
      if (treeState) treeState.highlightedEl = match;
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
    // Search returns paths written "$.a[0].b"; tree lines are written "a[0].b"
    const set = new Set((Array.isArray(paths) ? paths : []).map((path) => Structra.dataPaths.strip(path)));
    container.querySelectorAll('.j-line').forEach(element => {
      const dataPath = element.getAttribute('data-path') || '';
      element.classList.toggle('find-match', set.has(dataPath));
    });
    // Scroll to first match
    const first = container.querySelector('.find-match');
    if (first) {
      expandParents(container, first);
      first.scrollIntoView({ block: 'center', behavior: 'instant' });
    }
  }

  function updateBookmarkHighlights(container, bookmarks) {
    const treeState = getState(container);
    if (!treeState) return;
    for (let i = 0; i < treeState.bookmarkedEls.length; i++) treeState.bookmarkedEls[i].classList.remove('bookmarked');
    treeState.bookmarkedEls = [];
    for (const bookmark of bookmarks) {
      const element = container.querySelector(`.j-line[data-path="${CSS.escape(Structra.dataPaths.strip(bookmark))}"]`);
      if (element) { element.classList.add('bookmarked'); treeState.bookmarkedEls.push(element); }
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

  function extractKeyName(keyElement) {
    return keyElement.textContent.replace(/^"|"$/g, '');
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

  function startInlineEdit(container, treeState, valElement) {
    const path = valElement.dataset.path;
    const data = treeState.data;
    if (!path || !data) return;

    const currentValue = Structra.dataPaths.resolve(data, path);
    let displayValue;
    if (currentValue === null) displayValue = 'null';
    else if (typeof currentValue === 'string') displayValue = currentValue;
    else displayValue = String(currentValue);

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'j-inline-edit';
    input.value = displayValue;
    input.style.cssText = 'font-family:var(--font-mono);font-size:inherit;padding:0 2px;border:1px solid var(--accent);border-radius:3px;background:var(--surface);color:var(--text);outline:none;min-width:40px;width:' + Math.max(60, valElement.offsetWidth + 20) + 'px;';

    const parent = valElement.parentNode;
    parent.replaceChild(input, valElement);
    input.focus();
    input.select();

    let committed = false;
    const commit = () => {
      if (committed) return;
      committed = true;
      const raw = input.value;
      let newValue;
      if (raw === 'null') newValue = null;
      else if (raw === 'true') newValue = true;
      else if (raw === 'false') newValue = false;
      else if (raw !== '' && !isNaN(Number(raw)) && raw.trim() === raw) newValue = Number(raw);
      else newValue = raw;

      // The command layer makes the change: it keeps the original for Undo, marks the tab and refreshes every view
      Structra.events.emit('tree:inline-edit', { path, value: newValue });
    };

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); input.blur(); }
      if (event.key === 'Escape') { committed = true; if (input.parentNode) input.parentNode.replaceChild(valElement, input); }
    });
  }

  /* ============================
     FILTER (data-level, survives recycle/rehydrate)
     ============================ */

  function applyFilterToContainer(treeState, element) {
    if (!treeState.filterMatchedPaths && !treeState.filterPathRegex) return;

    const parent = element.parentNode;
    const next = element.nextSibling;
    if (parent) parent.removeChild(element);

    const lines = element.getElementsByClassName('j-line');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.classList.contains('j-lazy-sentinel')) {
        line.style.visibility = 'hidden';
        line.style.height = '1px';
        line.style.overflow = 'hidden';
        continue;
      }
      const dataPath = line.getAttribute('data-path') || '';

      if (treeState.filterPathRegex) {
        line.classList.toggle('filter-hidden', !treeState.filterPathRegex.test(dataPath));
      } else if (treeState.filterMatchedPaths) {
        const match = isAncestorMatched(treeState.filterMatchedPaths, dataPath) || (treeState.filterAncestors && treeState.filterAncestors.has(dataPath));
        if (match) {
          line.classList.remove('filter-hidden');
          if (treeState.filterMatchedPaths.has(dataPath)) {
            line.querySelectorAll('.j-str, .j-num, .j-bool, .j-null').forEach(element => element.classList.add('filter-match'));
          }
        } else {
          line.classList.add('filter-hidden');
        }
      }
    }

    if (parent) {
      if (next) parent.insertBefore(element, next);
      else parent.appendChild(element);
    }
  }

  function isAncestorMatched(matchedPaths, dataPath) {
    if (matchedPaths.has('')) return true;
    if (matchedPaths.has(dataPath)) return true;
    let currentPath = dataPath;
    while (currentPath) {
      const lastDot = currentPath.lastIndexOf('.');
      const lastBracket = currentPath.lastIndexOf('[');
      const splitAt = Math.max(lastDot, lastBracket);
      if (splitAt <= 0) break;
      currentPath = currentPath.substring(0, splitAt);
      if (matchedPaths.has(currentPath)) return true;
    }
    return false;
  }

  async function setFilter(container, matchedPaths) {
    const treeState = getState(container);
    if (!treeState) return;
    // Search returns paths written "$.a[0].b"; tree lines are written "a[0].b". The filter looks paths up, so keep them as a Set in the tree's form.
    treeState.filterMatchedPaths = new Set([...matchedPaths].map((path) => Structra.dataPaths.strip(path)));
    treeState.filterPathRegex = null;
    // The lines above a match stay visible, so a match is shown inside the record that holds it
    treeState.filterAncestors = new Set(['']);
    for (const filterMatchedPath of treeState.filterMatchedPaths) {
      let currentPath = filterMatchedPath;
      while (currentPath) {
        const splitAt = Math.max(currentPath.lastIndexOf('.'), currentPath.lastIndexOf('['));
        if (splitAt <= 0) break;
        currentPath = currentPath.substring(0, splitAt);
        if (treeState.filterAncestors.has(currentPath)) break;
        treeState.filterAncestors.add(currentPath);
      }
    }
    if (treeState.loadObserver) treeState.loadObserver.disconnect();
    Structra.events.emit('loading:show', 'Applying filter…');
    await tick();
    applyFilterToContainer(treeState, container);
    installFilterScrollLoader(container, treeState);
    fillViewport(container, treeState, true);
  }

  async function setFilterByRegex(container, regex) {
    const treeState = getState(container);
    if (!treeState) return;
    treeState.filterPathRegex = regex;
    treeState.filterMatchedPaths = null;
    if (treeState.loadObserver) treeState.loadObserver.disconnect();
    Structra.events.emit('loading:show', 'Applying filter…');
    await tick();
    applyFilterToContainer(treeState, container);
    installFilterScrollLoader(container, treeState);
    fillViewport(container, treeState, true);
  }

  async function clearFilter(container) {
    const treeState = getState(container);
    if (!treeState) return;
    treeState.filterMatchedPaths = null;
    treeState.filterPathRegex = null;
    removeFilterScrollLoader(container, treeState);
    Structra.events.emit('loading:show', 'Clearing filter…');
    await tick();

    const parent = container.parentNode;
    const next = container.nextSibling;
    if (parent) parent.removeChild(container);

    container.querySelectorAll('.filter-hidden').forEach(element => element.classList.remove('filter-hidden'));
    container.querySelectorAll('.filter-match').forEach(element => element.classList.remove('filter-match'));
    container.querySelectorAll('.j-lazy-sentinel').forEach(sentinel => {
      sentinel.style.visibility = '';
      sentinel.style.height = '';
      sentinel.style.overflow = '';
    });

    if (parent) {
      if (next) parent.insertBefore(container, next);
      else parent.appendChild(container);
    }
    if (treeState.loadObserver) {
      container.querySelectorAll('.j-lazy-sentinel').forEach(sentinel => treeState.loadObserver.observe(sentinel));
    }
    Structra.events.emit('loading:hide');
  }

  function fillViewport(container, treeState, dismissSpinner) {
    if (!container.clientHeight) { if (dismissSpinner) Structra.events.emit('loading:hide'); return; }
    const maxIterations = 200;
    let iterations = 0;
    const doFill = () => {
      if (iterations++ >= maxIterations) { if (dismissSpinner) Structra.events.emit('loading:hide'); return; }
      const sentinel = container.querySelector('.j-lazy-sentinel');
      if (!sentinel) { if (dismissSpinner) Structra.events.emit('loading:hide'); return; }
      if (container.scrollHeight > container.clientHeight + 100) { if (dismissSpinner) Structra.events.emit('loading:hide'); return; }
      loadNextChunk(container, treeState, sentinel);
      requestAnimationFrame(doFill);
    };
    requestAnimationFrame(doFill);
  }

  function installFilterScrollLoader(container, treeState) {
    removeFilterScrollLoader(container, treeState);
    let loading = false;
    treeState.filterScrollHandler = () => {
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
          const sentinel = container.querySelector('.j-lazy-sentinel');
          if (!sentinel || chunksLoaded >= maxChunksPerScroll) { loading = false; Structra.events.emit('loading:hide'); return; }
          const remaining = container.scrollHeight - container.scrollTop - container.clientHeight;
          if (remaining > 400 && chunksLoaded > 0) { loading = false; Structra.events.emit('loading:hide'); return; }
          loadNextChunk(container, treeState, sentinel);
          chunksLoaded++;
          requestAnimationFrame(doLoad);
        };
        requestAnimationFrame(doLoad);
      }
    };
    container.addEventListener('scroll', treeState.filterScrollHandler, { passive: true });
  }

  function removeFilterScrollLoader(container, treeState) {
    if (treeState && treeState.filterScrollHandler) {
      container.removeEventListener('scroll', treeState.filterScrollHandler);
      treeState.filterScrollHandler = null;
    }
  }

  /* ============================
     RENDER INTO (read-only, no callbacks)
     ============================ */

  function renderInto(container, data) {
    const treeState = initState(container, data, {});
    container.innerHTML = buildLines(treeState, data, '', 0).join('');
    sizeNumberMargin(container, treeState);
    setupDelegation(container, treeState);
    setupObservers(container, treeState);
  }

  /* --- Utility --- */
  const tick = Structra.sharedHelpers.waitForNextTick;

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
