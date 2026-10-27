# Plan: best of both worlds (mature libraries plus our own value)

Status: proposal, waiting for approval. The MVP is not built yet. Research round 2 and 3 (section 10) closed the open questions and already produced fixes (JSONPath hang, accessibility, cross-browser error places, Firefox and WebKit tests).
Evidence: [deep-dive-analysis-2026-10.md](deep-dive-analysis-2026-10.md).

## 1. The idea in one paragraph

Our app has two kinds of code. Some of it is unique to us: Power Platform expressions, the Overview insights, data paths, Parse JSON schema generation, the find-across-everything flow. The rest solves problems that mature libraries and the browser itself already solve and test: showing a long list, folding, keyboard handling, dialogs, undo, tables. The deep dive found 14 real bugs in the second kind within one session. The plan is to keep our own code only where it does something nothing else does, and to move everything else to mature code, one area at a time, each behind a switch so nothing breaks while we compare.

## 2. The rule for choosing (decision rubric)

An area moves to a mature library only if all of these hold:

1. **Fit:** it covers at least 80 percent of what we do today. The rest we add on top, without patching the library.
2. **License:** MIT, ISC, Apache 2.0 or BSD. Checked against the package, not a blog.
3. **No build for the app:** it is vendored in `src/libs` (one-time esbuild bundle is allowed, as for CodeMirror), loaded on first use, works offline and from `file://`-style hosting. Nothing is fetched from another site at run time.
4. **Large files:** it holds up on our big fixtures (89 MB, 5 million lines) or we cap it and keep the classic path above the cap.
5. **No framework forced on us:** vanilla JS in, vanilla JS out.
6. **Size:** loads lazily, and does not grow the first load.
7. **Reversible:** a switch (Settings or `?engine=`) keeps the old path until the new one has passed all tests and a trial period.

An area stays ours if it is unique value, if no library fits, or if the library costs more bytes and risk than the code it replaces.

## 3. Inventory and verdicts

