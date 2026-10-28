/* YAML files as people really have them, opened through the real file path (worker, notes, toast):
     - a Kubernetes file with several documents (---) opens as a list, and the person is told,
     - a CloudFormation file with tags (!Ref, !Sub, !GetAtt) opens with its values, and the person is told,
     - a Docker Compose file with the << merge key opens merged,
     - a broken file says where,
     - Convert to YAML writes text that reads back to the same data.

   Run:  node tests/smoke/yaml.js          (PW_CHANNEL=msedge uses the installed Edge; PW_BROWSER=firefox or webkit) */
const { runAppTest } = require('../app-test');
const { uploadAndWait } = require('../page-helpers');

const KUBERNETES = 'apiVersion: v1\nkind: Service\nmetadata:\n  name: web\n---\napiVersion: apps/v1\nkind: Deployment\nspec:\n  replicas: 2\n---\nkind: Ingress\n';
const CLOUDFORMATION = 'Resources:\n  Bucket:\n    Type: AWS::S3::Bucket\n    Properties:\n      BucketName: !Sub "${Env}-data"\n  Policy:\n    Properties:\n      Bucket: !Ref Bucket\n      Arn: !GetAtt Role.Arn\n';
const COMPOSE = 'x-base: &base\n  image: node\n  restart: always\nservices:\n  web:\n    <<: *base\n    ports: ["80:80"]\n';

runAppTest('yaml', async ({ page, fail, base, browser }) => {
// Every message shown while a file opens, collected as it arrives: a hint can replace the "Loaded ..." message within a moment
  const toastText = () => page.evaluate(() => (window.__toasts || []).join(' | '));
  const open = async (name, text) => {
    await page.evaluate(() => {
      if (!window.__toastListener) { window.__toastListener = true; Structra.events.on('toast', (toast) => { (window.__toasts = window.__toasts || []).push(String(toast.msg)); }); }
      window.__toasts = [];
    });
    await uploadAndWait(page, { name, mimeType: 'text/yaml', buffer: Buffer.from(text) });
    await page.waitForTimeout(300);
  };



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

  // the worker file is fetched by version, not by time, so the browser can keep it between visits
  const workerUrl = await page.evaluate(() => Structra._yamlWorkerPool.workerUrl + ' ' + document.querySelector('meta[name="structra-version"]').content);
  const [workerAddress, appVersion] = workerUrl.split(' ');
  if (!workerAddress.endsWith('?v=' + appVersion) || !appVersion) fail('the worker address should end with ?v=<app version>: ' + workerUrl);

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
}, { viewport: { width: 1360, height: 900 } });
