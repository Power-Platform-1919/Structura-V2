/* The Schema view must read every record (not only the first), say which fields can be empty,
   and a click on a field must select it like a node in the Tree.

   Run:  node tests/smoke/schema.js          (PW_CHANNEL=msedge uses the installed Edge)
*/
const { runAppTest } = require('../app-test');
const { uploadAndWait } = require('../page-helpers');
const path = require('path');

runAppTest('schema', async ({ page, fail, ROOT }) => {
  await uploadAndWait(page, path.join(ROOT, 'tests', 'fixtures', 'sp_getitems.json'));
  await page.evaluate(() => Structra.setState('activeView', 'schema'));
  await page.waitForTimeout(600);

  const lines = await page.evaluate(() => [...document.querySelectorAll('structra-schema .s-line')].map((l) => l.textContent.replace(/\s+/g, ' ').trim()));
  const has = (text) => lines.some((l) => l.startsWith(text));
  if (!lines.length) fail('the Schema view drew nothing');
  if (!has('Department: string | null')) fail('Department should read "string | null" (HR in one record, null in another); got: ' + lines.find((l) => l.startsWith('Department')));
  if (!has('Picture: string | null')) fail('Picture should read "string | null"; got: ' + lines.find((l) => l.startsWith('Picture')));
  if (!has('Notes: string | null')) fail('Notes should read "string | null"; got: ' + lines.find((l) => l.startsWith('Notes')));
  if (!lines.some((l) => /^Title: string.*required/.test(l))) fail('Title is in every record, so it should be marked required');
  // The Schema view and the Schema Gen tab must tell the same story
  const gen = await page.evaluate(() => {
    const s = Structra.parseJsonSchemaGenerator.smart(Structra.state.jsonData, { integers: true, required: true });
    return s.properties.value.items.properties.Requester.properties.Department.type;
  });
  if (JSON.stringify(gen) !== JSON.stringify(['string', 'null'])) fail('Schema Gen disagrees about Department: ' + JSON.stringify(gen));

  // A click selects the field
  await page.locator('structra-schema .s-line', { hasText: 'Email:' }).first().click();
  await page.waitForTimeout(300);
  const path1 = await page.evaluate(() => Structra.state.currentPath);
  if (path1 !== '$.value[0].Requester.Email') fail('clicking Email selected "' + path1 + '"');
}, { viewport: { width: 1360, height: 800 } });
