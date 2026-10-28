/* Charts, Graph, Minimap and Heatmap on documents that are awkward for drawing: a single value, all-null and all-equal columns, negative and
   enormous numbers, an empty list, many different text values, a very wide and a very deep document.
   For each: no page error, and nothing drawn carries NaN, Infinity or undefined (in text or in drawing attributes such as x, y, width, d).

   Run:  node tests/smoke/visual-edge.js          (PW_CHANNEL=msedge uses the installed Edge; PW_BROWSER=firefox or webkit) */
const { runAppTest } = require('../app-test');

const deep = (levels) => { let value = 'leaf'; for (let i = 0; i < levels; i++) value = { child: value }; return value; };
const DOCUMENTS = {
  'one record': [{ id: 1, value: 5 }],
  'all-null column': [{ id: 1, value: null }, { id: 2, value: null }, { id: 3, value: null }],
  'all values equal': Array.from({ length: 30 }, (_, i) => ({ id: i, value: 7 })),
  'negative numbers': Array.from({ length: 30 }, (_, i) => ({ id: i, value: -i * 1.5 - 1 })),
  'huge and tiny numbers': [{ value: 1e308 }, { value: -1e308 }, { value: 1e-308 }, { value: 0 }, { value: 123456789012345680000 }],
  'zero and negative zero': [{ value: 0 }, { value: -0 }, { value: 0 }],
  'many different texts': Array.from({ length: 500 }, (_, i) => ({ id: i, value: 'text ' + i })),
  'mixed types': [{ value: 1 }, { value: 'a' }, { value: true }, { value: null }, { value: [1] }, { value: { a: 1 } }],
  'empty and missing': [{}, { value: '' }, { other: 1 }],
  'a very wide record': [Object.fromEntries(Array.from({ length: 400 }, (_, i) => ['key' + i, i]))],
  'a deep document': { list: [deep(60)] },
  'a list of lists': [[1, 2, 3], [4, 5], []],
  'long text values': [{ value: 'x'.repeat(5000) }, { value: 'y'.repeat(5000) }],
};

runAppTest('visual-edge', async ({ page, fail, errors }) => {
  await page.locator('#canvasEmpty input[type=file]').setInputFiles({ name: 'start.json', mimeType: 'application/json', buffer: Buffer.from('[{"a":1}]') });
  await page.waitForFunction(() => !!Structra.state.jsonData, null, { timeout: 15000 });

  for (const [name, data] of Object.entries(DOCUMENTS)) {
    const before = errors.length;
    const report = await page.evaluate(async (data) => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const bad = /NaN|Infinity|undefined|\[object/;
      const found = [];
      // every attribute that carries a number, and all visible text, of what is drawn inside `root`
      const scan = (root, label) => {
        for (const element of root.querySelectorAll('svg *, svg')) {
          for (const attribute of element.attributes) {
            if (/^(x|y|x1|x2|y1|y2|cx|cy|r|rx|ry|width|height|d|points|transform|viewBox|stroke-dasharray)$/.test(attribute.name) && bad.test(attribute.value)) found.push(`${label}: ${element.tagName} ${attribute.name}="${attribute.value.slice(0, 60)}"`);
          }
        }
        const text = root.innerText || '';
        const hit = bad.exec(text);
        if (hit) found.push(`${label}: text contains "${hit[0]}" near "${text.slice(Math.max(0, hit.index - 20), hit.index + 20).replace(/\s+/g, ' ')}"`);
      };
      Structra.setState('jsonData', data);
      await wait(500);
      // Graph
      Structra.setState('activeView', 'graph');
      await wait(600);
      const graph = document.querySelector('structra-graph');
      if (graph) scan(graph, 'graph');
      // Minimap and Heatmap on the Tree
      Structra.setState('activeView', 'tree');
      await wait(500);
      Structra.events.emit('minimap:toggle');
      await wait(300);
      const minimap = document.querySelector('#minimapContainer');
      if (minimap) scan(minimap, 'minimap');
      Structra.events.emit('minimap:toggle');
      Structra.events.emit('heatmap:toggle');
      await wait(400);
      const tree = document.querySelector('structra-tree');
      if (tree) {
        const styled = [...tree.querySelectorAll('[style]')].map((element) => element.getAttribute('style')).filter((style) => bad.test(style));
        if (styled.length) found.push('heatmap: a style carries ' + styled[0].slice(0, 80));
        const indicator = document.querySelector('.heatmap-indicator');
        if (indicator) scan(indicator, 'heatmap legend');
      }
      Structra.events.emit('heatmap:toggle');
      await wait(200);
      // Charts, on every column of the first list
      Structra.events.emit('charts:open', {});
      await wait(400);
      const charts = document.querySelector('structra-charts');
      const columns = charts ? [...charts.querySelectorAll('#chColumn option')].map((option) => option.value).slice(0, 12) : [];
      for (const column of columns) {
        charts.querySelector('#chColumn').value = column;
        charts.querySelector('#chColumn').dispatchEvent(new Event('change', { bubbles: true }));
        await wait(80);
        scan(charts.querySelector('#chBody'), 'chart of ' + column);
      }
      Structra.events.emit('overlay:close');
      return found;
    }, data);
    for (const line of [...new Set(report)].slice(0, 5)) fail(`${name}: ${line}`);
    for (const message of [...new Set(errors.slice(before))]) fail(`${name}: page error: ${message}`);
  }
}, { viewport: { width: 1360, height: 900 } });
