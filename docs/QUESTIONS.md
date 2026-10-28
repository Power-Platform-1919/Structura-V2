# Open questions

All questions in one place. Answer when you like, in any order, as we develop. Nothing waits on you: each question has a **default** I use if you have not answered by the time the work needs it, and I say so when I do.

**How to answer:** write the id and the answer, for example `Q3 A` or `Q18 yes`. I record it in the log at the bottom and update [TODO.md](TODO.md).

**Rules of the road (from you):** I may open pull requests and **merge them into `dev`** myself, carefully (CI green first). Nothing goes from `dev` to `test`, from `test` to `prod`, or from `prod` to `main` without your word each time.

## Open

None right now.

### Q3 in plain words (answered: A): what is the "path model"?

Every value in a document has an address, like "the Title of the first item in the list called value": `value[0].Title`. The Tree, Find, the Table, Compare, the Query panel and the Power Automate expressions all need to agree on how an address is written and read.

**The problem today:** about 16 places write addresses by hand, with 6 different rules. For a key like `@odata.etag` (SharePoint and Dataverse payloads are full of them):

- the Tree writes `value[0]["@odata.etag"]` (quoted, readable),
- Find writes `$.value[0].@odata.etag` (not quoted, so the reader thinks it means key `@odata` and then key `etag`, finds nothing, and Next, Previous and the highlight fail).

**Option A (my recommendation):** keep how addresses look today, so bookmarks, saved sessions, workspace files, the path bar and the expression generators all stay exactly the same. Add **one** function that writes any address correctly (plain `.Title` for ordinary keys, `["@odata.etag"]` for odd ones) and make the reader understand everything that function can write. Every place that wrote addresses by hand calls that one function instead. A test then tries nasty keys (dots, brackets, quotes, backslashes, empty, starting with `$`) through every place and checks them against json-p3, which follows the official rules.

**Option B:** change what is stored inside to an official standard called JSON Pointer (`/value/0/@odata.etag`), which has no ambiguity at all, and turn it into the readable form only for display. Cleaner in theory, but every saved bookmark, session and workspace file has to be converted and every part that reads addresses changes.

### Q18 in plain words (answered: no for now): offline install

### Offline install: what it would take (estimated 2026-10-28, at your request)

**Where we are:** the app makes no outside requests, so once it has loaded it works with no network. What is missing is *opening* it with no network (after a restart, or after the browser drops its cached copy) and an "Install" button. There is no web manifest, no service worker and only one icon (`icons/icon.svg`). The whole folder is 39.7 MB: 35.6 MB is the DuckDB engine (loaded only when SQL or Pivot is used), 4.1 MB is everything else (111 files at start, 700 KB gzipped).

**The pieces, with the time each takes** (one person who knows the code):

