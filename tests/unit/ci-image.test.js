/* The browser jobs in CI run inside Microsoft's Playwright image. If its version differs from the playwright package, Playwright cannot
   find its browsers and every browser job fails. This test catches that when Playwright is upgraded. */
const fs = require('fs');
const path = require('path');
const { test, truthy } = require('./harness');

const ROOT = path.join(__dirname, '..', '..');

console.log('CI image');

test('the CI Playwright image matches the playwright version in package-lock.json', () => {
  const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'));
  const version = lock.packages['node_modules/playwright'].version;
  const workflow = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
  const tags = [...workflow.matchAll(/mcr\.microsoft\.com\/playwright:v([\d.]+)-/g)].map((m) => m[1]);
  truthy(tags.length === 3, 'expected 3 browser jobs with the image, found ' + tags.length);
  truthy(tags.every((tag) => tag === version), `image tags ${tags.join(', ')} must all equal the playwright version ${version}`);
});
