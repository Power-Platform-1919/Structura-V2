/* Components clean up after themselves: an element taken off the page stops listening to the event bus and to the document, and listens
   again, once, when it is added back. Checked with a small test element and with the real zoom and input panel elements.

   Run:  node tests/smoke/component-cleanup.js          (PW_CHANNEL=msedge uses the installed Edge; PW_BROWSER=firefox or webkit) */
const { runAppTest } = require('../app-test');

runAppTest('component-cleanup', async ({ page, fail }) => {
  // a test element: bus events and a document listener are counted while it is on the page, off the page, and back on it (twice)
  const counts = await page.evaluate(() => {
    window.__bus = 0; window.__keys = 0;
    class CleanupProbe extends StructraComponent {
      init() { this.on('probe:ping', () => { window.__bus++; }); this._bindKeys(); }
      listenersReturned() { this._bindKeys(); }
      _bindKeys() { document.addEventListener('probe-key', () => { window.__keys++; }, { signal: this.listenerSignal }); }
    }
    customElements.define('cleanup-probe', CleanupProbe);
    const probe = document.createElement('cleanup-probe');
    const ping = () => { Structra.events.emit('probe:ping'); document.dispatchEvent(new Event('probe-key')); return [window.__bus, window.__keys]; };
    const steps = {};
    document.body.appendChild(probe);
    steps.onPage = ping();
    probe.remove();
    steps.removed = ping();
    document.body.appendChild(probe);
    steps.added = ping();
    probe.remove(); document.body.appendChild(probe);
    steps.addedAgain = ping();
    probe.remove();
    steps.gone = ping();
    return steps;
  });
  const expected = { onPage: [1, 1], removed: [1, 1], added: [2, 2], addedAgain: [3, 3], gone: [3, 3] };
  for (const step of Object.keys(expected)) {
    if (counts[step].join() !== expected[step].join()) fail(`${step}: bus and document handled ${counts[step].join(' and ')} times, expected ${expected[step].join(' and ')}`);
  }

  // the real zoom element: Ctrl+= makes the text one step larger, once, also after it was taken off the page and put back
  const zoom = await page.evaluate(() => {
    const element = document.querySelector('structra-zoom');
    const size = () => element._size;
    const press = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: '=', ctrlKey: true, bubbles: true }));
    const parent = element.parentNode;
    const out = {};
    const start = size();
    press(); out.first = size() - start;
    element.remove(); press(); out.whileRemoved = size() - start - out.first;
    parent.appendChild(element);
    const before = size(); press(); out.afterReturn = size() - before;
    return out;
  });
  if (zoom.first !== 1) fail('Ctrl+= should make the text one step larger: ' + JSON.stringify(zoom));
  if (zoom.whileRemoved !== 0) fail('a removed zoom element should not answer to Ctrl+=: ' + JSON.stringify(zoom));
  if (zoom.afterReturn !== 1) fail('a zoom element put back should answer once: ' + JSON.stringify(zoom));
}, { viewport: { width: 1360, height: 900 } });
