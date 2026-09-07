import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function loadCore() {
  const context = {};
  context.globalThis = context;
  vm.runInNewContext(readFileSync('wizard-core.js', 'utf8'), context, { filename: 'wizard-core.js' });
  return context.WizardCore;
}

const core = loadCore();
const plain = (value) => JSON.parse(JSON.stringify(value));

test('legacy ambiguous hazardous value is migrated without claiming absence', () => {
  const data = core.normalizeData({ hazardous: ['なし'], wastewater_type: 'めっき洗浄水', ph_min: '2', ph_max: '5' });
  assert.deepEqual(plain(data.hazardous), ['なし/不明']);
  assert.equal(data.wastewater_type, 'めっき洗浄水');
  assert.equal(data.ph_min, '2');
  assert.equal(data.ph_max, '5');
});

test('draft normalization ignores fields outside the supported schema', () => {
  const data = core.normalizeData({ customer_name: 'テスト株式会社', unsupported_field: 'ignore' });
  assert.equal(data.customer_name, 'テスト株式会社');
  assert.equal(Object.hasOwn(data, 'unsupported_field'), false);
});

test('powder feeder removes only the liquid coagulant pump regardless of selection order', () => {
  const data = core.normalizeData({
    chemicals: ['pH調整剤（酸）', '液体凝集剤'],
    powder_feeder: '使用する'
  });
  assert.deepEqual(plain(core.calculatePumps(data)), { count: 1, details: ['pH調整剤（酸）'] });
});

test('other chemicals require an explicit count and are consistently counted', () => {
  const incomplete = core.normalizeData({ chem_other_selected: true });
  assert.equal(core.calculatePumps(incomplete).count, 0);
  assert.ok(core.validateData(incomplete).errors.some(message => message.includes('その他の薬品')));

  const complete = core.normalizeData({ chem_other_selected: true, chem_other_count: '2' });
  assert.deepEqual(plain(core.getOtherChemicalKeys(complete)), ['その他 1', 'その他 2']);
  assert.equal(core.calculatePumps(complete).count, 2);
});

test('stale legacy chemical detail does not reactivate a deselected other chemical', () => {
  const data = core.normalizeData({ chem_other_count: '', chem_details: { その他: { name: '旧薬剤', amount: '1' } } });
  assert.equal(data.chem_other_selected, false);
});

test('deleted extra pump placeholders remain aligned with open form rows', () => {
  const data = core.normalizeData({
    extra_pumps: [
      null,
      { name: 'B', count: '2', lph: '', amp: '' },
      { name: 'C', count: '3', lph: '', amp: '' }
    ]
  });
  assert.equal(data.extra_pumps.length, 3);
  assert.equal(data.extra_pumps[0], null);
  assert.equal(data.extra_pumps[1].name, 'B');
  assert.equal(data.extra_pumps[2].name, 'C');
});

test('equipment placement survives draft round trips and legacy rows remain explicitly unassigned', () => {
  const data = core.normalizeData({ extra_pumps: [null, { name: '旧設備', count: '2' }, { kind: '攪拌機', tank: '原水槽', name: '攪拌', count: '1' }] });
  assert.equal(data.extra_pumps[1].kind, '');
  assert.equal(data.extra_pumps[1].tank, '');
  assert.deepEqual(plain(core.normalizeData(JSON.parse(JSON.stringify(data)))), plain(data));
  assert.ok(core.validateData(data).warnings.some(w => w.includes('旧設備') && w.includes('設置槽')));
});

test('equipment validation catches removed tanks and fractional counts without silently changing placement', () => {
  const data = core.normalizeData({ extra_pumps: [{ kind: 'ポンプ', tank: '中継槽', count: '1' }] });
  assert.ok(core.validateData(data).warnings.some(w => w.includes('現在の構成にありません')));
  data.option_tanks = ['中継槽'];
  assert.equal(core.validateData(data).warnings.some(w => w.includes('追加機器')), false);
  data.extra_pumps[0].count = '1.5';
  assert.ok(core.validateData(data).errors.some(w => w.includes('整数')));
  data.extra_pumps[0].count = '0';
  data.option_tanks = [];
  assert.equal(core.validateData(data).warnings.some(w => w.includes('追加機器')), false);
  assert.equal(data.extra_pumps[0].tank, '中継槽');
});

