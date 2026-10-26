/* ============================================================
   STRUCTRA V2 - Share and Capture
   Structra.shareLink   - put a small JSON document in the URL hash, and read it back.
   Structra.imageCapture - save an element as a PNG image.

   The hash looks like  #share=g.<base64url>  (gzip)  or  #share=p.<base64url>  (plain).

   API:
     await Structra.shareLink.createUrl(data, name)   → { url, bytes }, throws when too large
     await Structra.shareLink.readHash()        → { data, name } or null
     Structra.shareLink.clearHash()
     await Structra.imageCapture.png(element, fileName)
   ============================================================ */

window.Structra = window.Structra || {};

Structra.shareLink = (() => {
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

  const MAX_UNPACKED = 20 * 1024 * 1024;   // a link that unpacks to more than this is refused

  async function pipe(bytes, stream, limit) {
    const reader = new Blob([bytes]).stream().pipeThrough(stream).getReader();
    const parts = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (limit && total > limit) { reader.cancel(); throw new Error('This share link unpacks to more than ' + Math.round(limit / 1048576) + ' MB, which is more than a link should hold.'); }
      parts.push(value);
    }
    const out = new Uint8Array(total);
    let at = 0;
    for (const p of parts) { out.set(p, at); at += p.length; }
    return out;
  }

  async function createUrl(data, name) {
    const bytes = new TextEncoder().encode(JSON.stringify({ name: name || null, data }));
    let encoded;
    if (typeof CompressionStream === 'function') {
      encoded = 'g.' + toBase64Url(await pipe(bytes, new CompressionStream('gzip')));
    } else {
      encoded = 'p.' + toBase64Url(bytes);
    }
    if (encoded.length > MAX_ENCODED) {
      throw new Error('Too large to share in a link (' + Math.round(encoded.length / 1000) + ' KB encoded, limit ' + Math.round(MAX_ENCODED / 1000) + ' KB)');
    }
    const url = location.href.split('#')[0] + '#share=' + encoded;
    return { url, bytes: encoded.length };
  }

  async function readHash() {
    const m = /^#share=([gp])\.(.+)$/.exec(location.hash);
    if (!m) return null;
    let bytes = fromBase64Url(m[2]);
    if (m[1] === 'g') bytes = await pipe(bytes, new DecompressionStream('gzip'), MAX_UNPACKED);
    else if (bytes.length > MAX_UNPACKED) throw new Error('This share link holds more than ' + Math.round(MAX_UNPACKED / 1048576) + ' MB, which is more than a link should hold.');
    const body = JSON.parse(new TextDecoder().decode(bytes));
    return { data: body.data, name: body.name || null };
  }

  function clearHash() {
    history.replaceState(null, '', location.pathname + location.search);
  }

  return { createUrl, readHash, clearHash };
})();

Structra.imageCapture = (() => {
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
    await Structra.libraryLoader.loadLibrary('html2canvas');
    const bg = getComputedStyle(document.body).backgroundColor;
    const canvas = await window.html2canvas(element, {
      backgroundColor: MODERN.test(bg) ? colorResolver()(bg) : bg,
      scale: Math.min(2, window.devicePixelRatio || 1),
      onclone: (doc) => flattenColors(doc),
    });
    MODERN.lastIndex = 0;
    await new Promise((resolve, reject) => canvas.toBlob((blob) => {
      if (!blob) { reject(new Error('Could not create the image')); return; }
      Structra.sharedHelpers.downloadFile(blob, fileName || 'structra.png');
      resolve();
    }, 'image/png'));
  }
  return { png };
})();
