import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = readFileSync('index.html', 'utf8');
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];

// Minimal DOM/storage stand-ins exercise the real application handlers without
// adding a browser dependency. Layout and native controls are checked in-browser.
function loadWizard(storage = new Map()) {
  const makeElement = () => {
    const classes = new Set();
    return {
      value: '', textContent: '', innerHTML: '', style: {}, dataset: {},
      attributes: {},
      setAttribute(key, value) { this.attributes[key] = value; },
      getAttribute(key) { return this.attributes[key] ?? null; },
      click() { this.clicked = true; },
      classList: {
        add(...names) { names.forEach(name => classes.add(name)); },
        remove(...names) { names.forEach(name => classes.delete(name)); },
        contains(name) { return classes.has(name); }
      },
      querySelectorAll() { return []; },
      closest() { return { querySelectorAll() { return []; } }; },
      appendChild() {}, replaceChildren() {}, remove() {}
    };
  };
  const elements = new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => [id, makeElement()]));
  const inputs = [...html.matchAll(/<(?:input|select|textarea)\b[^>]*\bid="([^"]+)"/g)].map(([, id]) => elements.get(id));
  const table = makeElement();
  const flowSVG = makeElement();
  flowSVG.setAttribute('width', '1680');
  const created = [];
  const downloads = [];
  const timers = [];
  const revoked = [];
  const alerts = [];
  const confirmations = [];
  const selectors = new Map();
  const context = vm.createContext({
    document: {
      getElementById: id => elements.get(id) || null,
      querySelector: selector => {
        if (selector === '#result-data-table tbody') return table;
        if (selector === '#result-flow svg') return flowSVG;
        if (!selectors.has(selector)) selectors.set(selector, makeElement());
        return selectors.get(selector);
      },
      querySelectorAll: selector => selector === '#main-container input, #main-container select, #main-container textarea' ? inputs : [],
      createElement: tag => { const element = makeElement(); created.push({ tag, element }); return element; },
      body: { appendChild() {} },
      addEventListener() {}
    },
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key)
    },
    Blob,
    URL: {
      createObjectURL: blob => { downloads.push(blob); return 'blob:test-flow'; },
      revokeObjectURL: url => revoked.push(url)
    },
    setTimeout: callback => timers.push(callback), clearTimeout() {},
    alert: message => alerts.push(message),
    confirm: message => { confirmations.push(message); return true; }
  });
  context.window = context;
  vm.runInContext(readFileSync('wizard-core.js', 'utf8'), context);
  vm.runInContext(readFileSync('wizard-flow.js', 'utf8'), context);
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
  return { elements, run, input, selectCapacity, fillCapacity, storage, alerts, confirmations, table, flowSVG, created, downloads, timers, revoked };
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

