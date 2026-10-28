/* Find > Fuzzy: what the app does (uFuzzy since 2026-10-28; before that our own Jaro-Winkler match, which found 100% with 81% right at its
   0.8 setting and 98.5% with 99.5% right at 0.9, in about 75 ms per question) against uFuzzy and Fuse.js on typos.

   The values: 50,000 text values built from the words found in the test fixtures (names, titles, emails, status words).
   The questions: a word of a value written with one typo (a letter left out, added, changed, or two swapped), from words of 4 to 10 letters.
   The right answer for a question: every value that has a word within one edit (or two letters swapped) of the question, found by checking all.
   Scored: recall (right values found), precision (found values that are right), time for 200 questions.

   Usage:  node tests/perf/fuzzy-compare.js [fuse.js folder]     (the folder holds node_modules/fuse.js; omit it to leave Fuse out) */
const fs = require('fs');
const path = require('path');
const { load } = require('../unit/harness');

const ROOT = path.join(__dirname, '..', '..');
load(['shared-helpers', 'data-paths', 'data-engine']);
global.Structra.duckdbAdapter = undefined;
const engine = global.Structra.dataEngine;
const uFuzzy = (() => { const box = { window: {} }; box.window = box; new Function('window', fs.readFileSync(path.join(ROOT, 'src', 'libs', 'ufuzzy', 'uFuzzy.iife.min.js'), 'utf8') + '\nwindow.uFuzzy = uFuzzy;')(box); return box.uFuzzy; })();
global.uFuzzy = uFuzzy;                          // the engine's Find > Fuzzy uses it
let Fuse = null;
if (process.argv[2]) Fuse = require(path.join(path.resolve(process.argv[2]), 'node_modules', 'fuse.js')).default || require(path.join(path.resolve(process.argv[2]), 'node_modules', 'fuse.js'));

