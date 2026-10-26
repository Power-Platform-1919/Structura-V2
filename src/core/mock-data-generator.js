/**
 * Mock Data Generator - generates random data preserving JSON structure and types.
 */
Structra.mockDataGenerator = (() => {

  const LOREM_WORDS = ['lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing', 'elit', 'sed', 'eiusmod', 'tempor', 'incididunt', 'labore', 'dolore', 'magna', 'aliqua'];
  const FIRST_NAMES = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank', 'Grace', 'Henry', 'Ivy', 'Jack'];
  const LAST_NAMES = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Anderson', 'Taylor', 'Thomas', 'Moore', 'Jackson'];
  const DOMAINS = ['example.com', 'test.org', 'demo.net', 'sample.io'];
  const STREETS = ['Main St', 'Oak Ave', 'Cedar Ln', 'Elm Dr', 'Pine Rd', 'Maple Ct', 'Broadway', 'Park Ave', 'Lake Blvd', 'Hill St'];
  const CITIES = ['New York', 'London', 'Tokyo', 'Paris', 'Sydney', 'Berlin', 'Toronto', 'Mumbai', 'São Paulo', 'Singapore', 'Dubai', 'Seoul', 'Chicago', 'Amsterdam', 'Madrid'];
  const COMPANIES = ['Acme Corp', 'TechFlow Inc', 'GlobalSoft', 'DataBridge', 'NovaStar', 'Quantum Labs', 'SkyNet Solutions', 'Apex Systems', 'PrimeWave', 'BluePeak'];
  const COLOR_NAMES = ['red', 'blue', 'green', 'purple', 'orange', 'teal', 'navy', 'coral', 'gold', 'indigo', 'crimson', 'emerald'];
  const COUNTRIES = ['US', 'GB', 'CA', 'AU', 'DE', 'FR', 'JP', 'BR', 'IN', 'SG', 'KR', 'NL', 'ES', 'IT', 'MX'];
  const PHONE_FORMATS = ['(###) ###-####', '+1-###-###-####', '+44 ## #### ####', '###-###-####'];
  const JOB_TITLES = ['Engineer', 'Manager', 'Analyst', 'Designer', 'Developer', 'Director', 'Consultant', 'Coordinator', 'Specialist', 'Architect'];

  function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
  function randomFloat(min, max) { return +(Math.random() * (max - min) + min).toFixed(2); }
  function randomWord() { return LOREM_WORDS[randomInt(0, LOREM_WORDS.length - 1)]; }
  function randomSentence() { return Array.from({ length: randomInt(3, 8) }, randomWord).join(' '); }
  function randomName() { return FIRST_NAMES[randomInt(0, FIRST_NAMES.length - 1)]; }
  function randomEmail() { return `${randomWord()}@${DOMAINS[randomInt(0, DOMAINS.length - 1)]}`; }
  function randomDate() {
    const date = new Date(Date.now() - randomInt(0, 365 * 24 * 3600000));
    return date.toISOString().slice(0, 10);
  }
  function randomUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, match => {
      const digit = Math.random() * 16 | 0;
      return (match === 'x' ? digit : (digit & 0x3 | 0x8)).toString(16);
    });
  }
  function randomUrl() { return `https://${DOMAINS[randomInt(0, DOMAINS.length - 1)]}/${randomWord()}`; }
  function randomBool() { return Math.random() > 0.5; }
  function randomLastName() { return LAST_NAMES[randomInt(0, LAST_NAMES.length - 1)]; }
  function randomFullName() { return `${randomName()} ${randomLastName()}`; }
  function randomPhone() {
    const format = PHONE_FORMATS[randomInt(0, PHONE_FORMATS.length - 1)];
    return format.replace(/#/g, () => String(randomInt(0, 9)));
  }
  function randomStreet() { return `${randomInt(1, 9999)} ${STREETS[randomInt(0, STREETS.length - 1)]}`; }
  function randomCity() { return CITIES[randomInt(0, CITIES.length - 1)]; }
  function randomCompany() { return COMPANIES[randomInt(0, COMPANIES.length - 1)]; }
  function randomColor() { return COLOR_NAMES[randomInt(0, COLOR_NAMES.length - 1)]; }
  function randomCountry() { return COUNTRIES[randomInt(0, COUNTRIES.length - 1)]; }
  function randomIP() { return `${randomInt(1, 254)}.${randomInt(0, 255)}.${randomInt(0, 255)}.${randomInt(1, 254)}`; }
  function randomJobTitle() { return `${['Senior ', 'Junior ', 'Lead ', ''][randomInt(0, 3)]}${JOB_TITLES[randomInt(0, JOB_TITLES.length - 1)]}`; }
  function randomParagraph() { return Array.from({ length: randomInt(2, 4) }, () => randomSentence() + '.').join(' '); }
  function randomZipCode() { return String(randomInt(10000, 99999)); }
  function randomState() { return ['CA', 'NY', 'TX', 'FL', 'IL', 'WA', 'PA', 'OH', 'GA', 'NC'][randomInt(0, 9)]; }

  /**
   * Infer a random value based on a sample value's type and content.
   * If keyName is provided, use it for context-aware generation.
   */
  function mockValue(sample, keyName) {
    if (sample === null) return null;
    if (typeof sample === 'boolean') return randomBool();
    if (typeof sample === 'number') {
      if (Number.isInteger(sample)) {
        // Context-aware integers
        if (keyName) {
          const lowerKey = keyName.toLowerCase();
          if (/^id$|_id$/.test(lowerKey)) return randomInt(1, 99999);
          if (/age/.test(lowerKey)) return randomInt(18, 80);
          if (/year/.test(lowerKey)) return randomInt(1980, 2026);
          if (/zip|postal/.test(lowerKey)) return randomInt(10000, 99999);
          if (/port/.test(lowerKey)) return randomInt(1024, 65535);
          if (/quantity|qty|count/.test(lowerKey)) return randomInt(1, 100);
          if (/price|cost|amount|salary/.test(lowerKey)) return randomInt(10, 10000);
        }
        const magnitude = Math.max(Math.abs(sample), 10);
        return randomInt(-magnitude, magnitude);
      }
      if (keyName) {
        const lowerKey = keyName.toLowerCase();
        if (/lat/.test(lowerKey)) return randomFloat(-90, 90);
        if (/lon|lng/.test(lowerKey)) return randomFloat(-180, 180);
        if (/price|cost|amount/.test(lowerKey)) return randomFloat(1, 999);
        if (/rate|ratio|percent/.test(lowerKey)) return randomFloat(0, 100);
      }
      return randomFloat(sample * 0.5, sample * 1.5);
    }
    if (typeof sample === 'string') {
      // Context-aware by key name first
      if (keyName) {
        const lowerKey = keyName.toLowerCase();
        if (/^(first.?name|given.?name)$/.test(lowerKey) || lowerKey === 'firstname') return randomName();
        if (/^(last.?name|sur.?name|family.?name)$/.test(lowerKey) || lowerKey === 'lastname') return randomLastName();
        if (/^(full.?name|display.?name|name)$/.test(lowerKey)) return randomFullName();
        if (/e.?mail/.test(lowerKey)) return randomEmail();
        if (/phone|tel|mobile|fax/.test(lowerKey)) return randomPhone();
        if (/company|org|employer/.test(lowerKey)) return randomCompany();
        if (/city|town/.test(lowerKey)) return randomCity();
        if (/street|address/.test(lowerKey)) return randomStreet();
        if (/state|province|region/.test(lowerKey)) return randomState();
        if (/country/.test(lowerKey)) return randomCountry();
        if (/color|colour/.test(lowerKey)) return randomColor();
        if (/zip|postal/.test(lowerKey)) return randomZipCode();
        if (/url|website|link|href/.test(lowerKey)) return randomUrl();
        if (/ip.?addr|ip$/.test(lowerKey)) return randomIP();
        if (/title|role|position|job/.test(lowerKey)) return randomJobTitle();
        if (/uuid|guid|id$/.test(lowerKey)) return randomUUID();
        if (/date|created|updated|born|dob/.test(lowerKey)) return randomDate();
        if (/description|bio|summary|about|note/.test(lowerKey)) return randomParagraph();
      }
      // Fallback: infer from sample value pattern
      if (/^\d{4}-\d{2}-\d{2}/.test(sample)) return randomDate();
      if (/^[0-9a-f]{8}-[0-9a-f]{4}/.test(sample)) return randomUUID();
      if (/@/.test(sample)) return randomEmail();
      if (/^https?:\/\//.test(sample)) return randomUrl();
      if (sample.length <= 20) return randomName();
      return randomSentence();
    }
    return sample;
  }

  /**
   * Generate mock data matching the structure of the input.
   * @param {*} obj - Sample JSON to base structure on
   * @param {number} arraySize - Number of items to generate for arrays (default: same as input or 5)
   * @returns {*} New mock data
   */
  function generate(object, arraySize, keyName) {
    if (object === null) return null;
    if (typeof object !== 'object') return mockValue(object, keyName);

    if (Array.isArray(object)) {
      const size = arraySize || Math.max(object.length, 3);
      const sample = object[0];
      if (sample == null) return Array.from({ length: size }, () => mockValue(null));
      return Array.from({ length: size }, () => generate(sample, undefined, keyName));
    }

    const result = {};
    for (const [lowerKey, value] of Object.entries(object)) {
      result[lowerKey] = generate(value, arraySize, lowerKey);
    }
    return result;
  }

  return { generate, mockValue };
})();
