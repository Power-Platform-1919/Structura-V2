/* ============================================================
   STRUCTRA V2 — Theme Engine
   Structra.theme — built-in themes, custom themes, light / dark / system.

   A theme is a mode plus 17 base colours (see tokens.css, everything else
   is derived). Custom themes are stored in this browser and can be exported
   to a small JSON file and imported again.

   Theme file:
     { "format": "structra-theme", "version": 1, "name": "My theme", "mode": "dark",
       "colors": { "bg": "#0c1018", ... 17 keys ... },
       "fonts":  { "ui": "IBM Plex Sans", "mono": "JetBrains Mono", "size": 15 } }   // fonts is optional

   API:
     Structra.theme.list()                  → every theme (built-in first, then custom)
     Structra.theme.get(id)
     Structra.theme.current()               → { mode, theme }  the theme in effect right now
     Structra.theme.mode()                  → 'light' | 'dark' | 'system'
     Structra.theme.setMode(mode)
     Structra.theme.toggle()                → flip between light and dark
     Structra.theme.use(id)                 → make a theme the choice for its mode and switch to it
     Structra.theme.preview(theme)          → apply a theme without saving (editing)
     Structra.theme.endPreview()
     Structra.theme.saveCustom(theme)       → id
     Structra.theme.deleteCustom(id)
     Structra.theme.exportJson(id)          → JSON text
     Structra.theme.importJson(text)        → saved theme, throws with a readable message when invalid
     Structra.theme.contrast(hexA, hexB)    → WCAG contrast ratio
     Structra.theme.BASE_KEYS, Structra.theme.LABELS

   Events: 'theme:changed'
   ============================================================ */

window.Structra = window.Structra || {};

