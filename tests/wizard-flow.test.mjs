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

test('outlet and branch solenoid valves are inline circle-V symbols with matching schedule tags', () => {
  for (const [filter_branches, total] of [['2分岐', 4], ['3分岐', 5], ['4分岐', 6], ['5分岐', 7], ['分岐なし', 2], ['ろ過しない', 2], ['不明', 2], ['', 2]]) {
    for (const option_tanks of [[], ['監視槽', '汚泥貯槽']]) {
      const svg = build({ filter_branches, option_tanks });
      const valves = [...svg.matchAll(/<g data-equipment="(MV-\d+)" data-kind="solenoid-valve" data-on-pipe="([^"]+)">([\s\S]*?)<\/g>/g)];
      assert.equal(valves.length, total);
      assert.equal(valves[0][2], option_tanks.length ? 'supernatant-monitor' : 'supernatant-discharge');
      assert.equal(valves[1][2], option_tanks.length ? 'sludge-storage' : ['', '不明', 'ろ過しない'].includes(filter_branches) ? 'sludge-unconfirmed' : 'sludge-filter');
      for (const [i, [, tag, routeId, body]] of valves.entries()) {
        assert.equal(tag, `MV-${i + 1}`);
        if (i > 1) assert.equal(routeId, `filter-branch-${i - 1}`);
        assert.match(body, />V<\/text>/);
        const [, x, y] = body.match(/<circle cx="([\d.]+)" cy="([\d.]+)"/).map(Number);
        const path = svg.match(new RegExp(`data-pipe="${routeId}"[^>]* d="([^"]+)"`))[1];
        const points = [...path.matchAll(/[ML]([\d.]+),([\d.]+)/g)].map(m => m.slice(1).map(Number));
        assert.ok(points.slice(1).some(([x2, y2], n) => {
          const [x1, y1] = points[n];
          return x1 === x2 && x === x1 && y > Math.min(y1, y2) && y < Math.max(y1, y2)
            || y1 === y2 && y === y1 && x > Math.min(x1, x2) && x < Math.max(x1, x2);
        }), `${tag} lies within its pipe segment`);
        assert.equal([...svg.matchAll(new RegExp(`>${tag}</text>`, 'g'))].length, 2, 'tag appears on drawing and schedule');
      }
    }
  }
});

test('instrument registry numbers each drawn probe and includes its name and tank in the schedule', () => {
  const svg = build({ option_tanks: ['中継槽', '監視槽', '汚泥貯槽'], filter_branches: '5分岐',
    option_ph_tanks: ['中継槽', '監視槽', '汚泥貯槽'], option_turbidity_tanks: ['中継槽', '監視槽', '汚泥貯槽'],
    level_sensors: ['原水槽', '中継槽', '監視槽', '汚泥貯槽', 'ろ過受け槽'] });
  for (const [label, prefix, count, name] of [['pH', 'PH', 4, 'pH計'], ['TU', 'TU', 3, '濁度計'], ['LS', 'LS', 6, 'レベルセンサー']]) {
    const probes = [...svg.matchAll(new RegExp(`data-instrument="${label}" data-equipment="(${prefix}-\\d+)" data-tank="([^"]+)"`, 'g'))];
    assert.equal(probes.length, count);
    assert.equal(new Set(probes.map(p => p[1])).size, count);
    for (let i = 1; i <= count; i++) {
      const tag = `${prefix}-${i}`;
      assert.equal([...svg.matchAll(new RegExp(`>${tag}</text>`, 'g'))].length, 2);
      assert.match(svg, new RegExp(`>${tag}</text><text[^>]+>${name}</text><text[^>]+>[^<]+ / 1台`));
    }
  }
  assert.match(svg, /data-equipment="PH-1" data-tank="TK-02"/);
  assert.match(svg, /data-equipment="LS-1" data-tank="TK-02"/);
  assert.match(svg, /data-equipment="LS-6" data-tank="FL-01"/);
  const absent = build({ option_ph_tanks: ['中継槽'], option_turbidity_tanks: ['監視槽'], level_sensors: ['ろ過受け槽'] });
  assert.doesNotMatch(absent, /data-equipment="(?:PH-2|TU-1|LS-2)"/);
  assert.doesNotMatch(absent, />PH-2<|>TU-1<|>LS-2</);
});

