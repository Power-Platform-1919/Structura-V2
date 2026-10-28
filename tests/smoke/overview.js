/* The Overview: advice on findings, no pointless charts for IDs and time stamps, honest "has a value" figures,
   and a page that can be scrolled with the keyboard.

   Run:  node tests/smoke/overview.js          (PW_CHANNEL=msedge uses the installed Edge)
*/
const { runAppTest } = require('../app-test');
const { uploadAndWait } = require('../page-helpers');
const path = require('path');

runAppTest('overview', async ({ page, fail, ROOT }) => {
  await uploadAndWait(page, path.join(ROOT, 'tests', 'fixtures', 'sp_getitems.json'));
  await page.evaluate(() => Structra.setState('activeView', 'overview'));
  await page.waitForTimeout(600);

  const o = await page.evaluate(() => ({
    findings: [...document.querySelectorAll('.ovw-find')].map((f) => f.textContent.replace(/\s+/g, ' ').trim()),
    distribution: [...document.querySelectorAll('.dist-card-title')].map((t) => t.textContent.replace(/\s+(numeric|categorical)\s*$/, '').trim()),
    coverageHeaders: [...document.querySelectorAll('.cov-table th')].map((t) => t.textContent.trim()),
    notes: (() => { const r = [...document.querySelectorAll('.cov-table tbody tr')].find((tr) => tr.querySelector('.cov-key')?.textContent.trim().startsWith('Notes')); return r ? [...r.querySelectorAll('td')].map((c) => c.textContent.trim()) : null; })(),
    region: (() => { const el = document.querySelector('structra-overview .stats-view'); return { tabindex: el.getAttribute('tabindex'), role: el.getAttribute('role') }; })(),
    headline: (() => { const h = document.querySelector('.ovw-headline'); return { width: h.getBoundingClientRect().width, lines: Math.round(h.getBoundingClientRect().height / parseFloat(getComputedStyle(h).lineHeight)) }; })(),
  }));

  if (!o.findings.some((f) => /coalesce\(/.test(f))) fail('findings about empty values give no advice on what to do: ' + o.findings.join(' | ').slice(0, 300));
  const noisy = o.distribution.filter((d) => /^(@|ItemInternalId|ID$|Created|Modified)/i.test(d));
  if (noisy.length) fail('distribution charts for identifiers or time stamps: ' + noisy.join(', '));
  if (!o.coverageHeaders.includes('Has a value')) fail('the coverage column should be called "Has a value": ' + o.coverageHeaders.join(', '));
  if (o.notes && o.notes[o.notes.length - 2] === '100%') fail('Notes is empty in 2 of 3 rows but shows 100% coverage: ' + o.notes.join(' | '));
  if (o.region.tabindex !== '0') fail('the Overview cannot be reached with the keyboard (no tabindex)');
  if (o.headline.lines > 2) fail('the headline is wrapped onto ' + o.headline.lines + ' lines');

  // Keyboard scrolling once the page is focused
  await page.locator('structra-overview .stats-view').focus();
  await page.waitForFunction(() => { const v = document.querySelector('structra-overview .stats-view'); return v && v.scrollHeight > v.clientHeight; }, null, { timeout: 5000 }).catch(() => {});
  let scrolled = 0;
  for (let attempt = 0; attempt < 3 && scrolled <= 0; attempt++) {   // a busy machine can swallow the first key press
    await page.locator('structra-overview .stats-view').focus();
    await page.keyboard.press('PageDown');
    await page.waitForTimeout(400);
    scrolled = await page.evaluate(() => document.querySelector('structra-overview .stats-view').scrollTop);
  }
  if (scrolled <= 0) fail('Page Down does not scroll the Overview');
}, { viewport: { width: 1360, height: 760 } });
