/* The quick check for patterns that can take extremely long (Structra.sharedHelpers.isRiskyRegex) is a first, instant warning. It is not
   the protection: a pattern that gets past it is stopped by the time limit in the sandbox worker (tests/smoke/sandbox.js). This test
   records exactly what the quick check catches today, and the patterns it misses, so an improvement shows up as a changed list.
   Evaluated 2026-10-28 (task 18.3.5): redos-detector 6.1.4 caught all 15 but called a.*b and id=\d+& risky and took 4.7 s for 29 patterns
   (880 KB); safe-regex2 5.1.2 caught 13 of 15 with no false alarms in 1 ms. Neither is added: the sandbox is the safety net. */
const { load, test, eq, truthy } = require('./harness');

load(['shared-helpers']);
const risky = Structra.sharedHelpers.isRiskyRegex;

console.log('regex guard');

const CAUGHT = ['(a+)+$', '(a*)*$', '(x+x+)+y', '([a-zA-Z]+)*$', '^(a+)+$', '(a+)*b', '(\\d+)*$', '^(\\w+\\s?)*$', '(.+)+x', '^([a-z]+)*$'];
const MISSED = ['(a|aa)+$', '(a|a?)+$', '^(([a-z])+.)+[A-Z]([a-z])+$', '(.*a){20}', '(a|b|ab)*c'];
const ORDINARY = ['^ann@', '^[A-Z]{2}\\d{4}$', 'foo|bar', '\\bcat\\b', '[0-9]+', '^\\s*$', '(?:https?)://[^/]+', 'a.*b', '^\\w+@\\w+\\.com$', '(ab)+', '^(\\d{3})-(\\d{4})$', 'id=\\d+&', '\\.json$', 'colou?r'];

test('a repeat inside a repeat is caught at once', () => {
  for (const pattern of CAUGHT) truthy(risky(pattern), pattern + ' should be caught');
});

test('known gaps: these slow patterns pass the quick check and are left to the sandbox time limit', () => {
  for (const pattern of MISSED) truthy(!risky(pattern), pattern + ' is now caught by the quick check: move it to the caught list');
});

test('ordinary patterns are never refused', () => {
  for (const pattern of ORDINARY) eq(risky(pattern), false, pattern);
});

test('the message tells what to do', () => {
  truthy(/Simplify it/.test(Structra.sharedHelpers.RISKY_REGEX_MESSAGE));
});