test('unlocated custom level sensors retain their count and escaped location in the schedule only', () => {
  const svg = build({ sensor_other_selected: true, sensor_other_count: '2', sensor_other_note: '<外部&槽>' });
  assert.match(svg.replace(/<[^>]+>/g, ''), /レベルセンサー（その他）/);
  assert.match(svg, /&lt;外部&amp;槽&gt; \/ 2台/);
  assert.match(svg.replace(/<[^>]+>/g, ''), /位置未確定・図示なし/);
  assert.equal([...svg.matchAll(/data-instrument="LS"/g)].length, 1);
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

test('transfer routes use two bends and a clear downward entry without crossing source instrument circles', () => {
  for (const option_tanks of [[], ['中継槽']]) for (const withMixers of [false, true]) {
    const svg = build({ option_tanks,
      option_ph_tanks: ['原水槽', '中継槽'], option_turbidity_tanks: ['原水槽', '中継槽'], level_sensors: ['原水槽', '中継槽'],
      extra_pumps: withMixers ? ['原水槽', '中継槽'].map(tank => ({ kind: '攪拌機', tank, count: '1' })) : [] });
    for (const {id, to} of edges(svg).filter(e => ['raw-relay', 'reactor-inlet'].includes(e.id))) {
      const path = svg.match(new RegExp(`data-pipe="${id}"[^>]* d="([^"]+)"`))[1];
      const points = [...path.matchAll(/[ML]([\d.]+),([\d.]+)/g)].map(m => m.slice(1).map(Number));
      assert.equal(points.length, 4, 'three straight segments with just two bends');
      const [start, rise, across, end] = points;
      assert.equal(start[0], rise[0]);
      assert.ok(rise[1] < start[1]);
      assert.equal(rise[1], across[1]);
      assert.ok(across[0] > rise[0]);
      assert.equal(across[0], end[0]);
      const vessel = svg.match(new RegExp(`<g data-equipment="${to}"[^>]*><path d="M([\\d.]+),([\\d.]+)`));
      assert.ok(across[1] < Number(vessel[2]), 'horizontal run clears the destination rim');
      assert.ok(end[0] > Number(vessel[1]) && end[1] > Number(vessel[2]), 'arrow points down inside the destination');
      assert.ok(end[1] - across[1] >= 20, 'final drop leaves room for a readable arrow');
      const circles = [...svg.matchAll(/(?:data-part="motor"|data-instrument="[^"]+"[^>]*><circle) cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"/g)];
      for (const [, x, y, r] of circles) {
        const nearestX = Math.max(rise[0], Math.min(across[0], Number(x)));
        assert.ok(Math.hypot(Number(x) - nearestX, Number(y) - rise[1]) > Number(r) + 1.2, 'horizontal pipe clears motor and instrument circles');
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

test('instrument stems are solid without arrows while chemical dosing lines retain their own line type', () => {
  const svg = build({ option_tanks: ['監視槽'], option_ph_tanks: ['監視槽'], option_turbidity_tanks: ['監視槽'], level_sensors: ['ろ過受け槽'], filter_branches: '2分岐', chemicals: ['酸'] });
  const instruments = [...svg.matchAll(/<g data-instrument="[^"]+"[^>]*>([\s\S]*?)<\/g>/g)];
  assert.ok(instruments.length >= 5);
  for (const [, body] of instruments) assert.doesNotMatch(body, /stroke-dasharray|marker-(?:start|mid|end)/);
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

test('additional mixers have motors above the vessel, shafts crossing the water level, and two submerged blades', () => {
  const names = ['原水槽', '凝集沈殿槽', '中継槽', '汚泥貯槽', '監視槽', 'ろ過受け槽'];
  const ids = ['TK-01', 'TK-02', 'TK-03', 'TK-04', 'TK-05', 'FL-01'];
  const svg = build({ option_tanks: ['中継槽', '汚泥貯槽', '監視槽'], filter_branches: '2分岐', extra_pumps: names.map(tank => ({ kind: '攪拌機', tank, count: '2' })) });
  for (let i = 0; i < names.length; i++) {
    const vessel = svg.match(new RegExp(`<g data-equipment="${ids[i]}"[^>]*>([\\s\\S]*?)</g>`))[1];
    const rim = Number(vessel.match(/<path d="M[\d.]+,([\d.]+) V/)[1]);
    const mixer = svg.match(new RegExp(`<g data-equipment="AM-0${i + 1}"[^>]*>([\\s\\S]*?)</g>`))[1];
    const motor = mixer.match(/data-part="motor" cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"/);
    assert.ok(Number(motor[2]) + Number(motor[3]) < rim, names[i] + ': motor is above the open top');
    const shaft = mixer.match(/<line x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)" data-part="shaft"/);
    assert.equal(shaft[1], shaft[3], 'additional mixer shaft is vertical');
    assert.ok(Number(shaft[2]) < rim && Number(shaft[4]) > rim + 48, 'shaft crosses into the liquid');
    assert.equal([...mixer.matchAll(/data-part="blade"/g)].length, 2);
    assert.match(mixer, />2台<\/text>/);
  }
});

test('multiple mixers occupy separate lanes without colliding with instrument circles', () => {
  const svg = build({ option_tanks: ['中継槽'], option_ph_tanks: ['中継槽'], option_turbidity_tanks: ['中継槽'], level_sensors: ['原水槽', '中継槽'], extra_pumps: ['原水槽', '原水槽', '中継槽', '中継槽'].map(tank => ({ kind: '攪拌機', tank, count: '1' })) });
  const motors = [...svg.matchAll(/data-part="motor" cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"/g)].map(m => m.slice(1).map(Number));
  const meters = [...svg.matchAll(/data-instrument="[^"]+"[^>]*><circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"/g)].map(m => m.slice(1).map(Number));
  assert.equal(motors.length, 5, 'four additional motors and the standard reactor motor');
  const circles = [...motors, ...meters];
  for (let i = 0; i < circles.length; i++) for (let j = i + 1; j < circles.length; j++) {
    const [x, y, r] = circles[i], [x2, y2, r2] = circles[j];
    assert.ok(Math.hypot(x - x2, y - y2) >= r + r2, 'motor and instrument circles remain separate');
  }
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
  for (const filter_branches of ['', '不明', 'ろ過しない', '999999分岐', 'toString']) {
    for (const option_tanks of [[], ['汚泥貯槽']]) {
      const svg = build({ filter_branches, option_tanks });
      assert.doesNotMatch(svg, /data-equipment="FL-01"|data-pipe="filtrate-discharge"/);
      assert.doesNotMatch(svg, /data-basket=|data-pipe="filter-branch-/);
      assert.match(svg, /data-pipe="supernatant-discharge"/);
      assert.match(svg, /汚泥処理方法を確認/);
    }
  }
});

test('selected branch count feeds that many baskets inside a single common receiver', () => {
  for (const [tank_capacity, filter_branches, count] of [
    ['200L', '2分岐', 2], ['500L', '3分岐', 3], ['1000L', '5分岐', 5],
    ['1000L', '分岐なし', 1], ['200L', '4分岐', 4]
  ]) {
    for (const option_tanks of [[], ['汚泥貯槽']]) {
      const svg = build({ tank_capacity, filter_branches, option_tanks });
      const receiver = svg.match(/<path d="M([\d.]+),([\d.]+) V([\d.]+) H([\d.]+) V[\d.]+" data-part="filter-receiver"/);
      const [, left, rim, bottom, right] = receiver.map(Number);
      assert.equal([...svg.matchAll(/data-part="filter-receiver"/g)].length, 1);
      const baskets = [...svg.matchAll(/<g data-basket="([^"]+)" data-tank="FL-01">([\s\S]*?)<\/g>/g)];
      assert.equal(baskets.length, count);
      const directSingleBasket = count === 1 && option_tanks.length === 0;
      const branches = edges(svg).filter(edge => directSingleBasket ? edge.id === 'sludge-filter' : edge.id.startsWith('filter-branch-'));
      assert.equal(branches.length, count);
      assert.equal(edges(svg).filter(edge => edge.id === 'filtrate-discharge').length, 1);
      let previousRight = left;
      for (const [, tag, body] of baskets) {
        const [, x, y, rx] = body.match(/<ellipse cx="([\d.]+)" cy="([\d.]+)" rx="([\d.]+)"/).map(Number);
        assert.ok(x - rx > previousRight && x + rx < right, 'baskets are separate and within receiver sides');
        previousRight = x + rx;
        const basketBottom = Number(body.match(/ V([\d.]+)/)[1]);
        assert.ok(y - 8 > rim && basketBottom + 8 < bottom, 'whole basket sits inside receiver');
        const branch = branches.find(edge => edge.to === tag);
        assert.equal(branch.from, directSingleBasket ? 'TK-02' : 'FL-01');
        const route = svg.match(new RegExp(`data-pipe="${branch.id}"[^>]* d="M([\\d.]+),([\\d.]+) L([\\d.]+),([\\d.]+)"`)).slice(1).map(Number);
        assert.equal(route[0], x);
        assert.equal(route[2], x);
        assert.ok(route[1] < rim && route[3] < y - 8 && route[3] > rim, 'branch enters through open top toward basket');
      }
      assert.match(svg, new RegExp(`カゴ${count}個`));
    }
  }
});

test('a single basket without sludge storage is directly below MV-2 with only one inlet arrow', () => {
  for (const option_tanks of [[], ['監視槽'], ['中継槽', '監視槽']]) {
    for (const expanded of [false, true]) {
      const svg = build({ filter_branches: '分岐なし', option_tanks, powder_feeder: '使用する',
        chemicals: expanded ? Array.from({length: 10}, (_, i) => `薬品${i}`) : [],
        extra_pumps: expanded ? ['凝集沈殿槽', 'ろ過受け槽'].map(tank => ({kind: '攪拌機', tank, count: '1'})) : [],
        level_sensors: ['ろ過受け槽'] });
      const valve = svg.match(/<g data-equipment="MV-2"[^>]*><circle cx="([\d.]+)" cy="([\d.]+)"/);
      const basket = svg.match(/data-basket="FL-01-B01"[\s\S]*?<ellipse cx="([\d.]+)" cy="([\d.]+)"/);
      const inlet = svg.match(/<path data-pipe="sludge-filter"[^>]*\/>/)[0];
      const points = [...inlet.matchAll(/[ML]([\d.]+),([\d.]+)/g)].map(m => m.slice(1).map(Number));
      assert.equal(points.length, 2, 'one continuous path with no bends');
      for (const [x] of points) assert.equal(x, Number(valve[1]));
      assert.equal(Number(basket[1]), Number(valve[1]), 'basket is centered below MV-2');
      assert.ok(points[0][1] < Number(valve[2]) && Number(valve[2]) < points[1][1]);
      assert.equal(points[1][1], Number(basket[2]) - 12, 'arrow ends at the basket opening');
      assert.match(inlet, /data-from="TK-02" data-to="FL-01-B01"/);
      assert.match(inlet, /marker-end/);
      assert.doesNotMatch(svg, /data-pipe="filter-branch-|data-part="filter-header"|r="3" fill="#20252b"/);
    }
  }
});

test('a single basket still receives sludge through storage when that tank is selected', () => {
  const svg = build({ filter_branches: '分岐なし', option_tanks: ['汚泥貯槽'] });
  const connections = edges(svg);
  assert.ok(connections.some(edge => edge.id === 'sludge-storage' && edge.from === 'TK-02' && edge.to === 'TK-04'));
  assert.ok(connections.some(edge => edge.id === 'sludge-filter' && edge.from === 'TK-04' && edge.to === 'FL-01'));
  assert.ok(!connections.some(edge => edge.from === 'TK-02' && edge.to === 'FL-01'));
  assert.match(svg, /data-pipe="sludge-filter"[^>]*marker-end/);
});

test('five baskets leave separate space for receiver mixers, pumps and level sensor', () => {
  const svg = build({ filter_branches: '5分岐', level_sensors: ['ろ過受け槽'], extra_pumps: ['攪拌機', '攪拌機', 'ポンプ'].map(kind => ({ kind, tank: 'ろ過受け槽', count: '1' })) });
  const baskets = [...svg.matchAll(/data-basket="[^"]+"[\s\S]*?<ellipse cx="([\d.]+)" cy="([\d.]+)"/g)];
  const lastRight = Number(baskets.at(-1)[1]) + 30;
  for (const tag of ['AM-01', 'AM-02']) {
    const mixer = svg.match(new RegExp(`<g data-equipment="${tag}"[^>]*>([\\s\\S]*?)</g>`))[1];
    assert.ok(Number(mixer.match(/data-part="motor" cx="([\d.]+)"/)[1]) - 25 > lastRight);
  }
  const pump = svg.match(/data-equipment="AP-03"[^>]*>[\s\S]*?<circle cx="[\d.]+" cy="([\d.]+)"/);
  assert.ok(Number(pump[1]) - 15 > Number(baskets[0][2]) + 88, 'pump is below baskets');
  assert.equal([...svg.matchAll(/data-instrument="LS"/g)].length, 2);
  const [, width, height] = svg.match(/viewBox="0 0 (\d+) (\d+)"/).map(Number);
  for (const [, x, y] of svg.matchAll(/<text x="([\d.]+)" y="([\d.]+)"/g)) {
    assert.ok(Number(x) < width - 24 && Number(y) < height - 24, 'expanded sheet contains labels');
  }
});

test('powder hopper sits directly above a straight downward feed and stays separate from liquid sources', () => {
  for (const count of [0, 1, 3, 10]) for (const option_tanks of [[], ['中継槽']]) {
    const svg = build({ powder_feeder: '使用する', chemicals: Array.from({length: count}, (_, i) => `薬品${i}`), option_tanks });
    const route = svg.match(/data-from="PF-01"[^>]* d="M([\d.]+),([\d.]+) L([\d.]+),([\d.]+)"[^>]*marker-end=/);
    assert.ok(route, 'powder feed is one segment with an arrow');
    assert.equal(route[1], route[3]);
    assert.ok(Number(route[4]) > Number(route[2]));
    const hopper = svg.match(/data-equipment="PF-01">[\s\S]*?<rect x="([\d.]+)"[^>]*width="36"/);
    assert.ok(Math.abs(Number(hopper[1]) + 18 - Number(route[1])) < 0.000001);
    for (const [, x, width] of svg.matchAll(/data-equipment="CH-\d+">[\s\S]*?<rect x="([\d.]+)"[^>]*width="([\d.]+)"/g)) {
      assert.ok(Number(x) + Number(width) < Number(route[1]) - 48 || Number(x) > Number(route[1]) + 48, 'liquid tank does not overlap hopper');
    }
    assert.equal(edges(svg).filter(e => e.id.startsWith('feed-')).length, count + 1);
  }
});

test('reactor instruments extend vertically without arrows in lanes clear of mixers and feed ports', () => {
  for (const extraCount of [0, 2]) for (const powder_feeder of ['使用する', '使用しない']) {
    const svg = build({ powder_feeder, chemicals: ['酸', 'アルカリ'], option_turbidity_tanks: ['凝集沈殿槽'],
      extra_pumps: Array.from({length: extraCount}, () => ({kind: '攪拌機', tank: '凝集沈殿槽', count: '1'})) });
    const probes = [...svg.matchAll(/data-instrument="[^"]+" data-equipment="[^"]+" data-tank="TK-02">([\s\S]*?)<\/g>/g)];
    assert.equal(probes.length, 3);
    const xs = [];
    for (const [, body] of probes) {
      const circle = body.match(/<circle cx="([\d.]+)" cy="([\d.]+)"/);
      const stem = body.match(/<path d="M([\d.]+),([\d.]+) V([\d.]+)"[^>]*\/>/);
      assert.ok(stem, 'straight vertical stem with no horizontal bends');
      assert.doesNotMatch(stem[0], /marker-(?:start|mid|end)/);
      assert.equal(stem[1], circle[1]);
      assert.ok(Number(stem[2]) < 490 && Number(stem[3]) > 490);
      xs.push(Number(circle[1]));
    }
    assert.ok(xs[1] - xs[0] >= 45 && xs[2] - xs[1] >= 45);
    for (const [, x] of svg.matchAll(/data-part="motor" cx="([\d.]+)"/g)) assert.ok(Number(x) + 36 < xs[0]);
    for (const [, path] of svg.matchAll(/data-pipe="feed-\d+"[^>]* d="([^"]+)"/g)) {
      const end = [...path.matchAll(/[ML]([\d.]+),([\d.]+)/g)].at(-1);
      assert.ok(Number(end[1]) + 18 < xs[0], 'feed port stays left of the probe lane');
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

test('absent sensor locations remain in the schedule with an explicit warning, without phantom probes', () => {
  const svg = build({ filter_branches: 'ろ過しない', level_sensors: ['中継槽', 'ろ過受け槽'] });
  const text = svg.replace(/<[^>]+>/g, '');
  assert.match(text, /レベルセンサー（構成外）中継槽 \/ 1台 \/ 設置先要確認・図示なし/);
  assert.match(text, /レベルセンサー（構成外）ろ過受け槽 \/ 1台 \/ 設置先要確認・図示なし/);
  assert.equal([...svg.matchAll(/data-instrument="LS"/g)].length, 1);
});

test('the first receiver pump label leaves a full line of clearance below the basket caption', () => {
  for (const filter_branches of ['分岐なし', '2分岐', '5分岐']) {
    const svg = build({ filter_branches, extra_pumps: [{ kind: 'ポンプ', tank: 'ろ過受け槽', count: '1' }] });
    const labelY = Number(svg.match(/<text[^>]* y="([\d.]+)"[^>]*>カゴ1<\/text>/)[1]);
    const pump = svg.match(/data-equipment="AP-01"[^>]*>([\s\S]*?)<\/g>/)[1];
    const numberY = Number(pump.match(/<text[^>]* y="([\d.]+)"[^>]*>AP-01<\/text>/)[1]);
    const circleY = Number(pump.match(/<circle[^>]* cy="([\d.]+)"/)[1]);
    assert.ok(numberY - 12 >= labelY + 12, 'text bounding areas plus a line of clearance');
    assert.ok(circleY - 15 >= labelY + 12, 'pump circle also clears the basket caption');
  }
});
