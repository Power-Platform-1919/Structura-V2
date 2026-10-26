# Structura V2 developer guide

Everything you need to understand, change or rebuild the app. The files in `docs/` other than this one are old design notes and are not kept up to date. `memory-bank.md` in the repo root has more detail on behaviour.

## 1. The big picture

- A static web app. No build step, no framework, no modules. `index.html` loads plain `<script>` tags in a fixed order.
- Everything hangs off one global object, `window.Structra`. Core files add pieces to it (`Structra.engine`, `Structra.theme`, ...). Components are custom elements (`<structra-tree>`) that read and write it.
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

**State** (`core/state.js`). `Structra.state` holds the app state (active view, current path, open panels, the open data). Change it with `Structra.set('key', value)`. That emits `state:<key>` with `{ key, value, old }`.

**Events** (`Structra.events.on / emit`). Components talk to each other through named events, such as `settings:open` or `drawer:show`. A component never calls another component's methods directly. Each file's header lists the events it listens to and emits.

**Components** (`core/base.js`). Extend `StructraElement`:

```js
class StructraThing extends StructraElement {
  init()   { this.on('state:currentPath', () => this._update()); }  // subscribe once
  render() { this.innerHTML = `<div>...</div>`; }                   // build the markup once
}
customElements.define('structra-thing', StructraThing);
```

`this.on(...)` removes the listener when the element is removed. `this.$` and `this.$$` are shortcuts for `querySelector` and `querySelectorAll` inside the element. There is no Shadow DOM, so global CSS applies.

Dialogs extend `StructraOverlay` (`core/overlay.js`), which provides the box, Escape, backdrop click and focus handling. See the example in that file's header.

## 5. Recipes

**Add a dialog**
1. Create `src/components/structra-thing.js` extending `StructraOverlay`.
2. Add `<structra-thing></structra-thing>` to the overlays block in `index.html` and a `<script>` tag before `src/app.js`.
3. Open it by emitting your own event, for example `Structra.events.emit('thing:open')`.

**Add a button to the left rail**
1. Add a `<button class="rail-btn" data-rail="name">` in `components/structra-rail.js`, with an icon and a `rail-label`.
2. Add a `case 'name':` in the click handler that emits an event or sets state.
3. If it should light up while its panel is open, add it to the `lit` map in `sync()`.

**Add a view**
1. Add its name to `Structra.constants.VIEWS`.
2. Create the component and add it to `structra-view-switcher.js`.
3. Add a tab in `structra-canvas-header.js` and, if wanted, a shortcut in `constants.js`.

**Add a theme**
Built-in themes live in `core/theme.js`. A theme is 17 base colours; the rest are derived with `color-mix()`. Users can also import and export themes as JSON.

**Add a keyboard shortcut**
Add the key and action name to the shortcut map in `core/constants.js`, then handle the action in `components/structra-command.js` (the same place the command palette runs its commands).

**Show a message**
`Structra.toast('Plain words', 'warning')`. Types are `info` (default), `warning` and `error`. Write for people who do not know the code: say what happened and what to do next.

## 6. Writing style for text people see

- Short, plain words. No jargon: say "list" and "value", not "array" and "payload", where you can.
- Say what happened and what to do next.
- No em dashes. Use a full stop, a colon or a comma.
- Buttons and titles use sentence case ("Open a file").

## 7. Running and testing

```bash
npm install
npm run serve            # http://localhost:8765/index.html
npm test                 # unit tests
npm run test:all         # every browser smoke test
npm run ui:audit         # UI audit across all themes and screen sizes
```

- The first-run welcome dialog covers the page. Tests start as a returning visitor by setting `localStorage['structra.welcomeSeen'] = '1'`.
- Set `PW_CHANNEL=msedge` to use installed Edge instead of downloading Chromium.
- When you change text that a test checks, update the test in the same change.

## 8. Branches and deployment

`dev` then `test` then `prod`. Pushing `prod` deploys GitHub Pages and resets `main` to match it. See the README.
