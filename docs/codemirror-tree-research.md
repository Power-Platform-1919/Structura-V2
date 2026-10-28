# One Tree: can CodeMirror drive it on huge files? (2026-10-28)

**Your rule (Q12):** keep one Tree, the same everywhere. Use CodeMirror if it meets every need on large files; if it cannot, keep our own tree, and then only for the Tree.

**Answer:** CodeMirror can, if the document it holds is not the file but **the rows that are showing** (design B below). It beat our tree on every number I measured and met every behavior I tested, with no accessibility findings. **Decision: build the Tree on CodeMirror (design B), behind the same interface the rest of the app already uses.** The cost is real and listed in section 6.

## 1. What the Tree has to do (task 20.3)

Taken from `json-tree-renderer.js` (1,071 lines), `structra-tree.js` and the tests that guard them.

| # | Requirement | Why it matters |
|---|---|---|
| R1 | Open a 90 MB document without freezing the page | the app's promise: large files |
| R2 | Open and close one block instantly; collapse everything and open one level quickly | the main use |
| R3 | Line numbers are the file's own (what the pretty-printed document would show), also when blocks are closed | decided in PR #6; same as the Editor |
| R4 | A row knows its path; a path finds its row, also when that row is not drawn yet | Find, Table, Graph, bookmarks, breadcrumb, expressions all work from paths |
| R5 | Marks that survive scrolling: selected row, find matches, bookmarks, key highlight, filter | the view state is kept in `treeState` today because recycled chunks lose it |
| R6 | Keyboard: arrows, Home, End, Page keys, open and close with the right and left arrows and Enter | task 17 and `treekeys.js` |
| R7 | Screen reader: a tree with levels, an open or closed state, a selected row | UI audit (axe-core) |
| R8 | Select text across rows and copy it | people copy from the Tree |
| R9 | Edit a value in place | `tree:inline-edit` |
| R10 | Hidden and direction-changing characters are shown | PR #6 |
| R11 | A huge list is shown a window at a time with a "more" row | `CHUNK_SIZE` today |
| R12 | The same Tree everywhere a tree is shown | Q12 |

**Where a tree is drawn today (task 20.4):** one place. `structra-tree.js` is the only component that calls the renderer; the Query panel only asks it to mark paths (`highlightPaths`). Compare uses code boxes, the Graph is its own picture. So R12 already holds: the decision is about the engine, not about uniformity.

## 2. What CodeMirror and others say (task 20.5)

