# Structura V2

A local JSON analyzer for everyone, with built-in tools for Power Platform makers.

**Live app:** https://power-platform-1919.github.io/Structura-V2/

Open a JSON, CSV, XML, YAML or TOML file and see what is inside it: its shape, its types, and where the data has gaps. Everything runs in your browser. Your data is never uploaded.

## What it does

- **Overview**: a plain summary of the file: what it holds, key figures, findings to look at first and the biggest lists.
- **Five views**: Tree, Table, Graph, Schema and Overview (`Ctrl+1` to `Ctrl+5`).
- **Query and Transform**: search with a path, JSONPath, pattern or JavaScript; pick fields, sort, group and total.
- **Filter, Find and Compare**: narrow the data, search inside it and diff two files.
- **Power Platform tools**: click any value to get:
  - the Power Automate expression (null-safe at every step)
  - a Parse JSON schema
  - the Power Fx formula (`ParseJSON`)
  - paste-ready flow actions: Select, Filter array, Apply to each, Compose, Condition
- **Themes**: light, dark and system modes, 8 built-in themes, custom themes with JSON import and export. Use the **Themes** button on the left rail.
- **Tabs and sessions**: open several files; tabs are saved and restored when you reopen the page.
- **Command palette**: `Ctrl+K`; press `?` for every shortcut.

## Privacy

Files are read and processed in the browser. Nothing leaves the page. Some libraries and icons may load from a CDN, but your data does not.

## Run it locally

No build step. The app is plain HTML, CSS and JavaScript.

```bash
npm install        # only needed for the tests
npm run serve      # serves the folder at http://localhost:8765
```

Then open http://localhost:8765/index.html.

## Tests

```bash
npm test           # unit tests (Node)
npm run test:smoke # opens every fixture in a real browser
npm run test:all   # the full smoke suite
npm run ui:audit   # UI audit: themes, layout, accessibility
```

The browser tests use [Playwright](https://playwright.dev). Set `PW_CHANNEL=msedge` to use an installed Edge instead of downloading Chromium.

## Project layout

| Path | What is there |
|---|---|
| `index.html` | the app entry point |
| `src/core` | engine, analysis, paths, expressions, schema generation, theme, state |
| `src/components` | the UI, as vanilla JS custom elements (no build, no framework) |
| `src/css` | styles, built on the design tokens in `tokens.css` |
| `tests` | unit, smoke, perf and UI audit scripts |
| `memory-bank.md` | notes on the architecture for contributors |

## Branches and deployment

Work moves through `dev`, then `test`, then `prod`. `main` mirrors `prod`.

- Pushing to `prod` publishes the app to GitHub Pages (`.github/workflows/deploy-pages.yml`).
- Pushing to `prod` also resets `main` to match it (`.github/workflows/mirror-prod-to-main.yml`). Do not commit to `main` directly.
