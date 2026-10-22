/* ============================================================
   STRUCTRA V2 — Status Bar Component
   <structra-status> — bottom status bar
   ============================================================ */

class StructraStatus extends StructraElement {
  static get observedAttributes() { return ['file', 'path']; }

  init() {
    this.on('state:currentPath', () => this._updatePath());
    this.on('state:fileName', () => this._updateFile());
    this.on('tabs:switched', () => this._updateAll());
    this.on('engine:duckdb-ready', () => this._updateDuckStatus('ready'));
  }

  render() {
    const mode = Structra.log.getMode();
    const duckState = Structra.engine && Structra.engine.duckReady ? 'ready' : 'loading';
    this.innerHTML = `
      <span class="st-ready">
        <span class="st-dot"></span> Ready
      </span>
      <span class="st-file" id="statusFile"></span>
      <span class="st-duck" id="statusDuck" data-state="${duckState}">
        <span class="st-duck-icon" id="duckIcon">${duckState === 'ready' ? '✓' : '⟳'}</span>
        <span class="st-duck-label" id="duckLabel">${duckState === 'ready' ? 'SQL' : 'DuckDB...'}</span>
      </span>
      <span style="flex:1"></span>
      <span class="st-path" id="statusPath"></span>
      <span class="st-sep"></span>
      <button class="st-log-toggle" id="logToggle" title="Console log mode (click to cycle)">
        <span class="st-log-icon">⚙</span>
        <span class="st-log-label" id="logLabel">${mode.toUpperCase()}</span>
      </button>`;

    this._updateAll();

    this.$('#logToggle').addEventListener('click', () => this._cycleLogMode());
  }

  _cycleLogMode() {
    const modes = ['off', 'normal', 'dev'];
    const current = Structra.log.getMode();
    const idx = modes.indexOf(current);
    const next = modes[(idx + 1) % modes.length];
    Structra.log.setMode(next);
    this._updateLogLabel();
  }

  _updateLogLabel() {
    const label = this.$('#logLabel');
    const btn = this.$('#logToggle');
    if (!label || !btn) return;
    const mode = Structra.log.getMode();
    label.textContent = mode.toUpperCase();
    btn.dataset.mode = mode;
  }

  _updateDuckStatus(state) {
    const el = this.$('#statusDuck');
    const icon = this.$('#duckIcon');
    const label = this.$('#duckLabel');
    if (!el) return;
    el.dataset.state = state;
    if (state === 'ready') {
      icon.textContent = '✓';
      label.textContent = 'SQL';
    } else if (state === 'failed') {
      icon.textContent = '✗';
      label.textContent = 'No SQL';
    }
  }

  _updateAll() {
    this._updatePath();
    this._updateFile();
    this._updateLogLabel();
  }

  _updatePath() {
    const el = this.$('#statusPath');
    if (el) el.textContent = Structra.state.currentPath || '$';
  }

  _updateFile() {
    const el = this.$('#statusFile');
    if (el) el.textContent = Structra.state.fileName || '';
  }
}

customElements.define('structra-status', StructraStatus);