- **A virtual document needs its own line numbers.** A maintainer's advice for line numbers that are not the document's: [do not use `lineNumbers` as is, use a custom gutter](https://discuss.codemirror.net/t/custom-gutter-for-specific-lines-only/5530); `formatNumber` [changes only how a number is shown](https://discuss.codemirror.net/t/codemirror-6-offset-line-numbers/2675) and receives the state, so it can read a mapping. The prototype uses `formatNumber` with a typed array that moves with the rows.
- **Very large files are not CodeMirror's job.** On [lazy loading a file of more than 100 MB](https://discuss.codemirror.net/t/lazy-loading-data-for-very-large-files-100mb/1263) the answer is that CodeMirror does not do it; the [viewport size cannot be changed](https://discuss.codemirror.net/t/can-i-set-the-viewport-to-a-bigger-range/5869). That is why the document must be small: design B keeps one line per closed block.
- **Folding many ranges** is best [done in one transaction](https://discuss.codemirror.net/t/folding-all-levels-of-code/8426/5), and [folding by level](https://discuss.codemirror.net/t/add-folding-at-specific-levels-programmatically/7024) means scanning the document yourself. We measured the cost (design A below).
- **How large-JSON viewers work.** The viewers I found keep the data outside the display and draw a flat list of the rows that show: [json_view_plus](https://pub.dev/packages/json_view_plus) flattens the visible tree into one virtualized list and chunks huge lists into range rows; [bigJson](https://hi-malay.github.io/bigjson/) keeps a flat index of every node and draws only the visible rows; [OmniJSON](https://chromewebstore.google.com/detail/jgliihmebpeghnaccmflbnhaokfmlakh) switches to a row-window mode at about 50 MB. Design B is the same idea with CodeMirror as the row drawer. (These are product descriptions, not benchmarks I verified.)

## 3. The designs

- **A. The whole file as text, with folds.** Measured earlier: opening 89 MB (5 million lines) works (0.87 s, about 220 MB), but folding scales badly: collapsing 165,000 records takes 2.2 s and one million fold effects 22 s. Rejected.
- **B. The document is the rows that show.** A closed block is one line (`{ ... 14 keys }`). Opening a block replaces its line with the block's lines in one change; closing puts the one line back. A typed array maps each row to its file line (for the margin) and to its data. Built as a spike in `tests/perf/tree-spike/`.
- **C. Hybrid** (A for small files, B for large): two paths to keep right. Not needed once B is this fast on small files too.
- **Ours today:** hand-written chunks and recycling.

## 4. Measurements (tasks 20.7.11 and 20.8)

Synthetic list of SharePoint-like records (25 lines each). "Painted" includes two animation frames (about 33 ms in these tests), so anything near 33 ms is "inside one frame". Edge unless said.

| | Design B (CodeMirror) | Our tree today |
|---|---|---|
| **58 MB, 160,000 records, 4.0 million file lines** | | |
| Open (to the first drawn view) | 37 ms changed, 51 ms painted (plus 65 ms to build the row model) | the app opens the file in 1,178 ms, longest freeze 446 ms |
| Open one block | 6.5 ms, painted 62 ms | 0.2 ms, painted 130 ms |
| Close one block | 2.8 ms, painted 21 ms | 0.4 ms, painted 11 ms |
| Open 2,000 records in one go | 11 ms, painted 33 ms | n/a |
| Back to one level (depth 3) | n/a (the closed state is the default) | 7.7 ms, painted 103 ms |
| Scroll to the end | painted 33 ms | painted 127 ms |
| Lines in the page | **85** | **5,003** |
| **94 MB, 260,000 records, 6.5 million file lines** | | |
| Open | 54 ms changed, 67 ms painted (92 ms for the model) | file opens in 1,516 ms |
| Open or close one block | 6 ms and 3 ms (painted 33 ms) | open painted 136 ms, close 21 ms |
| 50 blocks opened one by one, slowest | 12 ms | n/a |
| Scroll to the end | painted 34 ms | painted 135 ms |
| Lines in the page | **85** | **5,003** |
| **58 MB in Firefox and WebKit (design B)** | open 31 / 29 ms, one block 9 / 5 ms, 50 blocks slowest 16 / 9 ms, 2,000 records 7 / 10 ms, keys at most 3 ms, 85 lines | not measured |

**Not like for like:** the prototype starts from data that is already parsed, so its "open" times leave out reading and parsing the file (about 0.9 s of the app's 1.2 to 1.5 s, which would be the same with either design). What the numbers do compare fairly is opening and closing blocks, scrolling, and the lines held in the page.

Memory: the spike added 92 to 135 MB on top of the parsed data in Edge for 160,000 to 260,000 records (the row model is typed arrays; most of it is the page holding the test data). Our tree ends at 78 to 200 MB in the same runs.

## 5. Can CodeMirror do what the Tree does? (task 20.7, tested in the spike)

| Requirement | Result |
|---|---|
| R1, R2 | Yes: the numbers above. |
| R3 file line numbers | Yes: the margin read 1,999,327, 1,999,352 and so on after opening a block at 2 million lines (`formatNumber` reading the row-to-file-line array). The margin width is sized for the largest number (as in PR #6). |
| R4 row to path, path to row | Yes: a row is a line; the model holds the row's data. A path to a row far away is found in the model and scrolled to with `scrollIntoView`; nothing needs to be drawn first (no placeholders in between, which were behind one of the five Tree bugs found in task 15). |
| R5 marks | Yes: line decorations rebuilt for the lines in view. Selected row, find match and the `j-line` hook all appeared on the right lines, including 2,000 marked rows far apart, which showed only when scrolled in. |
| R6 keyboard | Yes: a high-priority key map moved the selected row, opened and closed rows, Home, End, Page; each key took 3 ms or less in all three engines. |
| R7 screen reader | **Yes, with three small fixes.** The content element is a `role="tree"`, every line in view is a `treeitem` with `aria-level`, `aria-expanded` and `aria-selected`, and `aria-activedescendant` names the selected row. axe-core found 2 problems at first (CodeMirror adds `aria-multiline` and, for read-only, `aria-readonly`, neither allowed on a tree; and the active row must be one that is drawn). After removing those two attributes and leaving the active-descendant off when the row is out of view: **0 violations, 17 passes.** |
| R8 select and copy across rows | Yes: a selection over 97 rows worked and copies as text. The selection model is CodeMirror's, over the rows that exist; our recycled chunks could not select across chunks reliably. |
| R9 edit in place | Not built in the spike; it is the documented replace-widget pattern (a decoration that swaps the value text for an input). To be built and tested in step 20.9. |
| R10 special characters | Not built in the spike; `highlightSpecialChars` is already in the bundle and is what the Editor uses. |
| R11 huge lists | Not built in the spike; a "more" row is a line that opens the next window when clicked or reached by key. To be built and measured in step 20.9. |

## 6. What it costs

- **Download:** the Tree is the first view, so CodeMirror's core (302 KB, about 100 KB gzipped, plus 21 KB gzipped of other parts) must load before the first Tree. Today it loads when the first code box opens. Parsing it takes about 30 to 50 ms. Mitigation: start the download as soon as a file is chosen.
- **New code:** the row model, the projection, the decorations, the keys, the edit widget and the "more" rows: an estimated 600 to 800 lines, replacing 1,071. The marker for open and closed blocks needs `gutter` and `GutterMarker` added to the bundle (`tools/editor/entry.js`) and the bundle rebuilt.
- **Tests:** many tests look at `.j-line[data-path]`, `.j-toggle`, `.highlighted` and `.find-match`. The spike keeps those names on the lines and the markers, so most tests keep working as they are. Tests that look at recycling internals (`tree-state.js`, `tree-margin.js` parts) are rewritten for the new design.
- **Risk:** the Tree is the main view. Protection: the same renderer interface (`render`, `expandAll`, `collapseAll`, `collapseToDepth`, `highlightPath`, `highlightPaths`, `setFilter`, `updateBookmarkHighlights`, inline edit events), the old renderer kept in `archive/` until the new one has passed every Tree test in three engines, and the large-file budget test.

## 7. Decision (task 20.8)

By your rule, CodeMirror supports the requirement, so the Tree moves to CodeMirror, as design B. It is faster to open and to scroll, holds 85 lines in the page instead of 5,003, gives real text selection and mature scrolling for free, removes the chunk recycling behind three of the five Tree bugs found in task 15 (closed blocks, the selected line and the marks lost when a chunk is rebuilt, and the jump to a chunk that is not drawn), and the Editor and the Tree then share one engine and one look. It is not dramatically faster than what we have for opening and closing a block (both are well under a frame to a few frames), so the case rests on lines in the page, scrolling, selection, fewer bug-prone parts, and one engine. If the build finds a requirement that cannot be met, the fallback is to keep our renderer as the only tree (task 20.10).

## 8. Build plan (task 20.9 and after)

1. Add `gutter` and `GutterMarker` to the CodeMirror bundle; rebuild.
2. `Structra.treeModel`: the row list from the data and the closed or open state, row to path and path to row, the file-line map, windows for huge lists.
3. `Structra.jsonTreeRenderer` rewritten on CodeMirror with the same functions and the same line and marker class names.
4. Inline edit, special characters, "more" rows, filter (hide rows that do not match), bookmarks and key highlight as decorations.
5. Run every existing Tree test; rewrite the recycling tests; add a large-file budget test (open 94 MB, open and close, scroll) and the axe audit on the Tree.
6. Three engines, then the old renderer to `archive/`.
