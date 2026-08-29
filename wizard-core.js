(function (root) {
  'use strict';

  const ARRAY_FIELDS = [
    'chemicals', 'metals', 'hazardous', 'other_contam', 'option_tanks',
    'option_ph_tanks', 'option_turbidity_tanks', 'level_sensors', 'carry_in', 'access'
  ];

  const DEFAULT_DATA = {
    customer_name: '', desired_delivery: '', staff_name: '',
    install_type: '', delivery_pref: '', delivery_city: '',
    industry: '', wastewater_type: '', daily_volume: '', working_days: '', batch_count: '',
    tank_capacity: '', filter_branches: '', powder_feeder: '',
    chemicals: [], chem_other_selected: false, pump_count: 0, chem_other_count: '', chem_details: {},
    ph_min: '', ph_max: '', raw_water_temp: '', sludge_amount: '',
    metals: [], hazardous: [], other_contam: [],
    discharge_dest: '', regulation_status: '',
    option_tanks: [], option_ph_tanks: [], option_turbidity_tanks: [],
    option_dehydrator: '', dehydrator_maker: '', dehydrator_model: '',
    raw_tank: '', raw_tank_size: '', power_status: '',
    extra_pumps: [],
    level_sensors: [], sensor_count: 0, sensor_other_selected: false, sensor_other_count: '', sensor_other_note: '',
    space_area: '', location_type: '', power_cable_length: '', primary_power_connection: '', carry_in: [], access: [],
    pipe_distance: '', pipe_step: '', slope_status: '', notes: '', step_notes1: '', step_notes2: '', step_notes3: '', step_notes4: ''
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function createInitialData() {
    return clone(DEFAULT_DATA);
  }

  function asString(value) {
    return value == null ? '' : String(value);
  }

  function asArray(value) {
    return Array.isArray(value) ? value.filter(Boolean) : [];
  }

  function normalizeData(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const normalized = createInitialData();
    Object.keys(DEFAULT_DATA).forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(source, key)) normalized[key] = source[key];
    });

    if (!normalized.staff_name && source.staff_email) normalized.staff_name = asString(source.staff_email);

    ARRAY_FIELDS.forEach((field) => {
      normalized[field] = asArray(source[field]);
    });
    normalized.extra_pumps = Array.isArray(source.extra_pumps) ? source.extra_pumps.filter(Boolean) : [];
    normalized.chem_details = source.chem_details && typeof source.chem_details === 'object' ? source.chem_details : {};

    // Older drafts stored the ambiguous choice as "なし".
    normalized.hazardous = normalized.hazardous.map((value) => value === 'なし' ? 'なし/不明' : value);
    normalized.chem_other_selected = Boolean(source.chem_other_selected || normalized.chem_other_count);
    normalized.sensor_other_selected = Boolean(
      source.sensor_other_selected || normalized.sensor_other_count || normalized.sensor_other_note
    );

    Object.keys(DEFAULT_DATA).forEach((key) => {
      if (ARRAY_FIELDS.includes(key) || key === 'extra_pumps' || key === 'chem_details') return;
      if (typeof DEFAULT_DATA[key] === 'string') normalized[key] = asString(normalized[key]);
    });
    return normalized;
  }

  function getOtherChemicalKeys(data) {
    if (!data.chem_other_selected) return [];
    const count = Number.parseInt(data.chem_other_count, 10);
    if (!Number.isInteger(count) || count < 1) return [];
    return Array.from({ length: count }, (_, index) => count === 1 ? 'その他' : `その他 ${index + 1}`);
  }

  function hasChemicals(data) {
    return asArray(data.chemicals).length > 0 || Boolean(data.chem_other_selected);
  }

  function calculatePumps(data) {
    const chemicals = asArray(data.chemicals);
    const details = chemicals.slice();
    let count = chemicals.length;

    if (data.powder_feeder === '使用する' && chemicals.includes('液体凝集剤')) {
      count -= 1;
      details.splice(details.indexOf('液体凝集剤'), 1);
    }

    const otherKeys = getOtherChemicalKeys(data);
    count += otherKeys.length;
    if (otherKeys.length) details.push(`その他×${otherKeys.length}台`);
    return { count, details };
  }

  function calculateSensors(data) {
    const base = asArray(data.level_sensors);
    const otherCount = data.sensor_other_selected ? Number.parseInt(data.sensor_other_count, 10) || 0 : 0;
    const details = base.slice();
    if (data.sensor_other_selected) {
      const label = data.sensor_other_note || 'その他';
      details.push(`${label}（${otherCount}台）`);
    }
    return { count: base.length + otherCount, details };
  }

  function isPresent(value) {
    return asString(value).trim() !== '';
  }

  function isNumberInRange(value, min, max) {
    if (!isPresent(value)) return true;
    const number = Number(value);
    return Number.isFinite(number) && number >= min && number <= max;
  }

  function validateData(data) {
    const errors = [];
    const warnings = [];
    const addWarning = (condition, message) => { if (condition) warnings.push(message); };

    if (!isNumberInRange(data.ph_min, 0, 14) || !isNumberInRange(data.ph_max, 0, 14)) {
      errors.push('pHは0から14の範囲で入力してください。');
    }
    if (isPresent(data.ph_min) && isPresent(data.ph_max) && Number(data.ph_min) > Number(data.ph_max)) {
      errors.push('pHの最小値は最大値以下にしてください。');
    }
    [['daily_volume', '1日の排水量'], ['raw_tank_size', '原水槽のサイズ'], ['space_area', '設置スペース'],
      ['power_cable_length', '電源コード長さ'], ['pipe_distance', '横引き距離']].forEach(([key, label]) => {
      if (isPresent(data[key]) && (!Number.isFinite(Number(data[key])) || Number(data[key]) < 0)) {
        errors.push(`${label}は0以上の数値で入力してください。`);
      }
    });
    if (isPresent(data.daily_volume) && Number(data.daily_volume) <= 0) {
      errors.push('1日の排水量は0より大きい数値で入力してください。');
    }
    if (isPresent(data.working_days) && (!Number.isFinite(Number(data.working_days)) || Number(data.working_days) < 1 || Number(data.working_days) > 31)) {
      errors.push('稼働日数は1から31の範囲で入力してください。');
    }
    if (isPresent(data.sludge_amount) && (!Number.isFinite(Number(data.sludge_amount)) || Number(data.sludge_amount) <= 0)) {
      errors.push('汚泥量は0より大きい数値で入力してください。');
    }
    if (data.raw_tank !== 'あり' && isPresent(data.raw_tank_size)) {
      errors.push('原水槽のサイズは、原水槽が「あり」の場合のみ入力してください。');
    }
    ['option_ph_tanks', 'option_turbidity_tanks'].forEach((field) => {
      const invalid = asArray(data[field]).filter((tank) => !asArray(data.option_tanks).includes(tank));
      if (invalid.length) errors.push('計器の設置槽は、選択した槽に合わせてください。');
    });
    if (data.chem_other_selected && getOtherChemicalKeys(data).length === 0) {
      errors.push('その他の薬品を選択した場合は、薬注ポンプ台数を選択してください。');
    }
    if (data.sensor_other_selected && (!isPresent(data.sensor_other_count) || !isPresent(data.sensor_other_note))) {
      errors.push('その他のレベルセンサーは、台数と設置箇所を入力してください。');
    }
    asArray(data.extra_pumps).forEach((pump) => {
      ['count', 'lph', 'amp'].forEach((field) => {
        if (isPresent(pump[field]) && (!Number.isFinite(Number(pump[field])) || Number(pump[field]) < 0)) {
          errors.push('追加ポンプの台数・容量・定格電流は0以上の数値で入力してください。');
        }
      });
    });

    addWarning(!isPresent(data.customer_name), '顧客名');
    addWarning(!isPresent(data.delivery_pref) && !isPresent(data.delivery_city), '納品場所');
    addWarning(!isPresent(data.wastewater_type), '排水の種類・内容');
    addWarning(!isPresent(data.daily_volume) || Number(data.daily_volume) <= 0, '1日の排水量');
    addWarning(!isPresent(data.tank_capacity), '排水処理装置の容量');
    addWarning(!isPresent(data.filter_branches) || data.filter_branches === '不明', 'ろ過分岐数');
    addWarning(data.filter_branches === 'ろ過しない' && !asArray(data.option_tanks).includes('汚泥貯槽'), '汚泥処理方法');
    addWarning(!isPresent(data.powder_feeder) || data.powder_feeder === '未定', '粉体供給機の使用');
    addWarning(!hasChemicals(data), '使用薬品');
    addWarning(!isPresent(data.ph_min) || !isPresent(data.ph_max), '原水のpH範囲');
    addWarning(!isPresent(data.discharge_dest) || data.discharge_dest === '不明', '放流先');
    addWarning(!isPresent(data.regulation_status) || data.regulation_status === '不明', '排水基準の把握状況');
    addWarning(asArray(data.hazardous).length === 0 || asArray(data.hazardous).includes('なし/不明'), '特定有害物質の確認');

    return { errors, warnings };
  }

  root.WizardCore = {
    createInitialData,
    normalizeData,
    getOtherChemicalKeys,
    hasChemicals,
    calculatePumps,
    calculateSensors,
    validateData
  };
})(typeof window !== 'undefined' ? window : globalThis);
