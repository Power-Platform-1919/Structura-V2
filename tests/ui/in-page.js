/* Functions the audit scripts run inside the page (injected with page.addScriptTag). */
window.__ui = (() => {
  const cv = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  cv.canvas.width = cv.canvas.height = 1;

  /** Any CSS colour (rgb, color(), color-mix result) as [r, g, b, a] */
  function rgba(css) {
    if (!css || css === 'transparent') return [0, 0, 0, 0];
    cv.clearRect(0, 0, 1, 1);
    cv.fillStyle = '#000'; cv.fillStyle = css;
    cv.fillRect(0, 0, 1, 1);
    const d = cv.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  }
  const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

  /** The colour actually behind an element: the first ancestor background that is not see-through, blended */
  function backdrop(el) {
    let layers = [];
    for (let e = el; e; e = e.parentElement) {
      const c = rgba(getComputedStyle(e).backgroundColor);
      if (c[3] > 0) { layers.push(c); if (c[3] >= 0.99) break; }
    }
    let base = [255, 255, 255];
    if (!layers.length || layers[layers.length - 1][3] < 0.99) base = rgba(getComputedStyle(document.body).backgroundColor).slice(0, 3);
    for (let i = layers.length - 1; i >= 0; i--) {
      const [r, g, b, a] = layers[i];
      base = [r * a + base[0] * (1 - a), g * a + base[1] * (1 - a), b * a + base[2] * (1 - a)];
    }
    return base;
  }

  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) return false;
    return r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
  };

  /** A short, readable address of an element for a finding */
  function where(el) {
    const parts = [];
    for (let e = el; e && e !== document.body && parts.length < 4; e = e.parentElement) {
      let s = e.tagName.toLowerCase();
      if (e.id) s += '#' + e.id;
      else if (e.classList.length) s += '.' + [...e.classList].slice(0, 2).join('.');
      parts.unshift(s);
    }
    return parts.join(' > ');
  }

  /** Every element with its own text, with the contrast of that text against what is behind it */
  function textContrast() {
    const out = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = n.nodeValue.trim();
      const el = n.parentElement;
      if (!text || !el || seen.has(el) || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'OPTION'].includes(el.tagName) || !visible(el)) continue;
      if (el.closest('.ov:not(.show), .io-overlay:not(.show), [hidden], svg')) continue;
      seen.add(el);
      const s = getComputedStyle(el);
      const fg = rgba(s.color);
      const bg = backdrop(el);
      const blended = [fg[0] * fg[3] + bg[0] * (1 - fg[3]), fg[1] * fg[3] + bg[1] * (1 - fg[3]), fg[2] * fg[3] + bg[2] * (1 - fg[3])];
      const size = parseFloat(s.fontSize);
      const bold = Number(s.fontWeight) >= 700;
      out.push({ text: text.slice(0, 40), ratio: ratio(blended, bg), size, large: size >= 24 || (size >= 18.66 && bold), where: where(el), disabled: !!el.closest(':disabled, [aria-disabled="true"]') });
    }
    return out;
  }

  return { rgba, ratio, backdrop, visible, where, textContrast };
})();
