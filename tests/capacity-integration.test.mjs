import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = readFileSync('index.html', 'utf8');
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];

// Minimal DOM/storage stand-ins exercise the real application handlers without
// adding a browser dependency. Layout and native controls are checked in-browser.
function loadWizard(storage = new Map()) {
  const makeElement = () => ({
    value: '', textContent: '', innerHTML: '', style: {}, dataset: {},
    classList: { add() {}, remove() {}, contains() { return false; } },
    querySelectorAll() { return []; },
    closest() { return { querySelectorAll() { return []; } }; },
    appendChild() {}, replaceChildren() {}, remove() {}
  });
  const elements = new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => [id, makeElement()]));
  const inputs = [...html.matchAll(/<(?:input|select|textarea)\b[^>]*\bid="([^"]+)"/g)].map(([, id]) => elements.get(id));
  const table = makeElement();
  const alerts = [];
  const confirmations = [];
  const context = vm.createContext({
    document: {
      getElementById: id => elements.get(id) || null,
      querySelector: selector => selector === '#result-data-table tbody' ? table : makeElement(),
      querySelectorAll: selector => selector === '#main-container input, #main-container select, #main-container textarea' ? inputs : [],
      createElement: makeElement,
      addEventListener() {}
    },
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key)
    },
    setTimeout() {}, clearTimeout() {},
    alert: message => alerts.push(message),
    confirm: message => { confirmations.push(message); return true; }
  });
  context.window = context;
  vm.runInContext(readFileSync('wizard-core.js', 'utf8'), context);
  vm.runInContext(script, context);
  const run = code => vm.runInContext(code, context);
  const input = (id, value) => {
    elements.get(id).value = value;
    const tag = html.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`))[0];
    const handler = tag.match(/oninput="([^"]+)"/)[1];
    run(`(function () { ${handler} }).call(document.getElementById(${JSON.stringify(id)}))`);
  };
  const selectCapacity = value => run(`selectRadio('tank_capacity', ${JSON.stringify(value)}, document.getElementById('tank_capacity'))`);
  const fillCapacity = () => {
    input('daily_volume', '5');
    input('operating_hours', '8');
    input('batch_cycle_minutes', '90');
    input('working_volume_percent', '80');
    selectCapacity('500L');
  };
  return { elements, run, input, selectCapacity, fillCapacity, storage, alerts, confirmations, table };
}

test('real input handlers recalculate and persist conditions; result/PDF uses identical calculations', () => {
  const app = loadWizard();
  app.fillCapacity();
  const preview = () => app.elements.get('capacity-preview').innerHTML;
  assert.match(preview(), /data-status="insufficient"/);
  assert.match(preview(), /13 回\/日/);
  app.run('generateResult()');
  assert.equal(app.alerts.length, 0);
  assert.ok(app.confirmations[0].includes('バッチ処理能力が不足'));
  assert.equal(app.elements.get('result-capacity').innerHTML, preview());
  assert.match(app.elements.get('result-flow').innerHTML, /<svg/);
  assert.match(app.table.innerHTML, /5 m³\/日/);
  app.selectCapacity('1000L');
  app.input('daily_volume', '3');
  assert.match(preview(), /data-status="sufficient"/);
  app.input('batch_cycle_minutes', '120');
  assert.match(preview(), /data-status="at_limit"/);
  app.input('working_volume_percent', '');
  assert.match(preview(), /data-status="incomplete"/);
  assert.doesNotMatch(preview(), /capacity-metrics/);
});

test('draft reload, resume and new-project reset retain or clear capacity conditions correctly', () => {
  const first = loadWizard();
  first.fillCapacity();
  first.input('customer_name', '保存確認');
  const reloaded = loadWizard(first.storage);
  reloaded.run('resumeDraft()');
  for (const [key, value] of [['operating_hours', '8'], ['batch_cycle_minutes', '90'], ['working_volume_percent', '80'], ['customer_name', '保存確認']]) {
    assert.equal(reloaded.elements.get(key).value, value);
  }
  assert.match(reloaded.elements.get('capacity-preview').innerHTML, /data-status="insufficient"/);
  reloaded.run('startNewDraft(true)');
  assert.match(reloaded.elements.get('capacity-preview').innerHTML, /data-status="incomplete"/);
  assert.equal(reloaded.run('data.operating_hours'), '');
  for (const key of ['operating_hours', 'batch_cycle_minutes', 'working_volume_percent']) {
    assert.equal(reloaded.elements.get(key).value, '');
  }
  const saved = JSON.parse(first.storage.get('ww-drafts-v2'));
  assert.equal(saved.length, 1);
  assert.equal(saved[0].data.operating_hours, '8');
});

test('legacy draft results remain available with an explicit incomplete capacity check', () => {
  const storage = new Map([['ww-drafts-v2', JSON.stringify([{
    id: 'old', version: 2, savedAt: Date.now(), step: 1,
    data: { customer_name: '既存案件', daily_volume: '1', tank_capacity: '200L' }
  }])]]);
  const app = loadWizard(storage);
  app.run('resumeDraft(); generateResult()');
  assert.equal(app.alerts.length, 0);
  assert.match(app.elements.get('result-capacity').innerHTML, /data-status="incomplete"/);
  assert.match(app.elements.get('result-capacity').innerHTML, /運転可能時間 未入力/);
  assert.match(app.table.innerHTML, /既存案件/);
});

test('invalid conditions replace old metrics and prevent result generation', () => {
  const app = loadWizard();
  app.fillCapacity();
  app.input('operating_hours', '25');
  assert.match(app.elements.get('capacity-preview').innerHTML, /data-status="invalid"/);
  assert.doesNotMatch(app.elements.get('capacity-preview').innerHTML, /capacity-metrics/);
  app.run('generateResult()');
  assert.equal(app.alerts.length, 1);
  assert.match(app.alerts[0], /24以下/);
  assert.equal(app.elements.get('result-capacity').innerHTML, '');
});

test('capacity calculation basis is escaped when rendering malformed draft values', () => {
  const app = loadWizard();
  const rendered = app.run(`buildBatchCapacityHTML({ daily_volume: '<img src=x onerror=alert(1)>', tank_capacity: '500L' })`);
  assert.doesNotMatch(rendered, /<img/);
  assert.match(rendered, /&lt;img/);
  assert.match(rendered, /data-status="invalid"/);
});
