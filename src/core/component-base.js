/* ============================================================
   STRUCTRA V2 - Base Element Class
   All custom elements extend this. ~30 lines, no magic.
   ============================================================ */

class StructraComponent extends HTMLElement {
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
    for (const attribute of this.attributes) {
      this.props[this._camel(attribute.name)] = attribute.value;
    }
  }

  /** Called when an observed attribute changes - updates props and re-renders */
  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    this.props[this._camel(name)] = newValue;
    if (this._mounted) this.update(name, oldValue, newValue);
  }

  /** Override for targeted prop-change handling (default: full re-render) */
  update(name, oldValue, newValue) {
    this.render();
  }

  /** Set a prop programmatically and trigger update */
  set(key, value) {
    const attribute = this._kebab(key);
    if (value == null || value === false) {
      this.removeAttribute(attribute);
    } else {
      this.setAttribute(attribute, value === true ? '' : value);
    }
  }

  /** Get a prop value */
  get(key) {
    return this.props[key];
  }

  _camel(text) { return text.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()); }
  _kebab(text) { return text.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase()); }

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
  queryOne(selector) {
    return this.querySelector(selector);
  }

  /** Shorthand: queryAll inside this element */
  queryAll(selector) {
    return this.querySelectorAll(selector);
  }
}
