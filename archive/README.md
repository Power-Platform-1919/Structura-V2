# Archive

Code that the app no longer uses, kept so nothing is lost while we are sure. **Review it and delete what is not needed.**

Nothing here is shipped, linted, tested or published: the deploy workflow copies only `index.html`, `src` and `icons`, ESLint skips this folder, and the unit tests only read `src`.

| What | Where it came from | Why it was moved | Moved on |
|---|---|---|---|
| `structra-v2.html` | the first single-file prototype of V2 | replaced by the split app (`index.html` and `src`) | 2026-10-28 |
| `samples/` (five `option-*.html` pages) | design options explored before the redesign | the chosen design is in `src/css`; they were also being published to the site by mistake | 2026-10-28 |
| `engine-worker.js` | a worker for heavy search, sort and filter | nothing ever started it. It was also loaded as a plain script on the page, where it took over `window.onmessage`; that script tag is removed | 2026-10-28 |
| `src-core/virtual-list.js` | the old windowed list used by the Table | the Table now uses `Structra.rowWindow` (a true scrollbar). It was already deleted from the code on the Table branch; this is its last version | 2026-10-28 |

Decided in `docs/QUESTIONS.md` (Q5 and Q21): unneeded code goes here first, and is deleted later after a review.
