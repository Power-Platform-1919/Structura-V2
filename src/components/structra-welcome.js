/* ============================================================
   STRUCTRA V2 — Welcome
   <structra-welcome> — shown once, the first time the app is opened.
   Says what the app is for, lets the person pick light or dark, and offers
   the two ways to start (a sample or their own file). Reopen it from the
   command palette ("Welcome"). Built on StructraOverlay.
   ============================================================ */

class StructraWelcome extends StructraOverlay {
  static SEEN_KEY = 'structra.welcomeSeen';

  init() {
    super.init();
    this.on('welcome:open', () => this.open());
  }

  render() {
    const mode = Structra.theme.mode();
    this.mount({
      title: 'Welcome to Structra',
      size: 'md',
      body: `
        <p class="wl-lead">Open a JSON, CSV, XML, YAML or TOML file and see what is inside it: its shape, its types, and where the data has gaps.</p>
        <ul class="wl-points">
          <li>
            ${Structra.icons.svg('lock')}
            <div><strong>Your data stays on this device.</strong> Files are read in the browser and never uploaded.</div>
          </li>
          <li>
            ${Structra.icons.svg('search')}
            <div><strong>Understand a payload quickly.</strong> Browse it as a tree, table, graph or schema, then query, filter and compare.</div>
          </li>
          <li>
            ${Structra.icons.svg('zap')}
            <div><strong>Built in for Power Platform.</strong> Click any value to get the Power Automate expression, Parse JSON schema or Power Fx formula for it.</div>
          </li>
        </ul>
        <div class="wl-theme">
          <span id="wlThemeLabel">Appearance</span>
          <div class="seg" role="group" aria-labelledby="wlThemeLabel" id="wlMode">
            ${['light', 'dark', 'system'].map((m) => `<button class="seg-btn ${m === mode ? 'active' : ''}" type="button" data-mode="${m}">${m[0].toUpperCase() + m.slice(1)}</button>`).join('')}
          </div>
        </div>`,
      foot: `
        <button class="btn" type="button" data-act="skip">Skip</button>
        <button class="btn" type="button" data-act="file">Open a file</button>
        <button class="btn btn-primary" type="button" data-act="sample" autofocus>Try a sample</button>`,
    });

    this.root.addEventListener('click', (e) => {
      const mode = e.target.closest('[data-mode]');
      if (mode) {
        Structra.theme.setMode(mode.dataset.mode);
        this.$$('#wlMode .seg-btn').forEach((b) => b.classList.toggle('active', b === mode));
        return;
      }
      const act = e.target.closest('[data-act]');
      if (!act) return;
      this.close();
      if (act.dataset.act === 'sample') this._startSample();
      else if (act.dataset.act === 'file') this._openFilePicker();
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
