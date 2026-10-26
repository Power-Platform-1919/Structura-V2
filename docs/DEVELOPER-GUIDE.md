# Structura V2 developer guide

Everything you need to understand, change or rebuild the app. The files in `docs/` other than this one are old design notes and are not kept up to date. `memory-bank.md` in the repo root has more detail on behaviour.

## 1. The big picture

- A static web app. No build step, no framework, no modules. `index.html` loads plain `<script>` tags in a fixed order.
- Everything hangs off one global object, `window.Structra`. Core files add pieces to it (`Structra.dataEngine`, `Structra.themeEngine`, ...). Components are custom elements (`<structra-tree>`) that read and write it.
- All data is processed in the browser. Nothing is uploaded.
- The only dev dependency is `playwright`, used by the tests.

## 2. Folder map

| Path | Purpose |
|---|---|
| `index.html` | Page shell: header, rail, canvas, drawer, status bar, dialogs, and the script list |
| `src/core` | Logic with no screen of its own: state, events, engine, analysis, paths, expressions, themes |
| `src/components` | One custom element per screen, panel or dialog |
| `src/css` | Styles. Load order: `tokens base ui layout shell overview panels overlays components theme-panel` |
| `src/workers` | Web workers that parse CSV, YAML, TOML and XML off the main thread |
| `src/vendor` | Third-party libraries kept locally so the app works offline |
| `tests/unit` | Node tests for the pure logic in `src/core` |
| `tests/smoke` | Browser tests (Playwright) that drive the real page |
| `tests/ui` | UI audit: colours in every theme, layout, accessibility, a random-click run |
| `tests/fixtures` | Sample JSON files used by the tests |

## 3. How the page starts

1. `src/core/safe-storage.js` runs first. If the browser blocks saving, it swaps in a memory store so nothing breaks.
2. Core scripts load (`base`, `util`, `state`, `constants`, `theme`, `engine`, ...). Order matters: a file may only use things defined above it in `index.html`.
3. Component scripts load. Each ends with `customElements.define(...)`, so the element in `index.html` wakes up as soon as its script runs.
4. `src/app.js` runs last. It creates the first tab, wires global shortcuts, drag and drop, paste, share links and session restore.

## 4. The three building blocks

**State** (`core/app-state-and-events.js`). `Structra.state` holds the app state (active view, current path, open panels, the open data). Change it with `Structra.setState('key', value)`. That emits `state:<key>` with `{ key, value, old }`.

**Events** (`Structra.events.on / emit`). Components talk to each other through named events, such as `settings:open` or `drawer:show`. A component never calls another component's methods directly. Each file's header lists the events it listens to and emits.

**Components** (`core/component-base.js`). Extend `StructraComponent`:

```js
class StructraThing extends StructraComponent {
  init()   { this.on('state:currentPath', () => this._update()); }  // subscribe once
  render() { this.innerHTML = `<div>...</div>`; }                   // build the markup once
}
customElements.define('structra-thing', StructraThing);
```

`this.on(...)` removes the listener when the element is removed. `this.$` and `this.$$` are shortcuts for `querySelector` and `querySelectorAll` inside the element. There is no Shadow DOM, so global CSS applies.

Dialogs extend `StructraDialog` (`core/dialog-base.js`), which provides the box, Escape, backdrop click and focus handling. See the example in that file's header.

## 5. Recipes

**Add a dialog**
1. Create `src/components/structra-thing.js` extending `StructraDialog`.
2. Add `<structra-thing></structra-thing>` to the overlays block in `index.html` and a `<script>` tag before `src/app.js`.
3. Open it by emitting your own event, for example `Structra.events.emit('thing:open')`.

**Add a button to the left rail**
1. Add a `<button class="rail-btn" data-rail="name">` in `components/structra-rail.js`, with an icon and a `rail-label`.
2. Add a `case 'name':` in the click handler that emits an event or sets state.
3. If it should light up while its panel is open, add it to the `lit` map in `sync()`.

**Add a view**
1. Add its name to `Structra.constants.VIEWS`.
2. Create the component and add it to `structra-view-switcher.js`.
3. Add a tab in `structra-canvas-header.js` and, if wanted, a shortcut in `app-constants.js`.

**Add a theme**
Built-in themes live in `core/theme-engine.js`. A theme is 17 base colours; the rest are derived with `color-mix()`. Users can also import and export themes as JSON.

**Add a keyboard shortcut**
Add the key and action name to the shortcut map in `core/app-constants.js`, then handle the action in `components/structra-command.js` (the same place the command palette runs its commands).

**Show a message**
`Structra.toast('Plain words', 'warning')`. Types are `info` (default), `warning` and `error`. Write for people who do not know the code: say what happened and what to do next.

## 6. Code boxes

Every box that shows or edits code (the SQL editor, the JSON editor, the two Compare panes, generated code, schemas, snippets) comes from one file, `src/core/code-view.js` (`Structra.codeView`). It is the only file that knows which editor library is behind them (CodeMirror 6, in `src/libs/codemirror6`), so changing the library later means changing that file.

```js
// An editable box (SQL, JSON, ...). The host element needs a definite height; only the visible lines are drawn.
const box = await Structra.codeView.create(host, { mode: 'json', value: text, label: 'JSON text' });
box.getValue(); box.setValue(text); box.onChange(fn); box.markError(offset); box.gotoOffset(offset, { select: true });
host.codeView === box;                        // a box can be found from its host element (the tests use this)

// Colour text that is already on the page, with no editor (generated code, a schema, a snippet)
Structra.codeView.colorize(preElement, text, 'typescript');
```

