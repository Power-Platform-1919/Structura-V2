/**
 * Data Masking - detect and anonymize PII
 */
Structra.personalDataMasker = (() => {

  // The same shape every time (a***@***.com), so the masked value does not hint at how long the original was
  const maskEmail = (value) => value[0] + '***@***.' + value.split('.').pop();
  const EMAIL_ANYWHERE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  // Fields that hold a person's name
  const NAME_KEY = /^(display|full|first|last|given|sur|family)[ _-]?name$|^surname$/i;
  const maskName = (value) => value.trim().split(/\s+/).map((part) => part[0] + '***').join(' ');

  const PATTERNS = [
    { type: 'email', regex: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, mask: value => maskEmail(value) },
    { type: 'phone', regex: /^[\+]?[(]?[0-9]{1,4}[)]?[-\s./0-9]{7,}$/, mask: value => {
      // Hide every digit except the last four: 555-123-4567 → ***-***-4567
      const total = (value.match(/\d/g) || []).length;
      let seen = 0;
      return value.replace(/\d/g, (match) => (++seen <= total - 4 ? '*' : match));
    } },
    { type: 'uuid', regex: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, mask: () => '********-****-****-****-************' },
    { type: 'ip', regex: /^(\d{1,3}\.){3}\d{1,3}$/, mask: value => value.split('.').map((pattern, i) => i < 2 ? pattern : '***').join('.') },
    { type: 'creditcard', regex: /^\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}$/, mask: value => '**** **** **** ' + value.replace(/[\s-]/g, '').slice(-4) },
  ];

  function detectAndMask(value) {
    if (typeof value !== 'string' || value.length < 3) return null;
    for (const pattern of PATTERNS) {
      if (pattern.regex.test(value)) return { type: pattern.type, masked: pattern.mask(value) };
    }
    // An email inside longer text (a sign-in claim, a sentence, a signature)
    if (EMAIL_ANYWHERE.test(value)) { EMAIL_ANYWHERE.lastIndex = 0; return { type: 'email', masked: value.replace(EMAIL_ANYWHERE, maskEmail) }; }
    EMAIL_ANYWHERE.lastIndex = 0;
    return null;
  }

  function maskData(object) {
    let count = 0;

    function walk(value, key) {
      if (typeof value === 'string') {
        if (key && NAME_KEY.test(key) && value.trim()) { count++; return maskName(value); }
        const result = detectAndMask(value);
        if (result) { count++; return result.masked; }
        return value;
      }
      if (Array.isArray(value)) return value.map(item => walk(item, key));
      if (value && typeof value === 'object') {
        const out = {};
        for (const [key, v] of Object.entries(value)) Object.defineProperty(out, key, { value: walk(v, key), enumerable: true, writable: true, configurable: true });
        return out;
      }
      return value;
    }

    const masked = walk(object);
    return { data: masked, count };
  }

  function scan(object) {
    let count = 0;
    function walk(value, key) {
      if (typeof value === 'string' && ((key && NAME_KEY.test(key) && value.trim()) || detectAndMask(value))) count++;
      else if (Array.isArray(value)) value.forEach((x) => walk(x, key));
      else if (value && typeof value === 'object') Object.entries(value).forEach(([key, value]) => walk(value, key));
    }
    walk(object);
    return count;
  }

  return { maskData, scan, detectAndMask };
})();
