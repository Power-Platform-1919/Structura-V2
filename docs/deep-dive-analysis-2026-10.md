# Deep dive analysis: our hand-written code against mature code (October 2026)

Status: analysis done for the Tree, Find, Table, Undo, dialogs, panel resizer, JSONPath, accessibility (axe-core), other browsers (Firefox, WebKit) and the test pipeline. Graph size limits were measured. Not yet done: Pivot, Charts, Query panel, Tabs keyboard handling, autocomplete (see section 7).
Companion plan: [mature-libraries-plan.md](mature-libraries-plan.md).
Branch with the fixes: `feature/tree-line-number-gutter` (commits `9268fdd`, `02968e8`; not pushed at the time of writing).

## 1. Why this was done

The app is a static, no-build JSON analyzer built from vanilla JS custom elements. Parts of it are already built on mature code: CodeMirror 6 (every code box), DuckDB WASM (SQL), jsondiffpatch (Compare), jsonrepair, Ajv, PapaParse, js-yaml, toml, html2canvas, Lucide icons. The rest is hand-written. The question was: where is our code weaker than mature code, and what can we learn or reuse?

Method: read the relevant parts of CodeMirror 6 (`@codemirror/view` dist: base theme, scroller, gutters, fold gutter, special characters, keymaps, scroll anchoring, aria attributes), read our code side by side, then test each suspicion in a real browser (Playwright with Edge) before changing anything. A suspicion that could not be reproduced was dropped.

## 2. The pattern behind almost every finding

1. **State lived in the page, not in a model.** CodeMirror keeps fold state, selection and decorations in its state and draws the page from it. Our Tree and Table kept them as CSS classes on elements. When an element was thrown away and rebuilt (recycling), the state was gone.
2. **Listener hygiene.** Cleanup ran against the wrong object, so every render added more handlers.
3. **Keyboard and accessibility were incomplete.** Mature code ships PageUp/PageDown, fold keys, tooltips, labels and live regions as defaults. We had to find each gap by hand.
4. **Memory and size budgets were missing.** Undo stored full copies without a total limit.

These are exactly the problems mature libraries have already solved and tested for years. That is the argument for the plan.

## 3. CodeMirror 6 against our Tree (what we compared)

| Topic | CodeMirror 6 | Our Tree before | Now |
|---|---|---|---|
| Line numbers | One hidden spacer of 9s sets the gutter width once | Width changed with the digits (text shifted) | Margin sized once for the biggest number |
| Fold state | In state, survives redraw | Only in the page; lost on recycle | Kept in `treeState`, put back on rebuild |
| Selection / marks | In state | Only CSS classes | Kept in `treeState`, put back on rebuild |
| Reaching a far line | Scroll to any position; height map estimates | Did nothing if the chunk was not drawn | Draws the chunk on demand, placeholders in between |
| Scroll anchoring | Own anchor logic, `overflow-anchor: none` | Browser default (works; measured stable) | Unchanged |
| Hidden characters | `highlightSpecialChars` | Invisible | Marked, same character list |
| Keyboard | Arrows, Page keys, fold keys | Arrows, Home, End | Page keys added |
| Focus outline, aria | Defaults ship | Partial | Tooltips on toggles; roles unchanged |
| Event handlers | One set, owned by the view | Stacked on every render | One set, aborted on re-render |

Also checked and left alone: key navigation scans all lines on each press (measured 9 ms at 1,900 lines, fine); `contain: layout/paint` on chunks (paint containment would clip long lines, gain not measured).

## 4. Bugs found and fixed (all reproduced first)

Commit `9268fdd` (Tree):
1. After 4 renders, one click ran 4 times and a double click threw errors. Cause: `render()` made the new state before calling `cleanup()`, so cleanup looked at the empty new state; `delegationBound` was per state so each render added a new set of handlers. Fix: clean up first, listeners owned by an `AbortController`.
2. A closed block opened again after its chunk was recycled. Same for the selected line, search marks, bookmark marker and highlighted key. Fix: view state kept in `treeState` (`collapseDepth`, `collapseOverrides`, `highlightedPath`, `findPaths`, `bookmarkPaths`, `keyHighlightName`) and restored after every chunk build.
3. Selecting a path in a chunk that was not drawn yet did nothing (Find, path bar, bookmarks could not reach row 2500 of a long list). Fix: `revealLine` draws the chunk that holds the row; the chunks in between become placeholders of about the right height.
4. Hidden and direction-changing characters in values were invisible. Fix: shown as marks with the code point in the tooltip.
5. PageUp and PageDown did nothing. Added.

Commit `02968e8`:
6. Find: Enter only re-ran the search and never moved on although the button says "Next (Enter)". Fix: Enter searches if the text changed, then goes to the next match; Shift+Enter goes back. A failed search does not step through the old result (caught by the existing `inputs.js` test).
7. Find: matches were in database order (the first "Next" went to `[1999]`). Fix: sorted in document order in one place, `_setActiveQuery`, so every kind of find is covered.
8. Table: the selected row lost its mark when its rows were recycled. Fix: remembered path, mark put back when rows are built.
9. Table: the "loading more rows" row spanned every column including hidden ones. Fix: visible columns only.
10. Undo: up to 20 full copies of a document up to 25M characters each (about 1 GB). Fix: a 60 MB budget per tab; the last two steps always stay.
11. Panel resizer: a cancelled drag (touch) left `user-select: none` on the page. Fix: `pointercancel` and `lostpointercapture` end the drag.
12. Find bar: labels on the inputs, live match count, pressed state on mode buttons.

