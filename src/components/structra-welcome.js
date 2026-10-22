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
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            <div><strong>Your data stays on this device.</strong> Files are read in the browser and never uploaded.</div>
          </li>
          <li>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <div><strong>Understand a payload quickly.</strong> Browse it as a tree, table, graph or schema, then query, filter and compare.</div>
          </li>
          <li>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
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
