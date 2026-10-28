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

  const fromBase64Url = (text) => {
    const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    return Uint8Array.from(bin, (character) => character.charCodeAt(0));
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
    for (const part of parts) { out.set(part, at); at += part.length; }
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
    const match = /^#share=([gp])\.(.+)$/.exec(location.hash);
    if (!match) return null;
    let bytes = fromBase64Url(match[2]);
    if (match[1] === 'g') bytes = await pipe(bytes, new DecompressionStream('gzip'), MAX_UNPACKED);
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
  // modern-screenshot (MIT) puts a copy of the element inside an SVG and lets the browser draw it, so every colour function the themes use
  // (color-mix, oklab) and every font work without help. html2canvas did its own drawing and needed a colour-flattening step; it took
  // about 5 seconds on a view and is not maintained (task 22.5).
  async function png(element, fileName) {
    if (!element) throw new Error('Nothing to capture');
    await Structra.libraryLoader.loadLibrary('modernscreenshot');
    const blob = await window.modernScreenshot.domToBlob(element, {
      type: 'image/png',
      backgroundColor: getComputedStyle(document.body).backgroundColor,
      scale: Math.min(2, window.devicePixelRatio || 1),
    });
    if (!blob) throw new Error('Could not create the image');
    Structra.sharedHelpers.downloadFile(blob, fileName || 'structra.png');
  }
  return { png };
})();
