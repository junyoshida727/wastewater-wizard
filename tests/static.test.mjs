import { readFileSync, existsSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const html = readFileSync('index.html', 'utf8');

test('core app wiring is present', () => {
  for (const token of [
    'function generateResult()', 'function buildFlowSVG(d)', 'function calcPumps()',
    'function calcSensors()', 'function resumeDraft()', 'WizardCore.validateData(data)'
  ]) assert.ok(html.includes(token), `Missing ${token}`);
});

test('restoration and PDF include the previously omitted safety-critical fields', () => {
  assert.ok(existsSync('wizard-core.js'));
  assert.match(html, /'wastewater_type','daily_volume','working_days','raw_tank_size','ph_min','ph_max'/);
  assert.match(html, /updateWastewaterOptions\(data\.industry, true\)/);
  assert.match(html, /\['電源コード長さ', data\.power_cable_length/);
  assert.match(html, /\['一次側電源の接続形状', data\.primary_power_connection/);
  assert.ok(existsSync('wizard-flow.js'));
  assert.match(html, /WizardFlow\.build\(d\)/);
  assert.doesNotMatch(html, /cdnjs\.cloudflare\.com\/ajax\/libs\/html2pdf/);
});

test('saving a draft does not replace active pump row indexes', () => {
  assert.equal(html.includes('Object.assign(data, normalized);'), false);
  assert.ok(html.includes("data.sludge_amount !== '' ? data.sludge_amount + ' kg' : ''"));
  assert.equal(html.includes('Content-Security-Policy'), false);
});

test('inline application script has valid JavaScript syntax', () => {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 1);
  assert.doesNotThrow(() => new Function(scripts[0][1]));
});

test('capacity live region is limited to the status text', () => {
  assert.match(html, /<div id="capacity-preview"><\/div>/);
  assert.match(html, /class="capacity-status" role="status" aria-live="polite"/);
  assert.doesNotMatch(html, /id="capacity-preview"[^>]*aria-live/);
  assert.doesNotMatch(html, /id="capacity-preview"[^>]*aria-atomic/);
});
