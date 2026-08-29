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

test('validation rejects unsafe numeric and equipment-state contradictions', () => {
  const invalid = core.normalizeData({
    ph_min: '11', ph_max: '2', raw_tank: 'なし', raw_tank_size: '3',
    option_tanks: [], option_ph_tanks: ['中継槽'], daily_volume: '0'
  });
  const { errors } = core.validateData(invalid);
  assert.ok(errors.some(message => message.includes('最小値')));
  assert.ok(errors.some(message => message.includes('原水槽のサイズ')));
  assert.ok(errors.some(message => message.includes('計器の設置槽')));
  assert.ok(errors.some(message => message.includes('1日の排水量')));
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
