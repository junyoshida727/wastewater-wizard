import { readFileSync, existsSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const html = readFileSync('index.html', 'utf8');
test('core app wiring is present', () => {
  for (const token of [
    'function generateResult()',
    'function buildFlowSVG(d)',
    'function calcPumps()',
    'function calcSensors()',
    'function resumeDraft()',
    'const REQUIRED_RESULT_FIELDS',
  ]) {
    assert.ok(html.includes(token), `Missing ${token}`);
  }
});

test('user-provided result table values are escaped before innerHTML rendering', () => {
  assert.match(
    html,
    /rows\.map\(r => `<tr><td>\$\{escapeHtml\(r\[0\]\)\}<\/td><td>\$\{escapeHtml\(r\[1\]\)\}<\/td><\/tr>`\)\.join\(''\)/,
  );
});

test('shared AI agent instructions exist', () => {
  assert.ok(existsSync('AGENTS.md'), 'AGENTS.md is required for Codex');
  assert.ok(existsSync('CLAUDE.md'), 'CLAUDE.md is required for Claude Code');
});
