/* ============================================================
   STRUCTRA V2 - Theme Engine
   Structra.themeEngine - built-in themes, custom themes, light / dark / system.

   A theme is a mode plus 17 base colours (see tokens.css, everything else
   is derived). Custom themes are stored in this browser and can be exported
   to a small JSON file and imported again.

   Theme file:
     { "format": "structra-theme", "version": 1, "name": "My theme", "mode": "dark",
       "colors": { "bg": "#0c1018", ... 17 keys ... },
       "fonts":  { "ui": "IBM Plex Sans", "mono": "JetBrains Mono", "size": 15 } }   // fonts is optional

   API:
     Structra.themeEngine.list()                  → every theme (built-in first, then custom)
     Structra.themeEngine.get(id)
     Structra.themeEngine.current()               → { mode, theme }  the theme in effect right now
     Structra.themeEngine.mode()                  → 'light' | 'dark' | 'system'
     Structra.themeEngine.setMode(mode)
     Structra.themeEngine.toggle()                → flip between light and dark
     Structra.themeEngine.use(id)                 → make a theme the choice for its mode and switch to it
     Structra.themeEngine.preview(theme)          → apply a theme without saving (editing)
     Structra.themeEngine.endPreview()
     Structra.themeEngine.saveCustom(theme)       → id
     Structra.themeEngine.deleteCustom(id)
     Structra.themeEngine.exportJson(id)          → JSON text
     Structra.themeEngine.importJson(text)        → saved theme, throws with a readable message when invalid
     Structra.themeEngine.contrast(hexA, hexB)    → WCAG contrast ratio
     Structra.themeEngine.BASE_KEYS, Structra.themeEngine.LABELS

   Events: 'theme:changed'

   Wiring (generated from the code below; update it when you add or remove an event):
     Emits: theme:changed
   ============================================================ */

window.Structra = window.Structra || {};

