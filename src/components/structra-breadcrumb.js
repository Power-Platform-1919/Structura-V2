/* ============================================================
   STRUCTRA V2 - Breadcrumb
   <structra-breadcrumb> - the selected path as clickable segments.
   Click a segment to jump back up to that level.

   Wiring (generated from the code below; update it when you add or remove an event):
     Listens to: state:currentPath, state:jsonData
     Sets state: currentPath
   ============================================================ */

class StructraBreadcrumb extends StructraComponent {
  init() {
    this.on('state:currentPath', () => this._update());
    this.on('state:jsonData', () => this._update());
  }

  render() {
    this.addEventListener('click', (event) => {
      const seg = event.target.closest('[data-path]');
      if (!seg) return;
      Structra.setState('currentPath', seg.dataset.path);
    });
    this._update();
  }

  _update() {
    if (!this._mounted) return;
    const tokens = Structra.dataPaths.tokenize(Structra.state.currentPath);
    if (!tokens.length || !Structra.state.jsonData) {
      this.innerHTML = '';
      this.classList.remove('show');
      return;
    }

    const escapeHtml = Structra.sharedHelpers.escapeHtml;
    let running = '';
    const parts = [`<button class="bc-seg" data-path="$">root</button>`];
    tokens.forEach((token, i) => {
      if (token.type === 'key') running += (running ? '.' : '') + token.value;
      else running += `[${token.value}]`;
      const label = token.type === 'key' ? token.value : `[${token.value}]`;
      const last = i === tokens.length - 1;
      parts.push(`<span class="bc-sep">›</span><button class="bc-seg${last ? ' bc-current' : ''}" data-path="${escapeHtml(running)}">${escapeHtml(label)}</button>`);
    });
    this.innerHTML = parts.join('');
    this.classList.add('show');
  }
}

customElements.define('structra-breadcrumb', StructraBreadcrumb);
