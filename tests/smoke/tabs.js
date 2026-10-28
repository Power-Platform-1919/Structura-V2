/* Opens three documents in three tabs, switches and closes tabs, and checks that everything the user sees
   (Overview headline, Analyze numbers, engine dataset) belongs to the tab that is showing.

   Run:  node tests/smoke/tabs.js          (PW_CHANNEL=msedge uses the installed Edge)
*/
const path = require('path');
const { runAppTest, ROOT } = require('../app-test');
const { uploadAndWait } = require('../page-helpers');

const FIXTURES = path.join(ROOT, 'tests', 'fixtures');
// Three documents with different shapes, so a mix-up cannot go unnoticed
const DOCS = ['jsonobject.json', 'test8_toplevel_array.json', 'edge_odata.json'];

/** What the page shows right now, and what the engine thinks is open */
const snapshot = (page) => page.evaluate(async () => {
  const ds = Structra.dataEngine.getActive();
  const analysis = await Structra.dataEngine.getAnalysis();
  const nodes = (n) => (n && n.stats ? (n.stats.totalNodes ?? n.stats.nodes ?? n.stats.total) : null);
  return {
    tabId: Structra.tabs.activeId,
    engineId: ds ? ds.id : null,
    engineRaw: ds ? JSON.stringify(ds.raw) : null,
    stateData: JSON.stringify(Structra.state.jsonData),
    analysisNodes: nodes(analysis),
    headline: (document.querySelector('.ovw-headline') || {}).textContent || null,
    shownNodes: (document.querySelector('.ds-mini-val') || {}).textContent || null,
  };
});

runAppTest('tabs', async ({ page, fail }) => {
  const check = (label, s, doc) => {
  // What is drawn must match what was drawn when that file was first opened
    if (doc && doc.headline != null && s.headline !== doc.headline) fail(`${label}: Overview says "${s.headline}" but this file's overview is "${doc.headline}"`);
    if (doc && doc.shownNodes != null && s.shownNodes !== doc.shownNodes) fail(`${label}: Analyze shows ${s.shownNodes} nodes but this file has ${doc.shownNodes}`);
    if (s.engineId !== s.tabId) fail(`${label}: engine is on tab ${s.engineId} but tab ${s.tabId} is showing`);
    if (s.engineRaw !== s.stateData) fail(`${label}: the engine holds a different document than the one shown`);
    if (doc && doc.analysisNodes != null && s.analysisNodes !== doc.analysisNodes) fail(`${label}: analysis says ${s.analysisNodes} nodes, the document has ${doc.analysisNodes}`);
  };



  const open = async (file, first) => {
    if (!first) await page.evaluate(() => Structra.events.emit('tabs:add'));
    await uploadAndWait(page, path.join(FIXTURES, file));
  };

  const known = [];
  for (let i = 0; i < DOCS.length; i++) {
    await open(DOCS[i], i === 0);
    const s = await snapshot(page);
    known.push({ file: DOCS[i], id: s.tabId, analysisNodes: s.analysisNodes, stateData: s.stateData, headline: s.headline, shownNodes: s.shownNodes });
    check(`opened ${DOCS[i]}`, s, null);
  }

  // Switch in a different order than the tabs were made, twice
  for (const i of [0, 2, 1, 0, 2]) {
    await page.evaluate((id) => document.querySelector(`.doc-tab[data-id="${id}"]`).click(), known[i].id);
    await page.waitForTimeout(900);
    const s = await snapshot(page);
    check(`switched to ${known[i].file}`, s, known[i]);
    if (s.stateData !== known[i].stateData) fail(`switched to ${known[i].file}: the document on screen is not that file`);
  }

  // Close the tab in the middle and the active one, then check what is left
  await page.evaluate((id) => document.querySelector(`.doc-tab[data-id="${id}"] .tab-close`).click(), known[1].id);
  await page.waitForTimeout(900);
  let s = await snapshot(page);
  const left = known.filter((k) => k.id !== known[1].id);
  const now = left.find((k) => k.id === s.tabId);
  if (!now) fail('after closing a tab, the active tab is not one that is still open');
  else { check('after closing the middle tab', s, now); if (s.stateData !== now.stateData) fail('after closing the middle tab, the document on screen is not that tab\'s file'); }

  // Open the closed file again in a new tab: it must get its own dataset
  await open(DOCS[1], false);
  s = await snapshot(page);
  check('reopened ' + DOCS[1], s, null);
  if (s.stateData !== known[1].stateData) fail('reopened file shows different data than before');
});
