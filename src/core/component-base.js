/* ============================================================
   STRUCTRA V2 - Component base class
   StructraComponent: every custom element of the app extends this. Small, no magic.
   Helpers: this.queryOne(selector) and this.queryAll(selector) search inside the element.
   Cleaning up: this.on(...) subscriptions are removed when the element leaves the page and made again if it is added back, and
   this.listenerSignal can be passed to addEventListener({ signal }) for document and window listeners, which are removed the same way.
   ============================================================ */

class StructraComponent extends HTMLElement {
  constructor() {
    super();
    this._mounted = false;
    this.props = {};
    this._subscriptions = [];
    this._listenerController = new AbortController();
  }

  /** Pass to addEventListener(type, handler, { signal }) so the listener goes away when the element is removed from the page */
  get listenerSignal() { return this._listenerController.signal; }

  connectedCallback() {
    if (this._mounted) {
      // added to the page again: the subscriptions were removed when it left
      if (this._released) this._resubscribe();
      return;
    }
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

  /** Removed from the page: stop listening to the event bus and to document and window, so nothing runs for an element that is gone */
  disconnectedCallback() {
    if (!this._mounted || this._released) return;
    this._released = true;
    for (const subscription of this._subscriptions) Structra.events.off(subscription.event, subscription.handler);
    this._listenerController.abort();
  }

  _resubscribe() {
    this._released = false;
    this._listenerController = new AbortController();
    for (const subscription of this._subscriptions) Structra.events.on(subscription.event, subscription.handler);
    if (typeof this.listenersReturned === 'function') this.listenersReturned();
  }

  /** Subscribe to Structra state events (removed when the element leaves the page, made again when it is added back) */
  on(event, handler) {
    this._subscriptions.push({ event, handler });
    if (!this._released) Structra.events.on(event, handler);
  }

  /** Unsubscribe from Structra state events */
  off(event, handler) {
    this._subscriptions = this._subscriptions.filter((subscription) => subscription.event !== event || subscription.handler !== handler);
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
