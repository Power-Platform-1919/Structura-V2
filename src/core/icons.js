/* ============================================================
   STRUCTRA V2 - Icons
   Structra.icons - every icon in the app comes through here.
   Artwork and names come straight from the Lucide library
   (https://lucide.dev, ISC licence), shipped locally in
   src/libs/lucide/lucide-icons.js so the app works offline. That file holds
   only the icons the code names (tools/build-lucide.mjs builds it from the
   Lucide package), so a new icon name needs the build run once.

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
  const library = window.lucide;
  if (!library || !library.icons) {
    if (Structra.log) Structra.log.error('Icons', 'The Lucide library did not load');
  }

  const TOKENS = ['accent', 'success', 'warning', 'danger', 'info', 'text', 'text-sec', 'text-muted',
    'syn-key', 'syn-string', 'syn-number', 'syn-boolean', 'syn-null'];

  /** Theme colour names resolve to the CSS variables, so icons follow light, dark and custom themes */
  function colorValue(color) {
    if (color === 'muted') return 'var(--text-muted)';
    return TOKENS.includes(color) ? `var(--${color})` : color;
  }

  const pascal = (name) => name.replace(/(^|-)([a-z0-9])/g, (_, __, letter) => letter.toUpperCase());
  const nodes = (name) => (library && library.icons ? library.icons[pascal(name)] : undefined);

  const attrString = (attrs) => Object.entries(attrs).map(([key, value]) => `${key}="${value}"`).join(' ');
  const childrenString = (children) => children.map(([tag, attrs]) => `<${tag} ${attrString(attrs)}/>`).join('');

  function svg(name, options = {}) {
    const node = nodes(name);
    if (!node) {
      if (Structra.log) Structra.log.warn('Icons', 'Unknown icon: ' + name);
      return '';
    }
    const [, base, children] = node;
    const attrs = { ...base, 'aria-hidden': 'true', focusable: 'false' };
    if (options.size) { attrs.width = options.size; attrs.height = options.size; }
    if (options.stroke) attrs['stroke-width'] = options.stroke;
    if (options.cls) attrs.class = options.cls;
    if (options.color) attrs.style = `color:${colorValue(options.color)}`;
    return `<svg ${attrString(attrs)}>${childrenString(children)}</svg>`;
  }

  /** Static HTML can say <i data-icon="search"></i>; this swaps in the artwork */
  function hydrate(root = document) {
    root.querySelectorAll('[data-icon]').forEach((element) => {
      const html = svg(element.dataset.icon, { size: element.dataset.size, cls: element.dataset.cls, color: element.dataset.color });
      if (html) element.outerHTML = html;
    });
  }

  // Fill the placeholders written directly in index.html as soon as the page is parsed
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => hydrate());
  else hydrate();

  return { svg, has: (name) => !!nodes(name), hydrate };
})();