Structra.theme = (() => {
  const STORE_KEY = 'structra.theme';
  const FORMAT = 'structra-theme';

  const BASE_KEYS = ['bg', 'surface', 'surfaceAlt', 'border', 'text', 'textSec', 'textMuted', 'accent',
    'success', 'warning', 'danger', 'info', 'synKey', 'synString', 'synNumber', 'synBoolean', 'synNull'];

  const LABELS = {
    bg: 'App background', surface: 'Panels and cards', surfaceAlt: 'Raised areas', border: 'Borders',
    text: 'Text', textSec: 'Secondary text', textMuted: 'Muted text', accent: 'Accent',
    success: 'Success', warning: 'Warning', danger: 'Danger', info: 'Info',
    synKey: 'Keys', synString: 'Strings', synNumber: 'Numbers', synBoolean: 'Booleans', synNull: 'Null',
  };

  const CSS_VAR = {
    bg: '--bg', surface: '--surface', surfaceAlt: '--surface-alt', border: '--border',
    text: '--text', textSec: '--text-sec', textMuted: '--text-muted', accent: '--accent',
    success: '--success', warning: '--warning', danger: '--danger', info: '--info',
    synKey: '--syn-key', synString: '--syn-string', synNumber: '--syn-number', synBoolean: '--syn-boolean', synNull: '--syn-null',
  };

  /* ---------- built-in themes ---------- */

  const BUILT_IN = [
    { id: 'structra-light', name: 'Structra Light', mode: 'light', colors: {
      bg: '#eef1f6', surface: '#ffffff', surfaceAlt: '#f5f7fb', border: '#d9dfeb', text: '#141b2d', textSec: '#475069', textMuted: '#667189',
      accent: '#3b5bdb', success: '#12805c', warning: '#b45309', danger: '#c62a3a', info: '#1769aa',
      synKey: '#6741d9', synString: '#0b7a54', synNumber: '#b45309', synBoolean: '#1c6fd1', synNull: '#8a94a8' } },
    { id: 'paper', name: 'Paper', mode: 'light', colors: {
      bg: '#ece9e2', surface: '#fbfaf7', surfaceAlt: '#f3f1ec', border: '#d8d3c8', text: '#26231e', textSec: '#4f4a40', textMuted: '#6e685b',
      accent: '#0f766e', success: '#2f7d4f', warning: '#a8620a', danger: '#b3322f', info: '#2a6f9e',
      synKey: '#7c3f9e', synString: '#2f7d4f', synNumber: '#a8620a', synBoolean: '#1f6fa8', synNull: '#8b8578' } },
    { id: 'power-light', name: 'Power Platform', mode: 'light', colors: {
      bg: '#f4f1f6', surface: '#ffffff', surfaceAlt: '#f8f5fa', border: '#ddd5e3', text: '#1f1a24', textSec: '#4d4357', textMuted: '#6c6177',
      accent: '#742774', success: '#107c10', warning: '#b05c00', danger: '#c4262e', info: '#0f6cbd',
      synKey: '#742774', synString: '#107c10', synNumber: '#b05c00', synBoolean: '#0f6cbd', synNull: '#8a8094' } },
    { id: 'structra-dark', name: 'Structra Dark', mode: 'dark', colors: {
      bg: '#0c1018', surface: '#131925', surfaceAlt: '#1a2232', border: '#273149', text: '#e8edf7', textSec: '#aab4ca', textMuted: '#8591a9',
      accent: '#7b94ff', success: '#3ecf9a', warning: '#f0b44c', danger: '#ff6b7a', info: '#62b4f5',
      synKey: '#b69cff', synString: '#4fd6a4', synNumber: '#f5b95f', synBoolean: '#6db3ff', synNull: '#7a859e' } },
    { id: 'midnight', name: 'Midnight', mode: 'dark', colors: {
      bg: '#060a14', surface: '#0b1222', surfaceAlt: '#121b30', border: '#1f2c47', text: '#e2ecff', textSec: '#9fb3d6', textMuted: '#7388ae',
      accent: '#38bdf8', success: '#34d399', warning: '#fbbf24', danger: '#fb7185', info: '#60a5fa',
      synKey: '#c4b5fd', synString: '#6ee7b7', synNumber: '#fcd34d', synBoolean: '#7dd3fc', synNull: '#6b7fa6' } },
    { id: 'graphite', name: 'Graphite', mode: 'dark', colors: {
      bg: '#111113', surface: '#19191c', surfaceAlt: '#222226', border: '#34343a', text: '#ececf0', textSec: '#b3b3bc', textMuted: '#8a8a95',
      accent: '#f2a93b', success: '#5cc98c', warning: '#f2a93b', danger: '#f0706a', info: '#6bb0e8',
      synKey: '#d3a8ff', synString: '#7bd88f', synNumber: '#f2c36b', synBoolean: '#79b8ff', synNull: '#858592' } },
    { id: 'power-dark', name: 'Power Platform Dark', mode: 'dark', colors: {
      bg: '#14101a', surface: '#1c1624', surfaceAlt: '#261e31', border: '#382c47', text: '#f0eaf5', textSec: '#bcaecb', textMuted: '#9585a8',
      accent: '#d28ae0', success: '#54c26b', warning: '#f0a64a', danger: '#ff7a85', info: '#6db3f2',
      synKey: '#d28ae0', synString: '#54c26b', synNumber: '#f0a64a', synBoolean: '#6db3f2', synNull: '#8f7fa3' } },
    { id: 'high-contrast', name: 'High Contrast', mode: 'dark', colors: {
      bg: '#000000', surface: '#0a0a0a', surfaceAlt: '#161616', border: '#7a7a7a', text: '#ffffff', textSec: '#ececec', textMuted: '#c8c8c8',
      accent: '#ffd60a', success: '#4cff8f', warning: '#ffb020', danger: '#ff6b6b', info: '#5cc8ff',
      synKey: '#ff9cf0', synString: '#7dffb0', synNumber: '#ffd60a', synBoolean: '#6fd0ff', synNull: '#bdbdbd' } },
  ].map((t) => ({ ...t, builtIn: true }));

  const DEFAULTS = { mode: 'system', light: 'structra-light', dark: 'structra-dark', custom: [] };

  /* ---------- storage ---------- */

  let _store = null;
  let _preview = null;          // a theme being edited, applied but not saved

  function load() {
    if (_store) return _store;
    try {
      const raw = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      _store = { ...DEFAULTS, ...(raw && typeof raw === 'object' ? raw : {}) };
      if (!Array.isArray(_store.custom)) _store.custom = [];
    } catch {
      _store = { ...DEFAULTS };
    }
    return _store;
  }

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(_store)); } catch { /* storage unavailable */ }
  }

  /* ---------- colour helpers ---------- */

  const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

  function toRgb(hex) {
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }

  function luminance(hex) {
    const [r, g, b] = toRgb(hex).map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function contrast(a, b) {
    const la = luminance(a), lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }

  const onAccent = (accent) => (contrast(accent, '#ffffff') >= contrast(accent, '#0b1020') ? '#ffffff' : '#0b1020');

  /* ---------- catalogue ---------- */

  const list = () => [...BUILT_IN, ...load().custom];
  const get = (id) => list().find((t) => t.id === id) || null;

  function fallbackFor(mode) {
    return get(mode === 'dark' ? load().dark : load().light) || BUILT_IN.find((t) => t.mode === mode);
  }

  function systemMode() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  /** The theme in effect: a preview if one is open, otherwise the choice for the active mode */
  function current() {
    if (_preview) return { mode: _preview.mode, theme: _preview };
    const s = load();
    const mode = s.mode === 'system' ? systemMode() : s.mode;
    return { mode, theme: fallbackFor(mode) };
  }

  /* ---------- applying ---------- */

  const SAFE_FONT = /^[\w\s,'"\-]{1,120}$/;

  function apply() {
    const { mode, theme } = current();
    const root = document.documentElement;
    root.setAttribute('data-theme', mode);

    // Base colours go on :root as inline custom properties; the CSS derives the rest from them
    for (const key of BASE_KEYS) {
      const value = theme.colors[key] || (BUILT_IN.find((t) => t.mode === mode) || BUILT_IN[0]).colors[key];
      root.style.setProperty(CSS_VAR[key], value);
    }
    root.style.setProperty('--text-on-accent', onAccent(theme.colors.accent));

    const fonts = theme.fonts || {};
    const setFont = (cssVar, value) => {
      if (value && SAFE_FONT.test(value)) root.style.setProperty(cssVar, value + ', ' + (cssVar === '--font-mono' ? 'monospace' : 'system-ui, sans-serif'));
      else root.style.removeProperty(cssVar);
    };
    setFont('--font-sans', fonts.ui);
    setFont('--font-mono', fonts.mono);
    if (Number.isFinite(fonts.size) && fonts.size >= 12 && fonts.size <= 20) root.style.setProperty('--structra-font-size', fonts.size + 'px');
    else root.style.removeProperty('--structra-font-size');

    if (Structra.events) Structra.events.emit('theme:changed', { mode, theme });
  }

  /* ---------- choices ---------- */

  function setMode(mode) {
    if (!['light', 'dark', 'system'].includes(mode)) return;
    load().mode = mode;
    save();
    apply();
  }

  function toggle() {
    const { mode } = current();
    setMode(mode === 'dark' ? 'light' : 'dark');
  }

  function use(id) {
    const theme = get(id);
    if (!theme) return;
    const s = load();
    s[theme.mode] = id;
    s.mode = theme.mode;          // picking a theme also switches to its mode
    save();
    _preview = null;
    apply();
  }

  function preview(theme) {
    _preview = { ...theme, colors: { ...theme.colors } };
    apply();
  }

  function endPreview() {
    _preview = null;
    apply();
  }

  /* ---------- custom themes ---------- */

  function sanitize(input) {
    const errors = [];
    if (!input || typeof input !== 'object') throw new Error('The file is not a theme.');
    if (input.format !== FORMAT) errors.push('This is not a Structra theme file.');
    const name = String(input.name || '').trim().slice(0, 60);
    if (!name) errors.push('The theme needs a name.');
    if (input.mode !== 'light' && input.mode !== 'dark') errors.push('Mode must be "light" or "dark".');

    const base = BUILT_IN.find((t) => t.mode === input.mode) || BUILT_IN[0];
    const colors = {};
    for (const key of BASE_KEYS) {
      const v = input.colors && input.colors[key];
      if (v === undefined) { colors[key] = base.colors[key]; continue; }     // missing colours fall back to the built-in of that mode
      if (typeof v !== 'string' || !HEX.test(v)) errors.push('"' + key + '" must be a hex colour such as #3b5bdb.');
      else colors[key] = v.toLowerCase();
    }

    const theme = { name, mode: input.mode, colors };
    const f = input.fonts;
    if (f && typeof f === 'object') {
      const fonts = {};
      if (typeof f.ui === 'string' && SAFE_FONT.test(f.ui)) fonts.ui = f.ui;
      if (typeof f.mono === 'string' && SAFE_FONT.test(f.mono)) fonts.mono = f.mono;
      if (Number.isFinite(f.size) && f.size >= 12 && f.size <= 20) fonts.size = f.size;
      if (Object.keys(fonts).length) theme.fonts = fonts;
    }
    if (errors.length) throw new Error(errors.join(' '));
    return theme;
  }

  function uniqueId(name) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'theme';
    let id = 'custom-' + slug;
    let n = 2;
    while (get(id)) id = 'custom-' + slug + '-' + n++;
    return id;
  }

  /** Save a custom theme (new, or an update when it already has a custom id) */
  function saveCustom(input) {
    const clean = sanitize({ format: FORMAT, ...input });
    const s = load();
    const existing = input.id && s.custom.find((t) => t.id === input.id);
    if (existing) {
      Object.assign(existing, clean);
      save();
      if (s[existing.mode] === existing.id) apply();
      return existing.id;
    }
    const id = uniqueId(clean.name);
    s.custom.push({ id, ...clean });
    save();
    return id;
  }

  function deleteCustom(id) {
    const s = load();
    const theme = s.custom.find((t) => t.id === id);
    if (!theme) return;
    s.custom = s.custom.filter((t) => t.id !== id);
    if (s.light === id) s.light = DEFAULTS.light;
    if (s.dark === id) s.dark = DEFAULTS.dark;
    save();
    apply();
  }

  function exportJson(id) {
    const t = get(id);
    if (!t) throw new Error('Theme not found');
    const out = { format: FORMAT, version: 1, name: t.name, mode: t.mode, colors: { ...t.colors } };
    if (t.fonts) out.fonts = { ...t.fonts };
    return JSON.stringify(out, null, 2);
  }

  function importJson(text) {
    let data;
    try { data = JSON.parse(text); } catch { throw new Error('The file is not valid JSON.'); }
    const clean = sanitize(data);
    const id = saveCustom(clean);
    return get(id);
  }

  // Follow the operating system while the mode is "system"
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => { if (load().mode === 'system') apply(); };
    if (mq.addEventListener) mq.addEventListener('change', onChange); else if (mq.addListener) mq.addListener(onChange);
  }

  apply();          // before first paint

  return {
    BASE_KEYS, LABELS,
    list, get, current, mode: () => load().mode,
    setMode, toggle, use, preview, endPreview, apply,
    saveCustom, deleteCustom, exportJson, importJson, sanitize,
    contrast,
    /** Everything needed to carry appearance to another browser (workspace files) */
    snapshot: () => JSON.parse(JSON.stringify(load())),
    restore(snap) {
      if (!snap || typeof snap !== 'object') return;
      const s = load();
      if (['light', 'dark', 'system'].includes(snap.mode)) s.mode = snap.mode;
      if (Array.isArray(snap.custom)) {
        for (const t of snap.custom) {
          try { if (!get(t.id)) s.custom.push({ id: String(t.id), ...sanitize({ format: FORMAT, ...t }) }); } catch { /* skip an invalid theme */ }
        }
      }
      if (get(snap.light)) s.light = snap.light;
      if (get(snap.dark)) s.dark = snap.dark;
      save();
      apply();
    },
    chosen: () => ({ light: load().light, dark: load().dark }),
  };
})();
