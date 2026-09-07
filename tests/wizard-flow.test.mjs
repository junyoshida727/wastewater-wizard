import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const context = {};
vm.runInNewContext(readFileSync('wizard-core.js', 'utf8'), context);
vm.runInNewContext(readFileSync('wizard-flow.js', 'utf8'), context);
const build = overrides => context.WizardFlow.build(context.WizardCore.normalizeData(overrides));
const edges = svg => [...svg.matchAll(/data-pipe="([^"]+)" data-from="([^"]+)" data-to="([^"]+)"/g)].map(([, id, from, to]) => ({ id, from, to }));

test('engineering SVG is self-contained, accessible and has a schedule and title block', () => {
  const svg = build({ customer_name: 'サンプル工場', tank_capacity: '200L', daily_volume: '1.5', wastewater_type: '洗浄排水' });
  assert.match(svg, /role="img" aria-labelledby="ww-flow-title ww-flow-desc"/);
  assert.match(svg, /機器一覧・入力仕様/);
  assert.match(svg, /サンプル工場/);
  assert.match(svg, /200L/);
  assert.match(svg, /1.5 m³\/日/);
  assert.match(svg, /洗浄排水/);
  assert.match(svg, /縮尺：NTS/);
  assert.match(svg, /施工用図面ではありません/);
  assert.doesNotMatch(svg, /<foreignObject|<image|<script|<style|NaN|Infinity|undefined/);
  assert.match(svg, /data-equipment="TK-02"/);
  assert.match(svg, /data-instrument="pH"/);
  assert.match(svg, /data-instrument="LS"/);
});

test('upper supernatant and lower sludge retain separate paths without adding a raw pump', () => {
  const svg = build({ filter_branches: '2分岐' });
  const connections = edges(svg);
  assert.ok(connections.some(e => e.id === 'supernatant-discharge' && e.from === 'TK-02' && e.to === '放流'));
  assert.ok(connections.some(e => e.id === 'sludge-filter' && e.from === 'TK-02' && e.to === 'FL-01'));
  assert.ok(connections.some(e => e.id === 'filtrate-discharge' && e.from === 'FL-01'));
  assert.doesNotMatch(svg, /原水ポンプ/);
});

test('selected relay, monitor and sludge tanks have distinct symbols and connected paths', () => {
  const svg = build({ option_tanks: ['中継槽', '監視槽', '汚泥貯槽'], filter_branches: '3分岐' });
  const connections = edges(svg);
  for (const [from, to] of [['TK-01', 'TK-03'], ['TK-03', 'TK-02'], ['TK-02', 'TK-05'], ['TK-05', '放流'], ['TK-02', 'TK-04'], ['TK-04', 'FL-01']]) {
    assert.ok(connections.some(e => e.from === from && e.to === to), `${from} → ${to}`);
  }
  assert.equal(connections.some(e => e.from === 'TK-02' && e.to === 'FL-01'), false);
});

test('no filter or unknown filtration does not claim filtered discharge', () => {
  for (const filter_branches of ['', '不明', 'ろ過しない']) {
    for (const option_tanks of [[], ['汚泥貯槽']]) {
      const svg = build({ filter_branches, option_tanks });
      assert.doesNotMatch(svg, /data-equipment="FL-01"|data-pipe="filtrate-discharge"/);
      assert.match(svg, /data-pipe="supernatant-discharge"/);
      assert.match(svg, /汚泥処理方法を確認/);
    }
  }
});

