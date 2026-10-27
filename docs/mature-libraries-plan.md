# Plan: best of both worlds (mature libraries plus our own value)

Status: proposal, waiting for approval. Nothing in this plan is built yet.
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
| JSONPath | Own 234-line engine (a useful subset) | An RFC 9535 library: `jsonpath-rfc9535` (Apache-2.0, 8 KB gzipped, no dependencies, claims 100 percent of the suite) or `json-p3` (MIT, 15 KB gzipped) | **ADOPT (measured, see section 10)** | Measured: our engine passes 34 percent of the official suite (32 percent before the hang fix), 126 invalid selectors are accepted, 322 valid ones are rejected (for example RFC filters without parentheses, unions with a wildcard, strict whitespace). It had 3 hangs, now fixed. Our `=~` regex test is not RFC (the RFC uses `match()` and `search()`), so an adapter keeps it. The candidates' pass rates are their own claims; I was not allowed to run them here, run them yourself (section 10). |
| Table | Own virtual list plus table, 1,102 lines, no keyboard navigation | Tabulator (vanilla, virtual DOM, MIT per the benchmark source, confirm in package) or AG Grid Community (MIT, bigger) or TanStack Table plus virtual-core (headless, we write the markup) | **SPIKE after the Tree MVP** | A 2026 benchmark source reports all three keep about 60 fps at 500,000 rows. Our gaps are keyboard, resize, copy, selection, not speed. Verify license text and size on the packages before deciding. |
| Virtual list (shared) | `virtual-list.js`, 270 lines | `@tanstack/virtual-core` (framework-free core) or `virtua` | **LATER** | Only if the Table stays ours. If Tabulator is adopted this goes away. |
| Graph | Own SVG graph, zoom and pan | `d3-hierarchy` for the tree layout (ISC, 5 KB gzipped); Cytoscape.js (MIT, 138 KB gzipped) only if we need a real graph engine | **MEASURE FIRST** | Our graph is an expandable tree, so a layout helper is enough and a graph engine is overkill. Avoid `elkjs`: it is EPL-2.0 or GPL-3.0 and 7.8 MB unpacked (the CALM ADR found by search puts its WebAssembly binary near 300 KB). No reliable benchmark exists: measure our own limit (nodes before it gets slow). |
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

**Other known risks:** very long single lines are slow in CodeMirror (mitigate: show a long string truncated with a "show all" action, as the Classic Tree could do too); pretty-printing a 40 MB document on the main thread (do it in the worker); two copies of the document in memory (the parsed data and the text).

**Acceptance for the MVP (all must pass):**
1. Every item in the checklist works, proven by tests run against both engines (the existing Tree tests parameterized with `?engine=`).
2. On the 37 MB fixture: Code Tree first view no slower than Classic, memory not more than 1.5 times Classic.
3. Whole suite (lint, unit, browser, UI audit) green with Classic default, and the Tree tests green with Code on.
4. No change to any other view, command or file when the switch is Classic.

## 5. Quick wins that do not wait for the MVP

Each is small, behind existing tests, and independent:

1. Worker cache: remove `?v=Date.now()` from worker URLs (use a build or version string instead). Faster load on every visit after the first.
2. Native `<dialog>` in `StructraDialog` (one file). Keep the same API, run the shell and layout tests.
3. Run the official JSONPath compliance test suite against our engine and record the pass rate (no code change, gives a fact for the SPIKE).
4. Lint rule or unit test that fails when a component adds a listener it does not remove (the Tree bug that cost us most).
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
3. Do you want the vanilla-jsoneditor comparison spike now, or only if the CodeMirror Tree falls short?
4. May I push the current branch and open a PR into `dev` first (Phase 0)?
5. May I add `@axe-core/playwright` as a dev dependency for the accessibility audit (tests only, no effect on the app)?
6. Will you run the JSONPath candidate check yourself, or allow me to run downloaded packages? (see section 10.2)

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

I also prepared a script that runs `jsonpath-rfc9535`, `json-p3` and `jsonpath-plus` against the same suite plus our own test expressions plus a 200,000 record filter benchmark. It was blocked because it executes freshly downloaded packages. The script is saved as `tests/perf/jsonpath-candidates.js` (its header says how to run it). To run it yourself: install the three packages in a scratch folder and run the script, or tell me to run it.

### 10.3 Path index spike

See the table in section 4. Own code, your fixtures. Conclusion: not a blocker up to 88 MB.

### 10.4 Browser features (MDN browser-compat-data)

| Feature | Chrome | Firefox | Safari |
|---|---|---|---|
| `<dialog>` | 37 | 98 | 15.4 |
| CSS `anchor-name` (anchor positioning) | 125 | 147 | 26 |
| CSS `content-visibility` | 85 | 125 | 18 |

The compat entries for `popover` and `inert` were not found at the paths I tried: verify them before relying on them.

### 10.5 How other large-JSON tools are built (sources)

- Open-source viewers for files of hundreds of MB avoid putting the text in an editor. They scan the file once into a flat index of offsets and structure and draw only the visible rows (BigJSON describes a memory-mapped file with a single tokenizer pass; OmniJSON reports a 189 MB, 6.4 million node reference run with about 7 s of worker parse and about 22 s to ready, MIT). These figures are self-reported and I could not verify them. Our Classic Tree is the same design.
- A Mozilla bug report shows Firefox devtools disabling CodeMirror above 10,240 bytes by default for response bodies, because editor-style rendering is costly at scale.
- CodeMirror 6 has no documented limit for very long single lines, and I found no benchmark. The old CodeMirror 5 had real problems with long lines full of special characters. Treat very long lines as a risk to test, not as solved.
- CodeMirror's own JSON path from cursor (forum thread): walk up from the syntax node, each array level counts siblings (cost proportional to the array length), and property names are decoded with `JSON.parse` (can throw on partial input).

### 10.6 What is still open

- The three candidates' compliance and speed (blocked, see 10.2).
- Tabulator keyboard and screen reader behaviour: searches returned nothing on it. Check its docs or test it in the spike. AG Grid's accessibility claim is not verified either.
- Real numbers for our own Graph and Table limits (nodes and rows before they slow down).
- `popover` and `inert` support data.
- OmniJSON page could not be fetched a second time (connection reset), its numbers come from the search summary only.
- Perspective (FINOS, Apache-2.0, WebAssembly grid and charts): licence and design look interesting for Table, Pivot and Charts together, but I found no size or large-row benchmark. It would be a large addition (WebAssembly), so only a spike candidate if the Tabulator trial disappoints.
