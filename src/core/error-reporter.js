/* ============================================================
   STRUCTRA V2 - Error Reporter
   Structra.errorReporter - catches errors nobody else caught, tells the person in a few words, and can copy a bug report.

   What it does
     - Listens for uncaught errors and unhandled promise rejections on the page. Code that reports a worker error calls report().
     - Keeps the last 20 in memory (never saved, never sent anywhere).
     - Shows one short message (not one per error: the same message at most once a minute, three a minute in all).
     - "Copy a bug report" (command palette) puts a text on the clipboard: version, browser, the open view, the last errors.

   What a bug report never holds: the document, any value from it, or the file name. Error messages can quote a piece of the data
   (the browser says: Unexpected token 'a', "abc, def..." is not valid JSON), so text inside double quotes is replaced by "..." and
   every message is cut to 160 characters. Page addresses lose their query and fragment (a shared link holds the whole document).

   API:
     Structra.errorReporter.start()              listen (called once at load)
     Structra.errorReporter.report(kind, error)  record an error that was caught elsewhere, for example from a worker
     Structra.errorReporter.list()               the recorded errors, newest last
     Structra.errorReporter.buildReport()        the bug report text
     Structra.errorReporter.copyReport()         copy the bug report
   ============================================================ */
'use strict';

window.Structra = window.Structra || {};

Structra.errorReporter = (() => {
  const MAX_ERRORS = 20;
  const MAX_MESSAGE = 160;
  const MAX_STACK_LINES = 5;
  const TOAST_COOLDOWN_MS = 60000;
  const TOASTS_PER_MINUTE = 3;
  // Browsers report these when a layout settles in the same frame: nothing is broken and the person can do nothing about it
  const IGNORED = [/ResizeObserver loop/i];

  const errors = [];
  let started = false;
  const lastToastFor = new Map();
  let toastTimes = [];

  /** A message with the quoted text taken out (it may be a piece of the document) and cut to a safe length */
  function cleanMessage(message) {
    const text = String(message === undefined || message === null ? '' : message).replace(/\s+/g, ' ').replace(/"[^"]*"/g, '"..."').trim();
    return text.length > MAX_MESSAGE ? text.slice(0, MAX_MESSAGE) + '...' : text;
  }

  /** A page or script address without its query and fragment; a blob address is just "blob" */
  function cleanAddress(address) {
    const text = String(address || '');
    if (/^(blob|data):/i.test(text)) return text.split(':')[0];
    return text.replace(/[?#].*$/, '').replace(/^https?:\/\/[^/]+/i, '');
  }

  /** The first few lines of a stack: only the place in our code, no messages */
  function cleanStack(stack) {
    return String(stack || '').split('\n').slice(1, 1 + MAX_STACK_LINES).map((line) => cleanAddress(line.trim().replace(/\(([^)]*)\)/, (all, inner) => '(' + cleanAddress(inner) + ')'))).join('\n');
  }

  function record(kind, error, address, line) {
    const message = cleanMessage(error && error.message !== undefined ? error.message : error);
    if (!message || IGNORED.some((pattern) => pattern.test(message))) return null;
    const entry = {
      time: new Date().toISOString(),
      kind,
      message,
      name: error && error.name ? String(error.name).slice(0, 40) : '',
      where: address ? cleanAddress(address) + (line ? ':' + line : '') : '',
      stack: error && error.stack ? cleanStack(error.stack) : '',
    };
    errors.push(entry);
    if (errors.length > MAX_ERRORS) errors.shift();
    return entry;
  }

  /** Tell the person once, briefly. Never throws: an error in the reporter must not cause another error. */
  function announce(entry) {
    try {
      const now = Date.now();
      toastTimes = toastTimes.filter((time) => now - time < TOAST_COOLDOWN_MS);
      if (toastTimes.length >= TOASTS_PER_MINUTE) return;
      if (now - (lastToastFor.get(entry.message) || 0) < TOAST_COOLDOWN_MS) return;
      lastToastFor.set(entry.message, now);
      toastTimes.push(now);
      if (typeof Structra.toast === 'function') Structra.toast('Something went wrong. Your data is safe.', { action: { label: 'Copy a bug report', run: () => copyReport() } });
    } catch { /* nothing more to do */ }
  }

  function report(kind, error, address, line) {
    try {
      const entry = record(kind, error, address, line);
      if (!entry) return;
      if (Structra.log) Structra.log.error('ErrorReporter', `${kind}: ${entry.message}`);
      announce(entry);
    } catch { /* the reporter must never be the cause of an error */ }
  }

  function start() {
    if (started || typeof window.addEventListener !== 'function') return;
    started = true;
    window.addEventListener('error', (event) => {
      // A failed image or script has no message; only real script errors are reported
      if (!event.message && !event.error) return;
      report('error', event.error || event.message, event.filename, event.lineno);
    });
    window.addEventListener('unhandledrejection', (event) => {
      report('promise', event.reason instanceof Error ? event.reason : { message: event.reason });
    });
  }

  function appVersion() {
    const meta = typeof document !== 'undefined' ? document.querySelector('meta[name="structra-version"]') : null;
    return meta ? meta.content : 'unknown';
  }

  function buildReport() {
    const state = Structra.state || {};
    const lines = [
      'Structra bug report',
      `Version: ${appVersion()}`,
      `Time: ${new Date().toISOString()}`,
      `Browser: ${typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'}`,
      `Window: ${typeof window.innerWidth === 'number' ? window.innerWidth + 'x' + window.innerHeight : 'unknown'}`,
      `View: ${state.activeView || 'none'}`,
      `Document open: ${state.jsonData === null || state.jsonData === undefined ? 'no' : 'yes (its content is not included)'}`,
      '',
      errors.length ? `Last ${errors.length} error${errors.length === 1 ? '' : 's'}:` : 'No errors recorded.',
    ];
    for (const entry of errors) {
      lines.push(`- ${entry.time} [${entry.kind}] ${entry.name ? entry.name + ': ' : ''}${entry.message}${entry.where ? ' (' + entry.where + ')' : ''}`);
      if (entry.stack) lines.push(...entry.stack.split('\n').map((line) => '    ' + line));
    }
    lines.push('', 'Steps to repeat the problem (please add): ');
    return lines.join('\n');
  }

  async function copyReport() {
    return Structra.sharedHelpers.copyToClipboard(buildReport(), 'Bug report copied. Paste it into your message.');
  }

  start();
  return { start, report, list: () => errors.slice(), buildReport, copyReport, cleanMessage, cleanAddress };
})();
