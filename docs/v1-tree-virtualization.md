# V1 Tree Virtualization Implementation

## File: src/ui/json-view.js (entire implementation - ~870 lines)

## Strategy: Chunked Lazy-Loading + DOM Recycling (NOT virtual scroll)

V1 does NOT use traditional fixed-row-height virtual scrolling. Instead it uses:
1. **Chunked rendering** - arrays render first 100 items, rest load on demand
2. **IntersectionObserver-based loading** - sentinel elements trigger loading when near viewport
3. **DOM recycling** - offscreen chunks are emptied to free memory, replaced with height placeholders
4. **Re-hydration** - recycled chunks re-render from raw data when scrolled back into view

## Constants
- `CHUNK_SIZE = 100` - items per chunk
- `OFFSCREEN_MARGIN = 3000` - px distance from viewport before recycling occurs

## Two IntersectionObservers
1. `loadObserver` - root: view container, rootMargin: '400px'
   - Watches `.j-lazy-sentinel` elements
   - When sentinel enters viewport (+400px margin), loads next CHUNK_SIZE items
2. `recycleObserver` - root: view container, rootMargin: `3000px`
   - Watches `.j-chunk` containers (only for arrays > CHUNK_SIZE)
   - When chunk leaves viewport (+3000px margin): calls recycleChunk()
   - When chunk re-enters viewport (+3000px margin): calls rehydrateChunk()

## Data Flow

### Initial Render (buildLines)
- Objects: rendered fully inline (no chunking for object keys)
- Arrays > 100 items:
  1. First 100 items rendered in a `.j-chunk` container
  2. A `.j-lazy-sentinel` placed after with metadata (path, indent, start, total, startline)
  3. Sentinel shows "// N more items below..."

### Loading Next Chunk (loadNextChunk)
- Triggered when loadObserver fires on a sentinel
- Creates new `.j-chunk` element with metadata dataset attrs
- Calls buildChunkLines() to render items [start, end)
- Inserts chunk before sentinel
- Updates sentinel's start/startline or removes it if done
- Registers new chunk with recycleObserver if array > CHUNK_SIZE

### Recycling (recycleChunk)
- Saves offsetHeight
- Sets dataset.recycled = '1'
- Clears innerHTML (frees all child DOM nodes)
- Sets explicit height to prevent layout shift

### Rehydration (rehydrateChunk)
- Reads metadata from chunk.dataset (path, indent, start, end, total, startline)
- Resolves actual array data via window.App.path.resolvePath(dataRef, path)
- Rebuilds HTML with buildChunkLines()
- Clears height style, removes recycled flag
- Re-applies any active filter

## Collapse/Expand with Virtualization
- Uses `.j-block` containers with data-block IDs
- Toggle hides/shows block via display:none
- Recycling skips chunks with offsetHeight === 0 (collapsed/hidden)
- expandParents() walks up DOM to reveal parents before scrolling to element

## Filter System (persists across recycle/rehydrate)
- `_filterMatchedPaths`: Set<string> of data-paths
- `_filterPathRegex`: RegExp for path matching
- applyFilterToContainer() runs on each chunk after rehydration
- Custom scroll-based loader (_installFilterScrollLoader) replaces IO during filter
  - Loads up to 30 chunks per scroll event
  - _fillViewport() ensures viewport is populated after filter apply

## CSS
- `.j-chunk { display: block }` - block container for chunk
- `.j-lazy-sentinel { display: block; padding: 2px 4px }` - sentinel placeholder
- `.j-line { display: block; padding: 0 4px }` - each tree line
- `.j-line.filter-hidden { display: none !important }` - filtered out lines