test('validation rejects unsafe numeric contradictions and warns about instrument tank mismatches', () => {
  const invalid = core.normalizeData({
    ph_min: '11', ph_max: '2', raw_tank: 'なし', raw_tank_size: '3',
    option_tanks: [], option_ph_tanks: ['中継槽'], daily_volume: '0'
  });
  const { errors, warnings } = core.validateData(invalid);
  assert.ok(errors.some(message => message.includes('最小値')));
  assert.ok(errors.some(message => message.includes('原水槽のサイズ')));
  assert.ok(warnings.some(message => message.includes('pH計の設置槽（中継槽）')));
  assert.ok(errors.some(message => message.includes('1日の排水量')));
});

test('validation accepts zero sludge amount', () => {
  const { errors } = core.validateData(core.normalizeData({ sludge_amount: '0' }));
  assert.equal(errors.some(message => message.includes('汚泥量')), false);
});

test('other sensor count is retained in the result summary', () => {
  const data = core.normalizeData({
    level_sensors: ['原水槽'], sensor_other_selected: true,
    sensor_other_count: '2', sensor_other_note: '薬液タンク'
  });
  assert.deepEqual(plain(core.calculateSensors(data)), {
    count: 3,
    details: ['原水槽', '薬液タンク（2台）']
  });
});

const capacityData = (overrides = {}) => core.normalizeData({
  daily_volume: '3', tank_capacity: '500L', working_volume_percent: '80',
  operating_hours: '8', batch_cycle_minutes: '60', ...overrides
});

test('capacity check accounts for usable volume and rounds partial batches up', () => {
  const result = core.calculateBatchCapacity(capacityData());
  assert.equal(result.effectiveBatchM3, 0.4);
  assert.equal(result.requiredBatches, 8);
  assert.equal(result.possibleBatches, 8);
  assert.equal(result.requiredMinutes, 480);
  assert.equal(result.dailyCapacityM3, 3.2);
  assert.equal(result.shortfallM3, 0);
  assert.equal(result.status, 'at_limit');
  assert.ok(core.validateData(capacityData()).warnings.some(message => message.includes('時間の余裕')));
});

test('capacity shortage is advisory and includes untreated daily volume', () => {
  const data = capacityData({ daily_volume: '5', batch_cycle_minutes: '90' });
  const result = core.calculateBatchCapacity(data);
  assert.equal(result.status, 'insufficient');
  assert.equal(result.requiredBatches, 13);
  assert.equal(result.possibleBatches, 5);
  assert.equal(result.requiredMinutes, 1170);
  assert.equal(result.dailyCapacityM3, 2);
  assert.equal(result.shortfallM3, 3);
  assert.equal(result.timeMarginMinutes, -690);
  assert.equal(core.validateData(data).errors.length, 0);
  assert.ok(core.validateData(data).warnings.some(message => message.includes('バッチ処理能力が不足')));
});

test('larger capacity immediately changes the calculated time margin', () => {
  const result = core.calculateBatchCapacity(capacityData({ tank_capacity: '1000L' }));
  assert.equal(result.status, 'sufficient');
  assert.equal(result.requiredBatches, 4);
  assert.equal(result.requiredMinutes, 240);
  assert.equal(result.timeMarginMinutes, 240);
});

test('all standard tank sizes are converted from litres to cubic metres', () => {
  for (const [tank_capacity, expected] of [['200L', 0.2], ['500L', 0.5], ['1000L', 1]]) {
    assert.equal(core.calculateBatchCapacity(capacityData({ tank_capacity, working_volume_percent: '100' })).effectiveBatchM3, expected);
  }
});

test('a cycle longer than the operating window completes no batches', () => {
  const result = core.calculateBatchCapacity(capacityData({ batch_cycle_minutes: '1500' }));
  assert.equal(result.status, 'insufficient');
  assert.equal(result.possibleBatches, 0);
  assert.equal(result.dailyCapacityM3, 0);
  assert.equal(result.shortfallM3, 3);
});

