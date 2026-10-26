/* ============================================================
   STRUCTRA V2 - Status Bar Component
   <structra-status> - bottom status bar

   Wiring (generated from the code below; update it when you add or remove an event):
     Listens to: state:currentPath, state:fileName, tabs:switched, engine:duckdb-starting,
          engine:duckdb-ready, engine:duckdb-failed, state:duplicateKeys
   ============================================================ */

class StructraStatus extends StructraElement {
  static get observedAttributes() { return ['file', 'path']; }

  init() {
    this.on('state:currentPath', () => this._updatePath());
    this.on('state:fileName', () => this._updateFile());
    this.on('tabs:switched', () => this._updateAll());
    this.on('engine:duckdb-starting', () => this._updateDuckStatus('loading'));
    this.on('engine:duckdb-ready', () => this._updateDuckStatus('ready'));
    this.on('engine:duckdb-failed', () => this._updateDuckStatus('failed'));
    this.on('state:duplicateKeys', () => this._updateDupes());
  }

  render() {
    const mode = Structra.log.getMode();
    const duckState = Structra.engine && Structra.engine.duckReady ? 'ready' : 'idle';
    this.innerHTML = `
      <span class="st-ready">
        <span class="st-dot"></span> Ready
      </span>
      <span class="st-file" id="statusFile"></span>
      <span class="st-dupes" id="statusDupes" hidden></span>
      <button type="button" class="st-duck" id="statusDuck" data-state="${duckState}">
        <span class="st-duck-icon" id="duckIcon">${duckState === 'ready' ? Structra.icons.svg('check', { size: 12 }) : Structra.icons.svg('circle', { size: 12 })}</span>
        <span class="st-duck-label" id="duckLabel">${duckState === 'ready' ? 'SQL ready' : 'SQL off'}</span>
      </button>
      <span style="flex:1"></span>
      <span class="st-path" id="statusPath" hidden></span>
      ${this._devTools() ? `<span class="st-sep"></span>
      <button class="st-log-toggle" id="logToggle" title="Developer: console log mode (click to cycle)">
        <span class="st-log-label" id="logLabel">${mode.toUpperCase()}</span>
      </button>` : ''}`;

    this._updateAll();

    this.$('#logToggle')?.addEventListener('click', () => this._cycleLogMode());
    this.$('#statusDuck').addEventListener('click', () => {
      if (this.$('#statusDuck').dataset.state === 'idle') Structra.engine.enableSql();
    });
    this._updateDuckStatus(duckState);
  }

  /** The log switch is for people working on the app: it only shows with ?dev in the address */
  _devTools() { return /[?&]dev\b/.test(location.search); }

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
    el.title = {
      idle: 'The SQL engine answers questions about your data with SQL queries. It is off until needed and takes a few seconds to start. Click to start it now.',
      loading: 'Starting the SQL engine. This takes a few seconds the first time.',
      ready: 'The SQL engine is running. SQL runs on this computer only.',
      failed: 'The SQL engine could not start in this browser. Everything else still works.',
    }[state] || '';
    if (state === 'ready') {
      icon.innerHTML = Structra.icons.svg('check', { size: 12 });
      label.textContent = 'SQL ready';
    } else if (state === 'loading') {
      icon.innerHTML = Structra.icons.svg('refresh-cw', { size: 12 });
      label.textContent = 'Starting SQL…';
    } else if (state === 'idle') {
      icon.innerHTML = Structra.icons.svg('circle', { size: 12 });
      label.textContent = 'SQL off';
    } else if (state === 'failed') {
      icon.innerHTML = Structra.icons.svg('x', { size: 12 });
      label.textContent = 'SQL unavailable';
    }
  }

  _updateAll() {
    this._updatePath();
    this._updateFile();
    this._updateLogLabel();
  }

  _updateDupes() {
    const el = this.$('#statusDupes');
    if (!el) return;
    const d = Structra.state.duplicateKeys || [];
    el.hidden = d.length === 0;
    el.textContent = d.length + ' duplicate key' + (d.length === 1 ? '' : 's');
    el.title = d.slice(0, 20).map((x) => x.path + ' (line ' + x.line + ')').join('\n');
  }

  _updatePath() {
    const el = this.$('#statusPath');
    const path = Structra.state.currentPath;
    if (el) el.textContent = '';        // the path is in the path bar and the Node panel: not a third time here
  }

  _updateFile() {
    const el = this.$('#statusFile');
    if (el) el.textContent = Structra.state.fileName || '';
  }
}

customElements.define('structra-status', StructraStatus);
