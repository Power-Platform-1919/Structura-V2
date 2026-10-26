/* ============================================================
   STRUCTRA V2 - Logger
   Centralized logging with dev/normal modes.

   Modes:
     'dev'    - All logs (debug, info, warn, error, perf)
     'normal' - Main logs only (info, warn, error)
     'off'    - Errors only

   Usage:
     Structra.log.info('Component', 'message', optionalData);
     Structra.log.debug('Component', 'message', optionalData);
     Structra.log.warn('Component', 'message', optionalData);
     Structra.log.error('Component', 'message', optionalData);
     Structra.log.perf('Component', 'action', durationMs);
     Structra.log.group('Component', 'label');
     Structra.log.groupEnd();
     Structra.log.setMode('dev' | 'normal' | 'off');

   Toggle from console:
     Structra.log.setMode('dev')   // show everything
     Structra.log.setMode('normal') // main logs
     Structra.log.setMode('off')    // errors only
   ============================================================ */

window.Structra = window.Structra || {};

Structra.log = (() => {
  // Priority: URL param > settings > localStorage > default
  const _urlMode = new URLSearchParams(window.location.search).get('log');
  let _mode = (['dev', 'normal', 'off'].includes(_urlMode) ? _urlMode : null)
    || (Structra.appSettings && Structra.appSettings.get('logMode'))
    || localStorage.getItem('structra.logMode')
    || 'normal';

  const COLORS = {
    // Core
    'App':            '#4fc3f7',
    'State':          '#ba68c8',
    'EventBus':       '#ff8a65',
    'WorkerPool':     '#4db6ac',
    'Worker':         '#4db6ac',
    // Components
    'Tree':           '#81c784',
    'Editor':         '#ffb74d',
    'Table':          '#64b5f6',
    'Stats':          '#e57373',
    'Schema':         '#9575cd',
    'Graph':          '#4dd0e1',
    'InputPanel':     '#aed581',
    'Drawer':         '#f06292',
    'Header':         '#90a4ae',
    'Tabs':           '#ce93d8',
    'ViewSwitcher':   '#80cbc4',
    'CanvasHeader':   '#a1887f',
    'Find':           '#80deea',
    'Query':          '#c5e1a5',
    'Context':        '#ef9a9a',
    'Command':        '#b39ddb',
    'Loading':        '#ffe082',
    'Toast':          '#80cbc4',
    'Rail':           '#bcaaa4',
    'Status':         '#b0bec5',
    // UI modules
    'JsonView':       '#66bb6a',
    'Path':           '#8d6e63',
  };

  function _color(tag) {
    return COLORS[tag] || '#ccc';
  }

  function _prefix(tag) {
    const now = new Date();
    const ts = now.toLocaleTimeString('en-GB', { hour12: false }) + '.' + String(now.getMilliseconds()).padStart(3, '0');
    return [
      `%c${ts} %c[Structra]%c[${tag}]`,
      'color:#888;font-weight:normal',
      'color:#7c4dff;font-weight:bold',
      `color:${_color(tag)};font-weight:bold`
    ];
  }

  function _shouldLog(level) {
    if (_mode === 'off') return level === 'error';
    if (_mode === 'normal') return level !== 'debug' && level !== 'perf';
    return true; // dev mode - log everything
  }

  return {
    /** Get current mode */
    getMode() { return _mode; },

    /** Set log mode: 'dev', 'normal', or 'off' */
    setMode(mode) {
      if (!['dev', 'normal', 'off'].includes(mode)) {
        console.warn('[Structra][Logger] Invalid mode:', mode, '- use dev, normal, or off');
        return;
      }
      _mode = mode;
      // Persist via settings if available, else direct localStorage
      if (Structra.appSettings) {
        Structra.appSettings.set('logMode', mode);
      } else {
        localStorage.setItem('structra.logMode', mode);
      }
      console.log(
        `%c[Structra]%c[Logger] Mode set to: ${mode}`,
        'color:#7c4dff;font-weight:bold',
        'color:#ffa726;font-weight:bold'
      );
    },

    /** Debug - only in dev mode */
    debug(tag, msg, ...data) {
      if (!_shouldLog('debug')) return;
      const p = _prefix(tag);
      if (data.length) console.debug(p[0] + ' ' + msg, p[1], p[2], p[3], ...data);
      else console.debug(p[0] + ' ' + msg, p[1], p[2], p[3]);
    },

    /** Info - dev + normal modes */
    info(tag, msg, ...data) {
      if (!_shouldLog('info')) return;
      const p = _prefix(tag);
      if (data.length) console.log(p[0] + ' ' + msg, p[1], p[2], p[3], ...data);
      else console.log(p[0] + ' ' + msg, p[1], p[2], p[3]);
    },

    /** Warn - dev + normal modes */
    warn(tag, msg, ...data) {
      if (!_shouldLog('warn')) return;
      const p = _prefix(tag);
      if (data.length) console.warn(p[0] + ' ' + msg, p[1], p[2], p[3], ...data);
      else console.warn(p[0] + ' ' + msg, p[1], p[2], p[3]);
    },

    /** Error - always logged */
    error(tag, msg, ...data) {
      if (!_shouldLog('error')) return;
      const p = _prefix(tag);
      if (data.length) console.error(p[0] + ' ' + msg, p[1], p[2], p[3], ...data);
      else console.error(p[0] + ' ' + msg, p[1], p[2], p[3]);
    },

    /** Performance timing - dev mode only */
    perf(tag, action, durationMs) {
      if (!_shouldLog('perf')) return;
      const p = _prefix(tag);
      const rounded = typeof durationMs === 'number' ? durationMs.toFixed(1) : durationMs;
      console.log(p[0] + ' ⏱ ' + action + ' - ' + rounded + 'ms', p[1], p[2], p[3]);
    },

    /** Grouped logs - dev mode only */
    group(tag, label) {
      if (!_shouldLog('debug')) return;
      const p = _prefix(tag);
      console.groupCollapsed(p[0] + ' ' + label, p[1], p[2], p[3]);
    },

    /** End grouped logs */
    groupEnd() {
      if (!_shouldLog('debug')) return;
      console.groupEnd();
    },

    /** Table output - dev mode only */
    table(tag, label, data) {
      if (!_shouldLog('debug')) return;
      const p = _prefix(tag);
      console.log(p[0] + ' ' + label, p[1], p[2]);
      console.table(data);
    }
  };
})();
