/* YAML files as people really have them, opened through the real file path (worker, notes, toast):
     - a Kubernetes file with several documents (---) opens as a list, and the person is told,
     - a CloudFormation file with tags (!Ref, !Sub, !GetAtt) opens with its values, and the person is told,
     - a Docker Compose file with the << merge key opens merged,
     - a broken file says where,
     - Convert to YAML writes text that reads back to the same data.

   Run:  node tests/smoke/yaml.js          (PW_CHANNEL=msedge uses the installed Edge; PW_BROWSER=firefox or webkit) */
const http = require('http');
const fs = require('fs');
const path = require('path');

let chromium;
try { ({ chromium } = require('playwright')); } catch {
  console.error('Playwright is not installed. Run: npm install --save-dev playwright && npx playwright install chromium');
  process.exit(2);
}

const { launchBrowser } = require('../launch-browser');
const { uploadAndWait } = require('../page-helpers');
const ROOT = path.join(__dirname, '..', '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' };

function serve() {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const file = path.join(ROOT, url === '/' ? 'index.html' : url);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const KUBERNETES = 'apiVersion: v1\nkind: Service\nmetadata:\n  name: web\n---\napiVersion: apps/v1\nkind: Deployment\nspec:\n  replicas: 2\n---\nkind: Ingress\n';
const CLOUDFORMATION = 'Resources:\n  Bucket:\n    Type: AWS::S3::Bucket\n    Properties:\n      BucketName: !Sub "${Env}-data"\n  Policy:\n    Properties:\n      Bucket: !Ref Bucket\n      Arn: !GetAtt Role.Arn\n';
const COMPOSE = 'x-base: &base\n  image: node\n  restart: always\nservices:\n  web:\n    <<: *base\n    ports: ["80:80"]\n';

(async () => {
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}/index.html`;
  const browser = await launchBrowser(chromium);
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('structra.welcomeSeen', '1'); } catch { /* storage blocked */ } });
  const page = await ctx.newPage();
  const failures = [];
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
  const fail = (message) => failures.push(message);
  const toastText = () => page.evaluate(() => (document.querySelector('structra-toast') || {}).textContent || '');
  const open = async (name, text) => {
    await uploadAndWait(page, { name, mimeType: 'text/yaml', buffer: Buffer.from(text) });
    await page.waitForTimeout(300);
  };

  try {
    await page.goto(base);
    await page.waitForSelector('#canvasEmpty input[type=file]', { state: 'attached', timeout: 10000 });
    await page.keyboard.press('Escape');

    await open('cluster.yaml', KUBERNETES);
    const documents = await page.evaluate(() => Structra.state.jsonData);
    if (!Array.isArray(documents) || documents.length !== 3 || documents.map((d) => d.kind).join() !== 'Service,Deployment,Ingress') fail('a file with 3 documents should open as a list of 3: ' + JSON.stringify(documents).slice(0, 120));
    if (!/3 YAML documents/.test(await toastText())) fail('the person should be told about the 3 documents: ' + (await toastText()).slice(0, 160));

    await open('template.yaml', CLOUDFORMATION);
    const stack = await page.evaluate(() => Structra.state.jsonData);
    if (!stack || stack.Resources.Policy.Properties.Bucket !== 'Bucket' || stack.Resources.Policy.Properties.Arn !== 'Role.Arn' || stack.Resources.Bucket.Properties.BucketName !== '${Env}-data') fail('tags should keep their values: ' + JSON.stringify(stack).slice(0, 200));
    if (!/Tags such as !Ref/.test(await toastText())) fail('the person should be told the tags were left out: ' + (await toastText()).slice(0, 160));

    await open('compose.yaml', COMPOSE);
    const compose = await page.evaluate(() => Structra.state.jsonData);
    if (!compose || JSON.stringify(compose.services.web) !== JSON.stringify({ image: 'node', restart: 'always', ports: ['80:80'] })) fail('the << merge should copy the base in: ' + JSON.stringify(compose).slice(0, 200));

    // Convert to YAML and read it back
    const roundTrip = await page.evaluate(async () => {
      const data = Structra.state.jsonData;
      const text = await Structra.formatConversion.jsonToYaml(data);
      return { same: JSON.stringify(Structra.yamlIo.parse(text).data) === JSON.stringify(data), first: text.split('\n')[0] };
    });
    if (!roundTrip.same) fail('Convert to YAML should read back to the same data');

    // a broken file says where
    await uploadAndWait(page, { name: 'broken.yaml', mimeType: 'text/yaml', buffer: Buffer.from('a: 1\nb: [1, 2\nc: 3\n') });
    await page.waitForTimeout(500);
    const message = await page.evaluate(() => [...document.querySelectorAll('[class*=error]')].map((element) => element.textContent.trim()).join(' | '));
    if (!/not valid YAML/.test(message) || !/line 3, column 1/.test(message)) fail('a broken YAML file should say it is not valid YAML and where: ' + message.replace(/\s+/g, ' ').slice(0, 240));
  } catch (error) {
    fail('crashed: ' + String(error.message).split('\n')[0]);
  }

  if (errors.length) fail('page errors: ' + [...new Set(errors)].join(' | '));
  await browser.close();
  server.close();
  if (failures.length) { console.log('yaml smoke test: FAILED\n - ' + failures.join('\n - ')); process.exit(1); }
  console.log('yaml smoke test: ok');
})();
