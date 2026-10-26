/* ============================================================
   STRUCTRA V2 - Appearance
   <structra-theme> - choose light, dark or system; pick a built-in theme;
   build your own with a live preview; export it as JSON and import it back.
   Built on StructraDialog; the theme logic itself is Structra.themeEngine.

   Wiring (generated from the code below; update it when you add or remove an event):
     Listens to: theme:open, theme:changed
   ============================================================ */

class StructraTheme extends StructraDialog {
  init() {
    super.init();
    this._draft = null;          // the custom theme being edited (not saved yet), or null
    this.on('theme:open', () => this.open());
    this.on('theme:changed', () => { if (this.isOpen && !this._draft) this._renderThemes(); });
  }

  render() {
    this.mount({
      title: 'Appearance',
      size: 'lg',
      body: `
        <section class="th-section">
          <div class="th-row">
            <div>
              <div class="th-label">Mode</div>
              <div class="hint" id="thModeHint"></div>
            </div>
            <div class="seg" id="thMode" role="group" aria-label="Mode">
              <button class="seg-btn" type="button" data-mode="light">Light</button>
              <button class="seg-btn" type="button" data-mode="dark">Dark</button>
              <button class="seg-btn" type="button" data-mode="system">System</button>
            </div>
          </div>
        </section>

        <section class="th-section">
          <div class="th-row">
            <div class="th-label">Themes</div>
            <div class="row">
              <button class="btn btn-sm" type="button" data-act="new">New custom theme</button>
              <button class="btn btn-sm" type="button" data-act="import">Import JSON</button>
              <input type="file" id="thFile" accept=".json,application/json" hidden>
            </div>
          </div>
          <div class="th-grid" id="thGrid"></div>
        </section>

        <section class="th-section th-editor" id="thEditor" hidden></section>`,
      foot: '<button class="btn btn-primary" type="button" data-ov-close>Done</button>',
    });

    this.root.addEventListener('click', (event) => this._onClick(event));
    this.root.addEventListener('input', (event) => this._onInput(event));
    this.root.addEventListener('change', (event) => this._onChange(event));
  }

  onOpen() {
    this._renderMode();
    this._renderThemes();
  }

  onClose() {
    // Leaving mid-edit throws the draft away and shows the saved theme again
    if (this._draft) this._cancelEdit();
  }

  /* ---------- mode and theme cards ---------- */

