/* Layout and positions: at desktop, laptop, tablet and phone sizes, in every view, look for
   page-level horizontal scroll, controls pushed off screen, controls too small to hit, regions that overlap,
   text cut off without an ellipsis, and a drawer or panel that leaves too little room for the data.
*/
const { newPage, open, view, shot, inject, VIEWS, main } = require('./helpers');

const SIZES = [
  { name: 'desktop', width: 1920, height: 1080 },
  { name: 'laptop', width: 1366, height: 700 },
  { name: 'tablet', width: 820, height: 1000 },
  { name: 'phone', width: 390, height: 800 },
];

main('02-layout', async ({ browser, base, rep }) => {
  for (const size of SIZES) {
    const page = await newPage(browser, size);
    await open(page, base);
    await inject(page);
    for (const v of VIEWS) {
      await view(page, v);
      await shot(page, `layout-${size.name}-${v}`);
      const r = await page.evaluate(() => {
        const U = window.__ui;
        const out = { overflowX: document.documentElement.scrollWidth - innerWidth, offscreen: [], tiny: [], clipped: [], canvas: null };
        const interactive = [...document.querySelectorAll('button, a[href], input, select, textarea, [role="button"], [role="tab"]')].filter((e) => U.visible(e) && !e.closest('.ov:not(.show), .io-overlay:not(.show), [hidden]') && !e.matches('.CodeMirror textarea'));   // CodeMirror's hidden typing helper is not a control to tap
        for (const e of interactive) {
          const b = e.getBoundingClientRect();
          // A control inside a row that scrolls sideways is reachable, not cut off
          const scrollsSideways = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if ((o === 'auto' || o === 'scroll') && p.scrollWidth > p.clientWidth) return true; } return false; };
          if ((b.right > innerWidth + 1 || b.left < -1) && !scrollsSideways(e)) out.offscreen.push(U.where(e) + ' "' + (e.getAttribute('aria-label') || e.textContent || e.title || '').trim().slice(0, 20) + '"');
          if ((b.width < 24 || b.height < 24) && !e.closest('.j-line, .table-pager, td, th, .doc-tab-scroll, svg') && e.type !== 'checkbox' && e.type !== 'radio' && e.type !== 'hidden') out.tiny.push(U.where(e) + ' ' + Math.round(b.width) + 'x' + Math.round(b.height));
        }
        for (const e of document.querySelectorAll('button, .view-tab, .rail-label, .tab, .btn')) {
          if (!U.visible(e)) continue;
          const s = getComputedStyle(e);
          if (e.scrollWidth > e.clientWidth + 2 && s.textOverflow !== 'ellipsis' && s.overflow !== 'visible') out.clipped.push(U.where(e) + ' "' + e.textContent.trim().slice(0, 20) + '"');
        }
        const c = document.querySelector('#canvas .view-panel.active, #canvas structra-' + Structra.state.activeView);
        const cv = document.querySelector('#canvas');
        if (cv) { const b = cv.getBoundingClientRect(); out.canvas = { w: Math.round(b.width), h: Math.round(b.height) }; }
        const dr = document.querySelector('structra-drawer');
        out.drawerH = dr ? Math.round(dr.getBoundingClientRect().height) : 0;
        return out;
      });
      const at = `${size.name} ${size.width}x${size.height} / ${v}`;
      if (r.overflowX > 1) rep.add('overflow', 'high', `the page scrolls sideways by ${r.overflowX}px at ${at}`, v);
      for (const o of [...new Set(r.offscreen)].slice(0, 5)) rep.add('offscreen', 'medium', `a control is cut off at ${at}: ${o}`, v);
      for (const o of [...new Set(r.tiny)].slice(0, 4)) rep.add('tap-target', 'low', `a control is smaller than 24px at ${at}: ${o}`, v);
      for (const o of [...new Set(r.clipped)].slice(0, 4)) rep.add('clipped-text', 'medium', `text is cut off with no ellipsis at ${at}: ${o}`, v);
      if (r.canvas && r.canvas.h < 260 && v !== 'overview') rep.add('room', 'medium', `the data area is only ${r.canvas.h}px tall at ${at} (drawer ${r.drawerH}px)`, v);
      if (r.canvas && r.canvas.w < 300 && size.name !== 'phone') rep.add('room', 'medium', `the data area is only ${r.canvas.w}px wide at ${at}`, v);
    }
    for (const e of [...new Set(page.errors)]) rep.add('errors', 'high', `${size.name}: ${e}`, 'layout');
    await page.context().close();
  }
});
