/* The task list (todo.json) and its readable copy (docs/TODO.md) must agree, and the list must make sense: every status is one of
   the four, ids are unique, and a task with subtasks has the status its subtasks give it. Fix a failure with:
   node tools/todo.mjs render      (after changing a status with: node tools/todo.mjs set <id> <status>) */
const { spawnSync } = require('child_process');
const path = require('path');
const { test, truthy } = require('./harness');

console.log('task list');

test('todo.json is sound and docs/TODO.md is made from it', () => {
  const run = spawnSync(process.execPath, [path.join(__dirname, '..', '..', 'tools', 'todo.mjs'), 'check'], { encoding: 'utf8' });
  truthy(run.status === 0, (run.stderr || run.stdout || 'tools/todo.mjs check failed').trim());
});

test('every question id used in the task list exists in docs/QUESTIONS.md', () => {
  const fs = require('fs');
  const root = path.join(__dirname, '..', '..');
  const questions = fs.readFileSync(path.join(root, 'docs', 'QUESTIONS.md'), 'utf8');
  const used = [...new Set(fs.readFileSync(path.join(root, 'todo.json'), 'utf8').match(/\b[QD]\d+\b/g) || [])];
  const missing = used.filter((id) => !new RegExp('\| ' + id + ' \|').test(questions));
  truthy(!missing.length, 'not in docs/QUESTIONS.md: ' + missing.join(', '));
});
