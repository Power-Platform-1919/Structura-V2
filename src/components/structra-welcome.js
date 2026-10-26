/* ============================================================
   STRUCTRA V2 - Welcome
   <structra-welcome> - shown once, the first time the app is opened.
   Says what the app is for, lets the person pick light or dark, and offers
   the two ways to start (a sample or their own file). Reopen it from the
   command palette ("Welcome"). Built on StructraDialog.

   Wiring (generated from the code below; update it when you add or remove an event):
     Listens to: welcome:open
     Emits: theme:open
   ============================================================ */

class StructraWelcome extends StructraDialog {
  static SEEN_KEY = 'structra.welcomeSeen';

  init() {
    super.init();
    this.on('welcome:open', () => this.open());
  }

  render() {
    const mode = Structra.themeEngine.mode();
    this.mount({
      title: 'Welcome to Structra',
      size: 'lg',
      body: `
        <p class="wl-lead">Open a JSON, CSV, XML, YAML or TOML file and see what is inside it: its shape, its types, and where the data has gaps.</p>
        <ul class="wl-points">
          <li>
            ${Structra.icons.svg('lock')}
            <div><strong>Your data stays on this device.</strong> Files are read in the browser and never uploaded.</div>
          </li>
          <li>
            ${Structra.icons.svg('search')}
            <div><strong>Understand your data quickly.</strong> The Overview tells you what the file holds and what to look at first. Then browse it as a tree, table, graph or schema, and query, filter and compare.</div>
          </li>
          <li>
            ${Structra.icons.svg('zap')}
            <div><strong>Built in for Power Platform.</strong> Click any value to get the Power Automate expression, Parse JSON schema or Power Fx formula for it, plus paste-ready flow actions such as Select and Filter array.</div>
          </li>
        </ul>
        <div class="wl-grid">
          <section>
            <h3 class="wl-h">Ways to bring data in</h3>
            <ul class="wl-list">
              <li>Drag a file onto the page, or use <strong>Open</strong> on the left</li>
              <li>Press <kbd>Ctrl</kbd> + <kbd>V</kbd> to paste text or a copied value</li>
              <li>Open a shared link, or reopen a recent file</li>
            </ul>
          </section>
          <section>
            <h3 class="wl-h">Five views</h3>
            <ul class="wl-list">
              <li><kbd>Ctrl</kbd> + <kbd>1</kbd> Tree, <kbd>2</kbd> Table, <kbd>3</kbd> Graph</li>
              <li><kbd>Ctrl</kbd> + <kbd>4</kbd> Schema, <kbd>5</kbd> Overview</li>
              <li>The Transform panel reshapes data: pick fields, sort, group and total</li>
            </ul>
          </section>
          <section>
            <h3 class="wl-h">Good to know</h3>
            <ul class="wl-list">
              <li><kbd>Ctrl</kbd> + <kbd>K</kbd> opens the command palette; <kbd>?</kbd> lists every shortcut</li>
              <li>Your tabs are saved and come back when you reopen the page</li>
              <li>Everything works offline once the page has loaded</li>
            </ul>
          </section>
        </div>
        <div class="wl-theme">
          <span id="wlThemeLabel">Appearance <button class="io-link" type="button" data-act="themes">More themes</button></span>
          <div class="seg" role="group" aria-labelledby="wlThemeLabel" id="wlMode">
            ${['light', 'dark', 'system'].map((m) => `<button class="seg-btn ${m === mode ? 'active' : ''}" type="button" data-mode="${m}">${m[0].toUpperCase() + m.slice(1)}</button>`).join('')}
          </div>
        </div>`,
      foot: `
        <button class="btn" type="button" data-act="skip">Skip</button>
        <button class="btn" type="button" data-act="file">Open a file</button>
        <button class="btn btn-primary" type="button" data-act="sample" autofocus>Open the sample</button>`,
    });

    this.root.addEventListener('click', (event) => {
      const mode = event.target.closest('[data-mode]');
      if (mode) {
        Structra.themeEngine.setMode(mode.dataset.mode);
        this.queryAll('#wlMode .seg-btn').forEach((button) => button.classList.toggle('active', button === mode));
        return;
      }
      const action = event.target.closest('[data-act]');
      if (!action) return;
      this.close();
      if (action.dataset.act === 'themes') Structra.events.emit('theme:open');
      else if (action.dataset.act === 'sample') this._startSample();
      else if (action.dataset.act === 'file') this._openFilePicker();
    });

    if (!StructraWelcome._seen()) setTimeout(() => this._maybeShowFirstRun(), 600);
  }

  onClose() { StructraWelcome._markSeen(); }

  /** Only greet someone who is really starting fresh: no shared link, no restored session */
  _maybeShowFirstRun() {
    if (/^#share=/.test(location.hash) || Structra.state.jsonData) return;
    this.open();
  }

  _startSample() {
    const panel = document.querySelector('structra-input-panel');
    if (panel && panel._loadSample) panel._loadSample();
  }

  _openFilePicker() {
    const input = document.querySelector('#canvasEmpty input[type=file]');
    if (input) input.click();
  }

  static _seen() {
    try { return localStorage.getItem(StructraWelcome.SEEN_KEY) === '1'; } catch { return false; }
  }

  static _markSeen() {
    try { localStorage.setItem(StructraWelcome.SEEN_KEY, '1'); } catch { /* private window: it may greet again */ }
  }
}

customElements.define('structra-welcome', StructraWelcome);
