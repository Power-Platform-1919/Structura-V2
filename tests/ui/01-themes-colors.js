/* Colours and themes: for every built-in theme and each view, check that text can be read (WCAG contrast against
   what is really behind it), that panels can be told apart, and keep a screenshot of each to look at.

   Findings: text under 4.5:1 (3:1 for large text), panels whose edge is nearly invisible, disabled controls that vanish.
*/
const { newPage, open, view, shot, inject, main } = require('./helpers');

main('01-themes-colors', async ({ browser, base, rep }) => {
  const page = await newPage(browser);
  await open(page, base);
  await inject(page);
  // The SQL editor lives in the Query panel: open it in SQL mode with text that has every kind of colour in it
  const sqlView = async (pg) => {
    await view(pg, 'tree');
    await pg.evaluate(() => Structra.set('queryPanelOpen', true));
    await pg.locator('.seg-btn[data-mode="sql"]').click();
    await pg.waitForSelector('#sqlColumns .qp-sql-col', { state: 'attached', timeout: 60000 });
    await pg.evaluate(() => {
      const text = ['-- how many open items', "SELECT COUNT(*) AS n, 'text' AS label, 42 AS num", 'FROM data WHERE amount > 1.5 AND name = "x"'].join('\n');
      document.querySelector('.qp-sql-host').codeView.replaceAll(text);
    });
    await pg.waitForTimeout(300);
  };
  const themes = await page.evaluate(() => Structra.theme.list().map((t) => ({ id: t.id, name: t.name })));
  for (const t of themes) {
    await page.evaluate((id) => Structra.theme.use(id), t.id);
    for (const v of ['overview', 'tree', 'table', 'editor', 'sql']) {
      if (v === 'sql') await sqlView(page); else await view(page, v);
      await shot(page, `theme-${t.id}-${v}`);
      const low = await page.evaluate(() => window.__ui.textContrast().filter((x) => x.ratio < (x.large ? 3 : 4.5) && !x.disabled));
      const seen = new Set();
      for (const x of low) {
        const key = x.where + '|' + x.text;
        if (seen.has(key)) continue;
        seen.add(key);
        rep.add('contrast', x.ratio < 3 ? 'high' : 'medium', `${t.name} / ${v}: "${x.text}" is ${x.ratio.toFixed(2)}:1 (${x.size}px)`, x.where);
        if (seen.size >= 8) break;
      }
    }
    // Panels must be told apart: the side panel, the canvas, the header and the drawer
    const edges = await page.evaluate(() => {
      const pick = (sel) => { const e = document.querySelector(sel); return e ? { sel, bg: window.__ui.rgba(getComputedStyle(e).backgroundColor), border: getComputedStyle(e).borderTopColor, bw: parseFloat(getComputedStyle(e).borderTopWidth) + parseFloat(getComputedStyle(e).borderLeftWidth) } : null; };
      return ['#canvas', '.app-sidebar', 'structra-rail', 'structra-drawer', 'structra-header'].map(pick).filter(Boolean).map((p) => ({ ...p, ratioToBody: window.__ui.ratio(p.bg.slice(0, 3), window.__ui.rgba(getComputedStyle(document.body).backgroundColor).slice(0, 3)) }));
    });
    for (const e of edges) if (e.ratioToBody < 1.06 && e.bw === 0) rep.add('panel-edge', 'low', `${t.name}: ${e.sel} is almost the same colour as the page (${e.ratioToBody.toFixed(2)}:1) and has no border`, e.sel);
  }
  await page.context().close();
});