Verdict key: KEEP (ours on purpose), ADOPT (move now), SPIKE (time-boxed trial, decide after), PLATFORM (use the browser's own feature), LATER.

| Area | Today | Candidate | Verdict | Reason and risk |
|---|---|---|---|---|
| JSON Tree | Own chunked renderer, 1,077 lines | CodeMirror 6 read-only view (already shipped); or vanilla-jsoneditor | **SPIKE then ADOPT (MVP)** | See section 4. CodeMirror gives line numbers, folding, search, keyboard, a11y for free. Needs a path-to-line index and a size cap. |
| Code boxes (Editor, SQL, Compare panes) | CodeMirror 6 | already adopted | KEEP | Already mature. Add `@codemirror/search` only if an in-editor Ctrl+F is wanted. |
| SQL | DuckDB WASM | already adopted | KEEP | |
| Compare / diff | jsondiffpatch | already adopted | KEEP | Also the base for undo deltas (below). |
| Repair, schema validation, CSV, YAML, TOML, icons | jsonrepair, Ajv, PapaParse, js-yaml, toml, Lucide | already adopted | KEEP | |
| Dialogs | `StructraDialog` with own focus trap | Native `<dialog>` with `showModal()` | **PLATFORM (quick win)** | The browser makes the rest of the page inert and traps focus, Escape works. One base class changes, every dialog follows. Support is broad for `<dialog>`; check the exact versions we target in browser-compat data before relying on any claim. |
| Menus and tooltips (context menu, positions) | Own positioning code | Popover API plus CSS anchor positioning | **LATER (low)** | MDN compatibility data (read 2026-10-27): `anchor-name` is in Chrome 125, Firefox 147, Safari 26, so all three engines have it. Keep `@floating-ui/dom` (3 KB gzipped) in mind only if we must support older browsers. |
| Accessibility audit (tests only) | Own checks in `tests/ui/04-a11y-relevance.js` (names, duplicate ids, landmarks) | `@axe-core/playwright` (axe-core, hundreds of WCAG rules) | **ADOPT (dev only)** | Costs the app nothing: it only runs in tests. Needs your approval to add a dev dependency. |
| Component base class | `StructraComponent`: no cleanup, `on()` records nothing, no `disconnectedCallback` | Pattern from Lit controllers (track subscriptions, remove on disconnect) | **FIX (small)** | Today harmless because components are created once. It will matter when components are created and destroyed (switchable engines, dialogs). Track subscriptions and an `AbortController` for DOM listeners; re-subscribe on reconnect. |
| Offscreen rendering in the Classic Tree | Own recycle code (about 100 lines) | CSS `content-visibility: auto` | **SPIKE (low)** | MDN: Chrome 85, Firefox 125, Safari 18. The browser skips rendering offscreen lines, so the manual emptying and rebuilding could shrink. Does not reduce memory (nodes stay). Measure before touching. |
| Undo | Full JSON snapshots, now with a 60 MB budget | jsondiffpatch deltas (already shipped) | **ADOPT (medium)** | Stores small diffs instead of full copies: much less memory on big files. Must keep the same `Structra.undoStack` API; tests exist. |
| JSONPath | Own 234-line engine (a useful subset) | **json-p3** (MIT, 15 KB gzipped) | **ADOPT (measured)** | Measured on the official RFC 9535 suite: json-p3 715 of 715 (100 percent), jsonpath-rfc9535 674 (94 percent), jsonpath-plus 121 (17 percent), our engine 243 (34 percent, after the hang fix). Filter over 200,000 records: json-p3 122 ms, jsonpath-plus about 200 ms, jsonpath-rfc9535 about 220 ms. json-p3 also returns each match's location, so our path column keeps working. Differences to handle in an adapter: our `=~` regex test is not RFC (use `match()` or `search()`), and jsonpath-plus treats a `null` value as "does not exist" in `[?(@.Email)]` where the RFC (and json-p3) say it exists. Section 10.2. |
| Table | Own virtual list plus table, 1,102 lines | Keep it, fix three gaps. Tabulator and AG Grid are not needed | **KEEP and FIX** | Measured (section 10.7): ours is as fast and lighter than Tabulator (100,000 rows: first rows 97 ms against 128 ms, heap 57 MB against 33 MB for the grid alone, worst scroll frame 33 ms against 50 ms; 500,000 rows 112 ms). The gaps are real: (1) the scrollbar only knows the rows drawn so far (100,723 px for 100,000 rows, Tabulator 2.4 million px), so you cannot drag to row 80,000; (2) no ARIA grid roles at all (Tabulator has grid, row, columnheader, gridcell); (3) no keyboard navigation. Fix with `@tanstack/virtual-core` (9 KB gzipped) for a true scroll height, plus the WAI-ARIA grid pattern with a roving tabindex. Tabulator's arrow keys also do nothing in its default setup, so it would not close gap 3 either. |
| Virtual list (shared) | `virtual-list.js`, 270 lines | `@tanstack/virtual-core` (framework-free, 9 KB gzipped) | **ADOPT with the Table fix** | Gives the true scroll height and dynamic row sizes. The Tree and Graph do not use it (the Tree has its own recycling). |
| Graph | Own SVG graph, zoom and pan | `d3-hierarchy` for the layout, only if needed | **KEEP** | Measured (section 10.7): the graph draws about 250 SVG elements for a 100,000 or 500,000 row file, because it is depth limited, so cost does not grow with the file. Cytoscape (138 KB gzipped) and `elkjs` (EPL-2.0 or GPL-3.0, avoid) are not needed. One open item: node labels fail one accessibility rule (the visible text is shortened with an ellipsis). |
| Charts | Own inline SVG, about 220 lines, no library | uPlot, Chart.js | KEEP | Tiny and enough. Adopt only if zoom or hover is wanted. A library costs 10 to 150 KB for little gain. |
| Large numbers | Worker finds numbers that would be rounded and keeps them as text | lossless-json | KEEP | Already handled. lossless-json is slower than native parse and not needed. |
| Parsing in workers | Own worker pool with queue, scale up and idle stop | Comlink (small RPC helper) | KEEP, fix one thing | Fix now: the pool adds `?v=Date.now()` to worker URLs so workers are never cached between page loads. |
| Browser storage | Own IndexedDB wrapper, 267 lines | `idb` | LATER | Small gain. |
| State, events, components | `Structra.setState`, event bus, `StructraComponent` | Lit, signals libraries | KEEP | Rewriting everything has a high cost and a small gain. The listener bugs came from missing cleanup, which a lint rule and test can guard. |
| Command palette, shortcuts | Own | tinykeys, ninja-keys | LATER | Low value. |
| Type code generator, mock data | Own | quicktype-core, faker | KEEP | Those are megabytes; ours is small and tuned for Power Platform. |
| Parse JSON schema, Power Automate and Power Fx expressions, Overview insights, paths, bookmarks, path history | Own | none exists | **KEEP (our unique value)** | This is what the app is for. |

## 4. The MVP: a CodeMirror Tree you can look at

Goal: one working version to look at and compare, not a rewrite.

**What you see:** Settings gets "Tree engine: Classic | Code (preview)". The URL `?engine=code` also switches it. Classic stays the default. In Code mode the Tree is a read-only CodeMirror view of the pretty-printed document.

**Why CodeMirror first and not a ready-made JSON editor:** CodeMirror is already shipped (0 new bytes) and already measured on our largest file. The other candidate, vanilla-jsoneditor, is a full product (tree, text and table modes, claims up to 512 MB documents, ISC license, built on CodeMirror 6 for text mode) but: its standalone bundle carries its own copies of its dependencies (a second CodeMirror, lodash, Ajv), its content must be changed immutably, long values are truncated in its tree and table, customizing how values render needs Svelte-style renderers, and our Power Platform path flow, bookmarks and Find highlighting would all have to be bridged to it. Treat it as a comparison spike only if the CodeMirror Tree falls short (section 8).

**Parity checklist (every item has a test before the MVP is accepted):**

| Behavior in Classic Tree | How the Code Tree does it |
|---|---|
| Line numbers like the Editor | Native `lineNumbers` |
| Fold and unfold blocks, arrow and keyboard folding, "N items" hint | Native fold gutter plus our `jsonFoldService`; collapse all and collapse to depth use fold effects in batches (one effect per 1M ranges took 22 s, so batch by record, 165,000 records took 2.2 s) |
| Click a line selects its path (`currentPath`, `tree:node-selected`) | Map click position to a path through a path index (below) |
| Path changes elsewhere reveal and highlight the line | Path index gives the line; `scrollIntoView` effect and a line decoration |
| Click a key highlights the same key everywhere; double click a key opens Find with `key:name` | Click handler on key ranges; decoration for the matches |
| Double click a value edits it (`tree:inline-edit`) | Small input over the value; edit goes through the existing command layer, which re-renders |
| Right-click menu | Same menu component, path from the path index |
| Bookmarks | Gutter marker plus line decoration, kept in the model |
| Find highlights and filter (hide lines that do not match) | Match line decorations; hidden stretches as replace decorations (82,000 hidden stretches took 0.9 s) |
| Wrap toggle | `EditorView.lineWrapping` |
| Special characters shown | `highlightSpecialChars` (already in our wrapper) |
| Theme, light and dark | Existing CodeMirror theme in `code-view.js` |
| Large file | Cap about 40 MB for the first version (see section 9); above the cap the Classic Tree opens and says why. This matches how other large-JSON viewers work: they use a virtualized tree over a flat index (not an editor) for files of hundreds of MB, and a Mozilla bug shows Firefox devtools turning CodeMirror off for big response bodies. Our Classic Tree is that design, so it stays the answer above the cap. |

**The hard part: the path index (now measured, feasible).** CodeMirror shows text, our features work on paths, so we need a map from a line to its path and back. Spike (own code, your fixtures, one scan over `JSON.stringify(data, null, 2)`, three typed arrays: parent line, index in the parent array, key id):

| File | Lines | Pretty-print | Index scan | Index memory | Line to path | Path to line |
|---|---|---|---|---|---|---|
| 37 MB (`perf_100k.json`) | 2.2 million | 0.35 s | 0.34 s | 25 MB | 100,000 lookups in 80 ms | not timed |
| 88 MB (`perf_150k_complex.json`) | 6.9 million | 1.2 s | 1.1 s | 79 MB | 100,000 lookups in 97 ms | 23 to 41 ms (scan, round trip correct) |

So the index is cheap and fast at both sizes, and it is better than CodeMirror's own way (walking the syntax tree up from the cursor, where each array level costs time proportional to the array length, per a CodeMirror forum thread). Memory for the 88 MB file would be roughly 226 MB (data) plus 134 MB (text) plus about 220 MB (CodeMirror, from the earlier 89 MB spike) plus 79 MB (index), about 660 MB: heavy but bounded. For 40 MB it is about 300 MB. Do the pretty-printing and index in a worker.

**Other known risks:** very long single lines were my worry, and they are measured now (section 10.11): a read-only CodeMirror box with one 30 MB text value opens in 1.3 s, keeps about 2,100 characters in the page and its worst frame is 18 ms, so this is not a risk for a read-only Tree (the 2 MB limit in the Editor is for editing and minifying). Still to watch: pretty-printing a 40 MB document on the main thread (do it in the worker) and two copies of the document in memory (the parsed data and the text).

**Acceptance for the MVP (all must pass):**
1. Every item in the checklist works, proven by tests run against both engines (the existing Tree tests parameterized with `?engine=`).
2. On the 37 MB fixture: Code Tree first view no slower than Classic, memory not more than 1.5 times Classic.
3. Whole suite (lint, unit, browser, UI audit) green with Classic default, and the Tree tests green with Code on.
4. No change to any other view, command or file when the switch is Classic.

## 5. Quick wins that do not wait for the MVP

Each is small, behind existing tests, and independent:

1. Worker cache: remove `?v=Date.now()` from worker URLs (use a build or version string instead). Faster load on every visit after the first.
2. Native `<dialog>` in `StructraDialog` (one file). Keep the same API, run the shell and layout tests.
3. Replace the JSONPath engine with json-p3 behind the same `Structra.jsonpathQuery.query()` API (measured 715 of 715 on the official suite). Keep our unit tests; add an adapter for `=~`.
4. Lint rule or unit test that fails when a component adds a listener it does not remove (the Tree bug that cost us most). Components also need cleanup on disconnect (section 3).
5. Remove the remaining fixed waits in the browser tests where a condition can be waited for.

## 6. Phases

| Phase | Content | Size | Done when |
|---|---|---|---|
| 0 | Push the current branch and open a PR into `dev` (the fixes in the deep dive), so new work starts from a clean base | S | PR merged into `dev` |
| 1 | Quick wins 1 to 3 from section 5, path index spike for the MVP | S to M | Facts recorded in the docs, spike result known |
| 2 | **MVP**: Code Tree behind the switch, parity checklist, tests on both engines | L | Acceptance in section 4 passes; you look at it |
| 3 | Decide: make Code the default, or keep both, or stop. Then undo deltas (jsondiffpatch) | M | Decision recorded |
| 4 | Table spike (Tabulator against our table on the same fixtures), Graph limit measurement | M | Numbers and a recommendation |
| 5 | Adopt what won; remove the old code only after a full release cycle on `prod` | M each | Old code deleted, docs updated |

Branch plan: `feature/mvp-code-tree` from `dev`. Merge to `test` and `prod` only when you say so.

## 7. Guardrails so nothing else is affected

- Each swap is behind a switch with the old code intact until the end of Phase 5.
- Each library keeps our own `Structra.*` API on the outside (adapter), so callers do not change.
- Vendored with exact version, license and source noted in `src/libs/.../NOTICE`.
- Offline test (`tests/smoke/offline.js`) and the hostile-input and stress tests must stay green.
- A written budget per library: bytes on first load, memory on the large fixtures, time to first view.

## 8. Research notes and sources

- **JSON editor product.** The svelte-jsoneditor README ([source](https://cdn.jsdelivr.net/npm/svelte-jsoneditor@3.12.0/README.md)) describes tree, text (CodeMirror 6) and table modes, large documents "up to 512 MB", text mode warns above 10 MB by default, ISC license, a framework-free `vanilla-jsoneditor` build with a standalone bundle that includes its own dependencies, immutable content updates, long values truncated at 1,000 bytes in tree and table. Browser requirement: March 2022 or newer. Bundle sizes are not stated there: measure before any decision.
- **Data grids.** A 2026 benchmark summary ([source](https://www.pkgpulse.com/guides/tanstack-table-vs-ag-grid-vs-react-data-grid-2026), plus [Tabulator virtual DOM docs](https://tabulator.info/docs/6.3/virtual-dom)) reports TanStack Table (headless, you write the markup and add virtualization), AG Grid Community (vanilla core, MIT, larger) and Tabulator (vanilla, batteries included) all render 500,000 rows at about 60 fps in that test. Bundle size figures in the sources disagree widely and the Tabulator license is not shown on the docs page fetched: verify on the packages.
- **Virtualization helpers.** [`@tanstack/virtual-core`](https://tanstack.com/virtual/latest) is the framework-agnostic core and supports dynamic sizes by measuring elements; [virtua](https://github.com/inokawa/virtua) is smaller but its docs focus on framework adapters.
- **Native dialog and popover.** Sources from 2026 ([article](https://attr-action.pages.dev/blog/2026-03-17-html-dialog-element-adoption/), [popover deep dive](https://dev.to/anjab/the-html-popover-attribute-complete-deep-dive-l6d), [anchored popovers](https://hidde.blog/positioning-anchored-popovers)) agree that `showModal()` makes the rest of the page inert and that popovers are non-modal. Anchor positioning is the part with uneven support (Chromium and recent Firefox yes, Safari must be re-checked).
- **Large numbers.** [lossless-json](https://github.com/josdejong/lossless-json) keeps number digits as text (about 4 kB gzipped, MIT, "much slower than native" parse). Our worker already keeps risky numbers as text, so this is not needed.
- **Graphs.** The searches returned only dated or generic comparisons for Cytoscape.js, D3 and ELK. No reliable benchmark for JSON-shaped trees: measure our own limit first.
- **JSONPath.** [jsonpath-plus](https://www.npmjs.com/package/jsonpath-plus) follows the original specification, not RFC 9535; json-p3 and others claim RFC 9535. A community compliance project compares engines: use its suite on our engine first.
- **Charts.** Bundle size figures from two sources disagree (uPlot about 10 kB gzipped, Chart.js 25 to 58 kB, ECharts 100 to 170 kB). Our charts are about 220 lines of SVG: keep.

Search quality note: several searches returned thin results. Every figure marked "verify" must be checked on the package or its docs before it drives a decision.

## 9. Decisions needed from you

1. Approve the MVP scope in section 4 (Code Tree behind a switch, Classic stays default).
2. The size cap for the first version. The path index measured fine up to 88 MB, so the cap is now decided by CodeMirror's memory, not by the index: suggested 40 MB, then measure and raise toward 90 MB.
3. vanilla-jsoneditor is measured now (section 10.8): fast because it pages arrays, but a different experience and 362 KB gzipped on top of CodeMirror. Do you still want it tried as a possible "paged view" for huge files, or drop it?
4. May I push the current branch and open a PR into `dev` first (Phase 0)?
5. Done with your permission: `@axe-core/playwright` is a dev dependency and `tests/ui/06-axe.js` runs it (section 10.9).
6. Done with your permission: the JSONPath candidates were run (section 10.2).
7. Cross-browser: should the CI run the browser tests in Firefox and WebKit on every pull request (a job is added in `ci.yml`, not yet run on GitHub), or only before a release? Firefox takes about 4.5 minutes, WebKit about 2 minutes.
8. Graph node labels: the accessibility rule wants the visible text to be part of the name. Fixing it means clipping the full label instead of ending it with an ellipsis. Is that look change acceptable?
9. Adopt json-p3 for JSONPath now (Phase 1), keeping our API?

## 10. Research round 2 (measured facts)

Everything here was measured or read from a primary source on 2026-10-27. Where it is a claim by a package, it says so.

### 10.1 Exact package facts (npm registry, latest versions)

Size is minified and gzipped, measured from jsDelivr's bundled builds. Packages with dependencies are understated because their dependencies stay separate imports, except where noted.

| Package | Version | License | Unpacked | Gzipped | Notes |
|---|---|---|---|---|---|
| vanilla-jsoneditor | 3.13.0 | ISC | 10 MB, 26 dependencies | 362 KB (standalone build, 1.2 MB minified) | on top of our CodeMirror (our own bundle is 25 KB entry plus lazy chunks) |
| tabulator-tables | 6.7.1 | MIT | 29 MB (docs and dist) | 101 KB plus 3 KB CSS | no dependencies |
| ag-grid-community | 36.2.0 | MIT | 21 MB | 345 KB | |
| @tanstack/table-core | 9.3.1 | MIT | 1 MB | 28 KB | headless: we write the markup |
| @tanstack/virtual-core | 3.19.8 | MIT | 628 KB | 9 KB | headless virtualizer, framework-free |
| virtua | 0.54.0 | MIT | 2.7 MB | 10 KB | |
| @headless-tree/core | 1.8.0 | MIT | 525 KB | 12 KB | accessible tree logic; its docs show only React usage and no 1M-node benchmark |
| jsonpath-rfc9535 | 1.3.0 | Apache-2.0 | 1 MB | 8 KB | no dependencies; claims 100 percent of the compliance suite |
| json-p3 | 3.0.1 | MIT | 469 KB | 15 KB | |
| jsonpath-plus | 11.2.1 | MIT | 838 KB | 9 KB | follows the older spec, not RFC 9535 |
| jsonc-parser | 3.3.1 | MIT | 208 KB | 6 KB | streaming parse with offsets: an alternative way to build a path index |
| d3-hierarchy | 3.1.2 | ISC | 133 KB | 5 KB | tree layouts |
| cytoscape | 3.34.4 | MIT | 5.5 MB | 138 KB | |
| elkjs | 0.12.0 | EPL-2.0 OR GPL-3.0 | 7.8 MB | not measured | license needs a review before any use |
| uplot | 1.6.32 | MIT | 533 KB | 22 KB | |
| chart.js | 4.6.1 | MIT | 6 MB | 66 KB | |
| lossless-json | 4.3.3 | MIT | 356 KB | 3 KB | not needed (our worker already keeps risky numbers as text) |
| @floating-ui/dom | 1.8.0 | MIT | 170 KB | 3 KB | |
| lit | 3.3.3 | BSD-3-Clause | 104 KB | not measured | |
| idb | 8.0.4 | ISC | 81 KB | 1 KB | |
| comlink | 4.4.2 | Apache-2.0 | 246 KB | 2 KB | |
| @codemirror/search | 6.7.2 | MIT | 134 KB | 7 KB | in-editor Ctrl+F, only if wanted |
| @codemirror/merge | 6.12.3 | MIT | 179 KB | 10 KB | side-by-side and unified text diff view |
| @leeoniya/ufuzzy | 1.0.19 | MIT | 131 KB | 4 KB | fuzzy matching |
| fuse.js | 7.5.0 | Apache-2.0 | 407 KB | 9 KB | fuzzy matching |
| jsondiffpatch | 0.7.6 | MIT | 159 KB | 5 KB | already shipped |

Not adopted on purpose: sigma (98 KB gzipped, WebGL graph), jsonata (25 KB gzipped, a different query language), immer and mutative (about 1 MB unpacked, not needed with jsondiffpatch).

### 10.2 JSONPath: our engine against the official suite

Tool: `tests/perf/jsonpath-compliance.js` (runs each test in its own process with a time limit).

| | Before | After the hang fix |
|---|---|---|
| Passed | 229 of 715 (32 percent) | 243 of 715 (34 percent) |
| Hangs | 3 (`$[::-1]`, `$[2::-1]`, `$[::-2]`) | 0 |
| Invalid selectors we accept | 126 | 126 |
| Valid selectors we reject | 322 | 322 |
| Wrong results | 35 | 24 |

Failures by group: whitespace 139 of 168, filter 128 of 188, name selector 113 of 137, functions 57 of 80, slice 21 of 74, basic 8 of 48, index 6 of 20. Examples: `$[?@.a=='b']` (filter without parentheses) is rejected, `$[*,1]` (wildcard in a union) is rejected, `$ ` (trailing space) is accepted.
Most of the whitespace and name failures are strictness (we accept more than the standard), which is harmless for users. The ones that matter are valid RFC syntax we reject, because people copy expressions from documentation.

Candidates (run with permission, `tests/perf/jsonpath-candidates.js`, packages installed in a scratch folder):

| Library | Official suite | Our own expressions | Filter over 200,000 records |
|---|---|---|---|
| json-p3 3.0.1 | **715 of 715 (100 percent)** | all work, including `[::-1]` and `[?@.Cost > 100]` | 122 ms |
| jsonpath-rfc9535 1.3.0 | 674 of 715 (94 percent; its README claims 100 percent against an older suite commit) | all work | 219 ms |
| jsonpath-plus 11.2.1 (safe eval) | 121 of 715 (17 percent) | misses `[-1]`, `[::-1]`, the RFC filter form, and treats `null` as "missing" in `[?(@.Email)]` | 203 ms |
| ours | 243 of 715 (34 percent) | passes our own tests | not measured |

None of them accepts our `=~` regex filter (it is not part of the RFC), so an adapter is needed. json-p3 is the choice: complete, fastest, MIT, 15 KB gzipped.

### 10.3 Path index spike

See the table in section 4. Own code, your fixtures. Conclusion: not a blocker up to 88 MB.

### 10.4 Browser features (MDN browser-compat-data)

| Feature | Chrome | Firefox | Safari |
|---|---|---|---|
| `<dialog>` | 37 | 98 | 15.4 |
| CSS `anchor-name` (anchor positioning) | 125 | 147 | 26 |
| CSS `content-visibility` | 85 | 125 | 18 |

Also (MDN data from the published package): `inert` Chrome 102, Firefox 112, Safari 15.5. `popover` Chrome 114, Firefox 125, Safari 17. `Element.checkVisibility()` Chrome 105, Firefox 106, Safari 17.4 (could replace the layout-forcing `offsetParent` check in the Tree key handler). `overflow-anchor` (scroll anchoring, which the Classic Tree's recycling quietly relies on) Chrome 56, Firefox 66, Safari 27: older Safari has no scroll anchoring. `contain-intrinsic-size` Chrome 83, Firefox 107, Safari 17.

### 10.5 How other large-JSON tools are built (sources)

- Open-source viewers for files of hundreds of MB avoid putting the text in an editor. They scan the file once into a flat index of offsets and structure and draw only the visible rows (BigJSON describes a memory-mapped file with a single tokenizer pass; OmniJSON reports a 189 MB, 6.4 million node reference run with about 7 s of worker parse and about 22 s to ready, MIT). These figures are self-reported and I could not verify them. Our Classic Tree is the same design.
- A Mozilla bug report shows Firefox devtools disabling CodeMirror above 10,240 bytes by default for response bodies, because editor-style rendering is costly at scale.
- CodeMirror 6 has no documented limit for very long single lines, and I found no benchmark. The old CodeMirror 5 had real problems with long lines full of special characters. Treat very long lines as a risk to test, not as solved.
- CodeMirror's own JSON path from cursor (forum thread): walk up from the syntax node, each array level counts siblings (cost proportional to the array length), and property names are decoded with `JSON.parse` (can throw on partial input).

### 10.6 What is still open

- Perspective: measured only by size (section 10.12). A spike is not justified now.
- Graph node labels (one accessibility rule, needs your decision, question 8).
- Real-world speed of json-p3 with our adapter on big documents (measured only on the 200,000 record filter).
- The new CI job for Firefox and WebKit has not run on GitHub yet.
- Whether `content-visibility: auto` helps the Classic Tree: not measured, and probably little, because the recycling already keeps the number of lines in the page small.
- OmniJSON page could not be fetched twice (connection reset): its numbers are from the search summary only.

### 10.7 Table and Graph, measured (ours against Tabulator)

Same data for each (100,000 and 500,000 rows of 8 columns), Edge, one machine, `--enable-precise-memory-info`. Scripts are outside the repo (scratch); the numbers are what to keep.

| | Ours (100,000 rows) | Ours (500,000) | Tabulator 6.7.1 (100,000) | Tabulator (500,000) |
|---|---|---|---|---|
| First rows visible | 97 ms | 112 ms | 128 ms | 500 ms |
| Heap | 57 MB (80 after ingest) | 78 MB (137 after ingest) | 33 MB | 157 MB |
| DOM nodes | 5,622 | 5,622 | 1,091 | 1,091 |
| Worst frame while scrolling | 33 ms | 17 ms | 50 ms | 50 ms |
| Scroll height | 100,723 px (only the rows drawn so far) | 100,723 px | 2.4 million px (true) | 12 million px (true) |
| ARIA roles | none | none | grid, rowgroup, row, columnheader, gridcell | same |
| Arrow keys | no keyboard navigation | | click then ArrowDown moved nothing; Tab left the table | |

Ours loads the file at 3.1 s (100,000 rows, 13 MB) and 1.7 s (500,000 rows, 67 MB). The Graph draws about 250 SVG elements (48 groups) whatever the file size, in about 60 ms: it is depth limited.

### 10.8 vanilla-jsoneditor on the 37 MB file (measured)

Fetch 416 ms, parse 189 ms, first render 138 to 152 ms, heap 41 MB, 1,803 DOM nodes, worst scroll frame 17 ms. It is fast because it draws only the first 100 items of an array and offers range links ("Item 100-100000: show 100-200, show 50000-50100, show 99900-100000") instead of a continuous scroll. That is a different experience from ours (and from a CodeMirror Tree). With the 362 KB gzipped standalone build, a second CodeMirror, an immutable data model and values truncated at 1,000 bytes, it is not a fit for the main Tree. It stays a possible read-only "paged" view for huge files.

### 10.9 Accessibility with axe-core (dev dependency added with your permission)

`@axe-core/playwright` 4.14 runs a few hundred WCAG rules. `tests/ui/06-axe.js` runs it on every view in light and dark, and with the Find bar open. First run: 54 findings of 7 kinds our own audit never reported. After fixes: 2 findings (1 kind).

| Rule | Where | Fix |
|---|---|---|
| landmarks (`region`) | top bar, tab bar, status bar outside any landmark | `role="banner"`, `role="navigation"`, `role="contentinfo"` on those elements |
| `page-has-heading-one` | whole page | a visually hidden `h1` |
| `label-content-name-mismatch` | Copy JSON button, depth buttons 1 2 3 | names now contain the visible text |
| `aria-required-children` | the Tree box had `role="tree"` but its lines are not tree items | now `role="group"` with a label |
| `scrollable-region-focusable` | table box, schema box, code box | `tabindex="0"`, region role and label (table, schema); `tabindex="0"` on the code box content |
| `empty-table-header` | Overview table | a visually hidden label |
| `label-content-name-mismatch` | **18 graph nodes, not fixed** | the visible text ends in an ellipsis, the name is the whole label: fixing it changes how the labels look |

### 10.10 Cross-browser: Firefox 157 and WebKit 27.2 (Playwright's builds)

Installed with your permission. Until now every test ran only in Chromium (Edge). First run of all 35 browser runs: WebKit 31 of 35, Firefox 30 of 35.

| Failure | Cause | Fix |
|---|---|---|
| Editor and Labels (both engines) | The Editor read the **place of a JSON error from the browser's own message**: Chrome says "at position 12", Firefox "at line 1 column 12 of the JSON data", Safari says only "Expected ']'". In Safari and Firefox the line, column and marker were lost. A real product bug. | `jsonc-parser` (MIT, 20 KB minified, vendored as `src/libs/jsonc-parser.min.js`) gives the same offset and error code in every browser; `explainParseError()` says it in plain words; the old reading stays as the fallback. 9 unit tests. |
| PowerPlatform and PathHistory (both engines) | The tests granted clipboard permissions that only Chromium has, and read the clipboard back, which Firefox and WebKit refuse. Not an app bug (the app falls back to the copy command). | `allowClipboard` and `readClipboard` helpers record what the app copies |
| Firefox fixtures (4 files) | Page load timeouts at 6 browsers at once; pass when run alone | Firefox width capped at 4 |

Now: 35 of 35 in Chromium, 35 of 35 in WebKit (about 2 minutes), 35 of 35 in Firefox (about 4.5 minutes at width 4). The Tree tests (recycling, state, margin, keys) all pass in both, so the Classic Tree's recycling works without Chromium's scroll anchoring too. Run them: `npm run test:firefox`, `npm run test:webkit`. A CI job runs both (not yet run on GitHub).

### 10.11 Long lines in CodeMirror (measured)

Our wrapper, read-only box, pretty-printed JSON with one text value of the given size, Edge:

| Value size | Create | Painted | Worst frame while scrolling along the line | Characters in the page |
|---|---|---|---|---|
| 0.5 MB | 75 ms | 109 ms | 33 ms | 2,116 |
| 2 MB | 104 ms | 111 ms | 18 ms | 2,116 |
| 8 MB | 342 ms | 349 ms | 17 ms | 2,116 |
| 30 MB | 1,311 ms | 1,318 ms | 18 ms | 2,116 |

CodeMirror windows long lines sideways, so only what is visible is in the page. Very long values are not a risk for a read-only Tree.

### 10.12 Perspective (FINOS), by size

Apache-2.0. Version 3.8.0. `@finos/perspective` 7 MB unpacked (its WebAssembly server is 2.2 MB), `perspective-viewer` 7.8 MB, `perspective-viewer-datagrid` 1.1 MB, `perspective-viewer-d3fc` (charts) 11.3 MB. It would add several megabytes and duplicates what DuckDB already does for us (grouping, pivots, SQL). Not adopted, and no spike planned.