Test pipeline (commit `9268fdd`):
13. Closing the shared test browsers with an un-awaited `kill()` left 8 browsers running per run (about 3 GB) because `process.exit` cut the kill off. Fix: end the whole process tree with `taskkill /T /F` (or a process group kill) and wait for it; 4 browsers close in 1.4 s and none are left.

Found while researching candidates (second round):
14. JSONPath: a negative step slice (`$[::-1]`, `$[2::-1]`, `$[::-2]`) looped forever and froze the page, because the loop condition `index < end` can never end when the step is negative. Fix: slice rules of RFC 9535 (negative step walks backwards, step 0 selects nothing). Unit test added (`tests/unit/jsonpath.test.js`, 17 tests pass). Found by running the official compliance suite against our engine (`tests/perf/jsonpath-compliance.js`): 32 percent before, 34 percent after, see the plan section 10.2.
15. Not a bug yet, a hazard: `StructraComponent` never removes its event subscriptions (no `disconnectedCallback`, `on()` records nothing). Fine while components are created once; it will matter when components are created and destroyed. In the plan as a small fix.

Found by the second round (accessibility engine, other browsers):
16. Cross-browser: the Editor read the place of a JSON error from the browser's own message text, so Safari (no place at all) and Firefox (a different wording) lost the line, column and error marker. Fix: jsonc-parser, same answer everywhere (plan section 10.10).
17. Accessibility: axe-core found 7 kinds of problem our own audit never flagged (no landmarks, no h1, button names not containing their visible text, a `role="tree"` box without tree items, scrollable boxes with no keyboard access, an empty table header). 54 findings down to 2 (plan section 10.9).
18. Test coverage: every test ran only in Chromium. Now the same 35 browser runs pass in Firefox 157 and WebKit 27.2 (`npm run test:firefox`, `npm run test:webkit`).
19. Our Table's scrollbar only knows the rows drawn so far (100,723 px for 100,000 rows), it has no ARIA grid roles and no keyboard navigation (plan section 10.7). Not fixed yet: in the plan.

Tests added: `tests/smoke/tree-state.js` (run against the old code it fails in 11 places; passes on the fix). `tests/smoke/inputs.js` was updated for the new Enter behaviour (count reads `1/N` after Enter).

## 5. Measurements to keep

CodeMirror spike on a large file (89 MB, 5 million lines):
- open: 0.87 s, about 220 MB of memory
- fold index: 0.4 s
- collapse 165,000 records: 2.2 s
- about 1 million fold effects: 22 s (so do not fold line by line at that scale)
- 82,000 hidden stretches: 0.9 s

Replacing roughly 100,000 or more ranges costs about 12 to 15 microseconds each.

Tree probe (3,000 rows, about 1,900 lines drawn): collapse all 10 ms, expand all 9 ms, collapse to depth 42 ms, arrow key about 9 ms. Scroll position stayed stable after scrolling far and back.

Test pipeline: 460 s to about 176 to 217 s for lint, unit, 35 browser runs and the UI audit (the machine is noisy, other apps change timings by a factor of 2 to 3). UI audit 258 s to about 40 to 70 s.

## 6. Things already handled well (do not redo)

- Large numbers: the worker already finds integers and decimals that `JSON.parse` would round and keeps them as text (`worker-pool.js`). No need for lossless-json.
- XML uses the browser's own `DOMParser`; CSV, YAML and TOML use PapaParse, js-yaml and toml in workers.
- Dialogs have a working focus trap and focus return; they could use the native `<dialog>` instead (see the plan).

## 7. Not yet audited, and known limits

Not audited: Graph, Pivot, Charts, Query panel, Tabs keyboard handling, autocomplete against CodeMirror's autocomplete, minimap, heatmap, command palette.
Known limits left on purpose:
- Tree End key goes to the last drawn line, not the end of the file. The closing line shares its path with the opening line, so selecting it by path jumps to the opening line. A clean fix needs line-based (not path-based) selection.
- Table has no keyboard navigation at all (arrow keys do nothing).
- Editor folding is off for text above 1.5 MB (idea: build a fold index for large read-only text).
- `worker-pool.js` adds `?v=Date.now()` to worker URLs, so workers are never cached between page loads (a quick win; see the plan).
- About 230 short fixed waits remain in the smoke tests (about 110 s of sleeping in total).

## 8. Decision pending from earlier

The CodeMirror-based Tree: option A (CSS only, margin like the Editor) is done. Option B (a read-only CodeMirror Tree behind a switch, capped at about 20 to 40 MB, classic Tree above the cap) is the basis of the MVP in the plan.
