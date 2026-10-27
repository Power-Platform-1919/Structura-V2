/* Accessibility rules from axe-core (the engine behind most accessibility checkers): names, roles, contrast, labels, landmarks,
   keyboard traps and more, a few hundred rules, checked on every view, in light and dark themes, and with the Find bar open.

   04-a11y-relevance.js is our own small check; this one is the mature engine, so it finds what we did not think to look for.
   Reports only (like the other audits): read the findings, fix, and add a real test in tests/smoke.
   Run:  PW_CHANNEL=msedge node tests/ui/06-axe.js */
const { AxeBuilder } = require('@axe-core/playwright');
const { newPage, open, view, main } = require('./helpers');

const SEVERITY = { critical: 'high', serious: 'high', moderate: 'medium', minor: 'low' };
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'];

async function check(page, rep, label) {
  const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  for (const violation of result.violations) {
    const first = violation.nodes[0];
    const where = first && first.target ? String(first.target[0]).slice(0, 90) : '';
    rep.add('axe', SEVERITY[violation.impact] || 'low', `${violation.id}: ${violation.help} (${violation.nodes.length} element${violation.nodes.length === 1 ? '' : 's'}) in ${label}`, where);
  }
}

main('06-axe', async ({ browser, base, rep }) => {
  for (const [mode, theme] of [['light', 'structra-light'], ['dark', 'structra-dark']]) {
    const page = await newPage(browser, { mode, theme });
    await open(page, base);
    for (const name of ['overview', 'tree', 'table', 'graph', 'schema', 'editor']) {
      await view(page, name);
      await check(page, rep, name + ' (' + mode + ')');
    }
    await view(page, 'tree');
    await page.evaluate(() => Structra.setState('findBarOpen', true));
    await page.waitForTimeout(300);
    await check(page, rep, 'tree with the Find bar open (' + mode + ')');
    await page.context().close();
  }
});
