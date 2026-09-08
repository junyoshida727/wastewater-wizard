import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const workflow = readFileSync('.github/workflows/branch-name-check.yml', 'utf8');
const script = workflow.split('run: |\n')[1].split('\n').map(line => line.replace(/^ {10}/, '')).join('\n');

test('branch check treats command substitution in a valid Git branch name as literal data', () => {
  assert.match(workflow, /env:\s*\n\s*BRANCH: \$\{\{ github.head_ref \}\}/);
  assert.doesNotMatch(script, /\$\{\{/);
  const branch = 'fix/$(printf${IFS}UNSAFE_EVALUATION)';
  assert.equal(spawnSync('git', ['check-ref-format', '--branch', branch]).status, 0);
  const result = spawnSync('bash', ['-c', script], { env: { ...process.env, BRANCH: branch }, encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.ok(result.stdout.includes(`Branch: ${branch}`));
  assert.ok(!result.stdout.includes('Branch: fix/UNSAFE_EVALUATION'));
});

test('branch check retains the existing acceptance and rejection rules', () => {
  for (const [BRANCH, expected] of [['fix/example', 0], ['feature/example', 0], ['codex/example', 0], ['main', 1]]) {
    assert.equal(spawnSync('bash', ['-c', script], { env: { ...process.env, BRANCH } }).status, expected);
  }
});