Languages: `sql json javascript typescript xml yaml toml python csharp java go rust powerfx powerautomate text`. Each language is a separate file that loads the first time it is used. Power Fx and Power Automate expressions are small stream parsers written in `code-view.js`, because CodeMirror has neither.

**How the library gets into the app.** CodeMirror 6 is published as many small ES modules that import each other by package name, which a browser cannot load by itself. `tools/editor/entry.js` lists the pieces the app uses, and `npm run build:editor` joins them with esbuild into `src/libs/codemirror6/` (a core file, one file per language, and `NOTICE.txt` with every package and licence inside). That folder is committed, so running, testing and deploying the app needs no build. Only change `entry.js` and run the build when you upgrade the library or need another piece of it.

Rules that keep large documents fast (measured with `node tests/perf/codeview.js <file>` and `node tests/perf/editor-large.js <file>`):
- **Give the box a fixed height.** `growsWithText` draws every line, so use it only for a short query box. A box without it draws only the visible lines, whatever the text length.
- **JSON is coloured by our own line-by-line plugin**, for the lines in view only. A JSON string never crosses a line break, so no earlier line is needed to colour a later one and nothing has to be parsed first.
- **Folding is left off above 1.5 MB**, because finding where each `{` ends would scan most of the document. Other languages fold from their syntax tree.
- **Do not read the whole text on every keystroke** (`getValue()` copies it). The Editor view checks the text after a pause that grows with its size.
- **Replacing the text keeps undo only for small text.** `replaceAll` starts a fresh history for large text, because remembering the old text would cost as much memory again.
- **One very long line cannot be shown smoothly.** Minify refuses to make a line over 2 MB.

Colours are in `src/css/codeview.css`: the text classes are `tok-*` and use the theme's syntax colours (the same ones the Tree uses). The library writes its own light styles with a class chosen at run time, so each rule starts with `.cv .cm-editor` to be stronger. If you add a colour, check it in the dark themes (`npm run ui:themes`).

Measured on this machine (Edge) with the real Editor view: a 37 MB file (49 MB of text, 2.2 million lines) opens in about 1 second and uses about 440 MB; an 88 MB file (134 MB of text, 6.9 million lines) opens in about 3 seconds, a keystroke takes about 7 ms, and the page uses about 650 MB. CodeMirror 5 needed about 1.5 GB and 16 seconds for the same file, which is why the app moved to version 6. The Editor view opens files up to 100 MB (`MAX_EDIT_BYTES` in `structra-editor.js`).

### Comparing documents

`Structra.jsonDiff` (`core/json-diff.js`) says what is different between two values, as a flat list of changes (`added`, `removed`, `changed`, `moved`) with the place on each side. It uses the jsondiffpatch library (`src/libs/jsondiffpatch`, plain ES modules, MIT). Items of a list are matched by an id-like field (`id`, `_id`, `key`, `name`, ...) or by their whole content, so one record added at the start is one change.

Matching list items is slow on long lists, so a list over 1,500 items makes the whole compare use a simple position-by-position mode, and the result carries a note that the Compare dialog shows. The same module makes the JSON Patch. Its unit tests include 150 random documents whose patch must rebuild the right side.

## 7. Writing style for text people see

- Short, plain words. No jargon: say "list" and "value", not "array" and "payload", where you can.
- Say what happened and what to do next.
- No em dashes. Use a full stop, a colon or a comma.
- Buttons and titles use sentence case ("Open a file").

## 8. Naming

A name should say what the thing is or does, so a reader never has to look it up.

- **Files** are named for their job: `data-engine.js`, `json-repair-and-validation.js`. Components keep the `structra-` prefix and match their tag.
- **What a file exposes** has the same name: `Structra.dataEngine`, `Structra.sharedHelpers`, `Structra.dataPaths`.
- **Functions** start with a verb: `escapeHtml`, `loadLibrary`, `copyToClipboard`. Yes/no values start with `is`, `has` or `can`.
- **Variables and parameters** are whole words: `event`, `row`, `button`, `options`, `startTime`. Do not shorten to `e`, `r`, `btn`, `opts`, `t0`. Only `i` and `j` (loop counters) and `x` and `y` (positions) stay short.
- **Constants** are in capitals with the unit in the name: `ROW_HEIGHT`, `MAX_ARRAY`, `STORAGE_KEY`.
- **Not renamed on purpose:** saved storage keys, event names (`'engine:ingested'`) and CSS classes, because saved data and styles depend on them.

## 9. Running and testing

```bash
npm install
npm run lint             # code checks (ESLint)
npm run serve            # http://localhost:8765/index.html
npm test                 # unit tests
npm run test:all         # every browser smoke test
npm run ui:audit         # UI audit across all themes and screen sizes
```

- The first-run welcome dialog covers the page. Tests start as a returning visitor by setting `localStorage['structra.welcomeSeen'] = '1'`.
- Set `PW_CHANNEL=msedge` to use installed Edge instead of downloading Chromium.
- When you change text that a test checks, update the test in the same change.

## 10. Branches and deployment

`dev` then `test` then `prod`. Pushing `prod` deploys GitHub Pages and resets `main` to match it. See the README.
