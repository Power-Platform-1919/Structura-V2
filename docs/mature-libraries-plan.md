# Plan: best of both worlds (mature libraries plus our own value)

Status: proposal, waiting for approval. Nothing in this plan is built yet.
Evidence: [deep-dive-analysis-2026-10.md](deep-dive-analysis-2026-10.md).

## 1. The idea in one paragraph

Our app has two kinds of code. Some of it is unique to us: Power Platform expressions, the Overview insights, data paths, Parse JSON schema generation, the find-across-everything flow. The rest solves problems that mature libraries and the browser itself already solve and test: showing a long list, folding, keyboard handling, dialogs, undo, tables. The deep dive found 13 real bugs in the second kind within one session. The plan is to keep our own code only where it does something nothing else does, and to move everything else to mature code, one area at a time, each behind a switch so nothing breaks while we compare.

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
| Menus and tooltips (context menu, positions) | Own positioning code | Popover API, `@floating-ui/dom` as a fallback | **LATER** | Popover is widely supported. CSS anchor positioning is newer: Chromium and recent Firefox have it, Safari support must be re-checked before use. |
| Undo | Full JSON snapshots, now with a 60 MB budget | jsondiffpatch deltas (already shipped) | **ADOPT (medium)** | Stores small diffs instead of full copies: much less memory on big files. Must keep the same `Structra.undoStack` API; tests exist. |
| JSONPath | Own 234-line engine (a useful subset) | An RFC 9535 library, if one passes | **SPIKE (cheap, measurable)** | Run the official JSONPath compliance test suite against our engine first. If we pass what users use, keep it. If not, evaluate json-p3 or similar. jsonpath-plus follows the older spec, not RFC 9535. |
| Table | Own virtual list plus table, 1,102 lines, no keyboard navigation | Tabulator (vanilla, virtual DOM, MIT per the benchmark source, confirm in package) or AG Grid Community (MIT, bigger) or TanStack Table plus virtual-core (headless, we write the markup) | **SPIKE after the Tree MVP** | A 2026 benchmark source reports all three keep about 60 fps at 500,000 rows. Our gaps are keyboard, resize, copy, selection, not speed. Verify license text and size on the packages before deciding. |
| Virtual list (shared) | `virtual-list.js`, 270 lines | `@tanstack/virtual-core` (framework-free core) or `virtua` | **LATER** | Only if the Table stays ours. If Tabulator is adopted this goes away. |
| Graph | Own SVG graph, zoom and pan | Cytoscape.js; layout from `elkjs` or `d3-hierarchy` | **MEASURE FIRST** | Measure our limit (nodes before it gets slow). Replace only if the limit is too low for real files. Sources found were thin: benchmark ourselves. |
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
| Large file | Cap about 20 to 40 MB for the first version; above the cap the Classic Tree opens and says why |

**The hard part (be honest about it): the path index.** CodeMirror shows text, our features work on paths. We need a map from a line to its path and back. Build it once per document, in a worker, while the text is generated: for each line that opens a container record its path and nesting. Memory cost is one small record per container, not per line. Spike this first, it decides whether the MVP is feasible within the cap.

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
2. The size cap for the first version (suggested: 20 MB, raise after measuring).
3. Do you want the vanilla-jsoneditor comparison spike now, or only if the CodeMirror Tree falls short?
4. May I push the current branch and open a PR into `dev` first (Phase 0)?
