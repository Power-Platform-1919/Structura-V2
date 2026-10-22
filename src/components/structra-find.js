/* ============================================================
   STRUCTRA V2 — Find & Replace Component
   <structra-find> — Find values across the active dataset and
   optionally replace them.  Queries go through DuckDB when
   available, falls back to in-memory engine search.
   Works across all views (tree, table, graph).
   ============================================================ */

class StructraFind extends StructraElement {
  static get observedAttributes() { return ['open']; }

  init() {
    this._idx = -1;
    this._debounceTimer = null;
    this._replaceOpen = false;
    this._mode = 'text'; // text | fuzzy | regex

    this.on('state:findBarOpen', (d) => {
      Structra.log.info('Find', 'findBar ' + (d.value ? 'opened' : 'closed'));
      this.props.open = d.value ? 'true' : '';
      this._toggle(d.value);
    });
    this.on('overlay:close', () => this._close());
    this.on('find:toggle-replace', () => this._toggleReplace());
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
            <button class="fb-mode active" data-mode="text" title="Text search">Aa</button>
            <button class="fb-mode" data-mode="fuzzy" title="Fuzzy search (DuckDB)">~</button>
            <button class="fb-mode" data-mode="regex" title="Regex search">.*</button>
          </div>
          <input type="text" class="find-input" id="findInput"
            placeholder="Find… (text, /regex/, key:name, $.path, SELECT…)" autocomplete="off">
          <span class="fb-count" id="findCount">0/0</span>
          <button class="fb-btn" data-action="prev" title="Previous (Shift+Enter)">
            ${Structra.icons.svg('chevron-up')}
          </button>
          <button class="fb-btn" data-action="next" title="Next (Enter)">
            ${Structra.icons.svg('chevron-down')}
          </button>
          <button class="fb-btn" data-action="toggleReplace" title="Toggle Replace (Ctrl+H)">
            ${Structra.icons.svg('pencil')}
          </button>
          <button class="fb-btn" data-action="clear" title="Clear">
            ${Structra.icons.svg('x')}
          </button>
        </div>
        <div class="replace-row" id="replaceRow" style="display:none">
          <input type="text" class="find-input" id="replaceInput"
            placeholder="Replace with…" autocomplete="off">
          <button class="fb-btn fb-replace-btn" data-action="replaceOne" title="Replace">Replace</button>
          <button class="fb-btn fb-replace-btn" data-action="replaceAll" title="Replace All">All</button>
        </div>
      </div>`;

    // Find input events
    const findInput = this.$('#findInput');
    findInput.addEventListener('input', () => {
      clearTimeout(this._debounceTimer);
      const query = findInput.value.trim();
      if (!query) { this._clearSearch(); return; }
      this._debounceTimer = setTimeout(() => this._doFind(query), 250);
    });
    findInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) this._prev();
        else {
          clearTimeout(this._debounceTimer);
          const query = findInput.value.trim();
          if (query) this._doFind(query);
          else this._next();
        }
      }
      if (e.key === 'Escape') this._close();
    });

    // Replace input events
    this.$('#replaceInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this._replaceOne(); }
      if (e.key === 'Escape') this._close();
    });

    // Button clicks
    this.addEventListener('click', (e) => {
      const modeBtn = e.target.closest('[data-mode]');
      if (modeBtn) {
        this._setMode(modeBtn.dataset.mode);
        const query = this._getInput();
        if (query) this._doFind(query);
        return;
      }
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const a = btn.dataset.action;
      if (a === 'prev') this._prev();
      else if (a === 'next') this._next();
      else if (a === 'clear') this._clearSearch();
      else if (a === 'toggleReplace') this._toggleReplace();
      else if (a === 'replaceOne') this._replaceOne();
      else if (a === 'replaceAll') this._replaceAll();
    });
  }

  _getInput() { const el = this.$('#findInput'); return el ? el.value.trim() : ''; }

  _setMode(mode) {
    this._mode = mode;
    this.querySelectorAll('.fb-mode').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
    const input = this.$('#findInput');
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
    const bar = this.$('#findBar');
    if (!bar) return;
    bar.classList.toggle('show', show);
    if (show) this.$('#findInput').focus();
  }

  _toggleReplace() {
    this._replaceOpen = !this._replaceOpen;
    const row = this.$('#replaceRow');
    if (row) row.style.display = this._replaceOpen ? 'flex' : 'none';
    // Type the search first: the cursor goes to Find while it is empty, and to Replace once there is something to replace
    if (this._replaceOpen) (this.$('#findInput').value ? this.$('#replaceInput') : this.$('#findInput')).focus();
  }

  _close() {
    Structra.set('findBarOpen', false);
    this._clearSearch();
    this._replaceOpen = false;
    const row = this.$('#replaceRow');
    if (row) row.style.display = 'none';
  }

  /* ======== QUERY DISPATCH ======== */

  async _doFind(query) {
    // SQL always takes priority regardless of mode
    if (/^\s*(SELECT|WITH)\s/i.test(query)) {
      await this._doSqlFind(query);
      return;
    }

    if (this._mode === 'fuzzy') {
      await this._doFuzzyFind(query);
    } else if (this._mode === 'regex') {
      await this._doRegexFind(query);
    } else {
      await this._doDbFind(query);
    }
  }

  /* --- Fuzzy search (engine.fuzzySearch) --- */
  async _doFuzzyFind(query) {
    try {
      const results = await Structra.engine.fuzzySearch(query);
      const total = Array.isArray(results) ? results.length : (results && results.total) || 0;
      this._idx = -1;
      this.$('#findCount').textContent = total > 0 ? `${total} fuzzy` : '0 found';
      if (total > 0) {
        Structra.events.emit('find:results', { results, mode: 'fuzzy', query });
      }
    } catch (err) {
      Structra.log.warn('Find', 'Fuzzy search failed', err.message);
      this.$('#findCount').textContent = 'Error';
    }
  }

  /* --- Regex search (engine.regexSearch) --- */
  async _doRegexFind(query) {
    try {
      const results = await Structra.engine.regexSearch(query);
      const total = Array.isArray(results) ? results.length : (results && results.total) || 0;
      this._idx = -1;
      this.$('#findCount').textContent = total > 0 ? `${total} regex` : '0 found';
      if (total > 0) {
        Structra.events.emit('find:results', { results, mode: 'regex', query });
      }
    } catch (err) {
      Structra.log.warn('Find', 'Regex search failed', err.message);
      this.$('#findCount').textContent = 'Error';
    }
  }

  /* --- DuckDB-backed find --- */
  async _doDbFind(query) {
    try {
      const result = await Structra.engine.findInDb(query);
      if (result && result.total > 0) {
        this.$('#findCount').textContent = result.total + ' found';
      } else {
        this.$('#findCount').textContent = '0 found';
      }
    } catch (err) {
      Structra.log.warn('Find', 'Find failed', err.message);
      this.$('#findCount').textContent = 'Error';
    }
  }

  /* --- SQL query --- */
  async _doSqlFind(query) {
    // The SQL engine starts on first use (runSql does that), so say so while it loads
    if (!Structra.engine.duckReady) this.$('#findCount').textContent = 'Starting SQL…';
    try {
      const result = await Structra.engine.runSql(query);
      if (result.error) {
        this.$('#findCount').textContent = 'SQL Error';
        Structra.toast(result.error, 'error');
      } else {
        this.$('#findCount').textContent = result.total + ' rows';
      }
    } catch (err) {
      Structra.log.warn('Find', 'SQL query failed', err.message);
      this.$('#findCount').textContent = 'SQL Error';
    }
  }

  /* ======== REPLACE ======== */

  /** Replace in the open document, keeping the original so Ctrl+Z can bring it back */
  _replace(findText, replaceText, all) {
    const ds = Structra.engine.getActive();
    const tabId = Structra.tabs.activeId;
    const kept = ds ? Structra.undoStack.push(ds.raw, 'Before replace', tabId) : false;
    const result = Structra.engine.replaceInData(findText, replaceText, all);
    if (result.replaced > 0 && kept) Structra.undoStack.push(ds.raw, `Replace "${findText}" with "${replaceText}"`, tabId);
    return { ...result, undoable: kept };
  }

  _replaceOne() {
    const findText = this._getInput();
    const replaceText = (this.$('#replaceInput') || {}).value || '';
    if (!findText) return;
    const result = this._replace(findText, replaceText, false);
    if (result.replaced > 0) {
      Structra.toast('Replaced 1 occurrence.' + (result.undoable ? ' Ctrl+Z undoes it.' : ''));
      this._refreshAfterReplace(findText);
    } else {
      Structra.toast('No match found', 'warning');
    }
  }

  _replaceAll() {
    const findText = this._getInput();
    const replaceText = (this.$('#replaceInput') || {}).value || '';
    if (!findText) return;
    const result = this._replace(findText, replaceText, true);
    if (!result.replaced) { Structra.toast('No match found', 'warning'); return; }
    Structra.toast(`Replaced ${result.replaced} occurrence${result.replaced === 1 ? '' : 's'}.` + (result.undoable ? ' Ctrl+Z undoes it.' : ''));
    this._refreshAfterReplace(findText);
  }

  _refreshAfterReplace(query) {
    // Re-run find to update counts
    this._doFind(query);
    // Force views to re-render since data changed in-place
    Structra.events.emit('state:jsonData', { value: Structra.state.jsonData });
  }

  /* ======== NAVIGATION ======== */

  _next() {
    const query = Structra.engine.getQuery();
    if (!query || !query.matchedPaths || query.matchedPaths.length === 0) return;
    this._idx = (this._idx + 1) % query.total;
    this._updateCount();
    // Navigate to path in tree view
    const path = query.matchedPaths[this._idx];
    if (path) Structra.events.emit('tree:navigate-path', path);
  }

  _prev() {
    const query = Structra.engine.getQuery();
    if (!query || !query.matchedPaths || query.matchedPaths.length === 0) return;
    this._idx = (this._idx - 1 + query.total) % query.total;
    this._updateCount();
    const path = query.matchedPaths[this._idx];
    if (path) Structra.events.emit('tree:navigate-path', path);
  }

  _updateCount() {
    const el = this.$('#findCount');
    if (!el) return;
    const query = Structra.engine.getQuery();
    if (query && query.total > 0) {
      el.textContent = `${this._idx + 1}/${query.total}`;
    }
  }

  /* ======== CLEANUP ======== */

  _clearSearch() {
    clearTimeout(this._debounceTimer);
    this._idx = -1;
    const countEl = this.$('#findCount');
    if (countEl) countEl.textContent = '0/0';
    const input = this.$('#findInput');
    if (input) input.value = '';
    Structra.engine.clearQuery();
  }
}

customElements.define('structra-find', StructraFind);
