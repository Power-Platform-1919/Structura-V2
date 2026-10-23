/* Names, focus and relevance: every control has an accessible name, keyboard focus is visible and reaches the
   important controls, ids are unique, and the same job is not offered in several places under different names.
*/
const { newPage, open, view, shot, inject, main } = require('./helpers');

main('04-a11y-relevance', async ({ browser, base, rep }) => {
  const page = await newPage(browser);
  await open(page, base);
  await inject(page);
  for (const v of ['overview', 'tree', 'table', 'graph', 'schema', 'editor']) {
    await view(page, v);
    const r = await page.evaluate(() => {
      const U = window.__ui;
      const nameOf = (e) => (e.getAttribute('aria-label') || e.getAttribute('aria-labelledby') && document.getElementById(e.getAttribute('aria-labelledby'))?.textContent || e.title || e.textContent || e.placeholder || (e.labels && e.labels[0] && e.labels[0].textContent) || '').trim();
      const controls = [...document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role="button"], [role="tab"]')].filter((e) => U.visible(e) && !e.closest('.ov:not(.show), .io-overlay:not(.show), [hidden]'));
      const unnamed = controls.filter((e) => !nameOf(e)).map((e) => U.where(e));
      const ids = {};
      document.querySelectorAll('[id]').forEach((e) => { ids[e.id] = (ids[e.id] || 0) + 1; });
      const dupIds = Object.keys(ids).filter((k) => ids[k] > 1);
      const imgNoAlt = [...document.querySelectorAll('img:not([alt])')].map((e) => U.where(e));
      return { unnamed, dupIds, imgNoAlt, lang: document.documentElement.lang, title: document.title, landmarks: ['main', 'nav', 'header', 'footer'].map((t) => document.querySelectorAll(t + ', [role="' + { main: 'main', nav: 'navigation', header: 'banner', footer: 'contentinfo' }[t] + '"]').length) };
    });
    for (const u of [...new Set(r.unnamed)].slice(0, 6)) rep.add('a11y-name', 'medium', `a control has no accessible name in ${v}: ${u}`, v);
    for (const d of r.dupIds) rep.add('a11y-id', 'medium', `the id "${d}" is used more than once in ${v}`, v);
    for (const i of r.imgNoAlt) rep.add('a11y-img', 'low', `an image has no alt text: ${i}`, v);
    if (v === 'tree') {
      if (!r.lang) rep.add('a11y-page', 'low', 'the page has no lang attribute', 'html');
      if (!r.title || r.title.length < 3) rep.add('a11y-page', 'low', 'the page has no useful title', 'title');
      if (!r.landmarks[0]) rep.add('a11y-page', 'low', 'the page has no main landmark', 'main');
    }
  }

  // Keyboard: Tab through the first 40 stops. Is focus ever invisible? Does it get stuck?
  await view(page, 'tree');
  await page.evaluate(() => { document.activeElement && document.activeElement.blur(); });
  const stops = [];
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    const s = await page.evaluate(() => {
      const e = document.activeElement;
      if (!e || e === document.body) return null;
      const st = getComputedStyle(e);
      const outline = st.outlineStyle !== 'none' && parseFloat(st.outlineWidth) > 0;
      // A ring on the wrapper (a path bar around its input) counts
      const par = e.parentElement && e.parentElement.matches(':focus-within') ? getComputedStyle(e.parentElement) : null;
      const shadow = st.boxShadow !== 'none' || (!!par && (par.boxShadow !== 'none' || (par.outlineStyle !== 'none' && parseFloat(par.outlineWidth) > 0)));
      const b = e.getBoundingClientRect();
      return { where: window.__ui.where(e), ring: outline || shadow, name: (e.getAttribute('aria-label') || e.title || e.textContent || '').trim().slice(0, 24), inView: b.bottom > 0 && b.top < innerHeight && b.right > 0 && b.left < innerWidth };
    });
    if (s) stops.push(s);
  }
  const noRing = stops.filter((s) => !s.ring);
  for (const s of noRing.slice(0, 5)) rep.add('focus', 'medium', `keyboard focus is not visible on "${s.name}"`, s.where);
  const hidden = stops.filter((s) => !s.inView);
  for (const s of hidden.slice(0, 3)) rep.add('focus', 'low', `keyboard focus moves to something off screen: "${s.name}"`, s.where);
  if (new Set(stops.map((s) => s.where)).size < 12) rep.add('focus', 'medium', `Tab reaches only ${new Set(stops.map((s) => s.where)).size} different controls in 40 presses`, 'tab order');
  await shot(page, 'a11y-focus');

  // Relevance: the same job offered in more than one place
  const dup = await page.evaluate(() => {
    const labels = (sel) => [...document.querySelectorAll(sel)].filter((e) => window.__ui.visible(e)).map((e) => (e.getAttribute('aria-label') || e.title || e.textContent).trim());
    return { theme: labels('structra-header [data-action="appearance"], structra-header [data-action="toggle-theme"], [data-rail="settings"]'), overview: labels('.view-tab, [data-rail="overview"], structra-drawer .btn').filter((l) => /overview/i.test(l)), railSettings: (document.querySelector('[data-rail="settings"]') || {}).textContent };
  });
  if (dup.theme.length >= 3) rep.add('relevance', 'low', `three controls change the look in the header and rail: ${dup.theme.join(' | ')}`, 'structra-header, structra-rail');
  if (dup.overview.length >= 3) rep.add('relevance', 'low', `Overview is offered in ${dup.overview.length} places: ${dup.overview.join(' | ')}`, 'view tabs, rail, drawer');
  if (/theme/i.test(dup.railSettings || '')) rep.add('relevance', 'medium', `the rail's settings button is still labelled "${(dup.railSettings || '').trim()}" though it opens Settings`, 'structra-rail');
  await page.context().close();
});
