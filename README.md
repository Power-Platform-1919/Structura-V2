# Structura V2

A local JSON analyzer for everyone, with built-in tools for Power Platform makers.

**Live app:** https://power-platform-1919.github.io/Structura-V2/

Open a JSON, CSV, XML, YAML or TOML file and see what is inside it: its shape, its types, and where the data has gaps. Everything runs in your browser. Your data is never uploaded.

## What it does

- **Overview**: a plain summary of the file: what it holds, key figures, findings to look at first and the biggest lists.
- **Five views**: Tree, Table, Graph, Schema and Overview (`Ctrl+1` to `Ctrl+5`).
- **Query and Transform**: search with a path, JSONPath, pattern, JavaScript or SQL; pick fields, sort, group and total.
- **SQL mode**: the open file is a table named `data`, for example `SELECT region, COUNT(*) FROM data GROUP BY region`. It runs in your browser with DuckDB, only reads (it never changes your data), and shows a grid you can copy, download as CSV or open in a new tab. Column names, keywords and functions are suggested as you type (`Tab` or `Enter` picks one, `Ctrl+Space` asks for them). `Ctrl+Enter` runs, selecting text runs just that part, and earlier queries are kept.
- **Filter, Find and Compare**: narrow the data, search inside it and compare two files or tabs. Compare matches the items of a list instead of comparing by position, so one item added at the start is one change. It shades the changed lines in two boxes that scroll together, and copies the changes as a JSON Patch.
- **Power Platform tools**: click any value to get:
  - the Power Automate expression (null-safe at every step)
  - a Parse JSON schema
  - the Power Fx formula (`ParseJSON`)
  - paste-ready flow actions: Select, Filter array, Apply to each, Compose, Condition
- **JSON editor**: the Editor view opens files of up to 100 MB (an 88 MB file opens in about 3 seconds). It has colours, line numbers, folding, bracket matching, and says exactly where the JSON stops being valid. Apply, Format, Minify and Repair work on the text; text you typed but did not apply is kept for each tab.
- **Themes**: light, dark and system modes, 8 built-in themes, custom themes with JSON import and export. Use the **Themes** button on the left rail.
- **Tabs and sessions**: open several files; tabs are saved and restored when you reopen the page.
- **Command palette**: `Ctrl+K`; press `?` for every shortcut.

## Privacy

Files are read and processed in the browser. Nothing leaves the page. Some libraries and icons may load from a CDN, but your data does not.

## Run it locally

The app is plain HTML, CSS and JavaScript. There is no build step, so you only need to clone the repo and serve the folder.

### 1. Get the code

You need [Git](https://git-scm.com/downloads). To run the tests you also need [Node.js](https://nodejs.org) 18 or newer.

```bash
git clone https://github.com/Power-Platform-1919/Structura-V2.git
cd Structura-V2
```

### 2. Serve it

Open the app through a small local web server. Opening `index.html` directly from the disk works only partly, because browsers block some features on `file://` pages.

Pick one of these. All of them serve the current folder.

```bash
# Option A: Python (already installed on most computers)
python -m http.server 8765

# Option B: the same thing through npm (it runs the Python command above)
npm run serve

# Option C: Node, nothing to install first
npx serve -l 8765 .
```

Now open http://localhost:8765/index.html in your browser. Press `Ctrl+C` in the terminal to stop the server.

If port 8765 is busy, use another number, for example `python -m http.server 9000`, and open that port instead.

### 3. Try it

1. The welcome dialog opens the first time. Choose **Open the sample** to see the app with example data, or **Open a file** to use your own.
2. Drag a file onto the page, or press `Ctrl+V` to paste data.
3. After you change a file in your editor, refresh the page. If the browser shows an old version, do a hard refresh with `Ctrl+Shift+R`.

### 4. Make a change and share it

```bash
git checkout dev                    # new work starts on dev
git checkout -b my-change           # optional: a branch for your change
# edit files, refresh the browser to see the result
npm install                         # first time only: installs the test tools
npm test                            # quick checks
git add -A
git commit -m "Describe your change"
```

Then open a pull request into `dev`. See [Branches and deployment](#branches-and-deployment) for how changes reach the live site, and `docs/DEVELOPER-GUIDE.md` for how the code is organised.

## Tests

```bash
npm run lint       # ESLint: names that do not exist, code that cannot run, unused variables
npm test           # unit tests (Node)
npm run test:smoke # opens every fixture in a real browser
npm run test:all   # unit tests, then every browser test (several at a time)
npm run ui:audit   # UI audit: themes, layout, accessibility, random clicking
npm run test:everything   # lint, unit tests, browser tests and UI audit, with a time for each step
```

The same checks and tests run on GitHub for every pull request into `dev`, `test` and `prod` (`.github/workflows/ci.yml`). Lint and unit tests, the browser tests and the UI audit run as three jobs at the same time.

Every test run prints a clock time for each test and a table of how long each took, slowest first, so it is easy to see where the time goes.

The browser tests use [Playwright](https://playwright.dev). Set `PW_CHANNEL=msedge` to use an installed Edge instead of downloading Chromium.

## Project layout

| Path | What is there |
|---|---|
| `index.html` | the app entry point |
| `src/core` | engine, analysis, paths, expressions, schema generation, theme, state |
| `src/components` | the UI, as vanilla JS custom elements (no build, no framework) |
| `src/css` | styles, built on the design tokens in `tokens.css` |
| `tests` | unit, smoke, perf and UI audit scripts |
| `docs/DEVELOPER-GUIDE.md` | how the app is built and how to extend it |
| `memory-bank.md` | detailed notes on behaviour and architecture |

## Branches and deployment

Work moves through `dev`, then `test`, then `prod`. `main` mirrors `prod`.

- Pushing to `prod` publishes the app to GitHub Pages (`.github/workflows/deploy-pages.yml`).
- Pushing to `prod` also resets `main` to match it (`.github/workflows/mirror-prod-to-main.yml`). Do not commit to `main` directly.

## Third-party code

Everything is served from this repository, so the app works offline. Nothing is downloaded from another site.

| Library | Used for | Licence |
|---|---|---|
| [CodeMirror 6](https://codemirror.net/) (`src/libs/codemirror6`) | SQL and JSON editors, coloured code, folding, suggestions | MIT (see `src/libs/codemirror6/NOTICE.txt`) |
| [jsondiffpatch](https://github.com/benjamine/jsondiffpatch) (`src/libs/jsondiffpatch`) | Compare: what is different between two documents | MIT (see `src/libs/jsondiffpatch/NOTICE.txt`) |
| [DuckDB-Wasm](https://duckdb.org/docs/api/wasm/overview) (`src/libs/duckdb`) | SQL engine | MIT |
| [Lucide](https://lucide.dev) (`src/vendor/lucide.min.js`) | Icons | ISC |
| PapaParse, yaml, toml, Ajv, jsonrepair, html2canvas (`src/libs`) | File formats, validation, repair, image export | MIT |
