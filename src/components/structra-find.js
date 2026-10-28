/* ============================================================
   STRUCTRA V2 - Find & Replace Component
   <structra-find> - Find values across the active dataset and
   optionally replace them.  Queries go through DuckDB when
   available, falls back to in-memory engine search.
   Works across all views (tree, table, graph).

   Wiring (generated from the code below; update it when you add or remove an event):
     Listens to: state:findBarOpen, overlay:close, find:toggle-replace, find:open,
          tree:search-key, find:prefill, engine:data-modified
     Emits: state:jsonData, tree:node-selected, tree:navigate-path
     Sets state: filterBarOpen, findBarOpen
   ============================================================ */

class StructraFind extends StructraComponent {
  static get observedAttributes() { return ['open']; }

  init() {
    this._idx = -1;
    this._debounceTimer = null;
    this._replaceOpen = false;
    this._mode = 'text'; // text | fuzzy | regex

    this.on('state:findBarOpen', (change) => {
      Structra.log.info('Find', 'findBar ' + (change.value ? 'opened' : 'closed'));
      this.props.open = change.value ? 'true' : '';
      if (change.value && Structra.state.filterBarOpen) Structra.setState('filterBarOpen', false);
      this._toggle(change.value);
    });
    this.on('overlay:close', () => this._close());
    this.on('find:toggle-replace', () => this._toggleReplace());
    // Open the bar in a mode, optionally with text typed in (Fuzzy search and SQL commands use this)
    this.on('find:open', ({ mode, text, run } = {}) => {
      Structra.setState('findBarOpen', true);
      const input = this.queryOne('#findInput');
      if (!input) return;
      this._setMode(mode || 'text');
      if (text !== undefined) input.value = text;
      input.focus();
      input.select();
      if (text && run !== false) this._doFind(text);
    });
    // Double-click a key in the Tree, or choose a key in the Overview: find where that field appears
    this.on('tree:search-key', (key) => {
      Structra.setState('findBarOpen', true);
      const input = this.queryOne('#findInput');
      if (!input) return;
      this._setMode('text');
      input.value = 'key:' + key;
      input.focus();
      this._doFind(input.value);
    });
    // Open the bar with a search already typed in (used by "Find this value" in the Node panel)
    this.on('find:prefill', (text) => {
      Structra.setState('findBarOpen', true);
      const input = this.queryOne('#findInput');
      if (!input) return;
      this._setMode('text');
      input.value = text;
      input.focus();
      input.select();
      this._doFind(text);
    });
    // Re-run on data changes
    this.on('engine:data-modified', () => {
      const query = this._getInput();
      if (query) this._doFind(query);
    });
  }

