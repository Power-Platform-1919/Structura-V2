/* Random clicking, the way someone who does not know the app would use it: on each step pick any visible control
   (buttons, tabs, menu items, chips, rows), click it, sometimes type something, sometimes press Escape or a shortcut.
   Seeded, so a run can be repeated:  SEED=7 STEPS=250 node tests/ui/05-monkey.js

   Findings: uncaught errors and console errors (with the last clicks that led to them), a dialog or panel that
   cannot be closed with Escape, the page stuck behind an overlay, a click that blanks the whole canvas,
   and horizontal page scroll that appears after a click.
*/
const { newPage, open, shot, inject, main } = require('./helpers');

const FIXTURES = ['sp_getitems.json', 'test8_toplevel_array.json', 'edge_odata.json', 'test5_empties.json', 'edge_deep_nest.json'];
const TEXTS = ['bob', 'a', '$.value[0]', '(', 'SELECT * FROM data', '[*]', '   ', '😀', 'x'.repeat(300), '{"a":1}'];

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

main('05-monkey', async ({ browser, base, rep }) => {
  const seed = Number(process.env.SEED || 1);
  const steps = Number(process.env.STEPS || 160);
  for (const fx of FIXTURES) {
    const rnd = rng(seed + fx.length);
    const page = await newPage(browser);
    await open(page, base, fx);
    await inject(page);
    const trail = [];
    const errAt = () => page.errors.length;
    for (let i = 0; i < steps; i++) {
      const before = errAt();
      // Pick something visible and clickable
      const targets = await page.evaluate(() => {
        const U = window.__ui;
        const sel = 'button, [role="tab"], [role="button"], [role="menuitem"], .view-tab, .rail-btn, .pivot-chip, .nf-item, .qp-result, .io-recent-item, .th-card, .j-key, .j-str, .j-num, th[data-col], .doc-tab, .cmd-item, .col-ctx-item, a[href]';
        return [...document.querySelectorAll(sel)].filter((e) => U.visible(e) && !e.disabled && !e.closest('.ov:not(.show), .io-overlay:not(.show), [hidden]')).map((e, k) => ({ k, label: (e.getAttribute('aria-label') || e.textContent || e.className || '').trim().slice(0, 30), where: U.where(e) }));
      });
      if (!targets.length) { rep.add('stuck', 'high', `no visible control to click after: ${trail.slice(-3).join(' > ')}`, fx); break; }
      const pick = targets[Math.floor(rnd() * targets.length)];
      const action = rnd();
      trail.push(pick.label || pick.where);
      try {
        if (action < 0.82) {
          await page.evaluate((k) => {
            const U = window.__ui;
            const sel = 'button, [role="tab"], [role="button"], [role="menuitem"], .view-tab, .rail-btn, .pivot-chip, .nf-item, .qp-result, .io-recent-item, .th-card, .j-key, .j-str, .j-num, th[data-col], .doc-tab, .cmd-item, .col-ctx-item, a[href]';
            const els = [...document.querySelectorAll(sel)].filter((e) => U.visible(e) && !e.disabled && !e.closest('.ov:not(.show), .io-overlay:not(.show), [hidden]'));
            const e = els[k];
            if (e) e.scrollIntoView({ block: 'nearest' });
          }, pick.k);
          const box = await page.evaluate((k) => {
            const U = window.__ui;
            const sel = 'button, [role="tab"], [role="button"], [role="menuitem"], .view-tab, .rail-btn, .pivot-chip, .nf-item, .qp-result, .io-recent-item, .th-card, .j-key, .j-str, .j-num, th[data-col], .doc-tab, .cmd-item, .col-ctx-item, a[href]';
            const els = [...document.querySelectorAll(sel)].filter((e) => U.visible(e) && !e.disabled && !e.closest('.ov:not(.show), .io-overlay:not(.show), [hidden]'));
            const r = els[k] && els[k].getBoundingClientRect();
            return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
          }, pick.k);
          if (box) await page.mouse.click(box.x, box.y, { button: rnd() < 0.1 ? 'right' : 'left' });
        } else if (action < 0.9) {
          // type into whatever input is focused or the first visible text input
          const text = TEXTS[Math.floor(rnd() * TEXTS.length)];
          const input = page.locator('input[type=text]:visible, textarea:visible').nth(Math.floor(rnd() * 3));
          if (await input.count()) { await input.fill(text, { timeout: 800 }); await page.keyboard.press('Enter'); trail.push('typed ' + text.slice(0, 10)); }
        } else if (action < 0.96) {
          await page.keyboard.press('Escape');
        } else {
          const keys = ['Control+f', 'Control+k', 'Control+z', 'Control+b', 'Control+e', 'Control+1', 'Control+2', 'Control+3', 'Control+d', '?'];
          const k = keys[Math.floor(rnd() * keys.length)];
          await page.keyboard.press(k); trail.push(k);
        }
      } catch (e) { /* the control moved or went away: that is normal while clicking around */ }
      await page.waitForTimeout(120);

      if (errAt() > before) {
        for (const e of page.errors.slice(before)) rep.add('error', 'high', `${e}  after: ${trail.slice(-4).join(' > ')}`, fx);
      }
      // Health checks every few steps
      if (i % 5 === 4) {
        const h = await page.evaluate(() => ({
          sideways: document.documentElement.scrollWidth - innerWidth,
          canvasBlank: (() => { const c = document.querySelector('#canvas'); return !!c && c.getBoundingClientRect().height > 100 && c.innerText.trim().length < 3 && !document.querySelector('.ov.show, .io-overlay.show') && !!Structra.state.jsonData; })(),
          modals: document.querySelectorAll('.ov.show, .io-overlay.show').length,
        }));
        if (h.sideways > 1) rep.add('layout', 'medium', `the page scrolls sideways (${h.sideways}px) after: ${trail.slice(-3).join(' > ')}`, fx);
        if (h.canvasBlank) { rep.add('blank', 'high', `the canvas is empty after: ${trail.slice(-3).join(' > ')}`, fx); await shot(page, `monkey-blank-${fx}-${i}`); }
        if (h.modals) {
          await page.keyboard.press('Escape'); await page.waitForTimeout(250);
          const still = await page.evaluate(() => document.querySelectorAll('.ov.show, .io-overlay.show').length);
          if (still && !(await page.evaluate(() => !Structra.state.jsonData))) rep.add('modal', 'medium', `a dialog does not close with Escape after: ${trail.slice(-3).join(' > ')}`, fx);
        }
      }
    }
    console.log(`${fx}: ${trail.length} actions, ${new Set(trail).size} different controls, ended in view ${await page.evaluate(() => Structra.state.activeView)}, ${await page.evaluate(() => Structra.tabs.list.length)} tab(s)`);
    await shot(page, `monkey-end-${fx}`);
    await page.context().close();
  }
  // Collapse repeats
  const seen = new Set();
  rep.list.splice(0, rep.list.length, ...rep.list.filter((f) => { const k = f.area + f.what.split('  after:')[0]; if (seen.has(k)) return false; seen.add(k); return true; }));
});