test('equipment row handlers persist placement, restore selected controls and transfer it to SVG and result output', () => {
  const app = loadWizard();
  app.input('customer_name', '機器配置確認');
  app.run(`addPumpRow(); updateExtraPump(0, 'name', '原水攪拌機'); updateExtraPump(0, 'kind', '攪拌機'); updateExtraPump(0, 'tank', '原水槽'); updateExtraPump(0, 'count', '2');`);
  const restored = loadWizard(app.storage);
  restored.run('resumeDraft(); generateResult()');
  assert.equal(restored.run('data.extra_pumps[0].kind'), '攪拌機');
  assert.equal(restored.run('data.extra_pumps[0].tank'), '原水槽');
  assert.match(restored.elements.get('result-flow').innerHTML, /data-equipment="AM-01" data-tank="TK-01"/);
  assert.match(restored.table.innerHTML, /設置槽：原水槽/);
  const row = restored.created.find(({ element }) => element.id === 'pump-row-0').element.innerHTML;
  assert.match(row, /value="攪拌機" selected/);
  assert.match(row, /value="原水槽" selected/);
  restored.run(`updateExtraPump(0, 'tank', '中継槽'); generateResult()`);
  assert.doesNotMatch(restored.elements.get('result-flow').innerHTML, /data-equipment="AM-01"/);
  assert.match(restored.elements.get('result-missing-check').innerHTML, /現在の構成にありません/);
  restored.run('startNewDraft(true)');
  assert.equal(restored.run('data.extra_pumps.length'), 0);
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

test('flow size controls switch between natural size and fit, and regeneration resets the zoom', () => {
  const app = loadWizard();
  app.run('setFlowScale(true)');
  assert.equal(app.flowSVG.style.width, '1680px');
  assert.equal(app.elements.get('flow-actual').getAttribute('aria-pressed'), 'true');
  assert.equal(app.elements.get('flow-fit').getAttribute('aria-pressed'), 'false');
  app.run('setFlowScale(false)');
  assert.equal(app.flowSVG.style.width, '100%');
  app.run('setFlowScale(true); generateResult()');
  assert.equal(app.flowSVG.style.width, '100%');
  assert.equal(app.elements.get('flow-fit').getAttribute('aria-pressed'), 'true');
});

test('SVG download is an independent vector document with the current drawing and a safe filename', async () => {
  const app = loadWizard();
  app.input('customer_name', '確認/案件:SVG');
  app.selectCapacity('200L');
  app.run('downloadFlowSVG()');
  assert.equal(app.downloads.length, 1);
  assert.equal(app.downloads[0].type, 'image/svg+xml;charset=utf-8');
  const content = await app.downloads[0].text();
  assert.ok(content.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<svg'));
  assert.match(content, /200L/);
  assert.match(content, /機器一覧・入力仕様/);
  assert.doesNotMatch(content, /capacity-section|<html|<script/);
  const link = app.created.find(item => item.tag === 'a').element;
  assert.equal(link.download, '確認_案件_SVG_概略フロー図.svg');
  assert.equal(link.href, 'blob:test-flow');
  assert.equal(link.clicked, true);
  app.timers.forEach(callback => callback());
  assert.deepEqual(app.revoked, ['blob:test-flow']);
});

test('live preview immediately follows filtration and optional vessels, including draft restoration', () => {
  const app = loadWizard();
  app.input('customer_name', 'プレビュー検証');
  for (const [value, count] of [['2分岐', 2], ['5分岐', 5], ['分岐なし', 1], ['ろ過しない', 0], ['不明', 0], ['', 0]]) {
    app.run(`selectRadio('filter_branches', ${JSON.stringify(value)}, document.getElementById('filter_branches'))`);
    for (const id of ['fn-filter', 'fa-filtrate', 'fn-filtrate']) assert.equal(app.elements.get(id).style.display, count ? '' : 'none');
    assert.equal(app.elements.get('fn-sludge-unconfirmed').style.display, count ? 'none' : '');
    assert.equal(app.elements.get('preview-filter-detail').textContent, count ? `${value} / カゴ${count}個` : '');
    const svg = app.run('buildFlowSVG(data)');
    assert.equal(svg.includes('data-equipment="FL-01"'), count > 0);
  }
  app.run(`updateData('option_tanks', ['中継槽', '監視槽', '汚泥貯槽'])`);
  for (const name of ['relay', 'monitor', 'sludge']) {
    assert.equal(app.elements.get('fn-' + name).style.display, '');
    assert.equal(app.elements.get('fa-' + name).style.display, '');
  }
  const restored = loadWizard(app.storage);
  restored.run('resumeDraft()');
  assert.equal(restored.elements.get('fn-relay').style.display, '');
  assert.equal(restored.elements.get('fn-filter').style.display, 'none');
  restored.run(`updateData('option_tanks', [])`);
  for (const name of ['relay', 'monitor', 'sludge']) assert.equal(restored.elements.get('fn-' + name).style.display, 'none');
});

test('new-project and reset actions clear conditional details and the previous discharge label', () => {
  for (const action of ['startNewDraft(true)', 'executeReset()']) {
    const app = loadWizard();
    app.run(`data.option_dehydrator = '必要'; toggleDehydratorDetail(true); updateData('discharge_dest', '公共下水道')`);
    assert.equal(app.elements.get('dehydrator-detail').style.display, 'block');
    assert.equal(app.run(`document.querySelector('#fn-discharge .node-label').textContent`), '公共下水道へ');
    app.run(action);
    assert.equal(app.elements.get('dehydrator-detail').style.display, 'none');
    assert.equal(app.run(`document.querySelector('#fn-discharge .node-label').textContent`), '直接放流');
    assert.equal(app.run('data.option_dehydrator'), '');
    assert.equal(app.run('data.discharge_dest'), '');
  }
});

test('switching drafts restores conditional details instead of leaking the previous draft UI', () => {
  const storage = new Map([['ww-drafts-v2', JSON.stringify([
    { id: 'a', savedAt: Date.now(), step: 3, data: { option_dehydrator: '必要', dehydrator_maker: 'メーカーA', discharge_dest: '河川・湖沼' } },
    { id: 'b', savedAt: Date.now(), step: 3, data: { option_dehydrator: '不要' } }
  ])]]);
  const app = loadWizard(storage);
  app.run(`selectedDraftId = 'a'; resumeDraft()`);
  assert.equal(app.elements.get('dehydrator-detail').style.display, 'block');
  assert.equal(app.elements.get('dehydrator_maker').value, 'メーカーA');
  app.run(`selectedDraftId = 'b'; resumeDraft()`);
  assert.equal(app.elements.get('dehydrator-detail').style.display, 'none');
  assert.equal(app.elements.get('dehydrator_maker').value, '');
  assert.equal(app.run(`document.querySelector('#fn-discharge .node-label').textContent`), '直接放流');
});
