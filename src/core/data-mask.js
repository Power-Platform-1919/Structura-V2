/**
 * Data Masking — detect and anonymize PII
 */
Structra.dataMask = (() => {

  // The same shape every time (a***@***.com), so the masked value does not hint at how long the original was
  const maskEmail = (v) => v[0] + '***@***.' + v.split('.').pop();
  const EMAIL_ANYWHERE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  // Fields that hold a person's name
  const NAME_KEY = /^(display|full|first|last|given|sur|family)[ _-]?name$|^surname$/i;
  const maskName = (v) => v.trim().split(/\s+/).map((w) => w[0] + '***').join(' ');

  const PATTERNS = [
    { type: 'email', regex: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, mask: v => maskEmail(v) },
    { type: 'phone', regex: /^[\+]?[(]?[0-9]{1,4}[)]?[-\s./0-9]{7,}$/, mask: v => {
      // Hide every digit except the last four: 555-123-4567 → ***-***-4567
      const total = (v.match(/\d/g) || []).length;
      let seen = 0;
      return v.replace(/\d/g, (d) => (++seen <= total - 4 ? '*' : d));
    } },
    { type: 'uuid', regex: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, mask: () => '********-****-****-****-************' },
    { type: 'ip', regex: /^(\d{1,3}\.){3}\d{1,3}$/, mask: v => v.split('.').map((p, i) => i < 2 ? p : '***').join('.') },
    { type: 'creditcard', regex: /^\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}$/, mask: v => '**** **** **** ' + v.replace(/[\s-]/g, '').slice(-4) },
  ];

  function detectAndMask(val) {
    if (typeof val !== 'string' || val.length < 3) return null;
    for (const p of PATTERNS) {
      if (p.regex.test(val)) return { type: p.type, masked: p.mask(val) };
    }
    // An email inside longer text (a sign-in claim, a sentence, a signature)
    if (EMAIL_ANYWHERE.test(val)) { EMAIL_ANYWHERE.lastIndex = 0; return { type: 'email', masked: val.replace(EMAIL_ANYWHERE, maskEmail) }; }
    EMAIL_ANYWHERE.lastIndex = 0;
    return null;
  }

  function maskData(obj) {
    let count = 0;

    function walk(val, key) {
      if (typeof val === 'string') {
        if (key && NAME_KEY.test(key) && val.trim()) { count++; return maskName(val); }
        const result = detectAndMask(val);
        if (result) { count++; return result.masked; }
        return val;
      }
      if (Array.isArray(val)) return val.map(item => walk(item, key));
      if (val && typeof val === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(val)) Object.defineProperty(out, k, { value: walk(v, k), enumerable: true, writable: true, configurable: true });
        return out;
      }
      return val;
    }

    const masked = walk(obj);
    return { data: masked, count };
  }

  function scan(obj) {
    let count = 0;
    function walk(val, key) {
      if (typeof val === 'string' && ((key && NAME_KEY.test(key) && val.trim()) || detectAndMask(val))) count++;
      else if (Array.isArray(val)) val.forEach((x) => walk(x, key));
      else if (val && typeof val === 'object') Object.entries(val).forEach(([k, v]) => walk(v, k));
    }
    walk(obj);
    return count;
  }

  return { maskData, scan, detectAndMask };
})();
