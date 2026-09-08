(function (root) {
  'use strict';

  const ARRAY_FIELDS = [
    'chemicals', 'metals', 'hazardous', 'other_contam', 'option_tanks',
    'option_ph_tanks', 'option_turbidity_tanks', 'level_sensors', 'carry_in', 'access', 'water_components'
  ];

  const DEFAULT_DATA = {
    hearing_version: '3', legacy_notes: '', water_components: [], water_analysis: {}, equipment_specs: {},
    customer_name: '', desired_delivery: '', staff_name: '',
    install_type: '', delivery_pref: '', delivery_city: '',
    industry: '', wastewater_type: '', daily_volume: '', working_days: '', batch_count: '',
    tank_capacity: '', filter_branches: '', powder_feeder: '',
    operating_hours: '', batch_cycle_minutes: '', working_volume_percent: '',
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

  const EQUIPMENT_KINDS = ['ポンプ', '攪拌機', 'その他'];
  const EQUIPMENT_TANKS = ['原水槽', '凝集沈殿槽', '中継槽', '汚泥貯槽', '監視槽', 'ろ過受け槽'];

  function getProcessConfig(data) {
    const tanks = asArray(data.option_tanks);
    const basketCount = new Map([['分岐なし', 1], ['2分岐', 2], ['3分岐', 3], ['4分岐', 4], ['5分岐', 5]]).get(data.filter_branches) || 0;
    return { hasRelay: tanks.includes('中継槽'), hasMonitor: tanks.includes('監視槽'),
      hasSludge: tanks.includes('汚泥貯槽'), basketCount, filterConfigured: basketCount > 0 };
  }

  function getEquipmentTanks(data) {
    return EQUIPMENT_TANKS.filter(tank => {
      if (tank === '原水槽' || tank === '凝集沈殿槽') return true;
      if (tank === 'ろ過受け槽') return getProcessConfig(data).filterConfigured;
      return asArray(data.option_tanks).includes(tank);
    });
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
    // Keep deleted row placeholders while the wizard is open. The DOM uses the
    // original row index for subsequent edits, so compacting this array corrupts data.
    normalized.extra_pumps = Array.isArray(source.extra_pumps)
      ? source.extra_pumps.map((pump, index) => pump && typeof pump === 'object' ? {
        ...pump, id: asString(pump.id) || `legacy-extra-${index}`, kind: asString(pump.kind), tank: asString(pump.tank)
      } : null)
      : [];
    normalized.chem_details = source.chem_details && typeof source.chem_details === 'object' ? source.chem_details : {};
    for (const field of ['water_analysis', 'equipment_specs']) {
      const fields = field === 'water_analysis' ? ['status', 'value', 'unit', 'date', 'source', 'note'] : ['maker', 'model', 'output_kw', 'amp', 'voltage', 'phase', 'frequency', 'power', 'power_unit', 'note'];
      normalized[field] = Object.fromEntries(Object.entries(source[field] || {}).filter(([key, value]) =>
        !['__proto__', 'constructor', 'prototype'].includes(key) && value && typeof value === 'object'
      ).map(([key, value]) => [key, Object.fromEntries(fields.filter(name => Object.hasOwn(value, name)).map(name => [name, asString(value[name])]))]));
    }
    // Old notes span several new pages. Archive verbatim instead of guessing their subject.
    if (source.hearing_version !== '3') {
      const titles = ['基本情報', '水質情報', '装置オプション', '既存設備'];
      const oldNotes = titles.flatMap((title, index) => source[`step_notes${index + 1}`]
        ? [`旧STEP${index + 1}（${title}）\n${source[`step_notes${index + 1}`]}`] : []);
      normalized.legacy_notes = [normalized.legacy_notes, ...oldNotes].filter(Boolean).join('\n\n');
      titles.forEach((_, index) => { normalized[`step_notes${index + 1}`] = ''; });
      normalized.hearing_version = '3';
    }

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

  function getWaterAnalysisNames(data) {
    return [...new Set(['SS', '油分', 'BOD', 'COD', ...asArray(data.metals), ...asArray(data.hazardous),
      ...asArray(data.water_components)].filter(name => !['なし', 'なし/不明'].includes(name)))];
  }

  // Keys identify physical roles, never their current position in a drawing or list.
  function getQuoteEquipment(data) {
    const rows = [];
    const add = (key, tag, name, tank, count = '1', legacy = {}) => rows.push({
      key, tag, name, tank, count, legacyPower: asString(legacy.lph),
      spec: { maker: '', model: '', output_kw: '', amp: asString(legacy.amp), voltage: '', phase: '', power: '', power_unit: 'kW', frequency: '', note: '',
        ...(data.equipment_specs?.[key] || {}) }
    });
    const config = getProcessConfig(data);
    add('transfer:raw', 'TP-01', '原水移送ポンプ', '原水槽');
    add('mixer:reactor', 'MX-01', '本体攪拌機', '凝集沈殿槽');
    if (config.hasRelay) add('transfer:relay', 'TP-02', '中継移送ポンプ', '中継槽');
    const chemicals = [...asArray(data.chemicals).filter(name => !(data.powder_feeder === '使用する' && name === '液体凝集剤')), ...getOtherChemicalKeys(data)];
    chemicals.forEach((name, i) => add(`chemical:${name}`, `DP-${String(i + 1).padStart(2, '0')}`, `薬注ポンプ / ${name}`, '凝集沈殿槽'));
    if (data.powder_feeder === '使用する') add('powder', 'PF-01', '粉体供給機', '凝集沈殿槽');
    for (const [field, type, prefix] of [['option_ph_tanks', 'pH計', 'PH'], ['option_turbidity_tanks', '濁度計', 'TU'], ['level_sensors', 'レベルセンサー', 'LS']]) {
      const order = ['凝集沈殿槽', '原水槽', '中継槽', '監視槽', '汚泥貯槽', 'ろ過受け槽'];
      const tanks = order.filter(tank => getEquipmentTanks(data).includes(tank) &&
        ((tank === '凝集沈殿槽' && prefix !== 'TU') || asArray(data[field]).includes(tank)));
      tanks.forEach((tank, i) => add(`${prefix}:${tank}`, `${prefix}-${i + 1}`, type, tank));
    }
    if (data.sensor_other_selected) add('sensor:other', 'LS-OTHER', 'レベルセンサー（その他）', data.sensor_other_note, data.sensor_other_count);
    add('valve:supernatant', 'MV-1', '上澄液出口電磁弁', '凝集沈殿槽');
    add('valve:sludge', 'MV-2', '汚泥出口電磁弁', '凝集沈殿槽');
    if (config.basketCount > 1) for (let i = 0; i < config.basketCount; i++) add(`valve:filter:${i}`, `MV-${i + 3}`, `ろ過分岐${i + 1}電磁弁`, 'ろ過受け槽');
    if (data.option_dehydrator === '必要') {
      add('dehydrator', 'DH-01', '脱水機', '');
      rows.at(-1).spec.maker ||= data.dehydrator_maker || '';
      rows.at(-1).spec.model ||= data.dehydrator_model || '';
    }
    let number = 0;
    (data.extra_pumps || []).forEach((item, index) => {
      if (!item) return;
      number++;
      if (isPresent(item.count) && Number(item.count) === 0) return;
      const prefix = item.kind === '攪拌機' ? 'AM' : item.kind === 'その他' ? 'AE' : 'AP';
      add(`extra:${item.id || `legacy-extra-${index}`}`, `${prefix}-${String(number).padStart(2, '0')}`, item.name || item.kind || '追加機器', item.tank, item.count, item);
    });
    return rows;
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

  // One unit, sequential batches, completed within the daily operating window.
  // No assumed cycle time or usable volume: unknown conditions stay unknown.
  function calculateBatchCapacity(data) {
    const missing = [];
    const errors = [];
    const fields = [
      ['daily_volume', '1日の排水量', Infinity],
      ['operating_hours', '運転可能時間', 24],
      ['batch_cycle_minutes', '1バッチの所要時間', Infinity],
      ['working_volume_percent', '容量の有効使用率', 100]
    ];
    fields.forEach(([key, label, max]) => {
      if (!isPresent(data[key])) {
        missing.push(label);
      } else if (!Number.isFinite(Number(data[key])) || Number(data[key]) <= 0 || Number(data[key]) > max) {
        errors.push(`${label}は0より大きい${Number.isFinite(max) ? `${max}以下の` : ''}数値で入力してください。`);
      }
    });
    const capacities = { '200L': 200, '500L': 500, '1000L': 1000 };
    if (!isPresent(data.tank_capacity)) missing.push('排水処理装置の容量');
    else if (!Object.prototype.hasOwnProperty.call(capacities, data.tank_capacity)) errors.push('装置容量は200L・500L・1000Lから選択してください。');
    if (errors.length || missing.length) {
      return { status: errors.length ? 'invalid' : 'incomplete', missing, errors };
    }

    // Correct only floating-point noise at integer boundaries, before ceil/floor.
    const snapInteger = (value) => {
      const nearest = Math.round(value);
      return Math.abs(value - nearest) <= 8 * Number.EPSILON * Math.max(1, Math.abs(value)) ? nearest : value;
    };
    const effectiveBatchM3 = capacities[data.tank_capacity] / 1000 * Number(data.working_volume_percent) / 100;
    const availableMinutes = Number(data.operating_hours) * 60;
    const cycleMinutes = Number(data.batch_cycle_minutes);
    const requiredBatches = Math.max(1, Math.ceil(snapInteger(Number(data.daily_volume) / effectiveBatchM3)));
    const possibleBatches = Math.floor(snapInteger(availableMinutes / cycleMinutes));
    const requiredMinutes = requiredBatches * cycleMinutes;
    const dailyCapacityM3 = possibleBatches * effectiveBatchM3;
    if (effectiveBatchM3 <= 0 || !Number.isSafeInteger(requiredBatches) || !Number.isSafeInteger(possibleBatches) ||
        !Number.isFinite(requiredMinutes) || !Number.isFinite(dailyCapacityM3)) {
      return { status: 'invalid', missing: [], errors: ['処理能力の計算範囲を超えています。排水量・有効使用率・所要時間を確認してください。'] };
    }
    const rawTimeMargin = availableMinutes - requiredMinutes;
    const timeMarginMinutes = Math.abs(rawTimeMargin) <= 8 * Number.EPSILON * Math.max(1, availableMinutes, requiredMinutes)
      ? 0 : rawTimeMargin;
    return {
      status: requiredBatches > possibleBatches ? 'insufficient' : timeMarginMinutes === 0 ? 'at_limit' : 'sufficient',
      missing, errors, effectiveBatchM3, requiredBatches, possibleBatches,
      requiredMinutes, availableMinutes, dailyCapacityM3, timeMarginMinutes,
      shortfallM3: requiredBatches > possibleBatches ? Math.max(0, Number(data.daily_volume) - dailyCapacityM3) : 0
    };
  }

  function validateData(data) {
    const errors = [];
    const warnings = [];
    const addWarning = (condition, message) => { if (condition) warnings.push(message); };
    getQuoteEquipment(data).forEach(item => {
      for (const [key, label] of [['output_kw', '定格出力'], ['amp', '定格電流'], ['voltage', '電圧'], ['power', '旧消費電力']]) {
        if (!isNumberInRange(item.spec[key], 0, Infinity)) errors.push(`${item.name}の${label}は0以上の数値で入力してください。`);
      }
    });
    getWaterAnalysisNames(data).forEach(name => {
      const analysis = data.water_analysis?.[name];
      if (analysis && !isNumberInRange(analysis.value, 0, Infinity)) errors.push(`${name}の分析値は0以上の数値で入力してください。`);
    });
    const capacity = calculateBatchCapacity(data);
    errors.push(...capacity.errors);
    addWarning(capacity.status === 'insufficient', 'バッチ処理能力が不足しています。装置容量・運転時間・処理条件を見直してください。');
    addWarning(capacity.status === 'at_limit', 'バッチ処理の必要時間が運転可能時間と同じです。時間の余裕を確認してください。');

    if (!isNumberInRange(data.ph_min, 0, 14) || !isNumberInRange(data.ph_max, 0, 14)) {
      errors.push('pHは0から14の範囲で入力してください。');
    }
    if (isPresent(data.ph_min) && isPresent(data.ph_max) && Number(data.ph_min) > Number(data.ph_max)) {
      errors.push('pHの最小値は最大値以下にしてください。');
    }
    [['raw_tank_size', '原水槽のサイズ'], ['space_area', '設置スペース'],
      ['power_cable_length', '電源コード長さ'], ['pipe_distance', '横引き距離']].forEach(([key, label]) => {
      if (isPresent(data[key]) && (!Number.isFinite(Number(data[key])) || Number(data[key]) < 0)) {
        errors.push(`${label}は0以上の数値で入力してください。`);
      }
    });
    if (isPresent(data.working_days) && (!Number.isFinite(Number(data.working_days)) || Number(data.working_days) < 1 || Number(data.working_days) > 31)) {
      errors.push('稼働日数は1から31の範囲で入力してください。');
    }
    if (isPresent(data.sludge_amount) && (!Number.isFinite(Number(data.sludge_amount)) || Number(data.sludge_amount) < 0)) {
      errors.push('汚泥量は0以上の数値で入力してください。');
    }
    if (data.raw_tank !== 'あり' && isPresent(data.raw_tank_size)) {
      errors.push('原水槽のサイズは、原水槽が「あり」の場合のみ入力してください。');
    }
    [['option_ph_tanks', 'pH計'], ['option_turbidity_tanks', '濁度計']].forEach(([field, label]) => {
      const invalid = asArray(data[field]).filter((tank) => !asArray(data.option_tanks).includes(tank));
      if (invalid.length) warnings.push(`${label}の設置槽（${invalid.join('、')}）がオプション槽に含まれていません。内容を確認してください。`);
    });
    const absentSensors = asArray(data.level_sensors).filter(tank => !getEquipmentTanks(data).includes(tank));
    if (absentSensors.length) warnings.push(`レベルセンサーの設置槽（${absentSensors.join('、')}）が現在の構成にありません。設置先を確認してください。`);
    if (data.chem_other_selected && getOtherChemicalKeys(data).length === 0) {
      errors.push('その他の薬品を選択した場合は、薬注ポンプ台数を選択してください。');
    }
    if (data.sensor_other_selected && (!isPresent(data.sensor_other_count) || !isPresent(data.sensor_other_note))) {
      errors.push('その他のレベルセンサーは、台数と設置箇所を入力してください。');
    }
    asArray(data.extra_pumps).forEach((pump, index) => {
      ['count', 'lph', 'amp'].forEach((field) => {
        if (isPresent(pump[field]) && (!Number.isFinite(Number(pump[field])) || Number(pump[field]) < 0)) {
          errors.push('追加機器の台数・容量・定格電流は0以上の数値で入力してください。');
        }
      });
      if (isPresent(pump.count) && !Number.isSafeInteger(Number(pump.count))) errors.push('追加機器の台数は整数で入力してください。');
      if (Number(pump.count) === 0 && isPresent(pump.count)) return;
      const label = `追加機器${index + 1}（${pump.name || '名称未入力'}）`;
      addWarning(!EQUIPMENT_KINDS.includes(pump.kind), `${label}の機器種別を選択してください。`);
      addWarning(!EQUIPMENT_TANKS.includes(pump.tank), `${label}の設置槽を選択してください。`);
      addWarning(EQUIPMENT_TANKS.includes(pump.tank) && !getEquipmentTanks(data).includes(pump.tank), `${label}の設置槽（${pump.tank}）が現在の構成にありません。`);
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
    EQUIPMENT_KINDS,
    EQUIPMENT_TANKS,
    getEquipmentTanks,
    getProcessConfig,
    getWaterAnalysisNames,
    getQuoteEquipment,
    createInitialData,
    normalizeData,
    getOtherChemicalKeys,
    hasChemicals,
    calculatePumps,
    calculateSensors,
    calculateBatchCapacity,
    validateData
  };
})(typeof window !== 'undefined' ? window : globalThis);
