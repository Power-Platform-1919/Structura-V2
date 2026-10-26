/* ============================================================
   STRUCTRA V2 - Base Element Class
   All custom elements extend this. ~30 lines, no magic.
   ============================================================ */

class StructraElement extends HTMLElement {
  constructor() {
    super();
    this._mounted = false;
    this.props = {};
  }

  connectedCallback() {
    if (!this._mounted) {
      this._mounted = true;
      const tag = this.tagName.toLowerCase();
      Structra.log.debug('App', 'Mount: <' + tag + '>');
      this._readProps();
      this.init();
      this.render();
      Structra.log.info('App', 'Ready: <' + tag + '>');
    }
  }

  /** Reads HTML attributes into this.props (camelCase keys) */
  _readProps() {
    for (const attr of this.attributes) {
      this.props[this._camel(attr.name)] = attr.value;
    }
  }

  /** Called when an observed attribute changes - updates props and re-renders */
  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal === newVal) return;
    this.props[this._camel(name)] = newVal;
    if (this._mounted) this.update(name, oldVal, newVal);
  }

  /** Override for targeted prop-change handling (default: full re-render) */
  update(name, oldVal, newVal) {
    this.render();
  }

  /** Set a prop programmatically and trigger update */
  set(key, value) {
    const attr = this._kebab(key);
    if (value == null || value === false) {
      this.removeAttribute(attr);
    } else {
      this.setAttribute(attr, value === true ? '' : value);
    }
  }

  /** Get a prop value */
  get(key) {
    return this.props[key];
  }

  _camel(s) { return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase()); }
  _kebab(s) { return s.replace(/[A-Z]/g, c => '-' + c.toLowerCase()); }

  /** Override in subclass for one-time setup (event listeners, state subscriptions) */
  init() {}

  /** Override in subclass - set this.innerHTML */
  render() {}

  /** Emit a custom event that bubbles up the DOM */
  emit(name, detail = null) {
    this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, detail }));
  }

  /** Subscribe to Structra state events */
  on(event, handler) {
    Structra.events.on(event, handler);
  }

  /** Unsubscribe from Structra state events */
  off(event, handler) {
    Structra.events.off(event, handler);
  }

  /** Shorthand: query inside this element */
  $(selector) {
    return this.querySelector(selector);
  }

  /** Shorthand: queryAll inside this element */
  $$(selector) {
    return this.querySelectorAll(selector);
  }
}