test('powder mode removes only the liquid coagulant pump and each other chemical has a separate line', () => {
  const svg = build({ powder_feeder: '使用する', chemicals: ['pH調整剤（酸）', '液体凝集剤', 'pH調整剤（アルカリ）'] });
  assert.match(svg, /data-equipment="PF-01"/);
  assert.equal([...svg.matchAll(/data-equipment="DP-/g)].length, 2);
  const feeds = edges(svg).filter(e => e.id.startsWith('feed-'));
  assert.equal(feeds.length, 3);
  assert.equal(new Set(feeds.map(e => e.from)).size, 3);
  assert.ok(feeds.every(e => e.to === 'TK-02'));
  assert.doesNotMatch(svg, /液体凝集剤/);
  assert.equal([...svg.matchAll(/data-kind="chemical"/g)].length, 2);
});

test('inactive stale custom chemicals are absent, selected custom names and amounts are preserved', () => {
  const stale = context.WizardCore.createInitialData();
  stale.chem_other_count = '2';
  stale.chem_details = { 'その他 1': { name: '旧薬剤' } };
  assert.doesNotMatch(context.WizardFlow.build(stale), /data-equipment="CH-|旧薬剤/);
  const svg = build({ chem_other_selected: true, chem_other_count: '2', chem_details: { 'その他 1': { name: '試験薬剤', amount: '50 mL/m³' } } });
  assert.match(svg, /試験薬剤/);
  assert.match(svg, /50 mL\/m³/);
  assert.equal([...svg.matchAll(/data-equipment="DP-/g)].length, 2);
});

test('instruments are drawn only on present tanks and standard pH remains visible', () => {
  const missing = build({ option_ph_tanks: ['中継槽'], option_turbidity_tanks: ['中継槽'], level_sensors: ['中継槽'] });
  assert.equal([...missing.matchAll(/data-instrument="pH"/g)].length, 1);
  assert.doesNotMatch(missing, /data-instrument="TU"/);
  assert.equal([...missing.matchAll(/data-instrument="LS"/g)].length, 1);
  const selected = build({ option_tanks: ['中継槽'], option_ph_tanks: ['中継槽'], option_turbidity_tanks: ['中継槽'], level_sensors: ['中継槽'] });
  assert.equal([...selected.matchAll(/data-instrument="pH"/g)].length, 2);
  assert.match(selected, /data-instrument="TU"/);
  assert.match(selected, /data-instrument="LS"/);
});

test('unlocated devices are listed without inventing pipe connections', () => {
  const svg = build({ option_dehydrator: '必要', dehydrator_maker: '試験メーカー', extra_pumps: [null, { name: '移送ポンプ', count: '2', lph: '0.5' }] });
  assert.match(svg, /DH-01/);
  assert.match(svg, /試験メーカー/);
  assert.match(svg, /AP-01/);
  assert.match(svg, /2台 \/ 0.5kW/);
  assert.equal(edges(svg).some(e => /DH-|AP-/.test(e.to + e.from)), false);
});

test('SVG escapes user text and prefixes identifiers without changing saved data', () => {
  const data = context.WizardCore.normalizeData({ customer_name: '<script>危険&"', tank_capacity: '500L', chemicals: ['<svg/onload=alert(1)>'] });
  const before = JSON.stringify(data);
  const svg = context.WizardFlow.build(data, { idPrefix: 'test"/>' });
  assert.doesNotMatch(svg, /<script>|<svg\/onload|id="test"/);
  assert.match(svg, /&lt;script&gt;/);
  assert.match(svg, /id="test----title"/);
  assert.equal(JSON.stringify(data), before);
});

test('large chemical lists and long specifications expand the sheet instead of clipping table rows', () => {
  const svg = build({ chemicals: ['pH調整剤（酸）', 'pH調整剤（アルカリ）', 'キレート剤', '液体凝集剤', '酸化剤', '還元剤'], chem_other_selected: true, chem_other_count: '4', chem_details: { 'その他 1': { name: '長い薬剤名'.repeat(30), amount: '添加条件の補足'.repeat(20) } } });
  const [, width, height] = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
  assert.ok(Number(width) > 1680);
  assert.ok(Number(height) > 1180);
  assert.equal(edges(svg).filter(e => e.id.startsWith('feed-')).length, 10);
  for (const [, y] of svg.matchAll(/<text[^>]* y="([\d.]+)"/g)) assert.ok(Number(y) < Number(height) - 24);
});
