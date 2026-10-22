# Structra V2 — Component Build Plan

## Element Audit Summary
- V1: 460+ UI elements across 12 major sections + 11 modals/overlays + 40 script files
- V2 prototype: ~200 elements across 12 sections (cleaner architecture)
- Gap: ~20 V1 features not yet in V2 prototype

## Custom Element Component Map

### Phase 1: Shell (app renders, no functionality)
1. `structra-header` — brand, search/path bar, theme toggle, cmd palette trigger
2. `structra-tabs` — doc tab bar (multi-tab: add/close/rename/drag/switch)
3. `structra-rail` — left icon sidebar (explorer/query/pp/stats/transform/settings)
4. `structra-status` — bottom status bar (ready dot, filename, path)
5. `structra-toast` — floating notification

### Phase 2: Canvas Core (main content area works)
6. `structra-canvas` — canvas shell (header + insight strip + view container + drawer host)
7. `structra-tree` — tree view (lines, collapse, select, highlight, syntax colors)
8. `structra-input-zone` — empty tab landing (paste/load/sample)
9. `structra-find` — floating find bar (search + replace)

### Phase 3: Alternate Views
10. `structra-table` — tabular data view (sortable, selectable rows)
11. `structra-graph` — node graph visualization
12. `structra-schema` — JSON schema display
13. `structra-editor` — raw JSON editor (format/minify/validate/apply)
14. `structra-stats` — stats dashboard (hero cards, type pills, coverage, arrays)

### Phase 4: Panels
15. `structra-query` — query/filter panel (path/jsonpath/regex/js modes)
16. `structra-context` — right detail panel (value, meta, actions)
17. `structra-drawer` — bottom drawer (analyze/expressions/schema-gen tabs)

### Phase 5: Overlays
18. `structra-command` — command palette (search, command list, keyboard nav)
19. `structra-loading` — full-screen loading spinner

### Phase 6: V1 Feature Ports
20. `structra-input-overlay` — full landing screen (file upload/paste/csv/url-api/recent)
21. `structra-diff` — JSON diff/compare overlay
22. `structra-convert` — YAML/XML format conversion modal
23. `structra-typegen` — type definition generator (TS/C#/Go/Python/Rust/SQL/PowerFx)
24. `structra-url-modal` — API request modal (method/url/auth/headers/body)
25. `structra-context-menu` — right-click menu (copy path/value/subtree, copy-as, bookmark, mock)

## V1 Features → V2 Mapping

### Integrated into existing components (not separate):
- Path back/forward nav → structra-header
- Breadcrumb bar → structra-header (below path or as separate sub-element)
- Zoom controls (tree + graph) → structra-canvas header toolbar
- D3 depth button → structra-canvas header toolbar
- Bookmarks → structra-context panel + structra-drawer tab
- Power Platform expressions → structra-drawer tab
- Schema generation → structra-drawer tab
- Search with Replace → structra-find (already planned)
- Export CSV/Image → structra-command palette commands
- Sort/Flatten/Minify/Compact → structra-command palette commands
- Transform → structra-command palette or structra-rail trigger
- Validate Schema → structra-command palette command
- Repair JSON → structra-command palette command
- Mask Sensitive Data → structra-command palette command
- Snippet Library → structra-command palette or rail
- Share URL → structra-command palette command
- Save/Load Workspace → structra-command palette command

### Feature decisions:
- Global loading overlay → KEEP (structra-loading, useful for large files)
- Shortcuts overlay → KEEP (add to command palette as "Show Shortcuts")
- Help modal → DEFER (merge into command palette help section)
- Panel resizer → KEEP (add drag-to-resize on query/context panels)
- Graph zoom toolbar → KEEP (part of structra-graph, only visible in graph view)
- Tree zoom → CONSIDER (was useful in V1, could add to canvas header)
- Null Finder / Size Heatmap / Data Charts / Data Profile / Minimap / Pivot Table → PHASE 6+ (analysis features via command palette or rail panel)

## index.html Structure (target)
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Structra V2</title>
  <link rel="icon" href="icons/icon.svg">
  <link rel="stylesheet" href="src/css/variables.css">
  <link rel="stylesheet" href="src/css/layout.css">
  <link rel="stylesheet" href="src/css/components.css">
</head>
<body>
  <div class="app">
    <structra-header class="app-header"></structra-header>
    <structra-tabs class="app-tab-bar"></structra-tabs>
    <div class="app-workspace">
      <structra-rail class="app-rail"></structra-rail>
      <structra-query class="app-query-panel"></structra-query>
      <structra-canvas class="app-canvas"></structra-canvas>
      <structra-context class="app-context-panel"></structra-context>
    </div>
    <structra-status class="app-status-bar"></structra-status>
  </div>

  <structra-toast></structra-toast>
  <structra-command></structra-command>
  <structra-loading></structra-loading>

  <!-- Core -->
  <script src="src/core/base.js"></script>
  <script src="src/core/state.js"></script>
  <script src="src/core/constants.js"></script>

  <!-- Components (order matters: shell → views → panels → overlays) -->
  <script src="src/components/structra-toast.js"></script>
  <script src="src/components/structra-header.js"></script>
  <script src="src/components/structra-tabs.js"></script>
  <script src="src/components/structra-rail.js"></script>
  <script src="src/components/structra-status.js"></script>
  <script src="src/components/structra-canvas.js"></script>
  <script src="src/components/structra-input-zone.js"></script>
  <script src="src/components/structra-tree.js"></script>
  <script src="src/components/structra-table.js"></script>
  <script src="src/components/structra-graph.js"></script>
  <script src="src/components/structra-schema.js"></script>
  <script src="src/components/structra-editor.js"></script>
  <script src="src/components/structra-stats.js"></script>
  <script src="src/components/structra-find.js"></script>
  <script src="src/components/structra-query.js"></script>
  <script src="src/components/structra-context.js"></script>
  <script src="src/components/structra-drawer.js"></script>
  <script src="src/components/structra-command.js"></script>
  <script src="src/components/structra-loading.js"></script>

  <!-- V1 Utilities (ported as-is initially) -->
  <script src="src/utils/primitives.js"></script>
  <script src="src/utils/traverse.js"></script>
  <script src="src/utils/json-utils.js"></script>
  <script src="src/utils/path.js"></script>
  <script src="src/utils/storage.js"></script>

  <!-- App init -->
  <script src="src/app.js"></script>
</body>
</html>
```

## Script Load Order Dependencies
1. base.js (defines StructraElement) — FIRST
2. state.js (defines Structra global) — needs base.js
3. constants.js — standalone
4. structra-toast.js — standalone (others show toasts)
5. Shell components (header, tabs, rail, status) — need state
6. Canvas + views — need state + shell
7. Panels (query, context, drawer) — need state
8. Overlays (find, command, loading) — need state
9. V1 utils — standalone
10. app.js — LAST, initializes everything