function random(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const rnd = random(11);

// vocabulary from the fixtures
const vocabulary = new Set();
const fixtures = path.join(ROOT, 'tests', 'fixtures');
const collect = (value) => {
  if (typeof value === 'string') for (const word of value.split(/[^A-Za-z]+/)) if (word.length >= 4 && word.length <= 10) vocabulary.add(word.toLowerCase());
  else if (value && typeof value === 'object') Object.values(value).forEach(collect);
};
for (const file of fs.readdirSync(fixtures).filter((name) => name.endsWith('.json'))) { try { collect(JSON.parse(fs.readFileSync(path.join(fixtures, file), 'utf8'))); } catch { /* skip */ } }
// the fixtures are small: add common words of the kind found in business data so 50,000 values are not all the same
const EXTRA = 'laptop refresh badge request parking pass invoice customer account manager office travel expense budget project review approval contract supplier delivery warehouse support ticket incident release deploy service network printer monitor keyboard mouse license renewal training holiday payroll benefit security access password reset onboarding report meeting calendar document template workflow dashboard analytics finance operations marketing engineering product design research legal compliance audit vendor purchase order shipment inventory pricing discount customer feedback survey campaign'.split(' ');
EXTRA.forEach((word) => vocabulary.add(word));
const words = [...vocabulary];

const values = [];
const seen = new Set();
while (values.length < 50000) {
  const count = 1 + Math.floor(rnd() * 3);
  const text = Array.from({ length: count }, () => words[Math.floor(rnd() * words.length)]).join(rnd() < 0.2 ? '.' : ' ') + (rnd() < 0.3 ? ' ' + Math.floor(rnd() * 1000) : '');
  if (!seen.has(text)) { seen.add(text); values.push(text); }
}

/** Is `candidate` one edit (letter left out, added or changed) or two letters swapped away from `target`? */
function withinOne(candidate, target) {
  if (candidate === target) return true;
  const difference = candidate.length - target.length;
  if (Math.abs(difference) > 1) return false;
  let i = 0;
  while (i < candidate.length && i < target.length && candidate[i] === target[i]) i++;
  if (difference === 0) {
    if (candidate.slice(i + 1) === target.slice(i + 1)) return true;
    return candidate[i] === target[i + 1] && candidate[i + 1] === target[i] && candidate.slice(i + 2) === target.slice(i + 2);
  }
  return difference === 1 ? candidate.slice(i + 1) === target.slice(i) : candidate.slice(i) === target.slice(i + 1);
}

function typo(word) {
  const kind = Math.floor(rnd() * 4);
  const at = 1 + Math.floor(rnd() * (word.length - 2));            // not the first letter: people rarely get that wrong
  const letter = String.fromCharCode(97 + Math.floor(rnd() * 26));
  if (kind === 0) return word.slice(0, at) + word.slice(at + 1);
  if (kind === 1) return word.slice(0, at) + letter + word.slice(at);
  if (kind === 2) return word.slice(0, at) + (letter === word[at] ? 'q' : letter) + word.slice(at + 1);
  return word.slice(0, at) + word[at + 1] + word[at] + word.slice(at + 2);
}

const wordsOf = (value) => value.split(/[^A-Za-z]+/).filter(Boolean).map((word) => word.toLowerCase());
// an index from word to the values that hold it, for the right answers
const byWord = new Map();
values.forEach((value, i) => { for (const word of new Set(wordsOf(value))) { if (!byWord.has(word)) byWord.set(word, []); byWord.get(word).push(i); } });
function truth(question) {
  const out = new Set();
  for (const [word, list] of byWord) if (withinOne(word, question) || word.includes(question)) for (const i of list) out.add(i);
  return out;
}

const questions = [];
while (questions.length < 200) {
  const word = words[Math.floor(rnd() * words.length)];
  if (word.length < 4 || !byWord.has(word)) continue;
  const question = typo(word);
  if (question.length >= 3 && question !== word) questions.push(question);
}
const answers = questions.map(truth);

async function score(name, run) {
  let found = 0, right = 0, wanted = 0, empty = 0;
  const started = process.hrtime.bigint();
  const results = [];
  for (const question of questions) results.push(await run(question));
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  results.forEach((result, q) => {
    const answer = answers[q];
    found += result.size; wanted += answer.size;
    for (const i of result) if (answer.has(i)) right++;
    if (!result.size) empty++;
  });
  console.log(`${name.padEnd(34)} recall ${(100 * right / wanted).toFixed(1).padStart(5)}%   precision ${(100 * right / Math.max(1, found)).toFixed(1).padStart(5)}%   no result for ${String(empty).padStart(3)} of ${questions.length}   ${(ms / questions.length).toFixed(1).padStart(7)} ms per question`);
}

(async () => {
  console.log(`${values.length.toLocaleString()} values, ${questions.length} questions with one typo (for example "${questions.slice(0, 3).join('", "')}")`);
  await engine.ingest(1, values, { fileName: 'values.json', fileSize: 1 });
  engine.setActive(1);
  {
    await score('our Find > Fuzzy (now uFuzzy)', async (question) => {
      // the engine returns the paths of the matches: $[12] is value 12
      const out = new Set();
      const result = await engine.fuzzySearch(question);
      for (const matched of result.matchedPaths || []) out.add(Number(/^\$\[(\d+)\]/.exec(matched)[1]));
      return out;
    });
  }
  // uFuzzy: one typo allowed per word (intraMode 1), the values are its haystack
  for (const [label, options] of [['uFuzzy intraMode 1', { intraMode: 1 }], ['uFuzzy intraMode 1, strict', { intraMode: 1, intraIns: 1, intraSub: 1, intraTrn: 1, intraDel: 1 }]]) {
    const finder = new uFuzzy(options);
    await score(label, (question) => new Set(finder.filter(values, question) || []));
  }
  if (Fuse) {
    for (const threshold of [0.2, 0.3, 0.4]) {
      const fuse = new Fuse(values, { threshold, ignoreLocation: true, minMatchCharLength: 3 });
      await score(`Fuse.js threshold ${threshold}`, (question) => new Set(fuse.search(question, { limit: 1000000 }).map((hit) => hit.refIndex)));
    }
  }
})();
