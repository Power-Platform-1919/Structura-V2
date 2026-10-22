/* ============================================================
   STRUCTRA V2 — Share and Capture
   Structra.share   — put a small JSON document in the URL hash, and read it back.
   Structra.capture — save an element as a PNG image.

   The hash looks like  #share=g.<base64url>  (gzip)  or  #share=p.<base64url>  (plain).

   API:
     await Structra.share.createUrl(data)   → full URL, throws when too large
     await Structra.share.readHash()        → { data } or null
     Structra.share.clearHash()
     await Structra.capture.png(element, fileName)
   ============================================================ */

window.Structra = window.Structra || {};

Structra.share = (() => {
  const MAX_ENCODED = 30000;   // characters in the hash

  const toBase64Url = (bytes) => {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };

  const fromBase64Url = (s) => {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  };

  async function pipe(bytes, stream) {
    const out = new Blob([bytes]).stream().pipeThrough(stream);
    return new Uint8Array(await new Response(out).arrayBuffer());
  }

  async function createUrl(data) {
    const bytes = new TextEncoder().encode(JSON.stringify(data));
    let encoded;
    if (typeof CompressionStream === 'function') {
      encoded = 'g.' + toBase64Url(await pipe(bytes, new CompressionStream('gzip')));
    } else {
      encoded = 'p.' + toBase64Url(bytes);
    }
    if (encoded.length > MAX_ENCODED) {
      throw new Error('Too large to share in a link (' + Math.round(encoded.length / 1000) + ' KB encoded, limit ' + Math.round(MAX_ENCODED / 1000) + ' KB)');
    }
    return location.href.split('#')[0] + '#share=' + encoded;
  }

  async function readHash() {
    const m = /^#share=([gp])\.(.+)$/.exec(location.hash);
    if (!m) return null;
    let bytes = fromBase64Url(m[2]);
    if (m[1] === 'g') bytes = await pipe(bytes, new DecompressionStream('gzip'));
    return { data: JSON.parse(new TextDecoder().decode(bytes)) };
  }

  function clearHash() {
    history.replaceState(null, '', location.pathname + location.search);
  }

  return { createUrl, readHash, clearHash };
})();

Structra.capture = (() => {
  // html2canvas reads colours itself and does not know the colour functions the themes use
  // (color-mix and color()). Before it draws, every colour in the copy of the page is written as plain rgb().
  const COLOR_PROPS = ['color', 'backgroundColor', 'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor',
    'outlineColor', 'textDecorationColor', 'caretColor', 'columnRuleColor', 'fill', 'stroke', 'boxShadow', 'backgroundImage', 'textShadow'];
  const MODERN = /(color-mix|color|oklch|oklab|lch|lab|hwb)\((?:[^()]|\([^()]*\))*\)/g;

  function colorResolver() {
    const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    ctx.canvas.width = ctx.canvas.height = 1;
    const cache = new Map();
    return (css) => {
      if (cache.has(css)) return cache.get(css);
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = '#000';
      ctx.fillStyle = css;                       // the browser parses any colour it supports
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      const out = a === 255 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${+(a / 255).toFixed(3)})`;
      cache.set(css, out);
      return out;
    };
  }

  function flattenColors(clonedDoc) {
    const win = clonedDoc.defaultView;
    const toRgb = colorResolver();
    for (const el of clonedDoc.querySelectorAll('*')) {
      const cs = win.getComputedStyle(el);
      for (const prop of COLOR_PROPS) {
        const value = cs[prop];
        if (value && MODERN.test(value)) {
          MODERN.lastIndex = 0;
          el.style[prop] = value.replace(MODERN, (m) => toRgb(m));
        }
        MODERN.lastIndex = 0;
      }
    }
  }

  async function png(element, fileName) {
    if (!element) throw new Error('Nothing to capture');
    await Structra.libs.require('html2canvas');
    const bg = getComputedStyle(document.body).backgroundColor;
    const canvas = await window.html2canvas(element, {
      backgroundColor: MODERN.test(bg) ? colorResolver()(bg) : bg,
      scale: Math.min(2, window.devicePixelRatio || 1),
      onclone: (doc) => flattenColors(doc),
    });
    MODERN.lastIndex = 0;
    await new Promise((resolve, reject) => canvas.toBlob((blob) => {
      if (!blob) { reject(new Error('Could not create the image')); return; }
      Structra.util.download(blob, fileName || 'structra.png');
      resolve();
    }, 'image/png'));
  }
  return { png };
})();