Structra.themeEngine = (() => {
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
      bg: '#eef1f6', surface: '#ffffff', surfaceAlt: '#f5f7fb', border: '#d9dfeb', text: '#141b2d', textSec: '#475069', textMuted: '#606b81',
      accent: '#3b5bdb', success: '#12805c', warning: '#b45309', danger: '#c62a3a', info: '#1769aa',
      synKey: '#6741d9', synString: '#0b7a54', synNumber: '#b45309', synBoolean: '#1a69c5', synNull: '#666e7c' } },
    { id: 'paper', name: 'Paper', mode: 'light', colors: {
      bg: '#ece9e2', surface: '#fbfaf7', surfaceAlt: '#f3f1ec', border: '#d8d3c8', text: '#26231e', textSec: '#4f4a40', textMuted: '#6e685b',
      accent: '#0d6b64', success: '#2f7d4f', warning: '#a8620a', danger: '#b3322f', info: '#2a6f9e',
      synKey: '#7c3f9e', synString: '#2f7d4f', synNumber: '#a8620a', synBoolean: '#1e6ca3', synNull: '#6d685f' } },
    { id: 'power-light', name: 'Power Platform', mode: 'light', colors: {
      bg: '#f4f1f6', surface: '#ffffff', surfaceAlt: '#f8f5fa', border: '#ddd5e3', text: '#1f1a24', textSec: '#4d4357', textMuted: '#6c6177',
      accent: '#742774', success: '#107c10', warning: '#b05c00', danger: '#c4262e', info: '#0f6cbd',
      synKey: '#742774', synString: '#107c10', synNumber: '#b05c00', synBoolean: '#0f6cbd', synNull: '#726b7c' } },
    { id: 'structra-dark', name: 'Structra Dark', mode: 'dark', colors: {
      bg: '#0c1018', surface: '#151c2b', surfaceAlt: '#1d2638', border: '#35425f', text: '#e8edf7', textSec: '#aab4ca', textMuted: '#8591a9',
      accent: '#7b94ff', success: '#3ecf9a', warning: '#f0b44c', danger: '#ff6b7a', info: '#62b4f5',
      synKey: '#b69cff', synString: '#4fd6a4', synNumber: '#f5b95f', synBoolean: '#6db3ff', synNull: '#828da4' } },
    { id: 'midnight', name: 'Midnight', mode: 'dark', colors: {
      bg: '#060a14', surface: '#0e1629', surfaceAlt: '#16213a', border: '#2c3d61', text: '#e2ecff', textSec: '#9fb3d6', textMuted: '#7a90b4',
      accent: '#38bdf8', success: '#34d399', warning: '#fbbf24', danger: '#fb7185', info: '#60a5fa',
      synKey: '#c4b5fd', synString: '#6ee7b7', synNumber: '#fcd34d', synBoolean: '#7dd3fc', synNull: '#7a8eb2' } },
    { id: 'graphite', name: 'Graphite', mode: 'dark', colors: {
      bg: '#111113', surface: '#19191c', surfaceAlt: '#222226', border: '#34343a', text: '#ececf0', textSec: '#b3b3bc', textMuted: '#8a8a95',
      accent: '#f2a93b', success: '#5cc98c', warning: '#f2a93b', danger: '#f0706a', info: '#6bb0e8',
      synKey: '#d3a8ff', synString: '#7bd88f', synNumber: '#f2c36b', synBoolean: '#79b8ff', synNull: '#898995' } },
    { id: 'power-dark', name: 'Power Platform Dark', mode: 'dark', colors: {
      bg: '#14101a', surface: '#1c1624', surfaceAlt: '#261e31', border: '#382c47', text: '#f0eaf5', textSec: '#bcaecb', textMuted: '#9585a8',
      accent: '#d28ae0', success: '#54c26b', warning: '#f0a64a', danger: '#ff7a85', info: '#6db3f2',
      synKey: '#d28ae0', synString: '#54c26b', synNumber: '#f0a64a', synBoolean: '#6db3f2', synNull: '#9283a6' } },
    { id: 'high-contrast', name: 'High Contrast', mode: 'dark', colors: {
      bg: '#000000', surface: '#101010', surfaceAlt: '#1f1f1f', border: '#d0d0d0', text: '#ffffff', textSec: '#ececec', textMuted: '#c8c8c8',
      accent: '#ffd60a', success: '#4cff8f', warning: '#ffb020', danger: '#ff6b6b', info: '#5cc8ff',
      synKey: '#ff9cf0', synString: '#7dffb0', synNumber: '#ffd60a', synBoolean: '#6fd0ff', synNull: '#bdbdbd' } },
  ].map((theme) => ({ ...theme, builtIn: true }));

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
    let digits = hex.replace('#', '');
    if (digits.length === 3) digits = digits.split('').map((part) => part + part).join('');
    return [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16));
  }

  function luminance(hex) {
    const [red, green, blue] = toRgb(hex).map((channel) => {
      const fraction = channel / 255;
      return fraction <= 0.03928 ? fraction / 12.92 : Math.pow((fraction + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  }

  function contrast(first, second) {
    const firstLuminance = luminance(first), secondLuminance = luminance(second);
    return (Math.max(firstLuminance, secondLuminance) + 0.05) / (Math.min(firstLuminance, secondLuminance) + 0.05);
  }

  const onAccent = (accent) => (contrast(accent, '#ffffff') >= contrast(accent, '#0b1020') ? '#ffffff' : '#0b1020');

  /* ---------- catalogue ---------- */

  const list = () => [...BUILT_IN, ...load().custom];
  const get = (id) => list().find((theme) => theme.id === id) || null;

  function fallbackFor(mode) {
    return get(mode === 'dark' ? load().dark : load().light) || BUILT_IN.find((theme) => theme.mode === mode);
  }

  function systemMode() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  /** The theme in effect: a preview if one is open, otherwise the choice for the active mode */
  function current() {
    if (_preview) return { mode: _preview.mode, theme: _preview };
    const settings = load();
    const mode = settings.mode === 'system' ? systemMode() : settings.mode;
    return { mode, theme: fallbackFor(mode) };
  }

  /* ---------- applying ---------- */

  const SAFE_FONT = /^[\w\s,'"\-]{1,120}$/;

  function apply() {
    const { mode, theme } = current();
    const root = document.documentElement;
    root.setAttribute('data-theme', mode);
    root.setAttribute('data-theme-id', theme.id || '');

    // Base colours go on :root as inline custom properties; the CSS derives the rest from them
    for (const key of BASE_KEYS) {
      const value = theme.colors[key] || (BUILT_IN.find((theme) => theme.mode === mode) || BUILT_IN[0]).colors[key];
      root.style.setProperty(CSS_VAR[key], value);
    }
    root.style.setProperty('--text-on-accent', onAccent(theme.colors.accent));
    // Status text drawn on its own tinted background: pulled toward the text colour so it stays readable (computed here, not with color-mix, which image export cannot read)
    const towardText = (hex) => { const baseColor = toRgb(hex), textColor = toRgb(theme.colors.text); return '#' + baseColor.map((channel, i) => Math.round(channel * 0.78 + textColor[i] * 0.22).toString(16).padStart(2, '0')).join(''); };
    for (const colorName of ['success', 'warning', 'danger']) root.style.setProperty('--' + colorName + '-ink', towardText(theme.colors[colorName] || '#000000'));

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
    const settings = load();
    settings[theme.mode] = id;
    settings.mode = theme.mode;          // picking a theme also switches to its mode
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

    const base = BUILT_IN.find((theme) => theme.mode === input.mode) || BUILT_IN[0];
    const colors = {};
    for (const key of BASE_KEYS) {
      const color = input.colors && input.colors[key];
      if (color === undefined) { colors[key] = base.colors[key]; continue; }     // missing colours fall back to the built-in of that mode
      if (typeof color !== 'string' || !HEX.test(color)) errors.push('"' + key + '" must be a hex colour such as #3b5bdb.');
      else colors[key] = color.toLowerCase();
    }

    const theme = { name, mode: input.mode, colors };
    const fontSettings = input.fonts;
    if (fontSettings && typeof fontSettings === 'object') {
      const fonts = {};
      if (typeof fontSettings.ui === 'string' && SAFE_FONT.test(fontSettings.ui)) fonts.ui = fontSettings.ui;
      if (typeof fontSettings.mono === 'string' && SAFE_FONT.test(fontSettings.mono)) fonts.mono = fontSettings.mono;
      if (Number.isFinite(fontSettings.size) && fontSettings.size >= 12 && fontSettings.size <= 20) fonts.size = fontSettings.size;
      if (Object.keys(fonts).length) theme.fonts = fonts;
    }
    if (errors.length) throw new Error(errors.join(' '));
    return theme;
  }

  function uniqueId(name) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'theme';
    let id = 'custom-' + slug;
    let suffix = 2;
    while (get(id)) id = 'custom-' + slug + '-' + suffix++;
    return id;
  }

  /** Save a custom theme (new, or an update when it already has a custom id) */
  function saveCustom(input) {
    const clean = sanitize({ format: FORMAT, ...input });
    const settings = load();
    const existing = input.id && settings.custom.find((theme) => theme.id === input.id);
    if (existing) {
      Object.assign(existing, clean);
      save();
      if (settings[existing.mode] === existing.id) apply();
      return existing.id;
    }
    const id = uniqueId(clean.name);
    settings.custom.push({ id, ...clean });
    save();
    return id;
  }

  function deleteCustom(id) {
    const settings = load();
    const theme = settings.custom.find((theme) => theme.id === id);
    if (!theme) return;
    settings.custom = settings.custom.filter((theme) => theme.id !== id);
    if (settings.light === id) settings.light = DEFAULTS.light;
    if (settings.dark === id) settings.dark = DEFAULTS.dark;
    save();
    apply();
  }

  function exportJson(id) {
    const theme = get(id);
    if (!theme) throw new Error('Theme not found');
    const out = { format: FORMAT, version: 1, name: theme.name, mode: theme.mode, colors: { ...theme.colors } };
    if (theme.fonts) out.fonts = { ...theme.fonts };
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
    const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => { if (load().mode === 'system') apply(); };
    if (darkQuery.addEventListener) darkQuery.addEventListener('change', onChange); else if (darkQuery.addListener) darkQuery.addListener(onChange);
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
      const settings = load();
      if (['light', 'dark', 'system'].includes(snap.mode)) settings.mode = snap.mode;
      if (Array.isArray(snap.custom)) {
        for (const theme of snap.custom) {
          try { if (!get(theme.id)) settings.custom.push({ id: String(theme.id), ...sanitize({ format: FORMAT, ...theme }) }); } catch { /* skip an invalid theme */ }
        }
      }
      if (get(snap.light)) settings.light = snap.light;
      if (get(snap.dark)) settings.dark = snap.dark;
      save();
      apply();
    },
    chosen: () => ({ light: load().light, dark: load().dark }),
  };
})();