  _renderMode() {
    const mode = Structra.themeEngine.mode();
    this.queryAll('#thMode .seg-btn').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.mode === mode)));
    const hint = this.queryOne('#thModeHint');
    if (hint) hint.textContent = { light: 'Always light, whatever your operating system uses.', dark: 'Always dark, whatever your operating system uses.', system: 'Follows your operating system: light by day, dark by night if it is set that way.' }[mode] || '';
  }

  _card(theme, selected) {
    const esc = Structra.sharedHelpers.escapeHtml;
    const colors = theme.colors;
    return `
      <div class="th-card${selected ? ' selected' : ''}" role="button" tabindex="0" data-use="${esc(theme.id)}" aria-pressed="${selected}">
        <div class="th-preview" style="background:${colors.bg};border-color:${colors.border}">
          <div class="th-pv-panel" style="background:${colors.surface};border-color:${colors.border}">
            <span class="th-pv-bar" style="background:${colors.accent}"></span>
            <span class="th-pv-line" style="background:${colors.text}"></span>
            <span class="th-pv-line short" style="background:${colors.textMuted}"></span>
            <span class="th-pv-dots">
              <i style="background:${colors.synKey}"></i><i style="background:${colors.synString}"></i><i style="background:${colors.synNumber}"></i><i style="background:${colors.synBoolean}"></i><i style="background:${colors.synNull}"></i>
            </span>
          </div>
        </div>
        <div class="th-meta">
          <span class="th-name" title="${esc(theme.name)}">${esc(theme.name)}</span>
          <span class="tag">${theme.mode === 'dark' ? 'Dark' : 'Light'}${theme.builtIn ? '' : ' · custom'}</span>
        </div>
        ${theme.builtIn ? '' : `<div class="th-actions">
          <button class="btn btn-ghost btn-sm" type="button" data-edit="${esc(theme.id)}">Edit</button>
          <button class="btn btn-ghost btn-sm btn-danger" type="button" data-del="${esc(theme.id)}">Delete</button>
        </div>`}
      </div>`;
  }

  _renderThemes() {
    const chosen = Structra.themeEngine.chosen();
    const active = Structra.themeEngine.current().theme;
    const all = Structra.themeEngine.list();
    const group = (title, items) => items.length
      ? `<div class="th-group">${Structra.sharedHelpers.escapeHtml(title)}</div>${items.map((theme) => this._card(theme, theme.id === active.id)).join('')}`
      : '';
    this.queryOne('#thGrid').innerHTML =
      group('Light', all.filter((theme) => theme.mode === 'light')) +
      group('Dark', all.filter((theme) => theme.mode === 'dark'));
    void chosen;
  }

  /* ---------- editor ---------- */

  _startEdit(base, editingId) {
    const source = base || Structra.themeEngine.current().theme;
    this._draft = {
      id: editingId || null,
      name: editingId ? source.name : (source.name + ' copy').slice(0, 60),
      mode: source.mode,
      colors: { ...source.colors },
      fonts: { ...(source.fonts || {}) },
    };
    this._renderEditor();
    this._applyDraft();
    this.queryOne('#thEditor').hidden = false;
    // While editing, Save theme and Cancel are the only buttons: no second Done to confuse them
    const foot = this.queryOne('.ov-foot'); if (foot) foot.hidden = true;
    this.queryOne('#thEditor').scrollIntoView({ block: 'start' });
  }

  _applyDraft() {
    if (this._draft) Structra.themeEngine.preview(this._draft);
    this._renderContrast();
  }

  _cancelEdit() {
    this._draft = null;
    { const foot = this.querySelector('.ov-foot'); if (foot) foot.hidden = false; }
    Structra.themeEngine.endPreview();
    const editor = this.queryOne('#thEditor');
    if (editor) { editor.hidden = true; editor.innerHTML = ''; }
  }

  _renderEditor() {
    const esc = Structra.sharedHelpers.escapeHtml;
    const draft = this._draft;
    const rows = Structra.themeEngine.BASE_KEYS.map((key) => `
      <div class="th-color">
        <label for="thc-${key}">${esc(Structra.themeEngine.LABELS[key])}</label>
        <input type="color" id="thc-${key}" data-color="${key}" value="${this._toSixDigitHex(draft.colors[key])}">
        <input type="text" class="th-hex" data-hex="${key}" value="${esc(draft.colors[key])}" maxlength="7" spellcheck="false" aria-label="${esc(Structra.themeEngine.LABELS[key])} hex value">
      </div>`).join('');

    this.queryOne('#thEditor').innerHTML = `
      <div class="th-row">
        <div class="th-label">${draft.id ? 'Edit custom theme' : 'New custom theme'}</div>
        <div class="hint">Changes preview live. Save to keep them.</div>
      </div>
      <div class="th-edit-top">
        <div class="field grow"><label for="thName">Name</label><input type="text" id="thName" value="${esc(draft.name)}" maxlength="60"></div>
        <div class="field"><label>Mode</label>
          <div class="seg" id="thEdMode" role="group" aria-label="Theme mode">
            <button class="seg-btn" type="button" data-edmode="light" aria-pressed="${draft.mode === 'light'}">Light</button>
            <button class="seg-btn" type="button" data-edmode="dark" aria-pressed="${draft.mode === 'dark'}">Dark</button>
          </div>
        </div>
        <div class="field"><label for="thBase">Start from</label>
          <select id="thBase">
            <option value="">Keep current colours</option>
            ${Structra.themeEngine.list().map((theme) => `<option value="${esc(theme.id)}">${esc(theme.name)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="th-colors">${rows}</div>
      <div class="th-fonts">
        <div class="field grow"><label for="thFontUi">Interface font (optional)</label><input type="text" id="thFontUi" value="${esc(draft.fonts.ui || '')}" placeholder="IBM Plex Sans"></div>
        <div class="field grow"><label for="thFontMono">Code font (optional)</label><input type="text" id="thFontMono" value="${esc(draft.fonts.mono || '')}" placeholder="JetBrains Mono"></div>
        <div class="field"><label for="thFontSize">Text size</label><input type="number" id="thFontSize" min="12" max="20" value="${esc(draft.fonts.size || '')}" placeholder="15"></div>
      </div>
      <div class="th-contrast" id="thContrast" aria-live="polite"></div>
      <div class="th-edit-actions">
        <button class="btn btn-primary" type="button" data-act="save">${draft.id ? 'Save changes' : 'Save theme'}</button>
        <button class="btn" type="button" data-act="export">Export JSON</button>
        <button class="btn" type="button" data-act="copy">Copy JSON</button>
        <button class="btn btn-ghost" type="button" data-act="cancel">Cancel</button>
      </div>`;
  }

  _toSixDigitHex(hex) {
    let digits = String(hex).replace('#', '');
    if (digits.length === 3) digits = digits.split('').map((colors) => colors + colors).join('');
    return '#' + digits.padEnd(6, '0').slice(0, 6);
  }

  _renderContrast() {
    const element = this.queryOne('#thContrast');
    if (!element || !this._draft) return;
    const colors = this._draft.colors;
    const pairs = [['Text on panels', colors.text, colors.surface], ['Secondary text', colors.textSec, colors.surface], ['Muted text', colors.textMuted, colors.surface],
      ['Accent on panels', colors.accent, colors.surface], ['Text on app background', colors.text, colors.bg]];
    element.innerHTML = '<div class="th-label">Contrast</div><div class="th-contrast-list">' + pairs.map(([label, pair, button]) => {
      const ratio = Structra.themeEngine.contrast(pair, button);
      const ok = ratio >= 4.5;
      return `<span class="th-cr ${ok ? 'ok' : 'low'}" title="Easy-to-read text needs a contrast of at least 4.5 to 1">${Structra.sharedHelpers.escapeHtml(label)} <b>${ratio.toFixed(1)}</b> ${ok ? 'AA' : 'low'}</span>`;
    }).join('') + '</div>';
  }

  /* ---------- events ---------- */

  _onClick(event) {
    const field = event.target;
    const modeBtn = field.closest('[data-mode]');
    if (modeBtn) { Structra.themeEngine.setMode(modeBtn.dataset.mode); this._renderMode(); this._renderThemes(); return; }

    const edMode = field.closest('[data-edmode]');
    if (edMode && this._draft) {
      this._draft.mode = edMode.dataset.edmode;
      this.queryAll('#thEdMode .seg-btn').forEach((button) => button.setAttribute('aria-pressed', String(button === edMode)));
      this._applyDraft();
      return;
    }

    const deletion = field.closest('[data-del]');
    if (deletion) { event.stopPropagation(); this._delete(deletion.dataset.del); return; }
    const edit = field.closest('[data-edit]');
    if (edit) { event.stopPropagation(); this._startEdit(Structra.themeEngine.get(edit.dataset.edit), edit.dataset.edit); return; }

    const card = field.closest('[data-use]');
    if (card && !this._draft) { Structra.themeEngine.use(card.dataset.use); this._renderMode(); this._renderThemes(); return; }

    const action = field.closest('[data-act]');
    if (!action) return;
    switch (action.dataset.act) {
      case 'new': this._startEdit(null, null); break;
      case 'import': this.queryOne('#thFile').click(); break;
      case 'save': this._save(); break;
      case 'export': this._export(false); break;
      case 'copy': this._export(true); break;
      case 'cancel': this._cancelEdit(); this._renderThemes(); break;
    }
  }

  _onInput(event) {
    const field = event.target;
    if (!this._draft) return;
    if (field.matches('[data-color]')) {
      this._draft.colors[field.dataset.color] = field.value;
      const hex = this.queryOne(`[data-hex="${field.dataset.color}"]`);
      if (hex) hex.value = field.value;
      this._applyDraft();
    } else if (field.matches('[data-hex]')) {
      if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(field.value)) {
        this._draft.colors[field.dataset.hex] = field.value.toLowerCase();
        const picker = this.queryOne(`[data-color="${field.dataset.hex}"]`);
        if (picker) picker.value = this._toSixDigitHex(field.value);
        this._applyDraft();
      }
    } else if (field.id === 'thName') {
      this._draft.name = field.value;
    } else if (field.id === 'thFontUi' || field.id === 'thFontMono') {
      this._draft.fonts[field.id === 'thFontUi' ? 'ui' : 'mono'] = field.value.trim() || undefined;
      this._applyDraft();
    } else if (field.id === 'thFontSize') {
      this._draft.fonts.size = field.value ? Number(field.value) : undefined;
      this._applyDraft();
    }
  }

  _onChange(event) {
    const field = event.target;
    if (field.id === 'thFile') { this._import(field); return; }
    if (field.id === 'thBase' && this._draft && field.value) {
      const base = Structra.themeEngine.get(field.value);
      if (!base) return;
      this._draft.mode = base.mode;
      this._draft.colors = { ...base.colors };
      this._draft.fonts = { ...(base.fonts || {}) };
      this._renderEditor();
      this._applyDraft();
    }
  }

  /* ---------- actions ---------- */

  _cleanDraft() {
    const draft = this._draft;
    const fonts = {};
    ['ui', 'mono', 'size'].forEach((key) => { if (draft.fonts[key] !== undefined && draft.fonts[key] !== '') fonts[key] = draft.fonts[key]; });
    return { id: draft.id, name: (draft.name || '').trim(), mode: draft.mode, colors: draft.colors, ...(Object.keys(fonts).length ? { fonts } : {}) };
  }

  _save() {
    try {
      const id = Structra.themeEngine.saveCustom(this._cleanDraft());
      this._draft = null;
      { const foot = this.querySelector('.ov-foot'); if (foot) foot.hidden = false; }
      this.queryOne('#thEditor').hidden = true;
      this.queryOne('#thEditor').innerHTML = '';
      Structra.themeEngine.use(id);
      this._renderMode();
      this._renderThemes();
      Structra.toast('Theme saved');
    } catch (error) {
      Structra.toast(error.message);
    }
  }

  _export(copyOnly) {
    try {
      // Export what is on screen, saved or not
      const draft = this._cleanDraft();
      const json = JSON.stringify({ format: 'structra-theme', version: 1, name: draft.name || 'My theme', mode: draft.mode, colors: draft.colors, ...(draft.fonts ? { fonts: draft.fonts } : {}) }, null, 2);
      if (copyOnly) Structra.sharedHelpers.copyToClipboard(json, 'Theme JSON copied');
      else Structra.sharedHelpers.downloadFile(json, (draft.name || 'theme').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.structra-theme.json', 'application/json');
    } catch (error) {
      Structra.toast(error.message);
    }
  }

  async _import(input) {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    try {
      const theme = Structra.themeEngine.importJson(await file.text());
      Structra.themeEngine.use(theme.id);
      this._renderMode();
      this._renderThemes();
      Structra.toast('Imported "' + theme.name + '"');
    } catch (error) {
      Structra.toast(error.message);
    }
  }

  _delete(id) {
    const theme = Structra.themeEngine.get(id);
    if (!theme || theme.builtIn) return;
    Structra.themeEngine.deleteCustom(id);
    this._renderThemes();
    Structra.toast('Deleted "' + theme.name + '"');
  }
}

customElements.define('structra-theme', StructraTheme);
