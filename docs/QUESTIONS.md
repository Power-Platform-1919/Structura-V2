# Open questions

All questions in one place. Answer them whenever you like, in any order, as we develop. Nothing waits on you: each question has a **default** that I will use if you have not answered by the time the work needs it, and I will say so when I do.

**How to answer:** write the id and the answer, for example `Q3 A`, `Q4 yes`, `Q1 restore`, or `defaults are fine`. I will record it in the answered log at the bottom, update the task list, and carry on.

**What never changes without your word:** nothing is merged into `dev`, `test` or `prod`, and nothing is promoted. Work happens on branches and in pull requests.

Task ids point into [TODO.md](TODO.md). Background for each question is in [feature-technology-map.md](feature-technology-map.md).

## Needed first (they start Wave 0)

| Id | Question | Options | My recommendation | Default if you do not answer | Blocks |
|---|---|---|---|---|---|
| Q1 | **Table:** keep the windowed version (a library does the scroll arithmetic) or restore `virtual-list.js` and upgrade it ourselves? I removed that file without asking first. | **keep** or **restore** | keep: it is built and tested in three engines, and it removes our own scroll code | keep, then commit the branch and open a pull request | task 17 (17.17 to 17.22) |
| Q2 | **Work order:** Wave 0 (correctness bugs) first, then the small improvements (Wave 1), then the Table and CodeMirror Tree? | **yes** or another order | yes | yes | tasks 18, 21, 17, 20 |
| Q3 | **Path model:** keep our dotted form with one writer and one reader (A), or switch the inside to JSON Pointer (B)? | **A** or **B** | A: saved bookmarks, sessions and workspace files keep working | A | 18.1 |
| Q4 | **CSV export:** protect against spreadsheet formulas (a leading apostrophe on cells that start with `=`, `+`, `-`, `@`), on by default, switchable in Settings? | **yes** or **no** | yes | yes | 18.2 |
| Q5 | **Old prototypes:** move `structra-v2.html` and `samples/` into `docs/archive/` and stop publishing them to the public site? | **yes** or **no** | yes | yes | 18.4.3 and 18.4.4 |
| Q6 | **User-written code:** move all of it (JavaScript query mode, filter expressions, Transform steps, regular expressions) into one sandbox worker? | **yes** or **no** | yes: safer, the page can never freeze, one mechanism instead of four | yes | task 19 and 18.3 |
| Q7 | **Pull requests:** may I open a pull request into `dev` for each finished task when its tests pass? I will never merge. | **yes** or **no** | yes | yes | task 26 |
| Q8 | **Merge order** when you are ready: #6 into `dev`, then #7, then the Table pull request? | **yes** or another order | yes | yes | 15.32, 16.18, 26.1 and 26.2 |

## Needed before Wave 1

| Id | Question | Options | My recommendation | Default if you do not answer | Blocks |
|---|---|---|---|---|---|
| Q9 | **Icons:** newer Lucide (1.62) has some changed artwork and names. OK if a few icons look slightly different? | **yes** or **no** | yes | yes | 21.3 |
| Q10 | **Browser support policy:** which browsers must the app work in? | e.g. the latest two versions of Chrome, Edge, Firefox and Safari | that | that | 21.4 (native dialog), CI |
| Q11 | **Graph labels:** I assumed your "why not wrapping the text" means yes: wrap long labels over 2 or 3 lines in a taller node. Correct? | **yes** or **no** | yes | yes (already assumed) | 21.7 |

## Needed before the CodeMirror Tree

| Id | Question | Options | My recommendation | Default if you do not answer | Blocks |
|---|---|---|---|---|---|
| Q12 | **Size cap** for the CodeMirror Tree in the first version. Larger files open in the Classic Tree. | e.g. 20, 40 or 90 MB | 40 MB, then measure and raise | 40 MB | 20.3 |

## Later, when the work reaches them

| Id | Question | Options | My recommendation | Default if you do not answer | Blocks |
|---|---|---|---|---|---|
| Q13 | **json-p3 fails to load:** keep the plain error message, or add a fallback? | **error** or **fallback** | error: the file is served from our own folder, so a failure means the app itself did not load | error | 16.19, 24.9 |
| Q14 | **Ajv:** upgrade to version 8 (with the draft-04 add-on) or keep version 6? Needs your real schemas (see D1). | **upgrade** or **keep** | decide after testing your schemas | keep for now | 22.1 |
| Q15 | **Firefox and WebKit in CI:** blocking for every pull request, or optional? Firefox takes about 4.5 minutes, WebKit about 2. | **blocking** or **optional** | decide after the job is tuned | optional | 26.4 |
| Q16 | **Promote** `dev` to `test` and `prod`. | when you say | only when you say | never without your word | 26.3 |
| Q17 | **Content-Security-Policy:** how strict may it be, given that the JavaScript query mode needs `unsafe-eval` until the sandbox worker (Q6) is in? | study first | decide after Q6 | study only | 18.4.8 |
| Q18 | **Offline install** (web manifest and service worker): wanted? | **yes** or **no** | optional, low priority | no | 18.4.9 |
| Q19 | **DuckDB:** wait for version 2.0, or upgrade to the current 1.33 now? | **wait** or **now** | wait | wait | 22.2 |
| Q20 | **Bug report button:** a "copy bug report" that holds the version, browser and last errors but never any document data. OK? | **yes** or **no** | yes | yes | 18.4.6 and 18.4.7 |

## Things I need from you (not decisions)

| Id | What | Why | Needed for |
|---|---|---|---|
| D1 | A few real **Power Automate Parse JSON schemas** (the ones you paste into the action) | to choose Ajv 6 or 8 (Q14) and to test the schema generator | 22.1.2 |
| D2 | A few exported **flows** (or flow run outputs) | to check the Power Automate and Power Fx expressions against real use | 23.8.1 |

## Answered log

| Date | Id | Question | Your answer | What I did |
|---|---|---|---|---|
| 2026-10-27 | | Use json-p3 for JSONPath | "if json-p3 is best and long term benefit, we would proceed" | adopted (PR #7) |
| 2026-10-27 | | Table: replace or fix ours | "if you think fixing our hand made code is better, go with that" | upgraded ours, built on a branch (see Q1) |
| 2026-10-27 | | vanilla-jsoneditor | "if you think it is not good, then drop it" | dropped |
| 2026-10-27 | | Push and open a pull request | "yes, go ahead and do a pr" | PR #6, then PR #7 |
| 2026-10-27 | | Firefox and WebKit in CI | "we will see based on time taken and optimisation" | job added, non-blocking (see Q15) |
| 2026-10-27 | | Graph labels | "why not wrapping the text" | taken as yes (see Q11) |
| 2026-10-27 | | MVP scope | "i will approve the mvp scope" | approved: Code Tree behind a switch, Classic stays default |
| 2026-10-27 | | The three rules | replace where mature is better; keep and add the mature cases where ours is better; neither world may cause trouble for the other | written into the map, section 8.0 |
| 2026-10-27 | | Permission to install test tools | "you can install required items for testing" | installed axe-core, Firefox and WebKit for Playwright; scratch packages for audits |
