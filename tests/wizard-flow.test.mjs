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

test('standard transfer pump lifts raw water while upper supernatant and lower sludge stay separate', () => {
  const svg = build({ filter_branches: '2分岐' });
  const connections = edges(svg);
  assert.ok(connections.some(e => e.id === 'supernatant-discharge' && e.from === 'TK-02' && e.to === '放流'));
  assert.ok(connections.some(e => e.id === 'sludge-filter' && e.from === 'TK-02' && e.to === 'FL-01'));
  assert.ok(connections.some(e => e.id === 'filtrate-discharge' && e.from === 'FL-01'));
  assert.match(svg, /data-equipment="TP-01" data-tank="TK-01"/);
  assert.doesNotMatch(svg, /data-equipment="TP-02"/);
  assert.match(svg, /標準付属/);
});

test('transfer discharge rises through the source open top before travelling outside the vessel', () => {
  for (const option_tanks of [[], ['中継槽']]) {
    const svg = build({ option_tanks });
    const sources = option_tanks.length ? [['raw-relay', 80, 220], ['reactor-inlet', 330, 470]] : [['reactor-inlet', 80, 220]];
    for (const [id, left, right] of sources) {
      const route = svg.match(new RegExp(`data-pipe="${id}"[^>]* d="([^"]+)"`))[1];
      const points = [...route.matchAll(/[ML]([\d.]+),([\d.]+)/g)].map(([, x, y]) => [Number(x), Number(y)]);
      assert.ok(points[0][0] > left && points[0][0] < right);
      assert.ok(points[0][1] > 510, 'discharge starts inside the source tank');
      assert.equal(points[1][0], points[0][0], 'first segment rises vertically from the pump');
      assert.ok(points[1][1] < 510, 'first bend is above the source tank rim');
      for (let i = 1; i < points.length; i++) {
        if (points[i][0] !== points[i - 1][0]) assert.ok(points[i][1] < 510, 'horizontal discharge never penetrates a source tank wall');
      }
    }
  }
});

test('transfer, auxiliary and dosing pumps all use a circle with P', () => {
  const svg = build({ option_tanks: ['中継槽'], chemicals: ['酸'], extra_pumps: [{ kind: 'ポンプ', tank: '原水槽', count: '1' }] });
  for (const tag of ['TP-01', 'TP-02', 'AP-01', 'DP-01']) {
    const symbol = svg.match(new RegExp(`<g data-equipment="${tag}"[^>]*>([\\s\\S]*?)</g>`))[1];
    assert.match(symbol, /<circle /);
    assert.match(symbol, />P<\/text>/);
    assert.doesNotMatch(symbol, /<path[^>]* Z"/);
  }
});

test('selected relay, monitor and sludge tanks have distinct symbols and connected paths', () => {
  const svg = build({ option_tanks: ['中継槽', '監視槽', '汚泥貯槽'], filter_branches: '3分岐' });
  const connections = edges(svg);
  for (const [from, to] of [['TK-01', 'TK-03'], ['TK-03', 'TK-02'], ['TK-02', 'TK-05'], ['TK-05', '放流'], ['TK-02', 'TK-04'], ['TK-04', 'FL-01']]) {
    assert.ok(connections.some(e => e.from === from && e.to === to), `${from} → ${to}`);
  }
  assert.equal(connections.some(e => e.from === 'TK-02' && e.to === 'FL-01'), false);
  assert.match(svg, /data-equipment="TP-01" data-tank="TK-01"/);
  assert.match(svg, /data-equipment="TP-02" data-tank="TK-03"/);
  assert.match(svg, /中継槽追加分/);
  for (const id of ['raw-relay', 'reactor-inlet']) {
    const route = svg.match(new RegExp(`data-pipe="${id}"[^>]* d="([^"]+)"`))[1];
    const points = [...route.matchAll(/[ML]([\d.]+),([\d.]+)/g)].map(([, x, y]) => [Number(x), Number(y)]);
    assert.ok(points.at(-1)[1] < points[0][1], 'pump delivery rises from the source vessel to the destination inlet');
  }
});

test('instrument stems are solid while chemical dosing lines retain their own line type', () => {
  const svg = build({ option_tanks: ['監視槽'], option_ph_tanks: ['監視槽'], option_turbidity_tanks: ['監視槽'], level_sensors: ['ろ過受け槽'], filter_branches: '2分岐', chemicals: ['酸'] });
  const instruments = [...svg.matchAll(/<g data-instrument="[^"]+">([\s\S]*?)<\/g>/g)];
  assert.ok(instruments.length >= 5);
  for (const [, body] of instruments) assert.doesNotMatch(body, /stroke-dasharray/);
  assert.match(svg, /data-kind="chemical"[^>]*stroke-dasharray/);
});

test('additional pumps and mixers are placed in selected vessels with counts and matching schedule tags', () => {
  const svg = build({ raw_tank: 'あり', filter_branches: '2分岐', extra_pumps: [
    { kind: '攪拌機', tank: '原水槽', name: '原水攪拌', count: '2', lph: '0.4', amp: '2.5' },
    { kind: 'ポンプ', tank: '凝集沈殿槽', name: '循環', count: '1' },
    { kind: 'その他', tank: 'ろ過受け槽', name: '予備機器', count: '1' }
  ] });
  assert.match(svg, /data-equipment="AM-01" data-tank="TK-01" data-kind="攪拌機"/);
  assert.match(svg, /data-equipment="AP-02" data-tank="TK-02" data-kind="ポンプ"/);
  assert.match(svg, /data-equipment="AE-03" data-tank="FL-01"/);
  assert.match(svg, /2台 \/ 0.4kW \/ 2.5A/);
  assert.match(svg.replace(/<[^>]+>/g, ''), /吐出先未確定/);
  assert.equal(edges(svg).some(e => /AP-02/.test(e.from + e.to)), false);
});

test('unknown, removed and zero-count placements do not create phantom equipment or vessels', () => {
  const data = { extra_pumps: [
    { kind: '攪拌機', tank: '中継槽', name: '保持する機器', count: '1' },
    { kind: 'ポンプ', tank: '原水槽', count: '0' },
    { name: '旧ポンプ', count: '1' }
  ] };
  const svg = build(data);
  assert.doesNotMatch(svg, /data-equipment="(?:AM-01|AP-02|AP-03|TK-03)"/);
  assert.match(svg.replace(/<[^>]+>/g, ''), /構成外・要確認/);
  assert.match(svg, /旧ポンプ/);
  assert.match(build({ ...data, option_tanks: ['中継槽'] }), /data-equipment="AM-01" data-tank="TK-03"/);
});

test('many additional devices expand vessel and sheet without losing tags or escaping', () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({ kind: i % 2 ? 'ポンプ' : '攪拌機', tank: '原水槽', name: '<補助&機器>', count: '2' }));
  const svg = build({ extra_pumps: rows });
  assert.equal([...svg.matchAll(/data-equipment="A[MP]-\d+"/g)].length, 12);
  assert.match(svg, /&lt;補助&amp;機器&gt;/);
  const height = Number(svg.match(/viewBox="0 0 \d+ (\d+)"/)[1]);
  assert.ok(height > 1500);
  for (const [, y] of svg.matchAll(/<text[^>]* y="([\d.]+)"/g)) assert.ok(Number(y) < height - 24);
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