  render() {
    this.innerHTML = `
      <div class="find-bar" id="findBar">
        <div class="find-row">
          <div class="find-modes">
            <button class="fb-mode active" data-mode="text" title="Find the exact text">Text</button>
            <button class="fb-mode" data-mode="fuzzy" title="Find close matches, so a small typo still finds the value">Fuzzy</button>
            <button class="fb-mode" data-mode="regex" title="Find by pattern, for example \d{3}-\d{4}">Pattern</button>
          </div>
          <input type="text" class="find-input" id="findInput" aria-label="Find"
            placeholder="Find… (text, /regex/, key:name, $.path, SELECT…)" autocomplete="off">
          <span class="fb-count" id="findCount" role="status" aria-live="polite">0/0</span>
          <button class="fb-btn" data-action="prev" title="Previous (Shift+Enter)">
            ${Structra.icons.svg('chevron-up')}
          </button>
          <button class="fb-btn" data-action="next" title="Next (Enter)">
            ${Structra.icons.svg('chevron-down')}
          </button>
          <button class="fb-btn" data-action="toggleReplace" title="Toggle Replace (Ctrl+H)">
            ${Structra.icons.svg('pencil')}
          </button>
          <button class="fb-btn" data-action="close-find" title="Close (Esc)" aria-label="Close find">
            ${Structra.icons.svg('x')}
          </button>
        </div>
        <div class="replace-row" id="replaceRow" style="display:none">
          <input type="text" class="find-input" id="replaceInput" aria-label="Replace with"
            placeholder="Replace with…" autocomplete="off">
          <button class="fb-btn fb-replace-btn" data-action="replaceOne" title="Replace the next match">Replace</button>
          <button class="fb-btn fb-replace-btn" data-action="replaceAll" title="Replace all matches">Replace all</button>
        </div>
      </div>`;

    // Find input events
    const findInput = this.queryOne('#findInput');
    findInput.addEventListener('input', () => {
      clearTimeout(this._debounceTimer);
      const query = findInput.value.trim();
      if (!query) { this._clearSearch(); return; }
      this._debounceTimer = setTimeout(() => this._doFind(query), 250);
    });
    findInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        this._stepFromInput(event.shiftKey);
      }
      if (event.key === 'Escape') this._close();
    });

    // Replace input events
    this.queryOne('#replaceInput').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); this._replaceOne(); }
      if (event.key === 'Escape') this._close();
    });

    // Button clicks
    this.addEventListener('click', (event) => {
      const modeButton = event.target.closest('[data-mode]');
      if (modeButton) {
        this._setMode(modeButton.dataset.mode);
        const query = this._getInput();
        if (query) this._doFind(query);
        return;
      }
      const button = event.target.closest('[data-action]');
      if (!button) return;
      const action = button.dataset.action;
      if (action === 'prev') this._goToPreviousMatch();
      else if (action === 'next') this._goToNextMatch();
      else if (action === 'close-find') Structra.setState('findBarOpen', false);
      else if (action === 'toggleReplace') this._toggleReplace();
      else if (action === 'replaceOne') this._replaceOne();
      else if (action === 'replaceAll') this._replaceAll();
    });
  }

  /**
   * Enter and Shift+Enter: search first when the text changed since the last search, then go to the next (or previous) match.
   * Before, Enter searched again every time and never moved on, although the button says "Next (Enter)".
   */
  async _stepFromInput(backwards) {
    clearTimeout(this._debounceTimer);
    const query = this._getInput();
    // A search that failed (a broken pattern) leaves the old result active: do not step through that
    if (query && query !== this._lastQuery && await this._doFind(query) === false) return;
    if (backwards) this._goToPreviousMatch(); else this._goToNextMatch();
  }

  _getInput() { const element = this.queryOne('#findInput'); return element ? element.value.trim() : ''; }

  _setMode(mode) {
    this._mode = mode;
    this.querySelectorAll('.fb-mode').forEach(element => {
      element.classList.toggle('active', element.dataset.mode === mode);
      element.setAttribute('aria-pressed', element.dataset.mode === mode ? 'true' : 'false');
    });
    const input = this.queryOne('#findInput');
    if (input) {
      const placeholders = {
        text: 'Find… (text, key:name, $.path, SELECT…)',
        fuzzy: 'Fuzzy search… (approximate match)',
        regex: 'Regex search… (e.g. \\d{3}-\\d{4})'
      };
      input.placeholder = placeholders[mode] || placeholders.text;
    }
  }

  _toggle(show) {
    const bar = this.queryOne('#findBar');
    if (!bar) return;
    bar.classList.toggle('show', show);
    // The bar floats over the top right of the canvas: leave room for it so it never covers the first lines
    const canvas = document.getElementById('canvas');
    if (canvas) {
      canvas.classList.toggle('find-open', !!show);
      canvas.style.setProperty('--find-h', show ? (bar.offsetHeight + 8) + 'px' : '0px');
    }
    if (show) this.queryOne('#findInput').focus();
  }

  _toggleReplace() {
    this._replaceOpen = !this._replaceOpen;
    const row = this.queryOne('#replaceRow');
    if (row) row.style.display = this._replaceOpen ? 'flex' : 'none';
    this._toggle(true);
    // Type the search first: the cursor goes to Find while it is empty, and to Replace once there is something to replace
    if (this._replaceOpen) (this.queryOne('#findInput').value ? this.queryOne('#replaceInput') : this.queryOne('#findInput')).focus();
  }

  _close() {
    Structra.setState('findBarOpen', false);
    this._clearSearch();
    this._replaceOpen = false;
    const row = this.queryOne('#replaceRow');
    if (row) row.style.display = 'none';
  }

  /* ======== QUERY DISPATCH ======== */

  async _doFind(query) {
    this._lastQuery = query;
    // SQL always takes priority regardless of mode
    if (/^\s*(SELECT|WITH)\s/i.test(query)) return this._doSqlFind(query);

    if (this._mode === 'fuzzy') return this._doFuzzyFind(query);
    if (this._mode === 'regex') return this._doRegexFind(query);
    return this._doDbFind(query);
  }

  /* --- Fuzzy search (engine.fuzzySearch) --- */
  async _doFuzzyFind(query) {
    try {
      const results = await Structra.dataEngine.fuzzySearch(query);
      const total = (results && results.total) || 0;
      this._idx = -1;
      this.queryOne('#findCount').textContent = total > 0 ? `${total} found` : '0 found';
      return true;
    } catch (error) {
      Structra.log.warn('Find', 'Fuzzy search failed', error.message);
      this.queryOne('#findCount').textContent = 'Error';
      return false;
    }
  }

  /* --- Regex search (engine.regexSearch) --- */
  async _doRegexFind(query) {
    try {
      const results = await Structra.dataEngine.regexSearch(query);
      const total = (results && results.total) || 0;
      this._idx = -1;
      this.queryOne('#findCount').textContent = total > 0 ? `${total} found` : '0 found';
      return true;
    } catch (error) {
      Structra.log.warn('Find', 'Regex search failed', error.message);
      // A pattern that was stopped for taking too long is not an invalid pattern: say what happened and what to do
      if (error.message === Structra.sharedHelpers.RISKY_REGEX_MESSAGE) {
        this.queryOne('#findCount').textContent = 'Pattern too slow';
        Structra.toast(error.message);
      } else {
        this.queryOne('#findCount').textContent = 'Not a valid pattern';
      }
      return false;
    }
  }

  /* --- DuckDB-backed find --- */
  async _doDbFind(query) {
    try {
      const result = await Structra.dataEngine.findInDb(query);
      this._idx = -1;   // a new search starts before the first match, so Enter goes to the first one (fuzzy and regex already did this)
      if (result && result.total > 0) {
        this.queryOne('#findCount').textContent = result.total + ' found';
      } else {
        this.queryOne('#findCount').textContent = '0 found';
      }
      return true;
    } catch (error) {
      Structra.log.warn('Find', 'Find failed', error.message);
      this.queryOne('#findCount').textContent = 'Error';
      return false;
    }
  }

  /* --- SQL query --- */
  async _doSqlFind(query) {
    // The SQL engine starts on first use (runSql does that), so say so while it loads
    if (!Structra.dataEngine.duckReady) this.queryOne('#findCount').textContent = 'Starting SQL…';
    try {
      const result = await Structra.dataEngine.runSql(query);
      if (result.error) {
        this.queryOne('#findCount').textContent = 'SQL Error';
        Structra.toast(result.error, 'error');
      } else {
        this.queryOne('#findCount').textContent = result.total + ' rows';
      }
      return !result.error;
    } catch (error) {
      Structra.log.warn('Find', 'SQL query failed', error.message);
      this.queryOne('#findCount').textContent = 'SQL Error';
      return false;
    }
  }

  /* ======== REPLACE ======== */

  /** Replace in the open document, keeping the original so Ctrl+Z can bring it back */
  _replace(findText, replaceText, all) {
    const dataset = Structra.dataEngine.getActive();
    const tabId = Structra.tabs.activeId;
    const kept = dataset ? Structra.undoStack.push(dataset.raw, 'Before replace', tabId) : false;
    const result = Structra.dataEngine.replaceInData(findText, replaceText, all);
    if (result.replaced > 0 && kept) Structra.undoStack.push(dataset.raw, `Replace "${findText}" with "${replaceText}"`, tabId);
    return { ...result, undoable: kept };
  }

  _skippedNote(result) {
    return result.skipped ? ` ${result.skipped} match${result.skipped === 1 ? '' : 'es'} inside numbers or true/false ${result.skipped === 1 ? 'was' : 'were'} left alone.` : '';
  }

  _replaceOne() {
    const findText = this._getInput();
    const replaceText = (this.queryOne('#replaceInput') || {}).value || '';
    if (!findText) return;
    const result = this._replace(findText, replaceText, false);
    if (result.replaced > 0) {
      Structra.toast('Replaced 1 text value.' + (result.undoable ? ' Ctrl+Z undoes it.' : '') + this._skippedNote(result));
      this._refreshAfterReplace(findText);
    } else {
      Structra.toast('No text to replace.' + this._skippedNote(result), 'warning');
    }
  }

  _replaceAll() {
    const findText = this._getInput();
    const replaceText = (this.queryOne('#replaceInput') || {}).value || '';
    if (!findText) return;
    const result = this._replace(findText, replaceText, true);
    if (!result.replaced) { Structra.toast('No text to replace.' + this._skippedNote(result), 'warning'); return; }
    Structra.toast(`Replaced ${result.replaced} text value${result.replaced === 1 ? '' : 's'}.` + (result.undoable ? ' Ctrl+Z undoes it.' : '') + this._skippedNote(result));
    this._refreshAfterReplace(findText);
  }

  _refreshAfterReplace(query) {
    // Re-run find to update counts
    this._doFind(query);
    // Force views to re-render since data changed in-place
    Structra.events.emit('state:jsonData', { value: Structra.state.jsonData });
    // The Node panel shows the selected value: read it again
    if (Structra.state.currentPath) Structra.events.emit('tree:node-selected', Structra.state.currentPath);
  }

  /* ======== NAVIGATION ======== */

  _goToNextMatch() {
    const query = Structra.dataEngine.getQuery();
    if (!query || !query.matchedPaths || query.matchedPaths.length === 0) return;
    this._idx = (this._idx + 1) % query.total;
    this._updateCount();
    // Navigate to path in tree view
    const path = query.matchedPaths[this._idx];
    if (path) Structra.events.emit('tree:navigate-path', path);
  }

  _goToPreviousMatch() {
    const query = Structra.dataEngine.getQuery();
    if (!query || !query.matchedPaths || query.matchedPaths.length === 0) return;
    this._idx = (this._idx - 1 + query.total) % query.total;
    this._updateCount();
    const path = query.matchedPaths[this._idx];
    if (path) Structra.events.emit('tree:navigate-path', path);
  }

  _updateCount() {
    const element = this.queryOne('#findCount');
    if (!element) return;
    const query = Structra.dataEngine.getQuery();
    if (query && query.total > 0) {
      element.textContent = `${this._idx + 1}/${query.total}`;
    }
  }

  /* ======== CLEANUP ======== */

  _clearSearch() {
    clearTimeout(this._debounceTimer);
    this._idx = -1;
    this._lastQuery = null;
    const countElement = this.queryOne('#findCount');
    if (countElement) countElement.textContent = '0/0';
    const input = this.queryOne('#findInput');
    if (input) input.value = '';
    Structra.dataEngine.clearQuery();
  }
}

customElements.define('structra-find', StructraFind);