| Piece | What | Time |
|---|---|---|
| Manifest and icons | `manifest.webmanifest` (name, start_url, display, colours), PNG icons 192 and 512 and a maskable one made from the SVG, links and theme colour in `index.html` (Chrome and Edge need name, 192 and 512 icons, start_url, display, and HTTPS) | 2 to 3 hours |
| Service worker, app files | caches the 4 MB at install and serves it first; the file list is made by a small script at deploy time (the app itself stays unbuilt; Workbox's precache does the same job, or about 60 hand-written lines) | 0.5 to 1 day |
| The DuckDB engine (35.6 MB) | not cached at install (it would make the first visit 35 MB heavier); cached the first time SQL, Pivot or the Query panel uses it, or by a "Make SQL work offline" button; so SQL offline works after one online use | 0.5 day |
| Updates | one cache per app version (the version is already in the page and in the worker file addresses, 21.1); a "A new version is ready, reload" message; never serve old code after a release | 0.5 to 1 day |
| Hosting paths | the site is served from different base paths (dev, test, prod, a project page), so the worker scope and start_url must be relative | 2 to 3 hours |
| Tests | Playwright can go offline after the first load (Chromium, Firefox, WebKit all support service workers): reload offline, open a file, every view, a PNG, and with the engine cached also SQL; plus a test that a release replaces the cache; extends `tests/smoke/offline.js` | 0.5 to 1 day |
| Documents | install and remove steps, what is stored, how to clear it; THIRD-PARTY and the map | 2 hours |

**Total: about 3 to 4 working days for a careful result (tests in three engines, an update story). A minimal version (manifest, one cache-first worker, no update message) is about 1.5 days, but it can serve old code after a release, so I would not ship it.**

**Risks:** a stale cache showing old code (the update piece and its test are the cure); Safari on a Mac cannot install a web app (on iPhone and iPad it can, from Share) but the offline cache still works there; iOS may clear a site's storage after weeks of no use; the browser's storage quota is large enough (hundreds of MB), so 40 MB is fine; the Zscaler proxy at work does not matter once the files are cached.

**What you would gain:** open on a plane or on a locked-down network after one visit, instant start from the cache (the first screen is 0.8 s now and would be a few hundred ms), a desktop and phone icon. **What it does not change:** your data still never leaves the page; the app still makes no outside requests.

**My recommendation:** worth doing after the development tasks are done, as one small pull request in the order above, because it touches how every release reaches people. Say "go" when you want it; the decision stays on the watch list (30.5) until then.

**The original question, for reference:**


The app already makes **no outside requests** while it runs: fonts, icons and libraries are all served from the app's own folder, and your data never leaves the page. But to **open** the page you still need to reach the site (or a local server) at least once, and a browser may drop its cached copy. A **service worker** (a small background script) plus a **web manifest** would let the browser keep the whole app so it opens with **no internet at all**, even after a restart, and would offer "Install" so it looks like a normal desktop app. It is optional, small to add, and has one cost: after each release, installed copies must update themselves, which needs a little care.

## Things I needed from you (now done)

D1 (real Parse JSON schemas) and D2 (real flows) came from your own developer environments through the Power Platform tools; results are in the map, section 8.6. Nothing from your environments is stored in the repository.

## Answered log

| Date | Id | Question | Your answer | What I did or will do |
|---|---|---|---|---|
| 2026-10-27 | | Use json-p3 for JSONPath | "if json-p3 is best and long term benefit, we would proceed" | adopted (PR #7) |
| 2026-10-27 | | Table: replace or fix ours | "if fixing our hand made code is better, go with that" | upgraded ours, built on a branch |
| 2026-10-27 | | vanilla-jsoneditor | "if you think it is not good, then drop it" | dropped |
| 2026-10-27 | | Push and open a pull request | "yes, go ahead and do a pr" | PR #6, then PR #7 |
| 2026-10-27 | | Firefox and WebKit in CI | "we will see based on time taken and optimisation" | job added, non-blocking |
| 2026-10-27 | | Graph labels | "why not wrapping the text" | taken as yes; confirmed by Q11 |
| 2026-10-27 | | MVP scope | "i will approve the mvp scope" | superseded by Q12 (one tree) |
| 2026-10-27 | | The three rules | replace where mature is better; keep and add the mature cases where ours is better; neither world may cause trouble for the other | written into the map, section 8.0 |
| 2026-10-27 | | Permission to install test tools | "you can install required items for testing" | installed axe-core, Firefox and WebKit for Playwright, scratch packages |
| 2026-10-27 | | D1 and D2 (schemas and flows) | "use the power platform skills and plugins already installed" | read-only, own developer environments only; see map 8.6 |
| 2026-10-27 | Q1 | Table: keep the library for scroll arithmetic or restore virtual-list.js | "Keep the scroll arithmetic" | keep virtual-core; wrap it in one core module; commit, pull request, merge into dev |
| 2026-10-27 | Q2 | Work order | "Yes, as recommended" | Wave 0, then Wave 1, then Table and Tree |
| 2026-10-27 | Q4 | CSV formula protection | "on by default, as it is csv not excel, so formula should not even be included" | always on, **no setting**. Text cells that start with = + - @ get a leading apostrophe; real numbers (-5) are untouched (tested with PapaParse) |
| 2026-10-27 | Q5 | Old prototypes | "yes move unneeded and unwanted code to archive folder and later we will review and delete them" | `archive/` for prototypes **and** unused code (see Q21); nothing is deleted yet |
| 2026-10-27 | Q6 | Sandbox worker for user code | "if you think that is best, go with it, but better to go with shared architecture, write generic code once" | yes; designed as one generic shared job service, not four copies (task 19, and the new rule 4: shared architecture, task 27) |
| 2026-10-27 | Q7 | Pull requests | "you can raise pr and merge also, as it is dev, you can do anything, but be careful till we push dev to test and then test to prod" | I open and merge into dev after CI is green; nothing is promoted without your word |
| 2026-10-27 | Q8 | Merge order | "as you see fit" | #6, then #7, then the Table |
| 2026-10-27 | Q9 | Icon artwork may change | "as we cant control it as library is upgrading, make sure nothing is breaking and ui should not look awkward" | yes; a visual check of every icon in all themes is a step (21.3) |
| 2026-10-27 | Q10 | Browser support | "yes, but don't restrict it and stop the app" | support the latest two versions of Chrome, Edge, Firefox, Safari as the target for tests, but never block an older browser: feature detection, a note, and the app keeps running (step 21.4) |
| 2026-10-27 | Q11 | Graph labels | "Yes, wrap long text label to multi lines" | wrap (21.7) |
| 2026-10-27 | Q12 | CodeMirror Tree: size cap | "i want to keep only one tree, uniform across all places; if CodeMirror cannot support the requirement, our hand written code for the tree only; do deep research on how to make CodeMirror work for the tree on large files" | **no switch, one tree**. Research and prototype, then decide by numbers: docs/codemirror-tree-research.md, task 20 |
| 2026-10-27 | Q13 | json-p3 fallback | "fallback only if other modules are already doing it, else error message" | error message: only 3 of 11 libraries have one (DuckDB by design, jsonc-parser, virtual-core); CodeMirror, Ajv, jsonrepair, jsondiffpatch, html2canvas, PapaParse do not |
| 2026-10-27 | Q14 | Ajv upgrade | "test and see, is there any benefit for us to upgrade?" | tested on 23 real schemas: no benefit today (see map 8.6); **keep Ajv 6**, revisit on the watch list (task 30) |
| 2026-10-27 | Q15 | Firefox and WebKit in CI | "as you recommended" | optional until tuned |
| 2026-10-27 | Q16 | Promotion | "as we develop, we will push code from dev to test, then test to prod, then prod to main" | each step only when you say |
| 2026-10-27 | Q17 | Content-Security-Policy | "go with your recommendation" | decide after the sandbox worker; study only for now |
| 2026-10-27 | Q19 | DuckDB upgrade | "if it improves the performance then upgrade else wait" | benchmark the current against the newest, decide by numbers (22.2) |
| 2026-10-27 | Q20 | Bug report button | "yes, along with raising an issue when we receive a bug report, but future things" | later: a button that opens a prefilled GitHub issue (task 28) |
| 2026-10-27 | Q3 | Path model | "proceed with your recommendation" | option A: keep the dotted form, one writer, one reader (18.1) |
| 2026-10-27 | Q18 | Offline install | "proceed with your recommendation" | no for now; stays on the watch list (30.5) |
| 2026-10-27 | Q21 | Archive folder | "proceed with your recommendation" | `archive/` at the repo root (18.4) |