test('floating-point boundaries do not invent or lose whole batches', () => {
  const exact = core.calculateBatchCapacity(capacityData({ daily_volume: '0.07', tank_capacity: '200L', working_volume_percent: '5', operating_hours: '0.29', batch_cycle_minutes: '0.1' }));
  assert.equal(exact.requiredBatches, 7);
  assert.equal(exact.possibleBatches, 174);
  const exactTime = core.calculateBatchCapacity(capacityData({ daily_volume: '1.74', tank_capacity: '200L', working_volume_percent: '5', operating_hours: '0.29', batch_cycle_minutes: '0.1' }));
  assert.equal(exactTime.requiredBatches, 174);
  assert.equal(exactTime.status, 'at_limit');
  assert.equal(exactTime.timeMarginMinutes, 0);
  const above = core.calculateBatchCapacity(capacityData({ daily_volume: '3.20000001' }));
  assert.equal(above.requiredBatches, 9);
  assert.equal(above.status, 'insufficient');
  const below = core.calculateBatchCapacity(capacityData({ operating_hours: '7.99999999' }));
  assert.equal(below.possibleBatches, 7);
  assert.equal(below.status, 'insufficient');
});

test('old drafts stay valid with unknown conditions and no assumed defaults', () => {
  const old = core.normalizeData({ daily_volume: '5', tank_capacity: '500L' });
  const result = core.calculateBatchCapacity(old);
  assert.equal(result.status, 'incomplete');
  assert.deepEqual(plain(result.missing), ['運転可能時間', '1バッチの所要時間', '容量の有効使用率']);
  assert.equal(Object.hasOwn(result, 'dailyCapacityM3'), false);
  assert.deepEqual(plain(core.validateData(old).errors), []);
  for (const key of ['daily_volume', 'tank_capacity', 'operating_hours', 'batch_cycle_minutes', 'working_volume_percent']) {
    assert.equal(core.calculateBatchCapacity(capacityData({ [key]: ' ' })).status, 'incomplete', key);
  }
});

test('invalid capacity inputs are rejected even when other conditions are missing', () => {
  for (const key of ['daily_volume', 'operating_hours', 'batch_cycle_minutes', 'working_volume_percent']) {
    for (const value of ['0', '-1', 'NaN', 'Infinity', '1e309', 'abc']) {
      const data = capacityData({ [key]: value });
      assert.equal(core.calculateBatchCapacity(data).status, 'invalid', `${key}=${value}`);
      assert.ok(core.validateData(data).errors.length > 0);
    }
  }
  for (const invalid of [{ operating_hours: '24.01' }, { working_volume_percent: '100.01' }, { tank_capacity: '750L' }, { tank_capacity: 'toString' }]) {
    assert.equal(core.calculateBatchCapacity(capacityData(invalid)).status, 'invalid');
  }
  assert.equal(core.calculateBatchCapacity(capacityData({ operating_hours: '24', working_volume_percent: '100' })).status, 'sufficient');
  assert.ok(core.validateData(core.normalizeData({ operating_hours: '-1' })).errors.length > 0);
});

test('unrepresentable calculations fail closed instead of showing Infinity or unsafe counts', () => {
  for (const extreme of [{ daily_volume: '1e308' }, { batch_cycle_minutes: '1e-300' }, { working_volume_percent: '5e-324' }, { batch_cycle_minutes: '1e308' }]) {
    const result = core.calculateBatchCapacity(capacityData(extreme));
    assert.equal(result.status, 'invalid');
    assert.ok(result.errors.some(message => message.includes('計算範囲')));
  }
});

test('capacity conditions survive draft serialization and calculations do not mutate data', () => {
  const data = capacityData();
  const before = JSON.stringify(data);
  for (const batch_count of ['1回', '2〜3回', '4回以上', '不定期']) {
    assert.equal(core.calculateBatchCapacity({ ...data, batch_count }).requiredBatches, 8);
  }
  core.calculateBatchCapacity(data);
  assert.equal(JSON.stringify(data), before);
  assert.deepEqual(plain(core.normalizeData(JSON.parse(before))), plain(data));
});
