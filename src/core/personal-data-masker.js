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

  // ---- the checks that tell a card number or a bank account from any other long number ----
  const digitsOf = (value) => value.replace(/\D/g, '');
  /** Luhn check digit: every real card number passes, a random 16-digit id passes one time in ten */
  function luhn(digits) {
    let sum = 0;
    for (let i = 0; i < digits.length; i++) {
      let digit = Number(digits[digits.length - 1 - i]);
      if (i % 2 === 1) { digit *= 2; if (digit > 9) digit -= 9; }
      sum += digit;
    }
    return sum % 10 === 0;
  }
  /** IBAN check: move the first four characters to the end, letters become 10 to 35, the number must leave 1 when divided by 97 */
  function ibanValid(compact) {
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(compact)) return false;
    let remainder = 0;
    for (const character of compact.slice(4) + compact.slice(0, 4)) {
      const piece = /[A-Z]/.test(character) ? String(character.charCodeAt(0) - 55) : character;
      for (const digit of piece) remainder = (remainder * 10 + Number(digit)) % 97;
    }
    return remainder === 1;
  }
  const maskLastFour = (value) => {
    const total = digitsOf(value).length;
    let seen = 0;
    return value.replace(/\d/g, (match) => (++seen <= total - 4 ? '*' : match));
  };

  // A key that says the value is a phone number: then a run of digits is a phone number
  const PHONE_KEY = /phone|mobile|\btel\b|telephone|fax|\bcell\b|gsm/i;
  // Without such a key, only a value written like a phone number counts: a + and a country code, brackets around an area code, or
  // digits in groups with separators. A plain run of digits (an id, a timestamp) and a date are not phone numbers.
  const PHONE_WRITTEN = /^(\+\d{1,3}[ .-]?)?(\(\d{1,5}\)[ .-]?|\d{1,5}[ .-])(\d{1,5}[ .-]?){1,4}\d$/;
  const looksLikeDate = (value) => /^\d{4}[-./]\d{1,2}[-./]\d{1,2}$|^\d{1,2}[-./]\d{1,2}[-./]\d{2,4}$/.test(value);
  function isPhone(value, key) {
    if (!/^[+(]?[\d][\d ()./-]*$/.test(value)) return false;
    const digits = digitsOf(value).length;
    if (digits < 7 || digits > 15) return false;
    if (key && PHONE_KEY.test(key)) return true;
    if (looksLikeDate(value)) return false;
    return value.startsWith('+') ? digits >= 8 : PHONE_WRITTEN.test(value);
  }

  // Each rule: type, a test of the value (and the key it sits under), and how it is hidden. The first rule that matches wins, so the most
  // exact ones come first and the loose phone rule last.
  const PATTERNS = [
    { type: 'email', test: (value) => /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value), mask: (value) => maskEmail(value) },
    { type: 'uuid', test: (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value), mask: () => '********-****-****-****-************' },
    // four numbers up to 255; 999.999.999.999 and version-like text are not addresses
    { type: 'ip', test: (value) => /^(\d{1,3}\.){3}\d{1,3}$/.test(value) && value.split('.').every((part) => Number(part) <= 255), mask: (value) => value.split('.').map((part, i) => i < 2 ? part : '***').join('.') },
    { type: 'creditcard', test: (value) => /^\d{4}([ -]?\d{4,6}){2,3}$|^\d{13,19}$/.test(value) && digitsOf(value).length >= 13 && digitsOf(value).length <= 19 && luhn(digitsOf(value)), mask: (value) => '**** **** **** ' + digitsOf(value).slice(-4) },
    { type: 'iban', test: (value) => /^[A-Za-z]{2}\d{2}[ ]?([A-Za-z0-9]{4}[ ]?){2,7}[A-Za-z0-9]{1,4}$/.test(value) && ibanValid(value.replace(/ /g, '').toUpperCase()), mask: (value) => value.slice(0, 4) + ' **** **** ' + value.replace(/ /g, '').slice(-4) },
    // US social security number: not 000, 666 or 9xx first, not 00 in the middle, not 0000 at the end
    { type: 'ssn', test: (value) => /^(?!000|666|9)\d{3}-(?!00)\d{2}-(?!0000)\d{4}$/.test(value), mask: (value) => '***-**-' + value.slice(-4) },
    { type: 'phone', test: (value, key) => isPhone(value, key), mask: (value) => maskLastFour(value) },
  ];

  function detectAndMask(value, key) {
    if (typeof value !== 'string' || value.length < 3) return null;
    for (const pattern of PATTERNS) {
      if (pattern.test(value, key)) return { type: pattern.type, masked: pattern.mask(value) };
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
        const result = detectAndMask(value, key);
        if (result) { count++; return result.masked; }
        return value;
      }
      if (Array.isArray(value)) return value.map(item => walk(item, key));
      if (value && typeof value === 'object') {
        const out = {};
        for (const [key, entryValue] of Object.entries(value)) Object.defineProperty(out, key, { value: walk(entryValue, key), enumerable: true, writable: true, configurable: true });
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
      if (typeof value === 'string' && ((key && NAME_KEY.test(key) && value.trim()) || detectAndMask(value, key))) count++;
      else if (Array.isArray(value)) value.forEach((x) => walk(x, key));
      else if (value && typeof value === 'object') Object.entries(value).forEach(([key, value]) => walk(value, key));
    }
    walk(object);
    return count;
  }

  return { maskData, scan, detectAndMask, luhn, ibanValid };
})();
