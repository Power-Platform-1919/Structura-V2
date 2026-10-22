/* ============================================================
   STRUCTRA V2 — Icons
   Structra.icons — every icon in the app comes through here.
   Artwork and names come straight from the Lucide library
   (https://lucide.dev, ISC licence), shipped locally in
   src/vendor/lucide.min.js so the app works offline. Any Lucide icon
   name works; nothing is listed or copied by hand.

   API:
     Structra.icons.svg('search')                        → '<svg ...>' string
     Structra.icons.svg('x', { size: 16, cls: 'foo' })
     Structra.icons.svg('check', { color: 'success' })   // a theme colour name (accent, success, warning, danger,
                                                         // info, text, text-sec, muted, syn-*) or any CSS colour
     Structra.icons.svg('triangle-alert', { stroke: 1.5 })
     Structra.icons.has('search')                        → true / false
     Structra.icons.hydrate(rootElement)                 → replaces <i data-icon="name" data-color="accent"></i>

   Every icon draws with currentColor, so it follows the text colour of
   whatever it sits in unless a colour is passed.
   ============================================================ */

window.Structra = window.Structra || {};

Structra.icons = (() => {
  const lib = window.lucide;
  if (!lib || !lib.icons) {
    if (Structra.log) Structra.log.error('Icons', 'The Lucide library did not load');
  }

  const TOKENS = ['accent', 'success', 'warning', 'danger', 'info', 'text', 'text-sec', 'text-muted',
    'syn-key', 'syn-string', 'syn-number', 'syn-boolean', 'syn-null'];

  /** Theme colour names resolve to the CSS variables, so icons follow light, dark and custom themes */
  function colorValue(c) {
    if (c === 'muted') return 'var(--text-muted)';
    return TOKENS.includes(c) ? `var(--${c})` : c;
  }

  const pascal = (name) => name.replace(/(^|-)([a-z0-9])/g, (_, __, ch) => ch.toUpperCase());
  const nodes = (name) => (lib && lib.icons ? lib.icons[pascal(name)] : undefined);

  const attrString = (attrs) => Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ');
  const childrenString = (children) => children.map(([tag, attrs]) => `<${tag} ${attrString(attrs)}/>`).join('');

  function svg(name, opts = {}) {
    const node = nodes(name);
    if (!node) {
      if (Structra.log) Structra.log.warn('Icons', 'Unknown icon: ' + name);
      return '';
    }
    const [, base, children] = node;
    const attrs = { ...base, 'aria-hidden': 'true', focusable: 'false' };
    if (opts.size) { attrs.width = opts.size; attrs.height = opts.size; }
    if (opts.stroke) attrs['stroke-width'] = opts.stroke;
    if (opts.cls) attrs.class = opts.cls;
    if (opts.color) attrs.style = `color:${colorValue(opts.color)}`;
    return `<svg ${attrString(attrs)}>${childrenString(children)}</svg>`;
  }

  /** Static HTML can say <i data-icon="search"></i>; this swaps in the artwork */
  function hydrate(root = document) {
    root.querySelectorAll('[data-icon]').forEach((el) => {
      const html = svg(el.dataset.icon, { size: el.dataset.size, cls: el.dataset.cls, color: el.dataset.color });
      if (html) el.outerHTML = html;
    });
  }

  // Fill the placeholders written directly in index.html as soon as the page is parsed
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => hydrate());
  else hydrate();

  return { svg, has: (name) => !!nodes(name), hydrate };
})();
