/* ============================================================
   STRUCTRA V2 - Constants
   Shared config values, shortcut map, view/rail definitions
   ============================================================ */

Structra.constants = {
  MAX_TABS: 8,

  VIEWS: ['overview', 'tree', 'table', 'graph', 'schema', 'editor'],

  DRAWER_STATES: ['collapsed', 'medium', 'expanded'],

  // Older rail description. The rail is built by hand in components/structra-rail.js, so nothing reads
  // RAIL_ITEMS or RAIL_BOTTOM today. Change the rail there.
  RAIL_ITEMS: [
    { id: 'explorer',  title: 'Explorer',        icon: 'folder' },
    { id: 'query',     title: 'Query and Transform',  icon: 'filter' },
    { id: 'power',     title: 'Power Platform',  icon: 'zap' },
    { id: 'overview',  title: 'Overview',        icon: 'bar-chart' },
    { id: 'transform', title: 'Transform',       icon: 'wand' },
  ],

  RAIL_BOTTOM: [
    { id: 'settings',  title: 'Settings',        icon: 'settings' },
  ],

  SHORTCUTS: {
    'ctrl+k':       'command-palette',
    'ctrl+f':       'find',
    'ctrl+h':       'find-replace',
    'ctrl+shift+f': 'filter',
    'ctrl+l':       'focus-path',
    'alt+n':        'new-tab',      // Ctrl+T and Ctrl+W belong to the browser
    'alt+w':        'close-tab',
    'ctrl+1':       'view-tree',
    'ctrl+2':       'view-table',
    'ctrl+3':       'view-graph',
    'ctrl+4':       'view-schema',
    'ctrl+5':       'view-overview',
    'ctrl+e':       'view-editor',
    'ctrl+shift+s': 'sort',
    'ctrl+shift+e': 'export-csv',
    'ctrl+shift+p': 'mask',
    'ctrl+d':       'compare',
    'ctrl+b':       'bookmark',
    'alt+arrowleft':  'nav-back',
    'alt+arrowright': 'nav-forward',
    'ctrl+z':       'undo',
    'ctrl+y':       'redo',
    'alt+t':        'theme',
    'escape':       'close-overlay',
  },

  QUERY_MODES: ['path', 'jsonpath', 'regex', 'js', 'sql'],

  DRAWER_TABS: [
    { id: 'analyze',     label: 'Analyze' },
    { id: 'expressions', label: 'Expressions' },
    { id: 'schema-gen',  label: 'Schema Gen' },
  ],
};
