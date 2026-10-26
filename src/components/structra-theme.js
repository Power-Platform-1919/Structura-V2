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

    this.root.addEventListener('click', (e) => this._onClick(e));
    this.root.addEventListener('input', (e) => this._onInput(e));
    this.root.addEventListener('change', (e) => this._onChange(e));
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
    this.$$('#thMode .seg-btn').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
    const hint = this.$('#thModeHint');
    if (hint) hint.textContent = { light: 'Always light, whatever your operating system uses.', dark: 'Always dark, whatever your operating system uses.', system: 'Follows your operating system: light by day, dark by night if it is set that way.' }[mode] || '';
  }

  _card(t, selected) {
    const esc = Structra.sharedHelpers.esc;
    const c = t.colors;
    return `
      <div class="th-card${selected ? ' selected' : ''}" role="button" tabindex="0" data-use="${esc(t.id)}" aria-pressed="${selected}">
        <div class="th-preview" style="background:${c.bg};border-color:${c.border}">
          <div class="th-pv-panel" style="background:${c.surface};border-color:${c.border}">
            <span class="th-pv-bar" style="background:${c.accent}"></span>
            <span class="th-pv-line" style="background:${c.text}"></span>
            <span class="th-pv-line short" style="background:${c.textMuted}"></span>
            <span class="th-pv-dots">
              <i style="background:${c.synKey}"></i><i style="background:${c.synString}"></i><i style="background:${c.synNumber}"></i><i style="background:${c.synBoolean}"></i><i style="background:${c.synNull}"></i>
            </span>
          </div>
        </div>
        <div class="th-meta">
          <span class="th-name" title="${esc(t.name)}">${esc(t.name)}</span>
          <span class="tag">${t.mode === 'dark' ? 'Dark' : 'Light'}${t.builtIn ? '' : ' · custom'}</span>
        </div>
        ${t.builtIn ? '' : `<div class="th-actions">
          <button class="btn btn-ghost btn-sm" type="button" data-edit="${esc(t.id)}">Edit</button>
          <button class="btn btn-ghost btn-sm btn-danger" type="button" data-del="${esc(t.id)}">Delete</button>
        </div>`}
      </div>`;
  }

  _renderThemes() {
    const chosen = Structra.themeEngine.chosen();
    const active = Structra.themeEngine.current().theme;
    const all = Structra.themeEngine.list();
    const group = (title, items) => items.length
      ? `<div class="th-group">${Structra.sharedHelpers.esc(title)}</div>${items.map((t) => this._card(t, t.id === active.id)).join('')}`
      : '';
    this.$('#thGrid').innerHTML =
      group('Light', all.filter((t) => t.mode === 'light')) +
      group('Dark', all.filter((t) => t.mode === 'dark'));
    void chosen;
  }

  /* ---------- editor ---------- */

  _startEdit(base, editingId) {
    const src = base || Structra.themeEngine.current().theme;
    this._draft = {
      id: editingId || null,
      name: editingId ? src.name : (src.name + ' copy').slice(0, 60),
      mode: src.mode,
      colors: { ...src.colors },
      fonts: { ...(src.fonts || {}) },
    };
    this._renderEditor();
    this._applyDraft();
    this.$('#thEditor').hidden = false;
    // While editing, Save theme and Cancel are the only buttons: no second Done to confuse them
    const foot = this.$('.ov-foot'); if (foot) foot.hidden = true;
    this.$('#thEditor').scrollIntoView({ block: 'start' });
  }

  _applyDraft() {
    if (this._draft) Structra.themeEngine.preview(this._draft);
    this._renderContrast();
  }

  _cancelEdit() {
    this._draft = null;
    { const foot = this.querySelector('.ov-foot'); if (foot) foot.hidden = false; }
    Structra.themeEngine.endPreview();
    const ed = this.$('#thEditor');
    if (ed) { ed.hidden = true; ed.innerHTML = ''; }
  }

  _renderEditor() {
    const esc = Structra.sharedHelpers.esc;
    const d = this._draft;
    const rows = Structra.themeEngine.BASE_KEYS.map((k) => `
      <div class="th-color">
        <label for="thc-${k}">${esc(Structra.themeEngine.LABELS[k])}</label>
        <input type="color" id="thc-${k}" data-color="${k}" value="${this._hex6(d.colors[k])}">
        <input type="text" class="th-hex" data-hex="${k}" value="${esc(d.colors[k])}" maxlength="7" spellcheck="false" aria-label="${esc(Structra.themeEngine.LABELS[k])} hex value">
      </div>`).join('');

    this.$('#thEditor').innerHTML = `
      <div class="th-row">
        <div class="th-label">${d.id ? 'Edit custom theme' : 'New custom theme'}</div>
        <div class="hint">Changes preview live. Save to keep them.</div>
      </div>
      <div class="th-edit-top">
        <div class="field grow"><label for="thName">Name</label><input type="text" id="thName" value="${esc(d.name)}" maxlength="60"></div>
        <div class="field"><label>Mode</label>
          <div class="seg" id="thEdMode" role="group" aria-label="Theme mode">
            <button class="seg-btn" type="button" data-edmode="light" aria-pressed="${d.mode === 'light'}">Light</button>
            <button class="seg-btn" type="button" data-edmode="dark" aria-pressed="${d.mode === 'dark'}">Dark</button>
          </div>
        </div>
        <div class="field"><label for="thBase">Start from</label>
          <select id="thBase">
            <option value="">Keep current colours</option>
            ${Structra.themeEngine.list().map((t) => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="th-colors">${rows}</div>
      <div class="th-fonts">
        <div class="field grow"><label for="thFontUi">Interface font (optional)</label><input type="text" id="thFontUi" value="${esc(d.fonts.ui || '')}" placeholder="IBM Plex Sans"></div>
        <div class="field grow"><label for="thFontMono">Code font (optional)</label><input type="text" id="thFontMono" value="${esc(d.fonts.mono || '')}" placeholder="JetBrains Mono"></div>
        <div class="field"><label for="thFontSize">Text size</label><input type="number" id="thFontSize" min="12" max="20" value="${esc(d.fonts.size || '')}" placeholder="15"></div>
      </div>
      <div class="th-contrast" id="thContrast" aria-live="polite"></div>
      <div class="th-edit-actions">
        <button class="btn btn-primary" type="button" data-act="save">${d.id ? 'Save changes' : 'Save theme'}</button>
        <button class="btn" type="button" data-act="export">Export JSON</button>
        <button class="btn" type="button" data-act="copy">Copy JSON</button>
        <button class="btn btn-ghost" type="button" data-act="cancel">Cancel</button>
      </div>`;
  }

  _hex6(hex) {
    let h = String(hex).replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    return '#' + h.padEnd(6, '0').slice(0, 6);
  }

  _renderContrast() {
    const el = this.$('#thContrast');
    if (!el || !this._draft) return;
    const c = this._draft.colors;
    const pairs = [['Text on panels', c.text, c.surface], ['Secondary text', c.textSec, c.surface], ['Muted text', c.textMuted, c.surface],
      ['Accent on panels', c.accent, c.surface], ['Text on app background', c.text, c.bg]];
    el.innerHTML = '<div class="th-label">Contrast</div><div class="th-contrast-list">' + pairs.map(([label, a, b]) => {
      const ratio = Structra.themeEngine.contrast(a, b);
      const ok = ratio >= 4.5;
      return `<span class="th-cr ${ok ? 'ok' : 'low'}" title="Easy-to-read text needs a contrast of at least 4.5 to 1">${Structra.sharedHelpers.esc(label)} <b>${ratio.toFixed(1)}</b> ${ok ? 'AA' : 'low'}</span>`;
    }).join('') + '</div>';
  }

  /* ---------- events ---------- */

  _onClick(e) {
    const t = e.target;
    const modeBtn = t.closest('[data-mode]');
    if (modeBtn) { Structra.themeEngine.setMode(modeBtn.dataset.mode); this._renderMode(); this._renderThemes(); return; }

    const edMode = t.closest('[data-edmode]');
    if (edMode && this._draft) {
      this._draft.mode = edMode.dataset.edmode;
      this.$$('#thEdMode .seg-btn').forEach((b) => b.setAttribute('aria-pressed', String(b === edMode)));
      this._applyDraft();
      return;
    }

    const del = t.closest('[data-del]');
    if (del) { e.stopPropagation(); this._delete(del.dataset.del); return; }
    const edit = t.closest('[data-edit]');
    if (edit) { e.stopPropagation(); this._startEdit(Structra.themeEngine.get(edit.dataset.edit), edit.dataset.edit); return; }

    const card = t.closest('[data-use]');
    if (card && !this._draft) { Structra.themeEngine.use(card.dataset.use); this._renderMode(); this._renderThemes(); return; }

    const act = t.closest('[data-act]');
    if (!act) return;
    switch (act.dataset.act) {
      case 'new': this._startEdit(null, null); break;
      case 'import': this.$('#thFile').click(); break;
      case 'save': this._save(); break;
      case 'export': this._export(false); break;
      case 'copy': this._export(true); break;
      case 'cancel': this._cancelEdit(); this._renderThemes(); break;
    }
  }

  _onInput(e) {
    const t = e.target;
    if (!this._draft) return;
    if (t.matches('[data-color]')) {
      this._draft.colors[t.dataset.color] = t.value;
      const hex = this.$(`[data-hex="${t.dataset.color}"]`);
      if (hex) hex.value = t.value;
      this._applyDraft();
    } else if (t.matches('[data-hex]')) {
      if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(t.value)) {
        this._draft.colors[t.dataset.hex] = t.value.toLowerCase();
        const picker = this.$(`[data-color="${t.dataset.hex}"]`);
        if (picker) picker.value = this._hex6(t.value);
        this._applyDraft();
      }
    } else if (t.id === 'thName') {
      this._draft.name = t.value;
    } else if (t.id === 'thFontUi' || t.id === 'thFontMono') {
      this._draft.fonts[t.id === 'thFontUi' ? 'ui' : 'mono'] = t.value.trim() || undefined;
      this._applyDraft();
    } else if (t.id === 'thFontSize') {
      this._draft.fonts.size = t.value ? Number(t.value) : undefined;
      this._applyDraft();
    }
  }

  _onChange(e) {
    const t = e.target;
    if (t.id === 'thFile') { this._import(t); return; }
    if (t.id === 'thBase' && this._draft && t.value) {
      const base = Structra.themeEngine.get(t.value);
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
    const d = this._draft;
    const fonts = {};
    ['ui', 'mono', 'size'].forEach((k) => { if (d.fonts[k] !== undefined && d.fonts[k] !== '') fonts[k] = d.fonts[k]; });
    return { id: d.id, name: (d.name || '').trim(), mode: d.mode, colors: d.colors, ...(Object.keys(fonts).length ? { fonts } : {}) };
  }

  _save() {
    try {
      const id = Structra.themeEngine.saveCustom(this._cleanDraft());
      this._draft = null;
      { const foot = this.querySelector('.ov-foot'); if (foot) foot.hidden = false; }
      this.$('#thEditor').hidden = true;
      this.$('#thEditor').innerHTML = '';
      Structra.themeEngine.use(id);
      this._renderMode();
      this._renderThemes();
      Structra.toast('Theme saved');
    } catch (err) {
      Structra.toast(err.message);
    }
  }

  _export(copyOnly) {
    try {
      // Export what is on screen, saved or not
      const draft = this._cleanDraft();
      const json = JSON.stringify({ format: 'structra-theme', version: 1, name: draft.name || 'My theme', mode: draft.mode, colors: draft.colors, ...(draft.fonts ? { fonts: draft.fonts } : {}) }, null, 2);
      if (copyOnly) Structra.sharedHelpers.copy(json, 'Theme JSON copied');
      else Structra.sharedHelpers.download(json, (draft.name || 'theme').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.structra-theme.json', 'application/json');
    } catch (err) {
      Structra.toast(err.message);
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
    } catch (err) {
      Structra.toast(err.message);
    }
  }

  _delete(id) {
    const t = Structra.themeEngine.get(id);
    if (!t || t.builtIn) return;
    Structra.themeEngine.deleteCustom(id);
    this._renderThemes();
    Structra.toast('Deleted "' + t.name + '"');
  }
}

customElements.define('structra-theme', StructraTheme);
